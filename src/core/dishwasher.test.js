import { describe, it, expect } from "vitest";
import { createDishwasher, dishwasherGeometry, getDishwasherParts, DISHWASHER_WIDTHS } from "./dishwasher.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { state, addDishwasher } from "./state.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { computeWorktops } from "./worktops.js";

const project = (front = { clearance: { top: 5, bottom: 0 } }) => ({ materials: { boardThickness: 18 }, front });

describe("zmywarka do zabudowy", () => {
  it("dwie szerokości: 450 i 600 (inna wartość = 600)", () => {
    expect(DISHWASHER_WIDTHS).toEqual([450, 600]);
    expect(createDishwasher(450).dimensions.width).toBe(450);
    expect(createDishwasher(500).dimensions.width).toBe(600);
    expect(createDishwasher(450).name).toBe("Zmywarka 45");
  });

  it("wymiary z szafki obok: korpus 780 + nóżki 100, głębokość, dekor i materiał frontu", () => {
    const ref = baseModule({ id: "a", dimensions: { width: 600, height: 780, depth: 560 }, legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
      materials: { korpusDecor: "U3053 VL" }, elements: [{ typ: "front", subtype: "szuflada", materialId: "mat-x" }] });
    const dw = createDishwasher(600, ref);
    expect(dw.dimensions).toEqual({ width: 600, height: 880, depth: 560 });
    expect(dw).toMatchObject({ plinthHeight: 100, decor: "U3053 VL", materialId: "mat-x", topBoard: true });
  });

  it("front węższy o 5 mm (595 × 775), wieniec 600 × 560 pod blatem", () => {
    const dw = createDishwasher(600);
    dw.dimensions = { width: 600, height: 880, depth: 560 };
    const g = dishwasherGeometry(dw, project());
    expect(g.front).toMatchObject({ x: 2.5, w: 595, y: 100, h: 775, z: 562 });
    expect(g.top).toMatchObject({ y: 862, h: 18 });
    const parts = getDishwasherParts(dw, project());
    expect(parts.map((p) => [p.name, p.length, p.width, p.category])).toEqual([
      ["Front zmywarki 60", 775, 595, "Front"],
      ["Wieniec nad zmywarką", 600, 560, "Korpus"],
    ]);
    dw.topBoard = false;
    expect(getDishwasherParts(dw, project())).toHaveLength(1);
  });

  it("cokół przechodzi przez zmywarkę jednym odcinkiem, blat bez przerwy", () => {
    const legs = { active: true, height: 100, plinth: true, plinthOffset: 40 };
    setProject(freshProject({ modules: [
      baseModule({ id: "a", position: { x: 0, y: 0, z: 0 }, dimensions: { width: 600, height: 780, depth: 560 }, legs }),
      baseModule({ id: "b", position: { x: 1200, y: 0, z: 0 }, dimensions: { width: 600, height: 780, depth: 560 }, legs }),
    ] }));
    state.project.worktop = { enabled: true };
    state.activeModuleId = "a";
    const dw = addDishwasher(600);
    expect(dw.position).toMatchObject({ x: 600, z: 0 });
    const plinths = calculateAllProjectParts().filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths).toHaveLength(1);
    expect(plinths[0].length).toBe(1800);
    const pieces = computeWorktops(state.project).pieces;
    expect(pieces).toHaveLength(1);
  });
});
