import { describe, it, expect } from "vitest";
import { getCostExcluded, setCostExcluded, costChoices, narrowProjectForCost, costScopeLabel } from "./costSelection.js";

const project = () => ({
  modules: [
    { id: "a", name: "Szafa", elements: [] },
    { id: "b", name: "Komoda", elements: [] },
  ],
  sidePanels: [{ id: "p1", name: "Szafa bok" }],
});

describe("costSelection", () => {
  it("bez odznaczeń zwraca ten sam projekt i pusty opis", () => {
    const p = project();
    expect(narrowProjectForCost(p)).toBe(p);
    expect(costScopeLabel(p)).toBe("");
  });

  it("odznaczony mebel znika z kopii, oryginał bez zmian", () => {
    const p = project();
    setCostExcluded(p, ["b"]);
    const n = narrowProjectForCost(p);
    expect(n.modules.map((m) => m.id)).toEqual(["a"]);
    expect(p.modules).toHaveLength(2);
    expect(costScopeLabel(p)).toBe("Wycena częściowa: Szafa, Szafa bok");
  });

  it("wpis o nieistniejącym meblu jest ignorowany; pusta lista kasuje pole", () => {
    const p = project();
    setCostExcluded(p, ["nie-ma"]);
    expect(narrowProjectForCost(p)).toBe(p);
    setCostExcluded(p, []);
    expect(getCostExcluded(p)).toEqual([]);
    expect(p.costSelection).toBeUndefined();
  });

  it("lista wyboru ma szafki w kolejności projektu", () => {
    expect(costChoices(project()).map((c) => c.key)).toEqual(["a", "b", "p1"]);
  });
});
