// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles } from "../core/drawerMath.js";

export function calculateParts() {
  if (!state.project.modules || state.project.modules.length === 0) {
    return { parts: [], mountingData: [] };
  }

  const mod = state.project.modules[0];
  const { width, height, depth } = mod.dimensions;
  
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  // Pobieramy typ frontu (dla określenia głębokości wnętrza przy wpuszczanych)
  const frontType = state.project.front && state.project.front.type ? state.project.front.type : 'nakladane';
  const isInset = frontType === 'wpuszczane';

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

  // 4. Wnętrze (Półki i Przegrody czytane z Edytora 2D)
  const innerDepthOffset = isInset ? board : 0;
  const innerPartDepth = topBottomDepth - innerDepthOffset;

  let shelfCount = 0;
  let partitionCount = 0;

  if (mod.elements && mod.elements.length > 0) {
    mod.elements.forEach(el => {
      if (el.typ === 'pion') {
        partitionCount++;
        parts.push({ name: `Przegroda pionowa ${partitionCount}`, length: parseFloat(el.h.toFixed(1)), width: innerPartDepth, qty: 1 });
      } else if (el.typ === 'poziom') {
        shelfCount++;
        parts.push({ name: `Półka ${shelfCount}`, length: parseFloat(el.w.toFixed(1)), width: innerPartDepth, qty: 1 });
      }
    });
  }

  // 5. Fronty i szuflady (Czytane BEZPOŚREDNIO ze zaktualizowanych danych CAD)
  let mountingData = [];
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front') : [];

  if (fronts.length > 0) {
    // Sortujemy po osi Y (od dołu do góry), żeby odpowiednio numerować na liście i w nawiertach
    fronts.sort((a, b) => a.y - b.y);

    let drawerCount = 0;
    let doorCount = 0;

    fronts.forEach(front => {
      // Inteligentne nazewnictwo w zależności od wybranej opcji w 2D
      let partName = "Front";
      if (front.subtype === 'szuflada') {
        drawerCount++;
        partName = `Front szuflady ${drawerCount}`;
      } else if (front.subtype === 'drzwi') {
        doorCount++;
        partName = `Drzwi ${doorCount}`;
      } else if (front.subtype === 'drzwi-lp') {
        const side = front.id.endsWith('-L') ? 'Lewe' : 'Prawe';
        partName = `Drzwi ${side}`;
      }

      // Wrzucamy gotowe wymiary z edytora na listę formatek
      parts.push({
        name: partName,
        length: parseFloat(front.h.toFixed(1)),
        width: parseFloat(front.w.toFixed(1)),
        qty: 1
      });

      // --- GENEROWANIE NAWIERTÓW (Tylko dla szuflad) ---
      if (front.subtype === 'szuflada' && typeof calculateDrawerHoles === 'function') {
        
        // Zapisaliśmy w editor2d `frontIndex`. Jeśli to 0, znaczy że to najniższa szuflada w swojej grupie.
        const isBottomInZone = front.frontIndex === 0;

        // Przekazujemy front.y - nasz Edytor 2D dba o to, że to dokładna współrzędna początku frontu na osi Y
        const drawerHoles = calculateDrawerHoles(
          state.project.front.drawerSystem,
          front.y, 
          front.h,
          board,
          drawerCount - 1, 
          isBottomInZone
        );
        if (drawerHoles) mountingData.push(drawerHoles);
      }
    });
  }

  return { parts, mountingData };
}