import { describe, it, expect, beforeEach } from "vitest";
import { getModuleSummary } from "./moduleInfo.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { state } from "./state.js";

const drawer = (over = {}) => ({
  id: "front-d1", typ: "front", subtype: "szuflada", frontIndex: 0, frontCount: 1, gap: 3, distribution: "1",
  baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
  ...over,
});

describe("getModuleSummary", () => {
  beforeEach(() => setProject(freshProject({ modules: [baseModule()] })));

  it("podaje wymiary korpusu i wnętrza", () => {
    const s = getModuleSummary(state.project.modules[0], state.project);
    expect(s.dims).toEqual({ w: 600, h: 720, d: 513 });
    expect(s.inner).toEqual({ w: 564, h: 684, d: 513 });
    expect(s.legs).toBe(100); // fixture: nóżki 100 mm
  });

  it("opisuje szufladę: wymiary frontu i skrzynki z systemu", () => {
    state.project.modules[0].elements = [drawer()];
    const s = getModuleSummary(state.project.modules[0], state.project);
    expect(s.drawers).toHaveLength(1);
    const d = s.drawers[0];
    expect(d.w).toBeGreaterThan(500);
    expect(d.h).toBeGreaterThan(500);
    expect(d.box).not.toBeNull();
    expect(d.box.length).toBeGreaterThan(300);
    expect(d.box.width).toBeGreaterThan(400);
    expect(d.box.height).toBeGreaterThan(50);
    expect(d.box.system).toBeTruthy();
  });

  it("liczy półki ruchome i stałe oraz przegrody", () => {
    state.project.modules[0].elements = [
      { id: "p1", typ: "poziom", x: 18, y: 300, w: 564, h: 18, isStructural: false },
      { id: "p2", typ: "poziom", x: 18, y: 500, w: 564, h: 18, isStructural: true },
      { id: "v1", typ: "pion", x: 291, y: 18, w: 18, h: 684, isStructural: true },
    ];
    const s = getModuleSummary(state.project.modules[0], state.project);
    expect(s.shelves).toEqual([{ y: 300, fixed: false }, { y: 500, fixed: true }]);
    expect(s.dividers).toBe(1);
  });
});
