import { describe, it, expect } from "vitest";
import { collectFrontPieces, nestFronts, placedOutline, placedOutlines, pairTriangles, rightTriangleCorner, sheetToDxf, allSheetsToDxf, asciiText } from "./frontsDxf.js";

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

describe("parowanie trójkątów (blendy skosu)", () => {
  const tri = (name, outline, qty = 1) => ({ name, length: 300, width: 400, qty, category: 'Front', outline });
  const BR = [[0, 0], [400, 0], [400, 300]];   // kąt prosty w prawym dolnym rogu
  const area = (p) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0) / 2;
  // Najmniejsza odległość wierzchołka jednego trójkąta od przeciwprostokątnej drugiego.
  const distToLine = ([px, py], [ax, ay], [bx, by]) => Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / Math.hypot(bx - ax, by - ay);

  it("rozpoznaje róg kąta prostego", () => {
    expect(rightTriangleCorner(BR, 400, 300)).toEqual({ lr: 'R', bt: 'B' });
    expect(rightTriangleCorner([[0, 0], [400, 0], [0, 300]], 400, 300)).toEqual({ lr: 'L', bt: 'B' });
    expect(rightTriangleCorner([[0, 0], [400, 0], [200, 300]], 400, 300)).toBeNull();
    expect(rightTriangleCorner([[0, 0], [400, 0], [400, 300], [0, 300]], 400, 300)).toBeNull();
  });

  it("dwa jednakowe trójkąty = jeden element, szerszy o odstęp mierzony prostopadle do przeciwprostokątnej", () => {
    const pieces = collectFrontPieces([tri('Blenda skos', BR, 2)]);
    const items = pairTriangles(pieces, 20);
    expect(items).toHaveLength(1);
    const it = items[0];
    expect(it.id).toBe('F001+F002');
    expect(it.frontW).toBeCloseTo(400 + 20 * 500 / 300);    // przeciwprostokątna 500
    expect(it.frontH).toBe(300);
    const [a, b] = it.members.map((m) => m.points);
    // Drugi trójkąt obrócony o 180° (nie lustro) i z kątem prostym naprzeciwko.
    expect(area(b)).toBeCloseTo(area(a));
    // Odstęp między przeciwprostokątnymi = 20 mm.
    const hypA = a.filter(([x, y]) => !(x === Math.max(...a.map((p) => p[0])) && y === 0));
    const minDist = Math.min(...b.map((pt) => distToLine(pt, hypA[0], hypA[1])));
    expect(minDist).toBeCloseTo(20);
    // Wszystko w obrębie elementu.
    [...a, ...b].forEach(([x, y]) => { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(it.frontW + 1e-9); expect(y).toBeLessThanOrEqual(300); });
  });

  it("nieparzysta liczba: ostatni trójkąt zostaje sam, inne kształty nietknięte", () => {
    const pieces = collectFrontPieces([tri('Blenda skos', BR, 3), { name: 'Drzwi', length: 700, width: 400, qty: 1, category: 'Front' }]);
    const items = pairTriangles(pieces, 20);
    expect(items.map((i) => i.members.length).sort()).toEqual([1, 1, 2]);
    expect(items.flatMap((i) => i.members.map((m) => m.piece.id)).sort()).toEqual(['F001', 'F002', 'F003', 'F004']);
  });

  it("para trafia do DXF jako dwa osobne obrysy", () => {
    const groups = nestFronts(collectFrontPieces([tri('Blenda skos', BR, 2)]), settings);
    const pl = groups[0].result.sheets[0].placements[0];
    expect(placedOutlines(pl, settings.sheetH)).toHaveLength(2);
    const dxf = sheetToDxf(groups[0].result.sheets[0], settings);
    expect((dxf.match(/\r\nPOLYLINE\r\n/g) || []).length).toBe(3);   // arkusz + 2 trójkąty
    expect(dxf).toContain('F001');
    expect(dxf).toContain('F002');
  });
  it('kąt prosty po lewej: trójkąty nie nachodzą na siebie, odstęp 20 mm', () => {
    const LB = [[0, 0], [400, 0], [0, 300]];
    const [it] = pairTriangles(collectFrontPieces([tri('Blenda skos', LB, 2)]), 20);
    const [a, b] = it.members.map((m) => m.points);
    // Przeciwprostokątna a: wierzchołki inne niż kąt prosty (najmniejsze x i y).
    const hypA = a.filter(([x, y]) => !(x === Math.min(...a.map((p) => p[0])) && y === 0));
    expect(Math.min(...b.map((pt) => distToLine(pt, hypA[0], hypA[1])))).toBeCloseTo(20);
    expect(Math.min(...a.map((p) => p[0]))).toBeCloseTo(0);
    expect(Math.max(...b.map((p) => p[0]))).toBeCloseTo(it.frontW);
  });
});
