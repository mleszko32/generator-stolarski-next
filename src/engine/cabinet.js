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

  const shelfDepth = topBottomDepth - 5; 

  const parts = [
    { name: "Bok lewy", length: height, width: sideDepth, qty: 1 },
    { name: "Bok prawy", length: height, width: sideDepth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1 }
  ];

  const shelvesCount = state.project.interior.shelvesCount;
  if (shelvesCount > 0) {
    parts.push({ 
      name: "Półka wewnętrzna", 
      length: innerWidth, 
      width: shelfDepth, 
      qty: shelvesCount 
    });
  }

  // LOGIKA FRONTU
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const frontWidth = width - (fc.sides * 2);
    const frontHeight = height - fc.top - fc.bottom;
    
    parts.push({
      name: "Front (Nakładany)",
      length: frontHeight,
      width: frontWidth,
      qty: 1
    });
  }

  return parts;
}