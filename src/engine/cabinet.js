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
  const { type, offset, grooveDepth, clearance, nutBuild } = state.project.backPanel;

  const frontType = state.project.front && state.project.front.type ? state.project.front.type : 'nakladane';
  const isInset = frontType === 'wpuszczane';
  const currentNutBuild = nutBuild || 'all';

  let parts = [];

  // 1. Boki (2 szt.)
  let sideDepth = type === 'nut' ? depth : depth - backThick;
  parts.push({ name: "Bok (L/P)", length: height, width: sideDepth, qty: 2 });

  // 2. Wieniec (Góra + Dół + Półki konstrukcyjne)
  let topBottomDepth = type === 'nut' ? depth - offset - backThick : depth - backThick;
  
  const structuralShelvesCount = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' && el.isStructural).length : 0;
  const wieniecQty = 2 + structuralShelvesCount;
  
  parts.push({ name: "Wieniec", length: width - (board * 2), width: topBottomDepth, qty: wieniecQty });

  // 3. Plecy (HDF) - 1 szt. (Z UWZGLĘDNIENIEM NUTU DOOKOŁA)
  let hdfWidth, hdfHeight;
  const totalClearance = clearance * 2;
  
  if (type === 'nut') {
    // Szerokość HDF: światło między bokami + głębokość nutów z obu stron boku - luz
    hdfWidth = (width - (board * 2)) + ((currentNutBuild === 'all' || currentNutBuild === 'sides') ? (grooveDepth * 2) : 0) - totalClearance;
    
    // Wysokość HDF: światło między wieńcami + głębokość nutów z góry i dołu - luz
    hdfHeight = (height - (board * 2)) + ((currentNutBuild === 'all' || currentNutBuild === 'top_bottom') ? (grooveDepth * 2) : 0) - totalClearance;
  } else {
    hdfWidth = width - totalClearance;
    hdfHeight = height - totalClearance;
  }
  
  parts.push({ name: "Plecy (HDF)", length: parseFloat(hdfHeight.toFixed(1)), width: parseFloat(hdfWidth.toFixed(1)), qty: 1 });

  // 4. Wnętrze (Półki luźne i Przegrody)
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
        if (!el.isStructural) {
          shelfCount++;
          parts.push({ name: `Półka ${shelfCount}`, length: parseFloat(el.w.toFixed(1)), width: innerPartDepth - 5, qty: 1 });
        }
      }
    });
  }

  // 5. Fronty i szuflady
  let mountingData = [];
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front') : [];

  if (fronts.length > 0) {
    fronts.sort((a, b) => a.y - b.y);

    let drawerCount = 0;
    let doorCount = 0;

    fronts.forEach(front => {
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

      parts.push({
        name: partName,
        length: parseFloat(front.h.toFixed(1)),
        width: parseFloat(front.w.toFixed(1)),
        qty: 1
      });

      if (front.subtype === 'szuflada' && typeof calculateDrawerHoles === 'function') {
        const isBottomInZone = front.frontIndex === 0;
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