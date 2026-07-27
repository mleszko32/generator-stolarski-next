// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles, getDrawerComponents } from "../core/drawerMath.js";

// ============================================================================
// GŁÓWNA FUNKCJA SILNIKA
// ============================================================================
export function calculateParts() {
  if (!state.project.modules || state.project.modules.length === 0) {
    return { parts: [], mountingData: [] };
  }

  const mod = state.project.modules[0];
  const config = state.project;

  let parts = [];
  let mountingData = [];

  parts.push(...getCorpusParts(mod, config));
  parts.push(...getBackPanelParts(mod, config));
  parts.push(...getInteriorParts(mod, config));

  const frontsAndDrawers = getFrontsAndDrawers(mod, config);
  parts.push(...frontsAndDrawers.parts);
  mountingData.push(...frontsAndDrawers.mountingData);

  return { parts, mountingData };
}

// ============================================================================
// FUNKCJE POMOCNICZE
// ============================================================================

function getCorpusParts(mod, config) {
  const parts = [];
  const { width, height, depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const { type, offset } = config.backPanel;

  const sideDepth = type === 'nut' ? depth : depth - backThick;
  parts.push({ name: "Bok (L/P)", length: height, width: sideDepth, qty: 2 });

  const topBottomDepth = type === 'nut' ? depth - offset - backThick : depth - backThick;
  const structuralShelvesCount = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' && el.isStructural).length : 0;
  
  parts.push({ name: "Wieniec", length: width - (board * 2), width: topBottomDepth, qty: 2 + structuralShelvesCount });

  return parts;
}

function getBackPanelParts(mod, config) {
  const { width, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const { type, grooveDepth, clearance, nutBuild } = config.backPanel;
  
  let hdfWidth, hdfHeight;
  const totalClearance = clearance !== undefined ? clearance * 2 : 4; 
  const currentNutBuild = nutBuild || 'all';

  if (type === 'nut') {
    hdfWidth = (currentNutBuild === 'all' || currentNutBuild === 'sides') 
      ? width - (board * 2) + (grooveDepth * 2) - totalClearance 
      : width - 4;
      
    hdfHeight = (currentNutBuild === 'all' || currentNutBuild === 'top_bottom') 
      ? height - (board * 2) + (grooveDepth * 2) - totalClearance 
      : height - 4;
  } else {
    hdfWidth = width - 4; 
    hdfHeight = height - 4;
  }

  return [{ name: "Plecy (HDF)", length: parseFloat(hdfHeight.toFixed(1)), width: parseFloat(hdfWidth.toFixed(1)), qty: 1 }];
}

function getInteriorParts(mod, config) {
  const parts = [];
  if (!mod.elements || mod.elements.length === 0) return parts;

  const { depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const { type, offset } = config.backPanel;
  
  const frontType = config.front && config.front.type ? config.front.type : 'nakladane';
  const isInset = frontType === 'wpuszczane';

  const topBottomDepth = type === 'nut' ? depth - offset - backThick : depth - backThick;
  const innerPartDepth = topBottomDepth - (isInset ? board : 0);

  let shelfCount = 0;
  let partitionCount = 0;

  mod.elements.forEach(el => {
    if (el.typ === 'pion') {
      partitionCount++;
      parts.push({ name: `Przegroda pionowa ${partitionCount}`, length: parseFloat(el.h.toFixed(1)), width: innerPartDepth, qty: 1 });
    } else if (el.typ === 'poziom' && !el.isStructural) {
      shelfCount++;
      parts.push({ name: `Półka ${shelfCount}`, length: parseFloat(el.w.toFixed(1)), width: innerPartDepth - 5, qty: 1 });
    }
  });

  return parts;
}

function getFrontsAndDrawers(mod, config) {
  const parts = [];
  const mountingData = [];
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front') : [];

  if (fronts.length === 0) return { parts, mountingData };

  fronts.sort((a, b) => a.y - b.y);

  const { width, depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const topBottomDepth = config.backPanel.type === 'nut' 
    ? depth - config.backPanel.offset - config.materials.backThickness 
    : depth - config.materials.backThickness;

  let drawerCount = 0;
  let doorCount = 0;

  fronts.forEach((front, index) => {
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

    // Dodanie formatki frontu
    parts.push({
      name: partName,
      length: parseFloat(front.h.toFixed(1)),
      width: parseFloat(front.w.toFixed(1)),
      qty: 1
    });

    if (front.subtype === 'szuflada') {
      const isBottomInZone = front.frontIndex === 0;
      // Sprawdzamy czy to najwyższa szuflada w szafce
      const isTopInZone = index === fronts.length - 1;
      
      // NAWIERTY
      if (typeof calculateDrawerHoles === 'function') {
        const drawerHoles = calculateDrawerHoles(config.front.drawerSystem, front.y, front.h, board, drawerCount - 1, isBottomInZone);
        if (drawerHoles) mountingData.push(drawerHoles);
      }

      // KOMPONENTY SZUFLADY
      if (typeof getDrawerComponents === 'function') {
        
        // --- TWOJA LOGIKA OBLICZANIA RZECZYWISTEGO ŚWIATŁA ---
        let availableSpace = front.h;
        
        // Szuflada dolna - odejmujemy nachodzenie na wieniec dolny
        if (isBottomInZone) {
          const bottomOverlap = board - (config.front.clearance.bottom || 0);
          availableSpace -= bottomOverlap;
        }
        
        // Szuflada górna - odejmujemy nachodzenie na wieniec górny
        if (isTopInZone) {
          const topOverlap = board - (config.front.clearance.top || 0);
          availableSpace -= topOverlap;
        }

        const drawerComps = getDrawerComponents(config.front.drawerSystem, width - (board * 2), topBottomDepth, availableSpace);
        
        if (drawerComps) {
          parts.push({
            name: `Dno szuflady ${drawerCount} (NL: ${drawerComps.nominalLength})`,
            length: parseFloat(drawerComps.bottom.length.toFixed(1)),
            width: parseFloat(drawerComps.bottom.width.toFixed(1)),
            qty: 1
          });
          parts.push({
            name: `Tył szuflady ${drawerCount} (Wariant ${drawerComps.back.variantType})`,
            length: parseFloat(drawerComps.back.width.toFixed(1)),
            width: parseFloat(drawerComps.back.height.toFixed(1)),
            qty: 1
          });
        }
      }
    }
  });

  return { parts, mountingData };
}