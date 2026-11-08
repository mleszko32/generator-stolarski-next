import { describe, it, expect, beforeEach } from "vitest";
import {
  findModule, projectOverview, listZones, zoneAt, splitZone, addShelves, setFront,
  clearFronts, removeDivider, moveDivider, setStructural, patchModule, projectIssues,
  addPanel, findPanel, patchPanel,
} from "./assistantApi.js";
import { state } from "./state.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { getPartEdges, withEdges } from "../engine/edgeBanding.js";

describe("panel poziomy (sidePanels kind 'poziomy')", () => {
  beforeEach(() => setProject(freshProject({ modules: [], sidePanels: [] })));

  it("wstawia płytę leżącą z wymiarami i daje formatkę z płyty korpusu", () => {
    const p = addPanel("poziomy", { name: "Wieniec nisza", dimensions: { width: 2102, depth: 383 }, position: { x: 1688, y: 2132, z: 0 } });
    expect(p).toMatchObject({ kind: "poziomy", dimensions: { width: 2102, height: 18, depth: 383 }, position: { x: 1688, y: 2132, z: 0 } });
    expect(findPanel("wieniec nisza")).toBe(p);
    const part = calculateAllProjectParts().find((x) => x.name.includes("Wieniec nisza"));
    expect(part).toMatchObject({ name: "Panel poziomy — Wieniec nisza", length: 2102, width: 383, qty: 1, category: "Korpus" });
    // okleina domyślnie tylko na jednej dłuższej krawędzi; kliknięcie da się cofnąć do domyślnej
    expect(getPartEdges(part)).toEqual([true, false, false, false]);
    expect(withEdges({}, part, [true, false, false, false])).toEqual({});
  });

  it("z materiałem z cennika frontów (bez dekoru) to formatka frontu w tym materiale", () => {
    addPanel("poziomy", { name: "Pod wiszącymi", materialId: "lak", dimensions: { width: 1710, depth: 320 } });
    const part = calculateAllProjectParts().find((x) => x.name.includes("Pod wiszącymi"));
    expect(part).toMatchObject({ length: 1710, width: 320, category: "Front", materialId: "lak" });
    // z dekorem zostaje płytą korpusu w tym dekorze
    addPanel("poziomy", { name: "Z dekorem", decor: "U740 PM", materialId: "lak", dimensions: { width: 800, depth: 300 } });
    expect(calculateAllProjectParts().find((x) => x.name.includes("Z dekorem")).category).toBe("Korpus: U740 PM");
  });

  it("zmiana pól i ochrona id / rodzaju", () => {
    const p = addPanel("poziomy", {});
    patchPanel(p, { position: { y: 819 } });
    expect(p.position).toMatchObject({ y: 819 });
    expect(() => patchPanel(p, { kind: "bok" })).toThrow();
    expect(() => addPanel("szafa")).toThrow();
  });
});

describe("assistantApi — pilot dla Claude'a", () => {
  let mod;
  beforeEach(() => {
    setProject(freshProject({
      modules: [
        baseModule({ id: "m1", name: "Szafa lewa – dół" }),
        baseModule({ id: "m2", name: "Szafa lewa – góra", position: { x: 0, y: 900, z: 0 } }),
        baseModule({ id: "m3", name: "Słupek", position: { x: 600, y: 0, z: 0 } }),
      ],
    }));
    mod = state.project.modules[0];
  });

  it("findModule: po id, dokładnej nazwie, jednoznacznym fragmencie; niejednoznaczne = błąd z listą", () => {
    expect(findModule("m3").name).toBe("Słupek");
    expect(findModule("szafa lewa – góra").id).toBe("m2");
    expect(findModule("dół").id).toBe("m1");
    expect(() => findModule("Szafa lewa")).toThrow(/kilku szafek/);
    expect(() => findModule("kuchnia")).toThrow(/Nie ma szafki/);
  });

  it("projectOverview: wymiary, położenie i zawartość szafek", () => {
    const o = projectOverview();
    expect(o.modules).toHaveLength(3);
    expect(o.modules[1]).toMatchObject({ id: "m2", w: 600, h: 720, d: 513, y: 900, shelves: 0, fronts: [] });
  });

  it("splitZone + zoneAt: półka na zadanej wysokości, ścieżki a = dół, b = góra", () => {
    splitZone(mod, "", "h", 300);
    const zones = listZones(mod);
    expect(zones[0]).toMatchObject({ path: "", kind: "split", divider: { kind: "półka", pos: 300 } });
    expect(zoneAt(mod, "a").rect.maxY).toBe(300);
    expect(zoneAt(mod, "b").rect.minY).toBe(318);
    expect(() => splitZone(mod, "", "h")).toThrow(/już podzielona/);
    expect(() => zoneAt(mod, "c")).toThrow(/Nie ma wnęki/);
  });

  it("przegroda, półki, fronty, przesunięcie i usunięcie dzielnika", () => {
    splitZone(mod, "", "v");
    addShelves(mod, "a", 2);
    expect(mod.elements.filter((e) => e.typ === "poziom")).toHaveLength(2);
    setFront(mod, "a", "drzwi", { openingSide: "left" });
    setFront(mod, "b", "szuflada", { distribution: "3" });
    expect(listZones(mod).find((z) => z.path === "b").fronts).toEqual(["szuflada", "szuflada", "szuflada"]);
    // wyliczony layout frontów od razu po zmianie
    expect(mod.elements.filter((e) => e.subtype === "szuflada").every((e) => e.h > 0)).toBe(true);
    clearFronts(mod, "b");
    expect(mod.elements.some((e) => e.subtype === "szuflada")).toBe(false);
    moveDivider(mod, "", 250);
    expect(zoneAt(mod, "").divider.x).toBe(250);
    setStructural(mod, "", false);
    expect(zoneAt(mod, "").divider.isStructural).toBe(false);
    removeDivider(mod, "");
    expect(mod.elements.some((e) => e.typ === "pion")).toBe(false);
    expect(() => setFront(mod, "", "klapa")).toThrow(/Rodzaj frontu/);
  });

  it("patchModule: głębokie scalenie bez gubienia innych pól, id nietykalne", () => {
    patchModule(mod, { dimensions: { height: 1188 }, legs: { active: false } });
    expect(mod.dimensions).toEqual({ width: 600, height: 1188, depth: 513 });
    expect(mod.legs).toMatchObject({ active: false, height: 100, plinth: true });
    expect(() => patchModule(mod, { id: "x" })).toThrow(/Id/);
  });

  it("projectIssues: bez wpisów informacyjnych", () => {
    expect(projectIssues().every((i) => i.level === "error" || i.level === "warn")).toBe(true);
  });
});
