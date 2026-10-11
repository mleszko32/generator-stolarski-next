import { describe, it, expect, beforeEach } from "vitest";
import { calculateHinges, stackedHingeObstacles } from "./hingeMath.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";

const door = (over = {}) => ({ id: "front-door", h: 700, y: 0, ...over });

describe("calculateHinges", () => {
  beforeEach(() => setProject(freshProject()));

  it("standardowe drzwi: 2 zawiasy na wysokości offsetów z ustawień", () => {
    const hinges = calculateHinges(door({ h: 700 }), 18, [], "left");
    expect(hinges).toHaveLength(2);
    expect(hinges.map((h) => h.relY)).toEqual([100, 700 - 100]);
    expect(hinges.map((h) => h.y)).toEqual([100, 600]); // y = front.y + relY
    expect(hinges.every((h) => h.side === "left" && !h.isAdjusted)).toBe(true);
  });

  it("liczba zawiasów rośnie z wysokością frontu", () => {
    expect(calculateHinges(door({ h: 900 }), 18, [], "left")).toHaveLength(2);
    expect(calculateHinges(door({ h: 1200 }), 18, [], "left")).toHaveLength(3);
    expect(calculateHinges(door({ h: 1800 }), 18, [], "left")).toHaveLength(4);
    expect(calculateHinges(door({ h: 2200 }), 18, [], "left")).toHaveLength(5);
  });

  it("forceHingeCount na froncie nadpisuje automat", () => {
    expect(calculateHinges(door({ h: 700, forceHingeCount: 4 }), 18, [], "left")).toHaveLength(4);
  });

  it("hingeOverrides na froncie nadpisuje pozycję konkretnego zawiasu, pomijając unikanie kolizji", () => {
    const obstacles = [{ typ: "poziom", y: 600, h: 18 }];
    const hinges = calculateHinges(
      door({ h: 700, y: 0, hingeOverrides: { 1: 605 } }),
      18,
      obstacles,
      "left"
    );

    expect(hinges[0].y).toBe(100); // zawias 0: bez zmian, liczony automatycznie
    expect(hinges[0].isManual).toBeFalsy();
    expect(hinges[1].y).toBe(605); // zawias 1: ręcznie ustawiony, mimo kolizji z półką
    expect(hinges[1].isManual).toBe(true);
    expect(hinges[1].isAdjusted).toBe(false);
  });

  it("odsuwa zawias od kolidującej półki i oznacza go jako skorygowany", () => {
    const obstacles = [{ typ: "poziom", y: 600, h: 18 }];
    const hinges = calculateHinges(door({ h: 700, y: 0 }), 18, obstacles, "left");

    expect(hinges.some((h) => h.isAdjusted)).toBe(true);
    for (const h of hinges) {
      expect(h.relY).toBeGreaterThanOrEqual(30);
      expect(h.relY).toBeLessThanOrEqual(700 - 30);
      // żaden zawias nie leży na półce (puszka 35 mm ma prześwit)
      const clashes = h.y + 16 > 600 && h.y - 16 < 618;
      expect(clashes).toBe(false);
    }
  });
});

describe("stackedHingeObstacles", () => {
  const stacked = (over) => baseModule({ id: "gora", position: { x: 0, y: 820, z: 0 }, legs: { active: false }, elements: [], ...over });

  it("dolicza wieńce szafki postawionej w tym samym miejscu, w układzie Y dolnej", () => {
    const dol = baseModule();
    const obs = stackedHingeObstacles(dol, [dol, stacked()], 18);
    // dolna: na nóżkach 100 -> spód górnej (y 820) to 720 w układzie dolnej
    expect(obs.some((o) => o.y === 720)).toBe(true);
  });

  it("pomija szafki o innym Z albo obrocie (to nie jest ta sama szafa)", () => {
    const dol = baseModule();
    const obs = stackedHingeObstacles(dol, [dol, stacked({ position: { x: 0, y: 820, z: 2000 } }), stacked({ rotation: 90 })], 18);
    expect(obs.filter((o) => o.isStructural)).toHaveLength(2); // tylko wieńce samej dolnej
  });
});
