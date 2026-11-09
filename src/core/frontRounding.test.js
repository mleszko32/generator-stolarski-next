import { describe, it, expect } from "vitest";
import { frontRoundingHints, roundingHintText } from "./frontRounding.js";

const mod = (elements) => ({ dimensions: { width: 600, height: 720, depth: 513 }, elements });
const front = (id, subtype, x, y, w, h, zone = {}) => ({ id, typ: "front", subtype, x, y, w, h, baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, ...zone } });

describe("frontRoundingHints", () => {
  it("fronty w pełnych milimetrach: brak podpowiedzi", () => {
    expect(frontRoundingHints(mod([front("a", "drzwi", 1.5, 0, 597, 715)]), 18)).toEqual([]);
  });

  it("para drzwi z połówką: zmiana luzu dzieli się na dwa fronty", () => {
    const m = mod([front("l", "drzwi-lp", 1.5, 0, 297.5, 715), front("p", "drzwi-lp", 302, 0, 297.5, 715)]);
    const [h] = frontRoundingHints(m, 18);
    expect(h).toEqual({ frontIds: ["l", "p"], dim: "width", value: 297.5, edges: ["left", "right"], more: { delta: 1, result: 297 }, less: { delta: 1, result: 298 } });
    expect(roundingHintText(h)).toBe("szerokość 297,5 mm: luz lewy albo prawy +1 → 297 mm, albo −1 → 298 mm");
  });

  it("trzy równe szuflady: luz góra / dół rozkłada się na trzy fronty", () => {
    const h = 709 / 3; // 236,33
    const m = mod([0, 1, 2].map((i) => front("s" + i, "szuflada", 1.5, i * (h + 3), 597, h)));
    const hints = frontRoundingHints(m, 18);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ dim: "height", edges: ["top", "bottom"], more: { delta: 1, result: 236 }, less: { delta: 2, result: 237 } });
  });

  it("front między przegrodami (bez krawędzi korpusu) i fronty wpuszczane: bez podpowiedzi", () => {
    const inner = mod([front("a", "drzwi", 200.5, 100.5, 190.5, 300.5)]);
    expect(frontRoundingHints(inner, 18)).toEqual([]);
    expect(frontRoundingHints(mod([front("a", "drzwi", 1.5, 0, 596.5, 715)]), 18, { inset: true })).toEqual([]);
  });

  it("tylko jedna krawędź zewnętrzna: podpowiedź wskazuje tylko ją", () => {
    const [h] = frontRoundingHints(mod([front("a", "drzwi", 1.5, 0, 290.25, 715)]), 18);
    expect(h.edges).toEqual(["left"]);
    expect(h.more).toEqual({ delta: 0.25, result: 290 });
  });
});
