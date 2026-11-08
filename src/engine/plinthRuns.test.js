import { describe, it, expect, beforeEach } from "vitest";
import { buildPlinthRuns } from "./plinthRuns.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

// Kuchnia L: szafka pod tylną ścianą (rot 0) kończy się 600 mm przed prawą ścianą,
// szafka pod prawą ścianą (rot 90) zaczyna się 700 mm od tylnej ściany.
function lKitchen(extra = []) {
  const back = baseModule({ id: "a", position: { x: 1800, y: 0, z: 0 } });
  const right = baseModule({ id: "b", rotation: 90, position: { x: 3000 - 513, y: 0, z: 700 } });
  const p = freshProject({ room: { width: 3000, height: 2600, depth: 3000 }, modules: [back, right, ...extra] });
  setProject(p);
  return p;
}

describe("buildPlinthRuns - narożniki", () => {
  beforeEach(() => lKitchen());

  it("bieg wzdłuż X przechodzi przez narożnik do zewnętrznej krawędzi listwy biegu Z", () => {
    const runs = buildPlinthRuns(lKitchen());
    const x = runs.find(r => r.axis === "x");
    expect(x.along).toBe(1800);
    // listwa prawej ściany: x 2487 + 40 .. + 18 = 2527..2545
    expect(x.runLen).toBe(2545 - 1800);
    expect(x.cornerFills).toEqual([{ x0: 2400, x1: 2545, z0: 455, z1: 473 }]);
  });

  it("bieg wzdłuż Z zaczyna się na licu listwy biegu X, styki przesunięte", () => {
    const runs = buildPlinthRuns(lKitchen());
    const z = runs.find(r => r.axis === "z");
    expect(z.along).toBe(473);
    expect(z.runLen).toBe(1300 - 473);
    expect(z.cornerFills).toEqual([{ x0: 2527, x1: 2545, z0: 473, z1: 700 }]);
  });

  it("bez narożnika, gdy listwa prostopadła jest daleko od końca biegu", () => {
    const p = lKitchen();
    p.modules[1].position.z = 1500; // 1500 - 473 > CORNER_REACH
    const runs = buildPlinthRuns(p);
    const x = runs.find(r => r.axis === "x");
    expect(x.runLen).toBe(600);
    expect(x.cornerFills).toEqual([]);
  });

  it("różna wysokość nóżek - bez łączenia", () => {
    const p = lKitchen();
    p.modules[1].legs.height = 150;
    const runs = buildPlinthRuns(p);
    expect(runs.every(r => r.cornerFills.length === 0)).toBe(true);
  });
});
