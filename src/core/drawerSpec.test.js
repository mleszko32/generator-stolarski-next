import { describe, it, expect } from "vitest";
import { drawerSpec } from "./drawerSpec.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };
const drawer = (extra = {}) => ({
  id: "f0", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3,
  x: 1.5, y: 0, w: 597, h: 715, baseZone: { ...zone }, ...extra,
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

  it("ręczne NL nadpisuje dobór", () => {
    expect(drawerSpec(baseModule(), drawer({ forceNL: 400 }), freshProject()).nl).toBe(400);
  });

  it("szuflada w kolumnie za przegrodą: szerokość wnęki z baseZone, nie z całej szafki", () => {
    const s = drawerSpec(baseModule(), drawer({ baseZone: { ...zone, maxX: 300 } }), freshProject());
    expect(s.openingW).toBe(282);
    expect(s.comps.bottom.width).toBe(282 - 51); // merivobox: dno = LW - 51
  });
});
