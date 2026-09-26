import { describe, it, expect, beforeEach } from "vitest";
import { getDrawerBoxRect } from "./drawerBoxes.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { state } from "./state.js";

const drawer = (over = {}) => ({
  id: "front-d", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3,
  x: 16.5, y: 16.5, w: 567, h: 200,
  baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
  ...over,
});

describe("getDrawerBoxRect", () => {
  beforeEach(() => setProject(freshProject({ modules: [baseModule()] })));

  it("skrzynka mieści się we wnętrzu korpusu i jest wyśrodkowana", () => {
    const r = getDrawerBoxRect(state.project.modules[0], drawer(), state.project);
    expect(r).not.toBeNull();
    expect(r.x0).toBeGreaterThanOrEqual(18 - 1);
    expect(r.x1).toBeLessThanOrEqual(582 + 1);
    expect(Math.abs((r.x0 + r.x1) / 2 - 300)).toBeLessThan(0.01); // środek szafki 600 mm
    expect(r.y1).toBeGreaterThan(r.y0);
  });

  it("dolna szuflada nakładana siada na wieńcu dolnym (y0 = y frontu + grubość płyty)", () => {
    const r = getDrawerBoxRect(state.project.modules[0], drawer(), state.project);
    expect(r.y0).toBeCloseTo(16.5 + 18, 5);
  });

  it("wyższa szuflada w stosie (frontIndex > 0) siada dokładnie na dole swojego frontu", () => {
    const r = getDrawerBoxRect(state.project.modules[0], drawer({ frontIndex: 1, y: 230 }), state.project);
    expect(r.y0).toBeCloseTo(230, 5);
  });

  it("zwraca null dla nieznanego systemu szuflad", () => {
    state.project.front.drawerSystem = "nie-ma-takiego";
    const orig = console.error;
    console.error = () => {};
    expect(getDrawerBoxRect(state.project.modules[0], drawer(), state.project)).toBeNull();
    console.error = orig;
  });
});
