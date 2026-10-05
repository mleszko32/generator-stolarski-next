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

describe("rysunki nawiertów szafki pod skos", () => {
  it("ściana płyty: otwory, wysokości od dołu i legenda", async () => {
    const { slopeFaceSVG } = await import("./slopeDrawing2d.js");
    const svg = slopeFaceSVG({ name: "Bok wysoki", side: "wewnętrzna", width: 597, height: 1100, holes: [
      { x: 37, y: 55, type: "drawer" }, { x: 69, y: 55, type: "drawer" }, { x: 261, y: 55, type: "drawer" },
      { x: 37, y: 497.5, type: "shelf" },
    ] });
    expect(svg).toContain("Bok wysoki — strona wewnętrzna");
    expect(svg).toContain("55 od dołu");
    expect(svg).toContain("prowadnica szuflady");
    expect(svg).toContain("podpórka półki");
    expect((svg.match(/<circle/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("rzut płyty z łącznikami", async () => {
    const { slopePlanSVG } = await import("./slopeDrawing2d.js");
    const svg = slopePlanSVG({ name: "Dno (wieniec dolny)", length: 2000, width: 597, fromLabel: "od lewej krawędzi", holes: [
      { x: 1991, z: 37, type: "screw" }, { x: 1991, z: 69, type: "dowel" },
    ] });
    expect(svg).toContain("Dno (wieniec dolny) — łączniki");
    expect(svg).toContain("1991");
    expect(svg).toContain("konfirmat");
    expect(svg).toContain("kołek");
  });
});
