import { describe, it, expect } from "vitest";
import { getCabinetPanels, getCabinetConstruction } from "./cabinetDrillings.js";
import { freshProject, baseModule, fullZoneFront, setProject } from "../test/fixtures.js";

const shelf = (id, y, structural = false) => ({ id, typ: "poziom", x: 18, w: 564, y, h: 18, isStructural: structural });
const setup = (mod, extra = {}) => {
  const project = freshProject({ modules: [mod], ...extra });
  setProject(project);
  return project;
};
const byId = (panels, id) => panels.find((p) => p.id === id);

describe("instrukcja szafki - formatki korpusu z otworami", () => {
  it("boki: łączniki wieńców (wkręt 37 / kołek 69 od przodu i tyłu, w osi wieńca)", () => {
    const mod = baseModule();
    const project = setup(mod);
    const panels = getCabinetPanels(mod, project);
    const left = byId(panels, "bok-lewy").holes.filter((h) => h.to === "wieniec dolny");
    expect(left.map((h) => [h.x, h.kind])).toEqual(expect.arrayContaining([[37, "wkret"], [69, "kolek"], [261, "wkret"], [293, "kolek"], [513 - 69, "kolek"], [513 - 37, "wkret"]]));
    left.forEach((h) => expect(h.y).toBe(9));
    // wieniec dolny: te same pozycje w czołach lewym i prawym
    const w = byId(panels, "wieniec-dolny");
    expect(w.length).toBe(564);
    expect(w.holes.filter((h) => h.edge === "lewe").map((h) => h.z)).toEqual([37, 69, 261, 293, 444, 476]);
    expect(w.holes.filter((h) => h.edge === "prawe")).toHaveLength(6);
  });

  it("półka ruchoma: podpórki 37 mm od przodu i tyłu, 3 otwory co 32 mm, środek 2,5 mm pod półką; stała: wkręt + kołek", () => {
    const mod = baseModule({ elements: [shelf("s1", 300), shelf("s2", 500, true)] });
    const project = setup(mod);
    const panels = getCabinetPanels(mod, project);
    const side = byId(panels, "bok-prawy").holes;
    const pins = side.filter((h) => h.kind === "podporka");
    expect(pins).toHaveLength(6);
    expect(new Set(pins.map((h) => h.x))).toEqual(new Set([37, 476]));
    expect(new Set(pins.map((h) => h.y))).toEqual(new Set([265.5, 297.5, 329.5]));
    const fixed = side.filter((h) => h.to === "półka stała");
    expect(fixed.map((h) => h.kind).sort()).toEqual(["kolek", "kolek", "kolek", "wkret", "wkret", "wkret"]);
    fixed.forEach((h) => expect(h.y).toBe(509));
    // półka stała ma łączniki w obu czołach, ruchoma - żadnych
    expect(byId(panels, "polka-2").holes).toHaveLength(12);
    expect(byId(panels, "polka-1").holes).toHaveLength(0);
  });

  it("drzwi z zawiasami z lewej: prowadniki na boku lewym 37 mm od przodu, para ±16 mm", () => {
    const door = fullZoneFront({ id: "d1", subtype: "drzwi", openingSide: "left" });
    const mod = baseModule({ elements: [door] });
    const project = setup(mod);
    const panels = getCabinetPanels(mod, project);
    const hinges = byId(panels, "bok-lewy").holes.filter((h) => h.kind === "zawias");
    expect(hinges.length).toBeGreaterThanOrEqual(4);
    hinges.forEach((h) => expect(h.x).toBe(37));
    expect(byId(panels, "bok-prawy").holes.filter((h) => h.kind === "zawias")).toHaveLength(0);
  });

  it("szuflada: otwory prowadnic na obu bokach", () => {
    const drawer = fullZoneFront({ id: "s1", subtype: "szuflada", distribution: "1" });
    const mod = baseModule({ elements: [drawer] });
    const project = setup(mod);
    const panels = getCabinetPanels(mod, project);
    const l = byId(panels, "bok-lewy").holes.filter((h) => h.kind === "prowadnica");
    const r = byId(panels, "bok-prawy").holes.filter((h) => h.kind === "prowadnica");
    expect(l.length).toBeGreaterThan(0);
    expect(r.map((h) => [h.x, h.y])).toEqual(l.map((h) => [h.x, h.y]));
  });

  it("wieńce przelotowe: łączniki w licu wieńców i w czołach boków", () => {
    const mod = baseModule({ construction: { joinType: "wience_przelotowe" } });
    const project = setup(mod);
    const panels = getCabinetPanels(mod, project);
    const w = byId(panels, "wieniec-dolny");
    expect(w.length).toBe(600);
    expect(new Set(w.holes.map((h) => h.x))).toEqual(new Set([9, 591]));
    expect(w.holes.every((h) => h.edge === "lico")).toBe(true);
    const side = byId(panels, "bok-lewy");
    expect(side.width).toBe(720 - 36);
    expect(side.holes.filter((h) => h.edge === "dolne")).toHaveLength(6);
    expect(side.holes.filter((h) => h.edge === "gorne")).toHaveLength(6);
  });

  it("plecy w liście z opisem montażu; szafka narożna i skos - bez paneli", () => {
    const mod = baseModule({ backPanel: { type: "nut", offset: 16, grooveDepth: 7, nutBuild: "all", clearance: 2 } });
    const project = setup(mod);
    const back = byId(getCabinetPanels(mod, project), "plecy");
    expect(back.note).toMatch(/w nucie/);
    expect(getCabinetConstruction(mod, project)).toMatchObject({ backType: "nut", legs: true, legsHeight: 100 });
    expect(getCabinetPanels({ ...mod, type: "corner_cabinet" }, project)).toEqual([]);
  });
});
