import { describe, it, expect, beforeEach } from "vitest";
import { calculateHinges } from "./hingeMath.js";
import { freshProject, setProject } from "../test/fixtures.js";

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
