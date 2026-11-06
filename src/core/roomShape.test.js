import { describe, it, expect } from "vitest";
import { roomNotch, roomPolygon, roomWalls, boxInNotch } from "./roomShape.js";

const L = { width: 5586, depth: 4215, height: 2630, notch: { corner: "przod-lewy", width: 1575, depth: 1672 } };

describe("roomShape", () => {
  it("prostokąt bez wcięcia: 4 ściany, wszystkie narożniki wypukłe", () => {
    const room = { width: 4000, depth: 3000 };
    expect(roomNotch(room)).toBeNull();
    const walls = roomWalls(room);
    expect(walls.map((w) => w.length)).toEqual([4000, 3000, 4000, 3000]);
    expect(walls[0].normal).toEqual([0, -1]); // tylna ściana na zewnątrz w -z
    expect(walls.every((w) => w.extA && w.extB)).toBe(true);
  });

  it("wcięcie przednie lewe: obrys L i 6 ścian", () => {
    expect(roomNotch(L)).toEqual({ x0: 0, x1: 1575, z0: 2543, z1: 4215 });
    expect(roomPolygon(L)).toEqual([[0, 0], [5586, 0], [5586, 4215], [1575, 4215], [1575, 2543], [0, 2543]]);
    const walls = roomWalls(L);
    expect(walls.map((w) => w.length)).toEqual([5586, 4215, 4011, 1672, 1575, 2543]);
    // ściana x=1575 (wnęka) - normalna w stronę wcięcia, wklęsły narożnik na końcu
    expect(walls[3].normal).toEqual([-1, 0]);
    expect(walls[3].extB).toBe(false);
    expect(walls[4].extA).toBe(false);
  });

  it("każdy narożnik daje 6 wierzchołków", () => {
    ["tyl-lewy", "tyl-prawy", "przod-prawy", "przod-lewy"].forEach((corner) => {
      const room = { width: 4000, depth: 3000, notch: { corner, width: 1000, depth: 800 } };
      expect(roomPolygon(room)).toHaveLength(6);
      expect(roomWalls(room).filter((w) => !w.extA)).toHaveLength(1);
    });
  });

  it("wcięcie zerowe albo na całą szerokość jest pomijane", () => {
    expect(roomNotch({ width: 4000, depth: 3000, notch: { corner: "tyl-lewy", width: 0, depth: 500 } })).toBeNull();
    expect(roomNotch({ width: 4000, depth: 3000, notch: { corner: "tyl-lewy", width: 4000, depth: 500 } })).toBeNull();
  });

  it("boxInNotch: szafka we wcięciu vs. styk ze ścianą wnęki", () => {
    expect(boxInNotch({ x0: 1000, x1: 1600, z0: 3000, z1: 3600 }, L)).toBe(true);
    expect(boxInNotch({ x0: 1575, x1: 2175, z0: 2543, z1: 4215 }, L)).toBe(false);
    expect(boxInNotch({ x0: 0, x1: 600, z0: 1943, z1: 2543 }, L)).toBe(false);
  });
});
