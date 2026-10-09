import { describe, it, expect } from "vitest";
import { getCornerPanels, getCornerConstruction } from "./cornerDrillings.js";
import { getCornerShelfHoles } from "./cornerParts.js";
import { calculateProjectHardware } from "./hardware.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const cornerModule = (overrides = {}) => baseModule({
  id: "mod-corner",
  name: "Narożna",
  type: "corner_cabinet",
  dimensions: { width: 860, legB: 860, depth: 540, height: 720 },
  backPanel: { type: "nakladane", offset: 20, grooveDepth: 13, nutBuild: "sides", clearance: 2 },
  elements: [],
  ...overrides,
});
const setup = (mod, extra = {}) => {
  const project = freshProject({ modules: [mod], ...extra });
  setProject(project);
  return project;
};
const byId = (panels, id) => panels.find((p) => p.id === id);

describe("instrukcja szafki narożnej - formatki z otworami", () => {
  it("tylko dla szafki narożnej", () => {
    const mod = baseModule();
    expect(getCornerPanels(mod, setup(mod))).toEqual([]);
  });

  it("formatki korpusu: boki ramion, listwa, dwa wieńce L, dwoje pleców", () => {
    const mod = cornerModule();
    const panels = getCornerPanels(mod, setup(mod));
    expect(panels.map((p) => p.id)).toEqual(["bok-a", "bok-b", "listwa", "wieniec-dolny", "wieniec-gorny", "plecy-a", "plecy-b"]);
    expect(byId(panels, "bok-a")).toMatchObject({ length: 537, width: 720, frontOnRight: true });
    expect(byId(panels, "bok-b").frontOnRight).toBe(false);
    expect(byId(panels, "listwa")).toMatchObject({ length: 100, width: 684 });
    // wieniec L: formatka (860 - 18 - 3) × (860 - 18 - 3), ramiona głębokości 537
    expect(byId(panels, "wieniec-dolny").outline).toEqual({ blankA: 839, blankB: 839, depthA: 537, depthB: 537, notch: null });
  });

  it("boki: łączniki wieńców jak w zwykłej szafce (jointSetsFor), te same pozycje w czołach wieńca L", () => {
    const mod = cornerModule();
    const panels = getCornerPanels(mod, setup(mod));
    const bottom = byId(panels, "bok-a").holes.filter((h) => h.to === "wieniec dolny");
    // głębokość boku 537 > 250 mm rozstawu: zestaw środkowy w rastrze 32 od przedniego wkrętu
    expect(bottom.filter((h) => h.kind === "wkret").map((h) => h.x)).toEqual([37, 261, 500]);
    expect(bottom.filter((h) => h.kind === "kolek").map((h) => h.x)).toEqual([69, 293, 468]);
    bottom.forEach((h) => expect(h.y).toBe(9));
    const w = byId(panels, "wieniec-dolny");
    const endA = w.holes.filter((h) => h.edge === "koniec-A");
    expect(endA.map((h) => h.z).sort((a, b) => a - b)).toEqual([37, 69, 261, 293, 468, 500]);
    // y w układzie formatki L = od tyłu
    expect(endA.find((h) => h.z === 37)).toMatchObject({ x: 839, y: 500, kind: "wkret" });
    const endB = w.holes.filter((h) => h.edge === "koniec-B");
    expect(endB.find((h) => h.z === 37)).toMatchObject({ x: 500, y: 839, kind: "wkret" });
    // ten sam rozstaw na rysunku 2D boku narożnika
    const side2d = getCornerShelfHoles(mod)[0].joints.filter((j) => j.type === "screw" && j.y === 9);
    expect(side2d.map((j) => j.x)).toEqual([37, 261, 500]);
  });

  it("listwa: kołki w czołach pod kołki w licu wieńców, wieńce mają kołki listwy", () => {
    const mod = cornerModule();
    const panels = getCornerPanels(mod, setup(mod));
    const l = byId(panels, "listwa").holes;
    expect(l.filter((h) => h.edge === "dolne").map((h) => h.x)).toEqual([20, 80]);
    expect(l.filter((h) => h.edge === "gorne").every((h) => h.y === 684)).toBe(true);
    const lico = byId(panels, "wieniec-gorny").holes.filter((h) => h.edge === "lico");
    expect(lico.map((h) => [h.x, h.y, h.kind])).toEqual([[20, 9, "kolek"], [80, 9, "kolek"]]);
    expect(byId(panels, "wieniec-gorny").faceSide).toBe("od spodu");
  });

  it("półki narożne L: podpórki na bokach i listwie (od dołu formatki), półka z wycięciem na listwę", () => {
    const mod = cornerModule({ elements: [{ id: "pn1", typ: "poziom-narozny", y: 360, h: 18 }] });
    const panels = getCornerPanels(mod, setup(mod));
    const shelf = byId(panels, "polka-l");
    expect(shelf).toMatchObject({ qty: 1, kind: "polka-L" });
    expect(shelf.outline).toMatchObject({ depthA: 532, depthB: 532, notch: { w: 100, h: 18 } });
    const pinsA = byId(panels, "bok-a").holes.filter((h) => h.kind === "podporka");
    expect(pinsA).toHaveLength(6);
    expect(new Set(pinsA.map((h) => h.y))).toEqual(new Set([325.5, 357.5, 389.5]));
    // listwa stoi na wieńcu dolnym: wysokości od jej dołu (o grubość wieńca niżej)
    const pinsL = byId(panels, "listwa").holes.filter((h) => h.kind === "podporka");
    expect(new Set(pinsL.map((h) => h.y))).toEqual(new Set([307.5, 339.5, 371.5]));
    expect(new Set(pinsL.map((h) => h.x))).toEqual(new Set([20, 80]));
  });

  it("konstrukcja: 5 nóżek, półki L, drzwi", () => {
    const mod = cornerModule({ elements: [{ id: "pn1", typ: "poziom-narozny", y: 360, h: 18 }] });
    const cons = getCornerConstruction(mod, setup(mod));
    expect(cons).toMatchObject({ legA: 860, legB: 860, depthA: 540, depthB: 540, legCount: 5, legs: true, cornerShelves: 1, doors: 0 });
  });

  it("lista okuć: złącza szafki narożnej z otworów wieńców L zamiast ryczałtu 8", () => {
    const mod = cornerModule();
    setup(mod);
    const join = calculateProjectHardware().find((h) => String(h.name).startsWith("Złącze korpusowe"));
    // 3 zestawy × 2 końce ramion × 2 wieńce
    expect(join.qty).toBe(12);
  });
});
