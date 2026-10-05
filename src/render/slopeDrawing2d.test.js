import { describe, it, expect } from "vitest";
import { slopeBoardSVG, slopeShapeSVG } from "./slopeDrawing2d.js";

describe("rysunki cięcia szafki pod skos", () => {
  const board = { name: "Półka", width: 592, th: 18, a: [0, 541.8], b: [24, 541.8], aLabel: "spód", bLabel: "wierzch", startLabel: "przy skosie", endLabel: "drugi koniec", length: 541.8, short: 517.8, tiltStart: 53.13, tiltEnd: 0 };

  it("płyta: kąt pochylenia piły, ostrzeżenie powyżej 45°, cięcie proste na drugim końcu", () => {
    const svg = slopeBoardSVG(board, 2);
    expect(svg).toContain("Półka — 2 szt.");
    expect(svg).toContain("piła 53,1°");
    expect(svg).toContain("więcej niż 45°");
    expect(svg).toContain("drugi koniec: cięcie proste");
  });

  it("obrys: długości boków i kąty inne niż proste", () => {
    const svg = slopeShapeSVG({ name: "Blenda skos", category: "Front", qty: 1, points: [[0, 0], [400, 0], [400, 300]] });
    expect(svg).toContain("<polygon");
    expect(svg).toContain(">400<");
    expect(svg).toContain(">500<");          // przeciwprostokątna 3-4-5
    expect(svg).toContain("36,9°");
    expect(svg).not.toContain(">90°<");
  });
});
