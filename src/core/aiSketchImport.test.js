import { describe, it, expect, beforeEach } from "vitest";
import { sanitizeAiModules, buildModulesFromAi } from "./aiSketchImport.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { state } from "./state.js";

describe("sanitizeAiModules", () => {
  it("typ spoza białej listy -> szafka dolna, wymiary w granicach, nazwa przycięta", () => {
    const [m] = sanitizeAiModules([{ type: "corner_cabinet", width: "99999", height: -5, name: "x".repeat(100) }]);
    expect(m).toMatchObject({ type: "base_cabinet", width: 2400, height: 150 });
    expect(m.name).toHaveLength(60);
  });

  it("strefy: nieznany typ -> drzwi, liczba szuflad 1..8, śmieci pomijane", () => {
    const [m] = sanitizeAiModules([{ type: "base_cabinet", sections: [{ type: "szuflady", count: 50 }, { type: "<x>" }, null, "abc"] }]);
    expect(m.sections).toEqual([{ type: "szuflady", count: 8, height: null }, { type: "drzwi", count: 1, height: null }]);
  });

  it("nie-tablica -> pusta lista", () => {
    expect(sanitizeAiModules({ modules: [] })).toEqual([]);
  });
});

describe("buildModulesFromAi", () => {
  beforeEach(() => setProject(freshProject({ modules: [baseModule({ position: { x: "1200", y: 0, z: 0 } })] })));

  it("stawia szafki na prawo od ostatniej (pozycja jako napis nie skleja się z szerokością)", () => {
    const mods = buildModulesFromAi(sanitizeAiModules([{ type: "base_cabinet", width: 800 }, { type: "upper_cabinet", width: 400 }]), state.project);
    expect(mods.map((m) => m.position.x)).toEqual([1800, 2600]);
    expect(mods[1].type).toBe("upper_cabinet");
    expect(mods[0].backPanel.grooveDepth).toBeDefined(); // pełne domyślne ustawienia jak przy ręcznym dodaniu
  });

  it("szuflady, drzwi L/P i półka między strefami", () => {
    const [m] = buildModulesFromAi(sanitizeAiModules([{ type: "base_cabinet", width: 600, height: 720,
      sections: [{ type: "szuflady", count: 2, height: 360 }, { type: "drzwi_lp", height: 360 }] }]), state.project);
    expect(m.elements.filter((e) => e.subtype === "szuflada")).toHaveLength(2);
    const lp = m.elements.filter((e) => e.subtype === "drzwi-lp");
    expect(lp.map((e) => e.id.includes("-L-"))).toEqual([true, false]);
    expect(m.elements.filter((e) => e.typ === "poziom")).toHaveLength(1);
    expect(new Set(m.elements.map((e) => e.id)).size).toBe(m.elements.length);
  });
});
