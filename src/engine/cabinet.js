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

  // 4. Wnętrze bezpośrednio z płaskiej listy formatek (Flat Data)
  if (mod.elements && mod.elements.length > 0) {
    mod.elements.forEach((el, index) => {
      if (el.typ === 'pion') {
        parts.push({ name: `Przegroda pionowa ${index + 1}`, length: parseFloat(el.h.toFixed(1)), width: topBottomDepth, qty: 1 });
      } else if (el.typ === 'poziom') {
        parts.push({ name: `Półka ${index + 1}`, length: parseFloat(el.w.toFixed(1)), width: topBottomDepth, qty: 1 });
      }
    });
  }

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
}