import { describe, it, expect } from "vitest";
import { collectFrontPieces, nestFronts, placedOutline, sheetToDxf, allSheetsToDxf, asciiText } from "./frontsDxf.js";

const mats = [{ id: 'm1', name: 'Biały mat' }, { id: 'm2', name: 'Dąb' }];
const settings = { sheetW: 2800, sheetH: 2070, gap: 20, trim: 10 };

describe("DXF frontów na CNC", () => {
  it("bierze tylko fronty, rozwija sztuki i przypisuje materiał (brak -> pierwszy z cennika)", () => {
    const pieces = collectFrontPieces([
      { name: 'Drzwi Lewe', length: 700, width: 400, qty: 2, category: 'Front', materialId: 'm2' },
      { name: 'Front szuflady', length: 140, width: 596, qty: 1, category: 'Front' },
      { name: 'Bok', length: 720, width: 560, qty: 2, category: 'Korpus' },
    ], mats);
    expect(pieces.map((p) => p.id)).toEqual(['F001', 'F002', 'F003']);
    expect(pieces.map((p) => p.materialId)).toEqual(['m2', 'm2', 'm1']);
    expect(pieces[2].outline).toEqual([[0, 0], [596, 0], [596, 140], [0, 140]]);
  });

  it("każdy materiał na osobnych arkuszach", () => {
    const pieces = collectFrontPieces([
      { name: 'A', length: 700, width: 400, qty: 1, category: 'Front', materialId: 'm1' },
      { name: 'B', length: 700, width: 400, qty: 1, category: 'Front', materialId: 'm2' },
    ], mats);
    const groups = nestFronts(pieces, settings);
    expect(groups.map((g) => g.materialName)).toEqual(['Biały mat', 'Dąb']);
    expect(groups.every((g) => g.result.sheetCount === 1)).toBe(true);
  });

  it("obrys leży w miejscu na arkuszu, wysokość frontu wzdłuż długości arkusza", () => {
    const [g] = nestFronts(collectFrontPieces([{ name: 'Drzwi', length: 700, width: 400, qty: 1, category: 'Front' }], mats), settings);
    const pl = g.result.sheets[0].placements[0];
    const pts = placedOutline(pl, settings.sheetH);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(700);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(400);
    expect(Math.min(...xs)).toBe(10);                       // obrzeże
    expect(Math.max(...ys)).toBe(2070 - 10);
  });

  it("front skośny zachowuje kształt (trójkąt bez lustra)", () => {
    const outline = [[0, 0], [400, 0], [400, 300]];         // kąt prosty z prawej na dole
    const [g] = nestFronts(collectFrontPieces([{ name: 'Blenda skos', length: 300, width: 400, qty: 1, category: 'Front', outline }], mats), settings);
    const pts = placedOutline(g.result.sheets[0].placements[0], settings.sheetH);
    expect(pts).toHaveLength(3);
    // Pole ze znakiem (kolejność wierzchołków) takie samo jak w oryginale = obrót, nie lustro.
    const area = (p) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0) / 2;
    expect(area(pts)).toBeCloseTo(area(outline));
  });

  it("plik DXF R12 z warstwami, zamkniętymi poliliniami i tekstem bez polskich znaków", () => {
    const groups = nestFronts(collectFrontPieces([{ name: 'Front szuflady', length: 140, width: 596, qty: 2, category: 'Front' }], mats), settings);
    const dxf = sheetToDxf(groups[0].result.sheets[0], settings, 'Biały mat - arkusz 1/1');
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('FRONTY_KONTUR');
    expect((dxf.match(/\r\nPOLYLINE\r\n/g) || []).length).toBe(3);   // arkusz + 2 fronty
    expect(dxf).toContain('Bialy mat - arkusz 1/1');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
    expect(allSheetsToDxf(groups, settings)).toContain('Bialy mat - arkusz 1/1');
  });

  it("asciiText", () => {
    expect(asciiText('Żółć — 45°')).toBe('Zolc - 45%%d');
  });
});
