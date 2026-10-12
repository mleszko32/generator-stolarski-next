import { describe, it, expect } from "vitest";
import { getSlopePanels, getSlopeConstruction } from "./slopeDrillings.js";
import { buildSlopeElements, slopeBevelGroove, getSlopeDrillings, getSlopeGeometry } from "../core/slopeCabinet.js";
import { LAMELLO } from "../core/lamello.js";
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

describe("Lamello w skośnym sztorcu (slopeBevelGroove)", () => {
  it("oś rowka przesunięta do niższej krawędzi, rowek na środku grubości boku", () => {
    const lam = LAMELLO.tenso_p14;
    const b = slopeBevelGroove(36.87, 18, lam);       // skos 3:4
    expect(b.width).toBe(22.5);
    expect(b.fromLow).toBe(6);                        // (9 - 7·0,6) / 0,8
    expect(b.shift).toBe(5.3);                        // 7 · tg = 5,25
    expect(b.wall).toBe(2);                           // (18 - (7·0,8 + 14·0,6)) / 2
    expect(b.discAngle).toBe(53.1);                   // tarcza Lamello: kąt bok - skośna płyta
    expect(b.wallTol).toBe(1.2);                      // oś o 1 mm dalej (pomiar ~7 mm przy ~52°) - nadal mieści się
    expect(slopeBevelGroove(55, 18, lam).wall).toBeGreaterThan(1);    // przy 18 mm P-14 mieści się zawsze
    expect(slopeBevelGroove(45, 16, lam).wall).toBeLessThan(1);
  });

  it("rowek w skośnej płycie leży nad rowkiem sztorca, za ciasny rowek = ostrzeżenie", () => {
    const base = slopeMod();
    const plain = getSlopeDrillings(base, state.project).plans.find((p) => p.name.startsWith("Skos")).holes.map((h) => h.x);
    base.slopeJoin = "tenso_p14";
    const g = getSlopeGeometry(base, 18);
    const lam = getSlopeDrillings(base, state.project);
    const xs = [...new Set(lam.plans.find((p) => p.name.startsWith("Skos")).holes.map((h) => h.x))];
    const shift = slopeBevelGroove(g.angle, 18, LAMELLO.tenso_p14).shift;
    expect(xs.map((x) => Math.round((x + shift) * 10) / 10)).toEqual([...new Set(plain)].map((x) => Math.round(x * 10) / 10));
    expect(lam.notes.some((n) => n.includes("nie mieści się"))).toBe(slopeBevelGroove(g.angle, 18, LAMELLO.tenso_p14).wall < 1);
    const bok = byId(getSlopePanels(base, state.project).panels, "bok-wysoki");
    expect(bok.note).toContain("od strony niskiego końca skosu");
    expect(slopeBevelGroove(g.angle, 18, LAMELLO.tenso_p14).disc).toMatchObject({ angle: 55, connector: "P-14", spacer: 4 });
  });
});

describe("Lamello w skosie - zgodność z tarczą kątów", () => {
  it("niski skos (kąt bok - skos 35°) przy 18 mm: tarcza P-10, wybrany P-14 = ostrzeżenie", () => {
    const mod = slopeMod({ width: 1000, height: 1430, dividers: [], shelves: [] });   // skos ok. 55° -> tarcza 35°
    mod.slopeJoin = "tenso_p14";
    const notes = getSlopeDrillings(mod, state.project).notes;
    expect(notes.some((n) => n.includes("łącznik P-10 (podkładka 2 mm)"))).toBe(true);
    mod.slopeJoin = "tenso_p10";
    expect(getSlopeDrillings(mod, state.project).notes.some((n) => n.includes("zmień łącznik"))).toBe(false);
  });
});
