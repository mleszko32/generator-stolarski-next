import { describe, it, expect } from "vitest";
import { buildSidebarTree } from "./sidebarTree.js";

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

  it("pusty projekt", () => {
    expect(buildSidebarTree({ modules: [], sidePanels: [] })).toEqual({ furniture: [], loose: [], shown: 0, total: 0 });
  });
});
