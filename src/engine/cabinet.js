import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const backOffset = state.project.materials.backOffset;
  const shelvesCount = state.project.interior.shelvesCount; // Pobieramy ilość ze stanu

  const innerWidth = width - (board * 2);
  const innerHeight = height - (board * 2);
  
  const groove = 8; 
  const backWidth = innerWidth + (groove * 2);
  const backHeight = innerHeight + (groove * 2);
  const shelfDepth = depth - backOffset - backThick - 5;

  const parts = [
    { name: "Bok lewy", length: height, width: depth, qty: 1 },
    { name: "Bok prawy", length: height, width: depth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: depth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: depth, qty: 1 },
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1 }
  ];

  // Jeśli ilość półek jest większa niż 0, dorzucamy je na listę
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