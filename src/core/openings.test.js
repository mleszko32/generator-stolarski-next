import { describe, it, expect } from "vitest";
import { getOpenings, newOpening, openingBox, OPENING_KINDS } from "./openings.js";
import { computeWallLayouts } from "./walls.js";
import { validateProject } from "./validate.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const room = { width: 3500, depth: 3000, height: 2600 };

describe("getOpenings", () => {
  it("brak pola albo złe wpisy nie psują listy", () => {
    expect(getOpenings({})).toEqual([]);
    const list = getOpenings({ openings: [null, { wall: "zla" }, { id: "a", wall: "tyl", u: "100", width: "900", height: "1200", sill: "900", kind: "okno" }] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ u: 100, width: 900, height: 1200, sill: 900 });
  });

  it("newOpening bierze domyślne wymiary rodzaju", () => {
    const d = newOpening("drzwi", "prawa");
    expect(d).toMatchObject({ kind: "drzwi", wall: "prawa", width: OPENING_KINDS.drzwi.width, sill: 0 });
  });
});

describe("openingBox (współrzędne 3D)", () => {
  const op = (wall) => ({ wall, u: 500, width: 1000, height: 1200, sill: 900 });

  it("ściana tylna: u rośnie z x, przy z=0", () => {
    const b = openingBox(op("tyl"), room);
    expect(b.cx).toBe(1000);
    expect(b.cy).toBe(1500);
    expect(b.cz).toBe(4);
  });

  it("ściana przednia: u liczone od prawej (odbicie względem x)", () => {
    const b = openingBox(op("przednia"), room);
    expect(b.cx).toBe(3500 - 500 - 500);
    expect(b.cz).toBe(3000 - 4);
  });

  it("ściany boczne: u wzdłuż z (prawa) i od tyłu odwrócone (lewa)", () => {
    expect(openingBox(op("prawa"), room)).toMatchObject({ cx: 3496, cz: 1000, sx: 8, sz: 1000 });
    expect(openingBox(op("lewa"), room)).toMatchObject({ cx: 4, cz: 3000 - 500 - 500 });
  });
});

describe("przeszkody a szafki", () => {
  it("ściany dostają swoje przeszkody i kolizja z szafką jest zgłaszana", () => {
    const project = freshProject({
      room,
      modules: [baseModule({ position: { x: 0, y: 0, z: 0 } })],
      openings: [{ id: "o1", kind: "okno", wall: "tyl", u: 100, width: 800, height: 1200, sill: 500 }],
    });
    setProject(project);
    const layouts = computeWallLayouts(project);
    expect(layouts.walls.find((w) => w.id === "tyl").openings).toHaveLength(1);

    const res = validateProject(project);
    // szafka 600x720 (nóżki 100 -> do 820) przy oknie od 500 mm: nakładają się
    expect(res.issues.some((i) => i.message.includes("z oknem na ścianie tylnej"))).toBe(true);
  });

  it("okno nad szafką (parapet powyżej korpusu) nie koliduje", () => {
    const project = freshProject({
      room,
      modules: [baseModule({ position: { x: 0, y: 0, z: 0 } })],
      openings: [{ id: "o1", kind: "okno", wall: "tyl", u: 100, width: 800, height: 1200, sill: 1000 }],
    });
    setProject(project);
    expect(validateProject(project).issues.some((i) => i.message.includes("oknem"))).toBe(false);
  });

  it("okno na innej ścianie nie koliduje", () => {
    const project = freshProject({
      room,
      modules: [baseModule({ position: { x: 0, y: 0, z: 0 } })],
      openings: [{ id: "o1", kind: "okno", wall: "prawa", u: 100, width: 800, height: 1200, sill: 500 }],
    });
    setProject(project);
    expect(validateProject(project).issues.some((i) => i.message.includes("oknem"))).toBe(false);
  });
});
