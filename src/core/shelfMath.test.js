import { describe, it, expect } from "vitest";
import { autoDistributeShelves } from "./shelfMath.js";

describe("autoDistributeShelves", () => {
  it("zwraca pustą tablicę dla zerowej lub ujemnej liczby półek", () => {
    expect(autoDistributeShelves(1000, 18, 0)).toEqual([]);
    expect(autoDistributeShelves(1000, 18, -2)).toEqual([]);
  });

  it("rozkłada N półek z równym światłem i stałym skokiem", () => {
    const shelves = autoDistributeShelves(684, 18, 3);
    expect(shelves).toHaveLength(3);

    const gap = shelves[0].y; // pierwsze światło == standardowe światło
    for (let i = 1; i < shelves.length; i++) {
      expect(shelves[i].y - shelves[i - 1].y).toBe(18 + gap);
    }
    for (const s of shelves) {
      expect(s).toMatchObject({ typ: "poziom", isStructural: false, h: 18 });
    }
  });
});
