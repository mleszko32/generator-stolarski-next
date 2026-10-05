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

  it("płyta: strona od wnętrza szafki oznaczona", () => {
    const svg = slopeBoardSVG({ ...board, inside: "a", aSide: "wnętrze szafki", bSide: "zewnątrz, widoczny" }, 1);
    expect(svg).toContain("spód — wnętrze szafki (WNĘTRZE)");
    expect(svg).toContain("niebieska krawędź = strona od wnętrza szafki");
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
    expect(svg).toContain("BOK WYSOKI — STRONA WEWNĘTRZNA");
    // Opis wysokości jak na rysunku boku zwykłej szafki: bliższa krawędź + druga w nawiasie.
    expect(svg).toContain(">55</tspan>");
    expect(svg).toContain("DÓŁ");
    expect(svg).toContain("(1045 GÓRA)");
    // Otwory w prawdziwej średnicy (prowadnica fi 5 -> r 2.5).
    expect(svg).toContain('r="2.5"');
    expect(svg).toContain("prowadnica szuflady");
    expect(svg).toContain("podpórka półki");
    expect((svg.match(/<circle/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it("rzut płyty z łącznikami", async () => {
    const { slopePlanSVG } = await import("./slopeDrawing2d.js");
    const svg = slopePlanSVG({ name: "Dno (wieniec dolny)", length: 2000, width: 597, fromLabel: "od lewej krawędzi", holes: [
      { x: 1991, z: 37, type: "screw" }, { x: 1991, z: 69, type: "dowel" },
    ] });
    expect(svg).toContain("DNO (WIENIEC DOLNY) (WIDOK Z GÓRY)");
    expect(svg).toContain("1991");
    expect(svg).toContain("konfirmat");
    expect(svg).toContain("kołek");
  });
});

describe("rysunki skosu - kierunek frontu i prawdziwy kąt", () => {
  it("ściana z frontem po prawej: PRZÓD przy prawej krawędzi, opisy po stronie tyłu (z lewej)", async () => {
    const { slopeFaceSVG } = await import("./slopeDrawing2d.js");
    const face = { name: "Przegroda 1", side: "lewa", note: "patrzy w stronę skosu", width: 597, height: 800, frontOnRight: true, holes: [{ x: 37, y: 38, type: "drawer" }] };
    const svg = slopeFaceSVG(face);
    expect(svg).toMatch(/<text x="582"[^>]*>PRZÓD</);         // 597 - 15
    expect(svg).toContain('cx="560"');                       // otwór 37 od frontu = 597 - 37
    expect(svg).toMatch(/<text x="-48"[^>]*text-anchor="end"/); // kolumna opisów po lewej (tył)
  });

  it("obie strony przegrody w jednej parze", async () => {
    const { slopeFacePairSVG } = await import("./slopeDrawing2d.js");
    const base = { name: "Przegroda 1", width: 597, height: 800, holes: [] };
    const html = slopeFacePairSVG({ ...base, side: "lewa", frontOnRight: true }, { ...base, side: "prawa", frontOnRight: false });
    expect(html.indexOf("STRONA LEWA")).toBeLessThan(html.indexOf("STRONA PRAWA"));
    expect((html.match(/<svg/g) || []).length).toBe(2);
  });

  it("płyta: ścięty koniec w prawdziwym kącie (53,13° dla 24 mm na 18 mm grubości)", () => {
    const svg = slopeBoardSVG({ name: "Półka", width: 592, th: 18, a: [0, 541.8], b: [24, 541.8], aLabel: "spód", bLabel: "wierzch", startLabel: "przy skosie", endLabel: "drugi koniec", length: 541.8, short: 517.8, tiltStart: 53.13, tiltEnd: 0 }, 1);
    // grubość 34 px -> 24 mm przesunięcia = 45,3 px: atan(45,3 / 34) = 53,1°
    expect(svg).toContain("85.3,70");
    expect(svg).toContain(">53,1°<");
  });
});
