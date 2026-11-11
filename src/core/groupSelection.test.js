import { describe, it, expect } from "vitest";
import { groupMembers, clickSelection, canCombine, combineIntoGroup, splitGroup, editTargets, pickedSelection } from "./groupSelection.js";

const make = () => ({
  modules: [{ id: "m1", groupId: "g" }, { id: "m2", groupId: "g" }, { id: "m3" }],
  sidePanels: [{ id: "p1", groupId: "g" }, { id: "p2" }],
});
const sel = (m, p) => ({ moduleIds: new Set(m), panelIds: new Set(p) });

describe("dobieranie szafek Shiftem wewnątrz grupy", () => {
  it("Shift+klik w inną szafkę grupy aktywnej dobiera ją do edycji, ponowny zdejmuje", () => {
    const p = make();
    const s = clickSelection(p, sel([], []), "module", "m1", false);
    const a = clickSelection(p, { ...s, activeId: "m1" }, "module", "m2", true);
    expect(a.picked).toBe(true);
    expect([...a.moduleIds].sort()).toEqual(["m1", "m2"]);
    expect(editTargets(p, a, "m1")).toEqual(["m1", "m2"]);
    const b = clickSelection(p, { ...a, activeId: "m1" }, "module", "m2", true);
    expect(b.removed).toBe(true);
    expect(editTargets(p, b, "m1")).toEqual(["m1"]);
  });

  it("zwykłe kliknięcie czyści dobrane, a szafka spoza grupy dokłada się jak dotąd", () => {
    const p = make();
    const a = clickSelection(p, { ...sel(["m1", "m2"], ["p1"]), activeId: "m1" }, "module", "m2", true);
    expect(clickSelection(p, { ...a, activeId: "m1" }, "module", "m1", false).picks.size).toBe(0);
    const c = clickSelection(p, { ...sel(["m1", "m2"], ["p1"]), activeId: "m1" }, "module", "m3", true);
    expect(c.picked).toBeUndefined();
    expect(editTargets(p, c, "m3")).toEqual(["m1", "m2", "m3"]);
  });

  it("Shift+klik w blendę z grupy aktywnej szafki dobiera ją razem z szafkami, ponowny zdejmuje", () => {
    const p = make();
    const m = clickSelection(p, { ...sel(["m1", "m2"], ["p1"]), activeId: "m1" }, "module", "m2", true);
    const a = clickSelection(p, { ...m, activeId: "m1" }, "panel", "p1", true);
    expect(a.picked).toBe(true);
    expect(a.removed).toBe(false);
    const ps = pickedSelection(p, a, "m1");
    expect([...ps.moduleIds].sort()).toEqual(["m1", "m2"]);
    expect([...ps.panelIds]).toEqual(["p1"]);
    expect(editTargets(p, a, "m1")).toEqual(["m1", "m2"]);
    const b = clickSelection(p, { ...a, activeId: "m1" }, "panel", "p1", true);
    expect(b.removed).toBe(true);
    expect([...pickedSelection(p, b, "m1").panelIds]).toEqual([]);
    expect(pickedSelection(p, sel(["m1", "m2"], ["p1"]), "m1")).toBe(null);
    expect([...a.moduleIds].sort()).toEqual(["m1", "m2"]);
    expect([...a.panelIds]).toEqual(["p1"]);
  });

  it("Shift+klik w szafkę z grupy aktywnej blendy nie odznacza mebla", () => {
    const p = make();
    const a = clickSelection(p, { ...sel(["m1", "m2"], ["p1"]), activeId: null, activePanelId: "p1" }, "module", "m2", true);
    expect(a.removed).toBe(false);
    expect([...a.moduleIds].sort()).toEqual(["m1", "m2"]);
    expect([...a.panelIds]).toEqual(["p1"]);
  });

  it("Shift+klik w blendę spoza grupy dokłada ją, a ponowny zdejmuje", () => {
    const p = make();
    const a = clickSelection(p, { ...sel(["m1", "m2"], ["p1"]), activeId: "m1" }, "panel", "p2", true);
    expect([...a.panelIds].sort()).toEqual(["p1", "p2"]);
    const b = clickSelection(p, { ...a, activeId: null, activePanelId: "p2" }, "panel", "p2", true);
    expect(b.removed).toBe(true);
    expect([...b.panelIds]).toEqual(["p1"]);
  });
});

describe("editTargets - których szafek dotyczą zmiany w panelu", () => {
  it("grupa zaznaczona kliknięciem: tylko kliknięta szafka", () => {
    const s = clickSelection(make(), sel([], []), "module", "m1", false);
    expect(editTargets(make(), s, "m1")).toEqual(["m1"]);
  });

  it("szafki dobrane Shift/Ctrl: wszystkie zaznaczone", () => {
    expect(editTargets(make(), sel(["m1", "m2", "m3"], ["p1"]), "m3")).toEqual(["m1", "m2", "m3"]);
    expect(editTargets(make(), sel(["m3", "m1"], []), "m1")).toEqual(["m3", "m1"]);
  });

  it("pojedyncza szafka bez grupy i brak zaznaczenia", () => {
    expect(editTargets(make(), sel(["m3"], []), "m3")).toEqual(["m3"]);
    expect(editTargets(make(), sel([], []), "m3")).toEqual(["m3"]);
  });
});

describe("groupSelection", () => {
  it("członkowie grupy - szafki i boki", () => {
    expect(groupMembers(make(), "panel", "p1")).toEqual({ moduleIds: ["m1", "m2"], panelIds: ["p1"] });
    expect(groupMembers(make(), "panel", "p2")).toEqual({ moduleIds: [], panelIds: ["p2"] });
  });

  it("Shift/Ctrl dokłada blendę do zaznaczonych szafek i zdejmuje ją drugim klikiem", () => {
    const p = make();
    const a = clickSelection(p, sel(["m3"], []), "panel", "p2", true);
    expect([...a.moduleIds, ...a.panelIds]).toEqual(["m3", "p2"]);
    const b = clickSelection(p, a, "panel", "p2", true);
    expect(b.removed).toBe(true);
    expect([...b.panelIds]).toEqual([]);
  });

  it("zwykły klik zaznacza całą grupę", () => {
    const a = clickSelection(make(), sel(["m3"], ["p2"]), "module", "m1", false);
    expect([...a.moduleIds]).toEqual(["m1", "m2"]);
    expect([...a.panelIds]).toEqual(["p1"]);
  });

  it("łączy szafkę z blendą, boki łączonych grup idą z nimi", () => {
    const p = make();
    expect(canCombine(p, sel(["m3"], ["p2"]))).toBe(true);
    expect(canCombine(p, sel([], ["p2"]))).toBe(false);  // jeden element
    expect(canCombine(p, sel(["m1", "m2"], ["p1"]))).toBe(false);  // już jedna grupa
    combineIntoGroup(p, sel(["m1", "m3"], ["p2"]), "n");
    expect(p.modules.map((m) => m.groupId)).toEqual(["n", "n", "n"]);  // stara grupa łączy się w całości
    expect(p.sidePanels.map((x) => x.groupId)).toEqual(["n", "n"]);
  });

  it("rozbija grupę razem z bokami", () => {
    const p = make();
    splitGroup(p, "g");
    expect([...p.modules, ...p.sidePanels].some((o) => o.groupId)).toBe(false);
  });
});

describe("grupa z samych paneli", () => {
  it("dwa panele bez szafek łączą się w grupę", () => {
    const p = { modules: [], sidePanels: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    expect(canCombine(p, sel([], ["a", "b"]))).toBe(true);
    combineIntoGroup(p, sel([], ["a", "b"]), "w");
    expect(p.sidePanels.map((x) => x.groupId || "-")).toEqual(["w", "w", "-"]);
    expect(groupMembers(p, "panel", "a")).toEqual({ moduleIds: [], panelIds: ["a", "b"] });
  });
});

describe("nazwy grup", () => {
  it("zapis, zmiana i usunięcie przy rozbiciu", async () => {
    const { groupName, setGroupName } = await import("./groupSelection.js");
    const p = make();
    setGroupName(p, "g", "Regał");
    setGroupName(p, "g", "Regał nad biurkiem");
    expect(groupName(p, "g")).toBe("Regał nad biurkiem");
    expect(p.groups).toHaveLength(1);
    splitGroup(p, "g");
    expect(groupName(p, "g")).toBe("");
  });
});
