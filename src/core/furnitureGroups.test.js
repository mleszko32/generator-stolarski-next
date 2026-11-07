import { describe, it, expect } from "vitest";
import { commonNamePrefix, furnitureGroups, sharedFurnitureKey, aggregateByFurniture, furnitureChoices, filterByChoice, getExcludedChoices, COLLECTIVE_KEY, UNGROUPED_KEY } from "./furnitureGroups.js";

const project = {
  modules: [
    { id: "a1", groupId: "g1", name: "S.6.2 Szafa lewa 1090" },
    { id: "a2", groupId: "g1", name: "S.6.2 Nadstawka 1" },
    { id: "b1", groupId: "g2", name: "S.6.4 Biurko - szufladki" },
    { id: "b2", groupId: "g2", name: "S.6.4 Siedzisko 1" },
    { id: "c1", name: "Szafka 7" },
  ],
  sidePanels: [
    { id: "p1", kind: "blenda", name: "S.6.2 Blenda przy ścianie 44" },
    { id: "p2", kind: "poziomy", name: "S.6.4 Blat biurka 38" },
    { id: "p3", kind: "bok", name: "" },
    { id: "p4", kind: "bok", groupId: "g1", name: "Bok zaoblony" },
  ],
};

describe("commonNamePrefix", () => {
  it("całe słowa, bez końcowego myślnika", () => {
    expect(commonNamePrefix(["S.6.2 Szafa lewa", "S.6.2 Nadstawka 1"])).toBe("S.6.2");
    expect(commonNamePrefix(["Kuchnia - dół", "Kuchnia - góra"])).toBe("Kuchnia");
    expect(commonNamePrefix(["Szafa", "Szafka"])).toBe("");
  });
});

describe("furnitureGroups", () => {
  it("grupa = jeden mebel z nazwą z przedrostka, boki dołączone po nazwie lub groupId", () => {
    const { groups, moduleKey, panelKey } = furnitureGroups(project);
    expect(groups.map((g) => g.label)).toEqual(["S.6.2", "S.6.4", "Szafka 7", "Bok dokładany"]);
    expect(moduleKey.get("a2")).toBe("g1");
    expect(panelKey.get("p1")).toBe("g1");
    expect(panelKey.get("p2")).toBe("g2");
    expect(panelKey.get("p4")).toBe("g1");
    expect(panelKey.get("p3")).toBe("p3");
  });

  it("cokół pod szafkami z różnych mebli = elementy zbiorcze", () => {
    expect(sharedFurnitureKey(["g1", "g1"])).toBe("g1");
    expect(sharedFurnitureKey(["g1", "g2"])).toBe(COLLECTIVE_KEY);
  });
});

describe("aggregateByFurniture", () => {
  const parts = [
    { category: "Korpus", name: "Bok", length: 700, width: 560, qty: 2, moduleName: "S.6.2 Szafa lewa 1090", furnitureKey: "g1" },
    { category: "Korpus", name: "Bok", length: 700, width: 560, qty: 2, moduleName: "S.6.2 Nadstawka 1", furnitureKey: "g1" },
    { category: "Korpus", name: "Bok", length: 700, width: 560, qty: 2, moduleName: "S.6.4 Siedzisko 1", furnitureKey: "g2" },
    { category: "Front", name: "Cokół dolny (Odcinek 1)", length: 900, width: 100, qty: 1, moduleName: "Elementy zbiorcze", furnitureKey: COLLECTIVE_KEY },
  ];

  it("sumuje tylko w obrębie mebla i podaje nazwę mebla", () => {
    const rows = aggregateByFurniture(parts, project);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ qty: 4, furnitureLabel: "S.6.2" });
    expect(rows[1]).toMatchObject({ qty: 2, furnitureLabel: "S.6.4" });
    expect(rows[2].furnitureLabel).toBe("");
  });

  it("pomija wykluczone meble", () => {
    const rows = aggregateByFurniture(parts, project, ["g1", COLLECTIVE_KEY]);
    expect(rows.map((r) => r.furnitureLabel)).toEqual(["S.6.4"]);
  });

  it("numery mebli M1, M2… z legendą, bez przenumerowania po odznaczeniu", async () => {
    const { furnitureLegend } = await import("./furnitureGroups.js");
    expect(furnitureLegend(project, parts)).toEqual([{ code: "M1", label: "S.6.2" }, { code: "M2", label: "S.6.4" }]);
    expect(aggregateByFurniture(parts, project).map((r) => r.furnitureCode)).toEqual(["M1", "M2", ""]);
    expect(aggregateByFurniture(parts, project, ["g1"]).map((r) => r.furnitureCode)).toEqual(["M2", ""]);
  });

  it("lista wyboru tylko z meblami, które mają formatki", () => {
    expect(furnitureChoices(project, parts).map((g) => g.key)).toEqual(["g1", "g2", COLLECTIVE_KEY]);
  });
});

describe("grupa z samych paneli", () => {
  it("panele na ścianę to jeden mebel z nazwą ze wspólnego początku", () => {
    const p = { modules: [{ id: "m", name: "Szafka 1" }], sidePanels: [
      { id: "a", groupId: "w", name: "Panel ścienny 1" }, { id: "b", groupId: "w", name: "Panel ścienny 2" }] };
    const { groups, panelKey } = furnitureGroups(p);
    expect(groups.map((g) => g.label)).toEqual(["Szafka 1", "Panel ścienny"]);
    expect(panelKey.get("b")).toBe("w");
  });
});

describe("wybór po grupach", () => {
  const parts = [
    { category: "Korpus", name: "Bok", length: 700, width: 560, qty: 2, moduleName: "Szafka 7", furnitureKey: "c1" },
    { category: "Korpus", name: "Bok", length: 700, width: 560, qty: 2, moduleName: "S.6.2 Nadstawka 1", furnitureKey: "g1" },
    { category: "Front", name: "Bok dokładany", length: 2600, width: 600, qty: 1, moduleName: "Bok", furnitureKey: "p3" },
  ];
  it("szafki i boki bez grupy to jedna pozycja „Bez grupy”, ale opis zostaje z nazwą szafki", () => {
    expect(furnitureChoices(project, parts).map((c) => c.key)).toEqual(["g1", UNGROUPED_KEY]);
    expect(filterByChoice(parts, project, [UNGROUPED_KEY]).map((p) => p.furnitureKey)).toEqual(["g1"]);
    expect(aggregateByFurniture(parts, project)[0].furnitureLabel).toBe("Szafka 7");
  });
  it("odznaczenia z projektu, ze starym polem jako zapasem", () => {
    expect(getExcludedChoices({ fc2Export: { excludedFurniture: ["x"] } })).toEqual(["x"]);
    expect(getExcludedChoices({ partsSelection: { excluded: ["y"] }, fc2Export: { excludedFurniture: ["x"] } })).toEqual(["y"]);
  });
});

describe("nazwa grupy", () => {
  it("nazwa nadana przez użytkownika wygrywa z przedrostkiem", () => {
    const p = { ...project, groups: [{ id: "g1", name: "Szafa przy łóżku" }] };
    expect(furnitureGroups(p).groups[0].label).toBe("Szafa przy łóżku");
  });
});
