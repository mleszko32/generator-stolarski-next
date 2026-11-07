import { describe, it, expect } from "vitest";
import { drillSheets, moduleDrillPanels } from "./drillSheets.js";
import { freshProject, baseModule, fullZoneFront, setProject } from "../test/fixtures.js";

const mod = (id, x, groupId) => baseModule({ id, name: `Nadstawka ${id}`, groupId, position: { x, y: 0, z: 0 }, elements: [fullZoneFront({ id: `f-${id}` })] });

describe("arkusze nawierceń", () => {
  it("formatki szafki: boki, wieńce i drzwi z puszkami, nazwy jak na liście formatek", () => {
    const m = mod("a", 0);
    const project = freshProject({ modules: [m] });
    setProject(project);
    const panels = moduleDrillPanels(m, project);
    const names = panels.map((p) => p.listName);
    expect(names).toContain("Bok (L/P)");
    expect(names).toContain("W600");
    const door = panels.find((p) => p.kind === "front");
    expect(door.holes.length).toBeGreaterThanOrEqual(2);
    door.holes.forEach((h) => { expect(h.kind).toBe("puszka"); expect(h.d).toBe(35); });
    expect(panels.some((p) => p.kind === "plecy")).toBe(false);
  });

  it("jednakowe formatki w meblu to jeden arkusz z liczbą sztuk; odznaczona grupa pomijana", () => {
    const project = freshProject({ modules: [mod("a", 0, "g"), mod("b", 600, "g"), mod("c", 1200, "h")], groups: [{ id: "g", name: "Szafa" }] });
    setProject(project);
    const { sheets } = drillSheets(project);
    const bokLewy = sheets.filter((s) => s.name === "Bok lewy");
    expect(bokLewy.map((s) => [s.code, s.qty])).toEqual([["M1", 2], ["M2", 1]]);
    expect(bokLewy[0].furniture).toBe("Szafa");
    expect(bokLewy[0].modules).toEqual(["Nadstawka a", "Nadstawka b"]);
    const only = drillSheets(project, ["g"]).sheets;
    expect(only.every((s) => s.code === "M2")).toBe(true);
  });

  it("jednakowe płyty o różnych nazwach (półki stałe) łączą się w jeden arkusz", () => {
    const shelf = (id, y) => ({ id, typ: "poziom", x: 18, w: 564, y, h: 18, isStructural: true });
    const m = baseModule({ elements: [shelf("s1", 200), shelf("s2", 400)] });
    const project = freshProject({ modules: [m] });
    setProject(project);
    const shelves = drillSheets(project).sheets.filter((s) => s.name.includes("Półka stała"));
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ qty: 2, name: "Półka stała 1, Półka stała 2" });
  });

  it("szafka narożna pomijana z informacją", () => {
    const project = freshProject({ modules: [baseModule({ type: "corner_cabinet", name: "Narożna" })] });
    setProject(project);
    expect(drillSheets(project).skipped).toEqual(["Narożna"]);
  });
});
