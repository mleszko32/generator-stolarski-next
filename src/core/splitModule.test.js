import { describe, it, expect, beforeEach } from "vitest";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { state } from "./state.js";
import { buildZoneTree, splitZoneHorizontal, splitZoneVertical, moveSplit, assignFront, getCabinetInnerRect } from "./zoneTree.js";
import { recalculateLayout } from "./layout.js";
import { listSplitPoints, splitModule, applySplit } from "./splitModule.js";

// Szafa 950 × 2380: półka stała na 518, pod nią przegroda z 4 szufladami, drzwi pary na całość.
function szafa() {
  setProject(freshProject({ modules: [baseModule({ id: "m1", name: "Szafa", type: "tall_cabinet", dimensions: { width: 950, height: 2380, depth: 580 } })] }));
  const mod = state.project.modules[0];
  splitZoneHorizontal(mod, buildZoneTree(mod));
  moveSplit(mod, buildZoneTree(mod), 518);
  mod.elements.find((e) => e.typ === "poziom").isStructural = true;
  splitZoneVertical(mod, buildZoneTree(mod).a);
  assignFront(mod, buildZoneTree(mod), "drzwi-lp");
  assignFront(mod, buildZoneTree(mod).a.a, "szuflada-wewnetrzna", { distribution: "1:1" });
  assignFront(mod, buildZoneTree(mod).a.b, "szuflada-wewnetrzna", { distribution: "1:1" });
  recalculateLayout(mod);
  return mod;
}

const poziom = (mod) => mod.elements.find((e) => e.typ === "poziom").id;
const fronty = (m, sub) => m.elements.filter((e) => e.typ === "front" && e.subtype === sub);

describe("podział szafki na korpusy", () => {
  let mod;
  beforeEach(() => { mod = szafa(); });

  it("listSplitPoints: półka na całą szerokość jest miejscem cięcia, przegroda pod nią nie", () => {
    const pts = listSplitPoints(mod);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ axis: "h", pos: 518 });
    expect(pts[0].fronts.map((f) => f.label)).toEqual(["Drzwi 1 z 2", "Drzwi 2 z 2"]);
  });

  it("cięcie poziome: dolny 536 z szufladami, górny dostaje resztę, wysokość łączna zostaje", () => {
    const { first, second } = splitModule(mod, state.project, { dividerId: poziom(mod), straddle: "both" });
    expect(first.dimensions.height).toBe(536);
    expect(first.dimensions.height + second.dimensions.height).toBe(2380);
    expect(second.position.y).toBe(100 + 536);
    expect(second.legs.active).toBe(false);
    expect(fronty(first, "szuflada-wewnetrzna")).toHaveLength(4);
    expect(fronty(second, "szuflada-wewnetrzna")).toHaveLength(0);
    expect(getCabinetInnerRect(first).maxY).toBe(518);
    expect(first.elements.some((e) => e.typ === "poziom")).toBe(false);
  });

  it("fronty 'both': każdy korpus dostaje własną parę drzwi na swoją wysokość", () => {
    const { first, second } = splitModule(mod, state.project, { dividerId: poziom(mod), straddle: "both" });
    expect(fronty(first, "drzwi-lp")).toHaveLength(2);
    expect(fronty(second, "drzwi-lp")).toHaveLength(2);
    const h1 = fronty(first, "drzwi-lp")[0].h;
    const h2 = fronty(second, "drzwi-lp")[0].h;
    expect(h1).toBeLessThan(540);
    expect(h2).toBeGreaterThan(1700);
    const ids = [...first.elements, ...second.elements].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fronty 'first': drzwi zostają w dolnym korpusie i sięgają góry całej szafy", () => {
    const { first, second } = splitModule(mod, state.project, { dividerId: poziom(mod), straddle: "first" });
    expect(fronty(second, "drzwi-lp")).toHaveLength(0);
    const d = fronty(first, "drzwi-lp")[0];
    expect(d.y + d.h).toBeGreaterThan(2360);
  });

  it("fronty 'second': drzwi zostają w górnym korpusie i schodzą do podłogi", () => {
    const { first, second } = splitModule(mod, state.project, { dividerId: poziom(mod), straddle: "second" });
    expect(fronty(first, "drzwi-lp")).toHaveLength(0);
    const d = fronty(second, "drzwi-lp")[0];
    expect(d.y).toBeLessThan(-500);
    expect(d.y + d.h).toBeGreaterThan(1800);
  });

  it("wybór per front: jedne drzwi w jednym, drugie w drugim korpusie", () => {
    const [d1, d2] = fronty(mod, "drzwi-lp");
    const { first, second } = splitModule(mod, state.project, { dividerId: poziom(mod), fronts: { [d1.id]: "first", [d2.id]: "second" } });
    expect(fronty(first, "drzwi-lp")).toHaveLength(1);
    expect(fronty(second, "drzwi-lp")).toHaveLength(1);
  });

  it("applySplit: oryginał zostaje pierwszą częścią, druga wstawiona zaraz za nim", () => {
    const orig = mod;
    const { second } = applySplit(mod, { dividerId: poziom(mod), straddle: "both" });
    expect(state.project.modules).toHaveLength(2);
    expect(state.project.modules[0]).toBe(orig);
    expect(state.project.modules[1]).toBe(second);
    expect(orig.id).toBe("m1");
    expect(second.id).not.toBe("m1");
  });

  it("cięcie pionowe: dwa korpusy obok siebie, szerokość łączna zostaje", () => {
    setProject(freshProject({ modules: [baseModule({ id: "m2", name: "Szafa", dimensions: { width: 950, height: 720, depth: 580 } })] }));
    const m = state.project.modules[0];
    splitZoneVertical(m, buildZoneTree(m));
    moveSplit(m, buildZoneTree(m), 466);
    assignFront(m, buildZoneTree(m), "drzwi-lp");
    recalculateLayout(m);
    const pts = listSplitPoints(m);
    expect(pts[0]).toMatchObject({ axis: "v" });
    const { first, second } = splitModule(m, state.project, { dividerId: pts[0].id, straddle: "both" });
    expect(first.dimensions.width + second.dimensions.width).toBe(950);
    expect(second.position.x).toBe(first.dimensions.width);
    expect(fronty(first, "drzwi-lp")).toHaveLength(2);
    const stay = splitModule(m, state.project, { dividerId: pts[0].id, straddle: "first" });
    const w = fronty(stay.first, "drzwi-lp").reduce((s, f) => s + f.w, 0);
    expect(w).toBeGreaterThan(930);
    expect(fronty(stay.second, "drzwi-lp")).toHaveLength(0);
  });

  it("szafka narożna i dzielnik bez pełnego rozpięcia dają czytelny błąd", () => {
    expect(() => splitModule({ ...mod, type: "corner_cabinet" }, state.project, { dividerId: "x" })).toThrow(/nie da się/);
    expect(() => splitModule(mod, state.project, { dividerId: "brak" })).toThrow(/półkę albo przegrodę/);
  });
});
