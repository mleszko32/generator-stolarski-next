import { describe, it, expect } from "vitest";
import { drawerSpec, isBottomOverlayFront } from "./drawerSpec.js";
import { getDrawerBoxInfo } from "./drawerBoxes.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };
const drawer = (extra = {}) => ({
  id: "f0", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3,
  x: 1.5, y: 0, w: 597, h: 715, baseZone: { ...zone }, ...extra,
});

describe("isBottomOverlayFront", () => {
  it("dolny front nakładany zjeżdża na wieniec; wpuszczany, wyższy i czoło szuflady wewn. - nie", () => {
    expect(isBottomOverlayFront(drawer(), 18, false)).toBe(true);
    expect(isBottomOverlayFront(drawer(), 18, true)).toBe(false);
    expect(isBottomOverlayFront(drawer({ frontIndex: 1 }), 18, false)).toBe(false);
    expect(isBottomOverlayFront(drawer({ baseZone: { ...zone, minY: 300 } }), 18, false)).toBe(false);
    expect(isBottomOverlayFront(drawer({ subtype: "szuflada-wewnetrzna", y: 21 }), 18, false)).toBe(false);
  });

  it("dolna szuflada wewnętrzna w systemie metalowym: boki skrzynki nie wychodzą ponad czoło", () => {
    // Szafa z drzwiami i dwiema szufladami wewn. GTV Axis Pro D: czoło 230 mm od y = 21.
    const mod = baseModule({ front: { drawerSystem: "gtv_axis_18" } });
    const el = drawer({ subtype: "szuflada-wewnetrzna", y: 21, h: 230, x: 21, w: 558, intGapY: 3, baseZone: { ...zone, maxY: 524 } });
    const { rect } = getDrawerBoxInfo(mod, el, freshProject());
    expect(rect.y0).toBe(21);
    expect(rect.y1).toBeLessThanOrEqual(21 + 230);
  });
});

describe("drawerSpec", () => {
  it("zwykła szuflada: wnęka między bokami, głębokość wieńców, NL500", () => {
    const s = drawerSpec(baseModule(), drawer(), freshProject());
    expect(s).toMatchObject({ system: "merivobox", openingX0: 18, openingX1: 582, openingW: 564, depth: 510, nl: 500 });
    expect(s.availableSpace).toBe(715 - 18 - 18);
  });

  it("szuflada wewnętrzna: głębokość minus czoło i cofnięcie -> krótsza prowadnica", () => {
    const s = drawerSpec(baseModule(), drawer({ subtype: "szuflada-wewnetrzna" }), freshProject());
    expect(s.depth).toBe(510 - 18 - 2);
    expect(s.nl).toBe(450);
    expect(s.comps.nominalLength).toBe(450);
  });

  it("front wpuszczany: głębokość minus grubość frontu", () => {
    const mod = baseModule({ front: { type: "wpuszczane" } });
    expect(drawerSpec(mod, drawer(), freshProject()).depth).toBe(510 - 18);
  });

  it("jedyny front nad dnem wnęki (chwyt od spodu): skrzynka ma całą wnękę między wieńcami", () => {
    const mod = baseModule({ dimensions: { width: 600, height: 120, depth: 580 } });
    const s = drawerSpec(mod, drawer({ y: 27, h: 90, frontCount: 1, baseZone: { ...zone, maxY: 102 } }), freshProject());
    expect(s.availableSpace).toBe(84);
  });

  it("ręczne NL nadpisuje dobór", () => {
    expect(drawerSpec(baseModule(), drawer({ forceNL: 400 }), freshProject()).nl).toBe(400);
  });

  it("szuflada w kolumnie za przegrodą: szerokość wnęki z baseZone, nie z całej szafki", () => {
    const s = drawerSpec(baseModule(), drawer({ baseZone: { ...zone, maxX: 300 } }), freshProject());
    expect(s.openingW).toBe(282);
    expect(s.comps.bottom.width).toBe(282 - 51); // merivobox: dno = LW - 51
  });
});
