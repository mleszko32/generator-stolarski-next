import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadPriceDefaults, savePriceDefaults, applyPriceDefaults, exportPriceDefaultsJson, importPriceDefaultsJson } from "./priceLibrary.js";

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const samplePricing = () => ({
  materials: { Korpus: 80, Front: 120, Szuflada: 60, Plecy: 25 },
  frontMaterials: [
    { id: "default", name: "Standard", pricePerM2: 120 },
    { id: "lakier", name: "Lakier", pricePerM2: 350 },
  ],
  hardware: { "Nóżka regulowana H-100": 3.5 },
});

describe("baza cen", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });

  it("zapisuje i wczytuje zrzut cennika", () => {
    expect(loadPriceDefaults()).toBeNull();
    savePriceDefaults(samplePricing());
    const snapshot = loadPriceDefaults();
    expect(snapshot.materials.Korpus).toBe(80);
    expect(snapshot.frontMaterials).toHaveLength(2);
    expect(snapshot.hardware["Nóżka regulowana H-100"]).toBe(3.5);
  });

  it("applyPriceDefaults nadpisuje znane kategorie/materiały/okucia, nie kasuje nieznanych", () => {
    const pricing = {
      materials: { Korpus: 0, Front: 0, Szuflada: 0, Plecy: 0 },
      frontMaterials: [
        { id: "x1", name: "Standard", pricePerM2: 0 },
        { id: "x2", name: "Fornir dąb", pricePerM2: 999 }, // nie ma w bazie - zostaje bez zmian
      ],
      hardware: { "Zawias 110°": 8 }, // nie ma w bazie - zostaje bez zmian
    };
    const snapshot = savePriceDefaults(samplePricing());

    applyPriceDefaults(pricing, snapshot);

    expect(pricing.materials.Korpus).toBe(80);
    expect(pricing.materials.Front).toBe(120);
    // "Standard" dopasowany po nazwie, nie po id - dostaje nową cenę
    expect(pricing.frontMaterials.find(m => m.name === "Standard").pricePerM2).toBe(120);
    // nowy materiał z bazy ("Lakier") dopisany
    expect(pricing.frontMaterials.find(m => m.name === "Lakier").pricePerM2).toBe(350);
    // materiał projektu, którego baza nie zna, zostaje nietknięty
    expect(pricing.frontMaterials.find(m => m.name === "Fornir dąb").pricePerM2).toBe(999);
    // okucie z bazy dopisane
    expect(pricing.hardware["Nóżka regulowana H-100"]).toBe(3.5);
    // okucie projektu, którego baza nie zna, zostaje nietknięte
    expect(pricing.hardware["Zawias 110°"]).toBe(8);
  });

  it("eksport i import przenoszą bazę między przeglądarkami", () => {
    savePriceDefaults(samplePricing());
    const json = exportPriceDefaultsJson();

    vi.stubGlobal("localStorage", fakeLocalStorage()); // "inny komputer"
    expect(loadPriceDefaults()).toBeNull();
    expect(importPriceDefaultsJson(json)).toBe(true);
    expect(loadPriceDefaults().materials.Front).toBe(120);
  });

  it("przenosi cenę cięcia formatki; stara baza bez tego pola jej nie zeruje", () => {
    const snapshot = savePriceDefaults({ ...samplePricing(), cuttingPerPart: 4.92 });
    const pricing = { materials: {}, frontMaterials: [], hardware: {}, cuttingPerPart: 0 };
    applyPriceDefaults(pricing, snapshot);
    expect(pricing.cuttingPerPart).toBe(4.92);

    const { cuttingPerPart: _omit, ...oldSnapshot } = snapshot;
    const kept = { materials: {}, frontMaterials: [], hardware: {}, cuttingPerPart: 7.38 };
    applyPriceDefaults(kept, oldSnapshot);
    expect(kept.cuttingPerPart).toBe(7.38);

    expect(importPriceDefaultsJson(exportPriceDefaultsJson())).toBe(true);
    expect(loadPriceDefaults().cuttingPerPart).toBe(4.92);
  });

  it("odrzuca niepoprawny plik", () => {
    expect(importPriceDefaultsJson("nie json")).toBe(false);
    expect(importPriceDefaultsJson('{"x":1}')).toBe(false);
    expect(loadPriceDefaults()).toBeNull();
  });
});
