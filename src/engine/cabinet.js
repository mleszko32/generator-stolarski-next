import { state } from "../core/state.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;

  // Światło szafki (szerokość minus dwa boki)
  const innerWidth = width - (board * 2);
  
  // Głębokość półki cofniętej o 5 mm od krawędzi przedniej
  const shelfDepth = depth - 5;

  const parts = [
    { name: "Bok lewy", length: height, width: depth, qty: 1 },
    { name: "Bok prawy", length: height, width: depth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: depth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: depth, qty: 1 },
    // Dodajemy nową formatkę:
    { name: "Półka środkowa", length: innerWidth, width: shelfDepth, qty: 1 }
  ];

  return parts;
}