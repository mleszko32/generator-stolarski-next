// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles } from "../core/drawerMath.js";

/**
 * Rekurencyjna funkcja wyliczająca pozycje formatek wewnętrznych
 */
function calculateInteriorPanels(node, x, y, z, width, height, depth, boardThick) {
  if (!node) return [];

  const panels = [];

  // ---- NOWE: Rejestrujemy pustą przestrzeń (powietrze), aby można było w nią kliknąć ----
  if (node.splitDirection === 'none') {
    panels.push({
      type: 'empty_space',
      width: width,
      height: height,
      depth: depth,
      centerX: x + (width / 2),
      centerY: y + (height / 2),
      centerZ: z + (depth / 2),
      nodeRef: node // Przekazujemy referencję do węzła, by móc go później edytować!
    });
    return panels; // Kończymy, bo nie ma tu więcej podziałów
  }

  // Zabezpieczenie przed błędami, gdyby węzeł miał kierunek, ale brak dzieci
  if (!node.children || node.children.length === 0) return panels;

  const numChildren = node.children.length;
  const numDividers = numChildren - 1;

  if (node.splitDirection === 'vertical') {
    // ---- CIĘCIE PIONOWE (WSTAWIANIE PRZEGRÓD) ----
    const availableWidth = width - (numDividers * boardThick);
    
    // Zliczanie proporcji (np. "1fr", "2fr")
    let totalFr = 0;
    node.children.forEach(child => {
      totalFr += parseFloat(child.size) || 1;
    });

    let currentX = x;
    
    for (let i = 0; i < numChildren; i++) {
      const childNode = node.children[i];
      const childFr = parseFloat(childNode.size) || 1;
      const sectionWidth = availableWidth * (childFr / totalFr);
      
      panels.push(...calculateInteriorPanels(
        childNode, currentX, y, z, sectionWidth, height, depth, boardThick
      ));
      
      currentX += sectionWidth;
      
      if (i < numDividers) {
        panels.push({
          type: 'vertical_partition',
          width: boardThick,
          height: height,
          depth: depth,
          centerX: currentX + (boardThick / 2),
          centerY: y + (height / 2),
          centerZ: z + (depth / 2)
        });
        currentX += boardThick; 
      }
    }

  } else if (node.splitDirection === 'horizontal') {
    // ---- CIĘCIE POZIOME (WSTAWIANIE PÓŁEK) ----
    const availableHeight = height - (numDividers * boardThick);
    
    let totalFr = 0;
    node.children.forEach(child => {
      totalFr += parseFloat(child.size) || 1;
    });

    let currentY = y;
    
    for (let i = 0; i < numChildren; i++) {
      const childNode = node.children[i];
      const childFr = parseFloat(childNode.size) || 1;
      const sectionHeight = availableHeight * (childFr / totalFr);
      
      panels.push(...calculateInteriorPanels(
        childNode, x, currentY, z, width, sectionHeight, depth, boardThick
      ));
      
      currentY += sectionHeight;
      
      if (i < numDividers) {
        panels.push({
          type: 'horizontal_shelf',
          width: width,
          height: boardThick,
          depth: depth,
          centerX: x + (width / 2),
          centerY: currentY + (boardThick / 2),
          centerZ: z + (depth / 2)
        });
        currentY += boardThick; 
      }
    }
  }

  return panels;
}

export function calculateParts() {
  // Zabezpieczenie: jeśli nie ma modułów, zwracamy puste dane
  if (!state.project.modules || state.project.modules.length === 0) {
    return { parts: [], mountingData: [] };
  }

  // Na ten moment obliczamy formatki dla aktywnego (pierwszego) modułu
  const mod = state.project.modules[0];
  const { width, height, depth } = mod.dimensions;
  
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  let parts = [];

  // 1. Boki (2 szt.)
  let sideDepth = type === 'nut' ? depth : depth - backThick;
  parts.push({ name: "Bok (L/P)", length: height, width: sideDepth, qty: 2 });

  // 2. Wieniec górny / dolny (2 szt.)
  let topBottomDepth = type === 'nut' ? depth - offset - backThick : depth - backThick;
  parts.push({ name: "Wieniec (G/D)", length: width - (board * 2), width: topBottomDepth, qty: 2 });

  // 3. Plecy (HDF) - 1 szt.
  let hdfWidth, hdfHeight;
  const totalClearance = clearance * 2;
  if (type === 'nut') {
    hdfWidth = width - (board * 2) + (grooveDepth * 2) - totalClearance;
    hdfHeight = height - totalClearance;
  } else {
    hdfWidth = width - totalClearance;
    hdfHeight = height - totalClearance;
  }
  parts.push({ name: "Plecy (HDF)", length: hdfHeight, width: hdfWidth, qty: 1 });

  // 4. Wnętrze (Półki i Przegrody ze struktury drzewa)
  if (mod.interior) {
    const innerWidth = width - (board * 2);
    const innerHeight = height - (board * 2);
    const innerDepth = topBottomDepth; // Półki zazwyczaj trzymają głębokość wieńców
    
    // Punkt startowy wewnątrz szafki (pomijamy grubości boków i wieńca dolnego)
    const startX = board; 
    const startY = board;
    const startZ = 0;

    const interiorPanels = calculateInteriorPanels(
      mod.interior, 
      startX, 
      startY, 
      startZ, 
      innerWidth, 
      innerHeight, 
      innerDepth, 
      board
    );
    
    interiorPanels.forEach((panel, index) => {
      if (panel.type === 'vertical_partition') {
        parts.push({ 
          name: `Przegroda pionowa ${index + 1}`, 
          length: parseFloat(panel.height.toFixed(1)), 
          width: parseFloat(panel.depth.toFixed(1)), 
          qty: 1,
          renderData: panel // Zachowujemy dane do silnika 3D
        });
      } else if (panel.type === 'horizontal_shelf') {
        parts.push({ 
          name: `Półka ${index + 1}`, 
          length: parseFloat(panel.width.toFixed(1)), 
          width: parseFloat(panel.depth.toFixed(1)), 
          qty: 1,
          renderData: panel // Zachowujemy dane do silnika 3D
        });
      } else if (panel.type === 'empty_space') {
        // NOWE: Przepuszczamy "powietrze" do silnika 3D
        parts.push({
          name: `Pusta przestrzeń`,
          length: 0,
          width: 0,
          qty: 0,
          renderData: panel
        });
      } // <-- 1. Zamknięcie bloku else if
    }); // <-- 2. Zamknięcie pętli forEach
  } // <-- 3. Zamknięcie bloku if (mod.interior)

  // 5. Fronty i szuflady
  let mountingData = [];
  if (state.project.front && state.project.front.active) {
    const fc = state.project.front.clearance;

  // 5. Fronty i szuflady
  let mountingData = [];
  if (state.project.front && state.project.front.active) {
    const fc = state.project.front.clearance;
    const gap = state.project.front.gap;
    const distributionStr = String(state.project.front.distribution || "1").trim();
    
    let parsedZones = [];
    if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
      const count = parseInt(distributionStr, 10);
      for (let i = 0; i < count; i++) {
        parsedZones.push({ type: 'fr', value: 1 });
      }
    } else {
      const separator = distributionStr.includes(':') ? ':' : ',';
      parsedZones = distributionStr.split(separator).map(s => {
        let zone = s.trim();
        if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
        const val = parseFloat(zone);
        return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
      });
    }

    const count = parsedZones.length;
    const fWidth = width - (fc.sides * 2);
    let availableHeight = height - fc.top - fc.bottom - ((count - 1) * gap);
    
    let fixedTotal = 0;
    let frTotal = 0;
    parsedZones.forEach(z => {
      if (z.type === 'fixed') fixedTotal += z.value;
      if (z.type === 'fr') frTotal += z.value;
    });

    availableHeight -= fixedTotal;
    const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

    let currentY = fc.bottom;
    parsedZones.forEach((zone, index) => {
      const fHeight = zone.type === 'fixed' ? zone.value : zone.value * singleFrValue;
      
      parts.push({
        name: `Front ${index + 1}`,
        length: parseFloat(fHeight.toFixed(1)),
        width: parseFloat(fWidth.toFixed(1)),
        qty: 1
      });

      // Nawierty
      if (typeof calculateDrawerHoles === 'function') {
        const drawerHoles = calculateDrawerHoles(
          state.project.front.drawerSystem,
          currentY,
          fHeight,
          board,
          index,
          index === 0
        );
        if (drawerHoles) mountingData.push(drawerHoles);
      }

      currentY += fHeight + gap;
    });
  }

  return { parts, mountingData };
  }}

