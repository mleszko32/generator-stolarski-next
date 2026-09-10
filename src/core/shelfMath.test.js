import { describe, it, expect } from "vitest";
import { autoDistributeShelves, calculateShelfHoles } from "./shelfMath.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

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

describe("calculateShelfHoles", () => {
  const withShelf = (depth, shelf) =>
    setProject(
      freshProject({
        modules: [
          baseModule({
            dimensions: { width: 600, height: 720, depth },
            elements: [shelf],
          }),
        ],
      })
    );

  it("półka konstrukcyjna (szafka <= 500 mm): dwa zestawy wkręt + kołek", () => {
    withShelf(450, { id: "s1", typ: "poziom", y: 350, isStructural: true });

    const holes = calculateShelfHoles();
    expect(holes).toHaveLength(4);

    const screws = holes.filter((h) => h.diameter === 3);
    const dowels = holes.filter((h) => h.diameter === 8);
    expect(screws).toHaveLength(2);
    expect(dowels).toHaveLength(2);
    // oś na środku grubości płyty
    expect(screws.every((h) => h.y === 350 + 9)).toBe(true);
    expect(holes.every((h) => h.type === "konstrukcyjna")).toBe(true);
  });

  it("głęboka szafka (> 500 mm) dokłada trzeci zestaw na środku", () => {
    withShelf(560, { id: "s1", typ: "poziom", y: 350, isStructural: true });
    expect(calculateShelfHoles()).toHaveLength(6);
  });

  it("półka ruchoma: dwa rzędy podpórek fi 5 w rozstawie System 32", () => {
    withShelf(450, { id: "a1", typ: "poziom", y: 400, isStructural: false });

    const holes = calculateShelfHoles();
    expect(holes).toHaveLength(6);
    expect(holes.every((h) => h.diameter === 5 && h.type === "podporka")).toBe(true);

    const ys = [...new Set(holes.map((h) => h.y))].sort((a, b) => a - b);
    // yBase = 400 - 2.5, offsety -32 / 0 / +32
    expect(ys).toEqual([365.5, 397.5, 429.5]);
  });
});
