import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const backOffset = state.project.materials.backOffset;

  // Światło szafki
  const innerWidth = width - (board * 2);
  const innerHeight = height - (board * 2);
  
  // Wymiary pleców HDF (światło + po 8 mm wpuszczenia w nut z każdej strony)
  const groove = 8; 
  const backWidth = innerWidth + (groove * 2);
  const backHeight = innerHeight + (groove * 2);

  // NOWA GŁĘBOKOŚĆ PÓŁKI!
  // Całkowita głębokość szafki 
  // MINUS cofnięcie pleców (15 mm) 
  // MINUS grubość samego HDF (3 mm) 
  // MINUS 5 mm luzu od frontu
  const shelfDepth = depth - backOffset - backThick - 5;

  const parts = [
    { name: "Bok lewy", length: height, width: depth, qty: 1 },
    { name: "Bok prawy", length: height, width: depth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: depth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: depth, qty: 1 },
    { name: "Półka środkowa", length: innerWidth, width: shelfDepth, qty: 1 },
    // Dodajemy HDF na listę rozkroju:
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1 }
  ];

  return parts;
}