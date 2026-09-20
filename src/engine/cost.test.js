import { describe, it, expect } from 'vitest';
import { state, ensurePricingDefaults, migratePricingExtras } from '../core/state.js';
import { calculateProjectCost } from './cabinet.js';
import { freshProject, setProject } from '../test/fixtures.js';

// Pusty projekt (bez szafek) - koszt materiałów i okuć = 0, więc liczby zależą
// tylko od robocizny, montażu, transportu, marży, rabatu i VAT.
function withPricing(pricing) {
  setProject(freshProject({ modules: [] }));
  state.project.pricing = pricing;
  ensurePricingDefaults(state.project);
  return calculateProjectCost();
}

describe('kosztorys - robocizna, montaż, transport, marża, rabat, VAT', () => {
  it('robocizna i montaż to godziny × stawka, transport osobną pozycją', () => {
    const c = withPricing({ labor: { hours: 10, rate: 80 }, assembly: { hours: 4, rate: 100 }, transport: 250, vatPercent: 0 });
    expect(c.laborCost).toBe(800);
    expect(c.assemblyCost).toBe(400);
    expect(c.transportCost).toBe(250);
    expect(c.subtotal).toBe(1450);
  });

  it('marża od sumy kosztów, rabat od ceny po marży, VAT od ceny po rabacie', () => {
    const c = withPricing({ labor: { hours: 10, rate: 100 }, transport: 0, marginPercent: 20, discountPercent: 10, vatPercent: 23 });
    expect(c.subtotal).toBe(1000);
    expect(c.marginAmount).toBe(200);
    expect(c.priceBeforeDiscount).toBe(1200);
    expect(c.discountAmount).toBe(120);
    expect(c.net).toBe(1080);
    expect(c.vatAmount).toBeCloseTo(248.4, 6);
    expect(c.gross).toBeCloseTo(1328.4, 6);
    expect(c.total).toBe(c.net);
  });

  it('projekt bez nowych pól: VAT 23%, reszta zero, wynik bez zmian względem starego kosztorysu', () => {
    const c = withPricing({ materials: {}, marginPercent: 10, hardware: {} });
    expect(c.laborCost + c.assemblyCost + c.transportCost + c.discountAmount).toBe(0);
    expect(c.vatPercent).toBe(23);
    expect(c.net).toBe(c.subtotal * 1.1);
  });

  it('brak pola pricing wcale też nie wywala kosztorysu', () => {
    setProject(freshProject({ modules: [] }));
    delete state.project.pricing;
    const c = calculateProjectCost();
    expect(c.gross).toBe(0);
    expect(c.vatPercent).toBe(23);
  });

  it('podatek 0% zostaje zerem, a nie wraca do 23%', () => {
    expect(withPricing({ vatPercent: 0 }).vatPercent).toBe(0);
  });
});

describe('migracja pól kosztorysu', () => {
  it('starsze projekty dostają domyślne pola i zachowują ceny', () => {
    setProject(freshProject({ modules: [] }));
    state.project.pricing = { boardPricePerM2: 50, hdfPricePerM2: 20, marginPercent: 15 };
    ensurePricingDefaults(state.project);
    const p = state.project.pricing;
    expect(p.materials.Korpus).toBe(50);
    expect(p.marginPercent).toBe(15);
    expect(p.labor).toEqual({ hours: 0, rate: 0 });
    expect(p.assembly).toEqual({ hours: 0, rate: 0 });
    expect([p.transport, p.discountPercent, p.vatPercent]).toEqual([0, 0, 23]);
  });

  it('odrzuca ujemne i nieliczbowe wartości, rabat ograniczony do 100%', () => {
    const p = migratePricingExtras({ labor: { hours: -5, rate: 'abc' }, transport: -1, discountPercent: 250, vatPercent: 'x' });
    expect(p.labor).toEqual({ hours: 0, rate: 0 });
    expect(p.transport).toBe(0);
    expect(p.discountPercent).toBe(100);
    expect(p.vatPercent).toBe(23);
  });

  it('jest idempotentna', () => {
    const once = migratePricingExtras({ labor: { hours: 2, rate: 90 }, vatPercent: 8 });
    expect(migratePricingExtras({ ...once })).toEqual(once);
  });
});
