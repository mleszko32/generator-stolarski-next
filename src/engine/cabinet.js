import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  const innerWidth = width - (board * 2);
  const totalClearance = clearance * 2; // Luz całkowity (z obu stron)

  let sideDepth, topBottomDepth, backWidth, backHeight;

  if (type === 'nut') {
    sideDepth = depth; // Boki pełne
    topBottomDepth = depth - offset - backThick; // Wieńce krótsze, kończą się przed plecami
    
    // HDF szerokość: światło szafki + 2x wpuszczenie w nut - 2x luz montażowy
    backWidth = innerWidth + (grooveDepth * 2) - totalClearance;
    // HDF wysokość: wysokość szafki - 2x luz montażowy
    backHeight = height - totalClearance;
  } else { // nakładane
    sideDepth = depth - backThick; // Boki płytsze o HDF
    topBottomDepth = depth - backThick; // Wieńce płytsze o HDF
    
    // HDF po obrysie szafki - 2x luz montażowy
    backWidth = width - totalClearance;
    backHeight = height - totalClearance;
  }

  // Półka zawsze względem wieńców pomniejszona o 5mm z przodu
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

  return parts;
}