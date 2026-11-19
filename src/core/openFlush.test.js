import { describe, it, expect } from 'vitest';
import { isOpenFlush } from './openFlush.js';

const mod = {
  elements: [
    { id: 'p', typ: 'pion', x: 285, y: 18, w: 18, h: 1904 },
    { id: 's1', typ: 'poziom', x: 18, y: 320, w: 267, h: 18 },
    { id: 's2', typ: 'poziom', x: 303, y: 456, w: 879, h: 18 },
    { id: 'f1', typ: 'front', x: 295.5, y: 18, w: 885, h: 221 },
    { id: 'f2', typ: 'front', x: 295.5, y: 474, w: 441, h: 1450 },
  ],
};

describe('isOpenFlush', () => {
  it('półka w kolumnie bez frontów jest równo z licem', () => {
    expect(isOpenFlush(mod, mod.elements[1])).toBe(true);
  });
  it('półka w kolumnie z frontami ustępuje frontowi', () => {
    expect(isOpenFlush(mod, mod.elements[2])).toBe(false);
  });
  it('przegroda z otwartym regałem po jednej stronie jest równo z licem', () => {
    expect(isOpenFlush(mod, mod.elements[0])).toBe(true);
  });
  it('przegroda z frontami po obu stronach ustępuje', () => {
    const m = { elements: [
      { typ: 'pion', x: 285, y: 18, w: 18, h: 1904 },
      { typ: 'front', x: 20, y: 18, w: 260, h: 500 },
      { typ: 'front', x: 306, y: 18, w: 260, h: 500 },
    ] };
    expect(isOpenFlush(m, m.elements[0])).toBe(false);
  });
  it('przegroda bez frontów jest równo', () => {
    expect(isOpenFlush({ elements: [mod.elements[0], mod.elements[1]] }, mod.elements[0])).toBe(true);
  });
  it('front o zerowej szerokości nie liczy się', () => {
    const m = { elements: [mod.elements[1], { typ: 'front', x: 20, y: 0, w: 0, h: 100 }] };
    expect(isOpenFlush(m, m.elements[0])).toBe(true);
  });
});
