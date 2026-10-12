import { describe, it, expect } from "vitest";
import { getSlopePanels, getSlopeConstruction } from "./slopeDrillings.js";
import { buildSlopeElements } from "../core/slopeCabinet.js";
import { recalculateLayout } from "../core/layout.js";
import { calculateProjectHardware } from "./hardware.js";
import { state } from "../core/state.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

// Szafka pod skos jak w core/slopeCabinet.test.js: wnętrze z edytora 2D (przegrody, półki, szuflady).
function slopeMod({ width = 2000, height = 1500, depth = 600, lowSide = "left", lowHeight = 0, dividers = [646, 1314], shelves = [500, 1000] } = {}) {
  const mod = {
    id: "skos", name: "Skos", type: "slope_cabinet",
    dimensions: { width, height, depth }, position: { x: 0, y: 0, z: 0 },
    legs: { active: false }, front: {}, slope: { lowSide, lowHeight, drawerBox: "A" }, elements: [],
  };
  const project = freshProject({ modules: [mod] });
  project.front.drawerSystem = "movento_katalog";
  setProject(project);
  mod.elements = buildSlopeElements(mod, 18, dividers, shelves, 3);
  recalculateLayout(mod);
  return mod;
}
const byId = (panels, id) => panels.find((p) => p.id === id);
// Głębokość płyt 600 - 3 = 597 > 250 mm rozstawu: dwa zestawy środkowe w rastrze 32 od przedniego wkrętu.
const SCREWS = [37, 197, 389, 560];

describe("instrukcja szafki pod skos - formatki z otworami", () => {
  it("tylko dla szafki pod skos", () => {
    const mod = baseModule();
    setProject(freshProject({ modules: [mod] }));
    expect(getSlopePanels(mod, state.project)).toEqual({ panels: [], notes: [] });
  });

  it("trójkąt: bok wysoki, przegrody, dno, skos, półki, plecy - bez boku niskiego", () => {
    const mod = slopeMod();
    const { panels, notes } = getSlopePanels(mod, state.project);
    const ids = panels.map((p) => p.id);
    expect(ids.slice(0, 5)).toEqual(["bok-wysoki", "przegroda-1", "przegroda-2", "dno", "skos"]);
    expect(ids).not.toContain("bok-niski");
    expect(ids[ids.length - 1]).toBe("plecy");
    expect(notes).toEqual([]);
    expect(byId(panels, "dno")).toMatchObject({ length: 2000, width: 597 });
    expect(byId(panels, "skos").note).toContain("36,9°");
  });

  it("dno: łączniki pod każdą płytą stojącą na dnie, w rozstawie jak zwykła szafka; czoła dolne płyt pasują", () => {
    const mod = slopeMod();
    const { panels } = getSlopePanels(mod, state.project);
    const dno = byId(panels, "dno").holes;
    // bok wysoki + 2 przegrody, po 4 zestawy
    expect(dno.filter((h) => h.kind === "wkret")).toHaveLength(12);
    expect([...new Set(dno.filter((h) => h.kind === "wkret").map((h) => h.z))]).toEqual(SCREWS);
    const bok = byId(panels, "bok-wysoki").holes;
    expect(bok.filter((h) => h.edge === "dolne" && h.kind === "wkret").map((h) => h.x)).toEqual(SCREWS);
    expect(bok.filter((h) => h.edge === "dolne" && h.kind === "kolek")).toHaveLength(4);
    // skos: tylko wkręty, w górne końce boku i przegród
    const skos = byId(panels, "skos").holes;
    expect(skos.every((h) => h.kind === "wkret" && h.edge === "lico")).toBe(true);
    expect(skos).toHaveLength(12);
    expect(bok.filter((h) => h.edge === "gorne").map((h) => h.x)).toEqual(SCREWS);
  });

  it("bok wysoki: prowadnice i podpórki jak na rysunku nawiertów skosu", () => {
    const mod = slopeMod();
    const { panels } = getSlopePanels(mod, state.project);
    const bok = byId(panels, "bok-wysoki");
    expect(bok.holes.filter((h) => h.kind === "prowadnica")).toHaveLength(10);
    expect(bok.holes.filter((h) => h.kind === "podporka")).toHaveLength(12);
    expect(bok.frontOnRight).toBe(true);
  });

  it("przegroda: otwory obu stron oznaczone stroną, cięcie góry w opisie", () => {
    const mod = slopeMod();
    const { panels } = getSlopePanels(mod, state.project);
    const p = byId(panels, "przegroda-2");
    expect(p.holes.filter((h) => h.side === "lewa" && h.kind === "prowadnica")).toHaveLength(5);
    expect(p.holes.filter((h) => h.side === "prawa" && h.kind === "prowadnica")).toHaveLength(10);
    expect(p.note).toContain("piła");
  });

  it("trapez: bok niski; półka stała ma łączniki w czołach przy ścianach", () => {
    const mod = slopeMod({ lowHeight: 500, dividers: [646], shelves: [300] });
    mod.elements.filter((e) => e.typ === "poziom").forEach((e) => { e.isStructural = true; });
    const { panels } = getSlopePanels(mod, state.project);
    expect(byId(panels, "bok-niski")).toBeTruthy();
    const shelves = panels.filter((p) => p.kind === "polka" && p.structural);
    expect(shelves.length).toBeGreaterThan(0);
    shelves.forEach((s) => {
      const edges = new Set(s.holes.map((h) => h.edge));
      expect(edges.size).toBeGreaterThan(0);
      expect(s.holes.filter((h) => h.kind === "wkret").every((h) => SCREWS.includes(h.z))).toBe(true);
    });
  });

  it("konstrukcja i lista okuć: złącza z otworów zamiast ryczałtu 8", () => {
    const mod = slopeMod();
    const cons = getSlopeConstruction(mod, state.project);
    expect(cons).toMatchObject({ isTriangle: true, dividers: 2, lowSide: "left" });
    const join = calculateProjectHardware().find((h) => String(h.name).startsWith("Złącze korpusowe"));
    // dno 12 + skos 12 (półki ruchome - bez łączników)
    expect(join.qty).toBe(24);
  });
});

describe("szafka pod skos łączona na Lamello (mod.slopeJoin)", () => {
  // Głębokość płyt 597, oś skrajnego 60 od krawędzi, rozstaw maks. 300 -> 3 rowki.
  const Z = [60, 298.5, 537];

  it("Tenso P-14: rowki zamiast kołków i wkrętów w dnie, skosie, czołach boków i półkach stałych", () => {
    const mod = slopeMod();
    mod.slopeJoin = "tenso_p14";
    mod.elements.find((e) => e.typ === "poziom").isStructural = true;
    const { panels } = getSlopePanels(mod, state.project);
    const all = panels.flatMap((p) => p.holes);
    expect(all.some((h) => h.kind === "wkret" || h.kind === "kolek")).toBe(false);
    const dno = byId(panels, "dno");
    expect([...new Set(dno.holes.map((h) => h.z))]).toEqual(Z);
    expect(dno.holes.every((h) => h.kind === "lamello" && h.groove === 75 && h.depth === 14)).toBe(true);
    const bok = byId(panels, "bok-wysoki");
    expect(bok.holes.filter((h) => h.edge === "dolne").map((h) => h.x)).toEqual(Z);
    expect(bok.holes.filter((h) => h.edge === "gorne").map((h) => h.x)).toEqual(Z);
    expect(byId(panels, "skos").holes.every((h) => h.kind === "lamello")).toBe(true);
    const shelf = panels.find((p) => p.kind === "polka" && p.structural);
    expect(shelf.holes.length).toBeGreaterThan(0);
    expect(shelf.holes.every((h) => h.kind === "lamello")).toBe(true);
    expect(all.some((h) => h.kind === "klucz")).toBe(false);
  });

  it("Clamex P-14: otwory na klucz w licu boku przy dnie i skosie; lista okuć liczy łączniki", () => {
    const mod = slopeMod();
    mod.slopeJoin = "clamex_p14";
    const { panels, notes } = getSlopePanels(mod, state.project);
    const bok = byId(panels, "bok-wysoki");
    const keys = bok.holes.filter((h) => h.kind === "klucz");
    expect(keys.map((h) => h.y)).toEqual([7.5, 7.5, 7.5, ...Z.map(() => round(bok.width - 7.5))]);
    expect(notes.some((n) => n.includes("Clamex P-14"))).toBe(true);
    const grooves = ["dno", "skos"].reduce((n, id) => n + byId(panels, id).holes.filter((h) => h.kind === "lamello").length, 0);
    const hw = calculateProjectHardware();
    expect(hw.find((h) => h.name === "Łącznik Lamello Clamex P-14").qty).toBe(grooves);
    expect(hw.some((h) => h.name.startsWith("Złącze korpusowe"))).toBe(false);
    expect(getSlopeConstruction(mod, state.project).join.lam.name).toBe("Clamex P-14");
  });

  it("nieznana wartość = kołek + wkręt", () => {
    const mod = slopeMod();
    mod.slopeJoin = "__proto__";
    const { panels } = getSlopePanels(mod, state.project);
    expect(byId(panels, "dno").holes.some((h) => h.kind === "wkret")).toBe(true);
  });
});
const round = (v) => Math.round(v * 10) / 10;
