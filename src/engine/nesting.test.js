import { describe, it, expect } from 'vitest';
import { nestParts, nestPartsFree } from './nesting.js';
import { partEdgeBandingMm, totalEdgeBandingMeters } from './edgeBanding.js';

const OPTS = { sheetW: 2800, sheetH: 2070, kerf: 4, trim: 10 };
const piece = (id, w, h, canRotate = true) => ({ id, w, h, canRotate });

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('nestParts', () => {
  it('mieści kilka formatek na jednym arkuszu bez nakładania i w granicach obrzeża', () => {
    const pieces = [piece(1, 720, 510), piece(2, 720, 510), piece(3, 764, 510), piece(4, 764, 510), piece(5, 600, 400)];
    const r = nestParts(pieces, OPTS);
    expect(r.sheetCount).toBe(1);
    expect(r.unplaced).toHaveLength(0);
    const ps = r.sheets[0].placements;
    expect(ps).toHaveLength(5);
    ps.forEach(p => {
      expect(p.x).toBeGreaterThanOrEqual(OPTS.trim);
      expect(p.y).toBeGreaterThanOrEqual(OPTS.trim);
      expect(p.x + p.w).toBeLessThanOrEqual(OPTS.sheetW - OPTS.trim);
      expect(p.y + p.h).toBeLessThanOrEqual(OPTS.sheetH - OPTS.trim);
    });
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) expect(overlaps(ps[i], ps[j])).toBe(false);
    }
  });

  it('zachowuje szerokość cięcia między formatkami', () => {
    const r = nestParts([piece(1, 1000, 500, false), piece(2, 1000, 500, false)], OPTS);
    const ps = r.sheets[0].placements.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const gapX = ps[1].x - (ps[0].x + ps[0].w);
    const gapY = ps[1].y - (ps[0].y + ps[0].h);
    expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(OPTS.kerf);
  });

  it('bierze kolejny arkusz, gdy się nie mieści, i liczy wszystkie sztuki', () => {
    const pieces = [];
    for (let i = 0; i < 12; i++) pieces.push(piece(i, 2000, 1000, false));
    const r = nestParts(pieces, OPTS);
    const total = r.sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(total).toBe(12);
    expect(r.sheetCount).toBeGreaterThan(1);
  });

  it('nie obraca formatek z canRotate=false', () => {
    const r = nestParts([piece(1, 500, 300, false)], OPTS);
    const p = r.sheets[0].placements[0];
    expect(p.rotated).toBe(false);
    expect(p.w).toBe(500);
    expect(p.h).toBe(300);
  });

  it('zgłasza formatki większe niż arkusz jako unplaced', () => {
    const r = nestParts([piece(1, 3000, 2500)], OPTS);
    expect(r.unplaced).toHaveLength(1);
    expect(r.sheetCount).toBe(0);
  });

  it('procent odpadu jest w zakresie 0-100', () => {
    const r = nestParts([piece(1, 1000, 1000)], OPTS);
    expect(r.wastePct).toBeGreaterThan(0);
    expect(r.wastePct).toBeLessThan(100);
  });
});

describe('oklejanie krawędzi', () => {
  it('okleja formatkę dookoła', () => {
    expect(partEdgeBandingMm({ category: 'Korpus', length: 720, width: 510 })).toBe(2 * (720 + 510));
  });
  it('nie okleja pleców z HDF', () => {
    expect(partEdgeBandingMm({ category: 'Plecy', length: 716, width: 581 })).toBe(0);
  });
  it('sumuje metry z uwzględnieniem ilości', () => {
    const m = totalEdgeBandingMeters([
      { category: 'Front', length: 715, width: 300, qty: 2 },
      { category: 'Plecy', length: 700, width: 500, qty: 1 },
    ]);
    expect(m).toBeCloseTo((2 * (715 + 300) * 2) / 1000, 5);
  });
});

describe("rozkrój dowolny (CNC, MaxRects)", () => {
  const opts = { sheetW: 2800, sheetH: 2070, kerf: 20, trim: 10 };
  const overlaps = (a, b, gap) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

  // Mieszanka frontów kuchni: drzwi, szuflady, wąskie blendy.
  const mix = [];
  let n = 0;
  const add = (w, h, qty) => { for (let i = 0; i < qty; i++) mix.push({ id: 'p' + (++n), w, h, canRotate: false }); };
  add(713, 396, 8); add(713, 596, 4); add(140, 596, 6); add(283, 596, 6); add(2100, 596, 2); add(713, 146, 3); add(1400, 450, 3);

  it("formatki nie nachodzą na siebie (z odstępem) i mieszczą się w arkuszu bez obrzeża", () => {
    const r = nestPartsFree(mix, opts);
    expect(r.unplaced).toHaveLength(0);
    r.sheets.forEach((s) => {
      s.placements.forEach((p, i) => {
        expect(p.x).toBeGreaterThanOrEqual(10);
        expect(p.y).toBeGreaterThanOrEqual(10);
        expect(p.x + p.w).toBeLessThanOrEqual(2790);
        expect(p.y + p.h).toBeLessThanOrEqual(2060);
        s.placements.slice(i + 1).forEach((q) => expect(overlaps(p, q, 20 - 1e-6)).toBe(false));
      });
    });
    expect(r.sheets.flatMap((s) => s.placements)).toHaveLength(mix.length);
  });

  it("nigdy nie gorzej niż układ rzędami (cięcia na wylot)", () => {
    expect(nestPartsFree(mix, opts).sheetCount).toBeLessThanOrEqual(nestParts(mix, opts).sheetCount);
  });

  it("wypełnia miejsce obok wysokiej formatki, czego układ rzędami nie potrafi", () => {
    // Jeden wysoki front i dużo niskich: w rzędach niskie stoją obok wysokiego
    // tylko w jego rzędzie, a reszta idzie pod nim.
    const pcs = [{ id: 'big', w: 1400, h: 2040, canRotate: false }];
    for (let i = 0; i < 12; i++) pcs.push({ id: 's' + i, w: 1300, h: 300, canRotate: false });
    expect(nestPartsFree(pcs, { ...opts, kerf: 10 }).sheetCount).toBe(2);
  });

  it("przekrecanie tylko gdy wolno", () => {
    const r = nestPartsFree([{ id: 'a', w: 500, h: 2600, canRotate: false }], opts);
    expect(r.unplaced).toHaveLength(1);
    const r2 = nestPartsFree([{ id: 'a', w: 500, h: 2600, canRotate: true }], opts);
    expect(r2.unplaced).toHaveLength(0);
    expect(r2.sheets[0].placements[0].rotated).toBe(true);
  });
});
