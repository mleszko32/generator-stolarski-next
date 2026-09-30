import { describe, it, expect } from "vitest";
import { validateProjectData } from "./projectSchema.js";

const goodMod = (id, over = {}) => ({
  id,
  type: "base_cabinet",
  dimensions: { width: 600, height: 720, depth: 513 },
  position: { x: 0, y: 0, z: 0 },
  elements: [],
  ...over,
});

describe("validateProjectData", () => {
  it("akceptuje poprawny projekt bez zmian (passthrough zachowuje wszystkie pola)", () => {
    const raw = {
      name: "Test",
      materials: { boardThickness: 18 },
      modules: [goodMod("a")],
      sidePanels: [{ id: "s1", name: "Bok 1" }],
    };
    const result = validateProjectData(raw);
    expect(result.success).toBe(true);
    // toEqual (nie porównanie stringów) - zod's .passthrough() zachowuje wszystkie
    // dane, ale przestawia kolejność kluczy (zadeklarowane w schemie na początek).
    expect(result.data).toEqual(raw);
  });

  it("odrzuca dane, które nie są obiektem", () => {
    expect(validateProjectData(null).success).toBe(false);
    expect(validateProjectData([]).success).toBe(false);
    expect(validateProjectData("oops").success).toBe(false);
  });

  it("brak pola modules leczy się do pustej tablicy (nic nie było do odzyskania)", () => {
    const result = validateProjectData({ name: "Pusty" });
    expect(result.success).toBe(true);
    expect(result.data.modules).toEqual([]);
  });

  it("modules niebędące tablicą leczy się do pustej tablicy", () => {
    const result = validateProjectData({ modules: "oops" });
    expect(result.success).toBe(true);
    expect(result.data.modules).toEqual([]);
  });

  it("odrzuca CAŁY projekt, gdy JEDEN moduł w tablicy jest naprawdę zepsuty - nie gubi po cichu pozostałych dobrych", () => {
    const badModule = { type: "base_cabinet", dimensions: {}, position: {}, elements: [] }; // brak id
    const raw = { modules: [goodMod("a"), goodMod("b"), badModule, goodMod("c")] };
    const result = validateProjectData(raw);
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/modules\.2\.id/);
  });

  it("brakujące/złe position i elements POJEDYNCZEGO modułu leczą się bez odrzucania projektu", () => {
    const raw = { modules: [{ id: "a", type: "base_cabinet", dimensions: { width: 600 }, elements: "oops" }] };
    const result = validateProjectData(raw);
    expect(result.success).toBe(true);
    expect(result.data.modules[0].position).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.data.modules[0].elements).toEqual([]);
  });

  it("nieznane/dodatkowe pola modułu (np. baseZone frontu) przechodzą bez zmian", () => {
    const raw = {
      modules: [
        goodMod("a", {
          elements: [{ id: "f1", typ: "front", subtype: "drzwi", baseZone: { minX: 18, maxX: 582, boundLeft: "cab-left" } }],
        }),
      ],
    };
    const result = validateProjectData(raw);
    expect(result.success).toBe(true);
    expect(result.data.modules[0].elements[0].baseZone).toEqual({ minX: 18, maxX: 582, boundLeft: "cab-left" });
  });
});
