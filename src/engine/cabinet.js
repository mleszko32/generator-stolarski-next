import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  const innerWidth = width - (board * 2);
  const totalClearance = clearance * 2; 

  let sideDepth, topBottomDepth, backWidth, backHeight;

  if (type === 'nut') {
    sideDepth = depth;
    topBottomDepth = depth - offset - backThick;
    backWidth = innerWidth + (grooveDepth * 2) - totalClearance;
    backHeight = height - totalClearance;
  } else { 
    sideDepth = depth - backThick;
    topBottomDepth = depth - backThick;
    backWidth = width - totalClearance;
    backHeight = height - totalClearance;
  }

  const parts = [
    { name: "Bok lewy", length: height, width: sideDepth, qty: 1 },
    { name: "Bok prawy", length: height, width: sideDepth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1 }
  ];

  // LOGIKA FRONTÓW (Strefy)
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const count = state.project.front.count;
    const gap = state.project.front.gap;

    const frontWidth = width - (fc.sides * 2);
    
    // Obliczamy przestrzeń w pionie i odejmujemy luzy skrajne
    const availableHeight = height - fc.top - fc.bottom;
    
    // Suma wszystkich szczelin MIĘDZY frontami (jest ich zawsze o 1 mniej niż frontów)
    const totalGaps = (count - 1) * gap;
    
    // Wysokość pojedynczego frontu
    const singleFrontHeight = (availableHeight - totalGaps) / count;
    
    parts.push({
      name: count > 1 ? "Front szuflady" : "Front główny",
      length: Number(singleFrontHeight.toFixed(1)), // Zaokrąglamy do 1 miejsca po przecinku (np. 235.3 mm)
      width: frontWidth,
      qty: count
    });
  }

  return parts;
}