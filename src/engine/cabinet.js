import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness; // Pobiera nasze 18mm ze stanu

  // Prosta kalkulacja: boki do ziemi, wieńce wpuszczane między boki
  const parts = [
    { name: "Bok lewy", length: height, width: depth, qty: 1 },
    { name: "Bok prawy", length: height, width: depth, qty: 1 },
    { name: "Wieniec dolny", length: width - (board * 2), width: depth, qty: 1 },
    { name: "Wieniec górny", length: width - (board * 2), width: depth, qty: 1 }
  ];

  return parts;
}