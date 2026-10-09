import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import { recalculateAllLayouts } from "./layout.js";
import { cornerFrontIssues, passageIssues, footprintBoxes } from "./cornerChecks.js";
import { validateProject } from "./validate.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const room = { width: 4000, depth: 3000, height: 2600 };
const door = (id) => ({
  id: "front-" + id, typ: "front", subtype: "drzwi", frontIndex: 0, openingSide: "left",
  baseZone: { boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top", offsetBottom: 0, offsetTop: 0 },
});
const cab = (id, x, z, rotation, extra = {}) => baseModule({ id, name: id, rotation, position: { x, y: 0, z }, elements: [door(id)], ...extra });

function run(modules) {
  state.project.modules = modules;
  recalculateAllLayouts();
  return cornerFrontIssues(state.project);
}

describe("fronty w narożniku", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], sidePanels: [] })));

  it("drzwi wchodzące za lico prostopadłego ciągu to błąd, styk bez blendy to ostrzeżenie", () => {
    // A przy ścianie tylnej w narożniku, B na lewej ścianie tuż przed licem frontów A.
    const issues = run([cab("A", 0, 0, 0), cab("B", 0, 533, 270)]);
    expect(issues.find((i) => i.mod.id === "A")).toMatchObject({ level: "error" });
    expect(issues.find((i) => i.mod.id === "B")).toMatchObject({ level: "warn" });
  });

  it("szafka ślepa z blendą 50 mm - bez uwag", () => {
    const blind = cab("A", 0, 0, 0, {
      dimensions: { width: 1100, height: 720, depth: 513 },
      blindCorner: { active: true, side: "left", frontWidth: 450 },
    });
    expect(run([blind, cab("B", 0, 583, 270)])).toEqual([]);
  });

  it("szafka daleko od narożnika i inny rząd (wiszące) nie są sprawdzane", () => {
    expect(run([cab("A", 2000, 0, 0), cab("B", 0, 533, 270)])).toEqual([]);
    const upper = cab("U", 0, 533, 270, { type: "upper_cabinet", position: { x: 0, y: 1450, z: 533 }, legs: { active: false } });
    expect(run([cab("A", 0, 0, 0), upper]).filter((i) => i.mod.id === "A")).toEqual([]);
  });
});

describe("szafka narożna L w kolizjach", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], sidePanels: [] })));
  const corner = () => ({
    id: "L", name: "Narożna", type: "corner_cabinet", rotation: 0,
    dimensions: { width: 900, legB: 900, depth: 513, height: 720 },
    position: { x: 0, y: 0, z: 0 }, legs: { active: true, height: 100 }, elements: [],
  });

  it("odcisk L to dwa ramiona", () => {
    state.project.modules = [corner()];
    const boxes = footprintBoxes(state.project);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => [b.x1 - b.x0, b.z1 - b.z0]).sort()).toEqual([[513, 900], [900, 513]]);
  });

  it("szafka w pustym wnętrzu L nie koliduje, szafka na ramieniu - koliduje", () => {
    state.project.modules = [corner(), baseModule({ id: "w", name: "W", dimensions: { width: 300, height: 720, depth: 300 }, position: { x: 600, y: 0, z: 600 } })];
    expect(validateProject().issues.some((i) => /Nachodzi/.test(i.message))).toBe(false);
    state.project.modules = [corner(), baseModule({ id: "k", name: "K", position: { x: 600, y: 0, z: 0 } })];
    expect(validateProject().issues.some((i) => /Nachodzi/.test(i.message))).toBe(true);
  });
});

describe("przejście między ciągami", () => {
  it("ciasno -> ostrzeżenie, za mało -> błąd, brak szafek naprzeciw -> nic", () => {
    const pair = (depth, x2 = 1000) => {
      setProject(freshProject({ room: { width: 4000, depth, height: 2600 }, modules: [] }));
      state.project.modules = [cab("A", 1000, 0, 0), cab("B", x2, depth - 513, 180)];
      return passageIssues(state.project);
    };
    expect(pair(2200)[0]).toMatchObject({ level: "warn" });
    expect(pair(2000)[0]).toMatchObject({ level: "error" });
    expect(pair(3000)).toEqual([]);
    expect(pair(2000, 3000)).toEqual([]);
  });
});
