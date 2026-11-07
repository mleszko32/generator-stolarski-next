import { describe, it, expect } from "vitest";
import { groupMembers, clickSelection, canCombine, combineIntoGroup, splitGroup } from "./groupSelection.js";

const make = () => ({
  modules: [{ id: "m1", groupId: "g" }, { id: "m2", groupId: "g" }, { id: "m3" }],
  sidePanels: [{ id: "p1", groupId: "g" }, { id: "p2" }],
});
const sel = (m, p) => ({ moduleIds: new Set(m), panelIds: new Set(p) });

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
