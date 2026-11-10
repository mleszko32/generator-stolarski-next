import { describe, it, expect } from "vitest";
import { buildSidebarTree, shortName } from "./sidebarTree.js";

const mod = (id, name, groupId) => ({ id, name, type: "base_cabinet", groupId, dimensions: { width: 600, height: 720, depth: 513 } });
const panel = (id, name, kind, groupId) => ({ id, name, kind, groupId, dimensions: { width: 50, height: 720, depth: 18 }, position: { x: 0, y: 0, z: 0 } });

const project = () => ({
  modules: [mod("a", "S.6 Lewa", "g1"), mod("b", "S.6 Prawa", "g1"), mod("c", "Zlew")],
  sidePanels: [panel("p1", "S.6 Blenda", "blenda"), panel("p2", "", "poziomy"), panel("p3", "Bok", undefined, "g1")],
});

describe("buildSidebarTree", () => {
  it("grupuje szafki i panele po meblach, reszta trafia do luźnych", () => {
    const t = buildSidebarTree(project());
    expect(t.furniture).toHaveLength(1);
    expect(t.furniture[0]).toMatchObject({ key: "g1", code: "M1", label: "S.6" });
    // blenda bez groupId należy do mebla przez przedrostek nazwy
    expect(t.furniture[0].items.map((i) => i.id)).toEqual(["a", "b", "p1", "p3"]);
    expect(t.furniture[0].items.map((i) => i.short)).toEqual(["Lewa", "Prawa", "Blenda", "Bok"]);
    expect(t.loose.map((i) => i.id)).toEqual(["c", "p2"]);
    expect(t.loose[0]).toMatchObject({ kind: "module", code: "M2", meta: "600 × 720 × 513" });
    expect(t.loose[1]).toMatchObject({ kind: "panel", panelKind: "poziomy", name: "Panel poziomy" });
    expect(t.shown).toBe(6);
    expect(t.total).toBe(6);
  });

  it("filtruje po nazwie elementu", () => {
    const t = buildSidebarTree(project(), "prawa");
    expect(t.furniture[0].items.map((i) => i.id)).toEqual(["b"]);
    expect(t.loose).toEqual([]);
    expect(t.shown).toBe(1);
  });

  it("pasująca nazwa mebla pokazuje cały mebel", () => {
    const t = buildSidebarTree(project(), "s.6");
    expect(t.furniture[0].items).toHaveLength(4);
    expect(t.loose).toEqual([]);
  });

  it("shortName: zdejmuje tylko całą nazwę mebla z początku", () => {
    expect(shortName("S.6.2 Szafa lewa – dół", "S.6.2")).toBe("Szafa lewa – dół");
    expect(shortName("S.6.20 Szafa", "S.6.2")).toBe("S.6.20 Szafa");
    expect(shortName("S.6.2", "S.6.2")).toBe("S.6.2");
    expect(shortName("Zlew", "Kuchnia")).toBe("Zlew");
  });

  it("grupa z własną nazwą: z nazw znika wspólny numer, zwykłe słowo zostaje", () => {
    const p = project();
    p.groups = [{ id: "g1", name: "Szafa za drzwiami" }];
    p.sidePanels[0].groupId = "g1";
    p.sidePanels[2].name = "S.6 Bok";
    expect(buildSidebarTree(p).furniture[0].items.map((i) => i.short)).toEqual(["Lewa", "Prawa", "Blenda", "Bok"]);
    const q = { modules: [mod("a", "Szafka dolna 1", "g"), mod("b", "Szafka dolna 2", "g")], sidePanels: [], groups: [{ id: "g", name: "Kuchnia" }] };
    expect(buildSidebarTree(q).furniture[0].items.map((i) => i.short)).toEqual(["Szafka dolna 1", "Szafka dolna 2"]);
  });

  it("pusty projekt", () => {
    expect(buildSidebarTree({ modules: [], sidePanels: [] })).toEqual({ furniture: [], loose: [], shown: 0, total: 0 });
  });
});
