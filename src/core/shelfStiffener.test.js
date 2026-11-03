import { describe, it, expect } from 'vitest';
import { shelfStiffener, getStiffenerSettings } from './shelfStiffener.js';

const project = { materials: { boardThickness: 18 }, construction: {} };
const shelf = (w, extra = {}) => ({ typ: 'poziom', w, h: 18, ...extra });
const mod = (extra = {}) => ({ type: 'tall_cabinet', construction: {}, ...extra });

describe('shelfStiffener', () => {
  it('dodaje listwę pod półką dłuższą niż próg', () => {
    expect(shelfStiffener(mod(), shelf(1000), project)).toEqual({ length: 1000, height: 50, thickness: 18 });
    expect(shelfStiffener(mod(), shelf(1000, { isStructural: true }), project)).not.toBeNull();
  });

  it('krótka półka i próg dokładnie 800 - bez listwy', () => {
    expect(shelfStiffener(mod(), shelf(559), project)).toBeNull();
    expect(shelfStiffener(mod(), shelf(800), project)).toBeNull();
  });

  it('ustawienia szafki nadpisują projekt', () => {
    const p = { ...project, construction: { shelfStiffener: { minLength: 600, height: 60 } } };
    expect(shelfStiffener(mod(), shelf(700), p)).toEqual({ length: 700, height: 60, thickness: 18 });
    expect(shelfStiffener(mod({ construction: { shelfStiffener: { active: false } } }), shelf(1000), p)).toBeNull();
  });

  it('pomija przegrody, szafki narożne i skosy', () => {
    expect(shelfStiffener(mod(), { typ: 'pion', w: 1000 }, project)).toBeNull();
    expect(shelfStiffener(mod({ type: 'corner_cabinet' }), shelf(1000), project)).toBeNull();
    expect(shelfStiffener(mod({ type: 'slope_cabinet' }), shelf(1000), project)).toBeNull();
  });

  it('błędne wartości wracają do domyślnych', () => {
    expect(getStiffenerSettings(mod({ construction: { shelfStiffener: { minLength: 'x', height: -5 } } }), project))
      .toEqual({ active: true, minLength: 800, height: 50 });
  });
});
