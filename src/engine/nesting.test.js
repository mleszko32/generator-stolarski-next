import { describe, it, expect } from 'vitest';
import { nestParts } from './nesting.js';
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
