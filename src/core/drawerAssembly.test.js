import { describe, it, expect } from "vitest";
import { innerFrontSpec, packCuts, collectDrawers, innerFrontPurchases } from "./drawerAssembly.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { state } from "./state.js";
import { recalculateLayout } from "./layout.js";

describe("czoło szuflady wewnętrznej MERIVOBOX", () => {
  it("profil ZV4.1042M docinany na LW − 126, mocowanie wg wysokości, reling tylko przy E", () => {
    expect(innerFrontSpec("merivobox", "E", 344)).toMatchObject({ profile: "ZV4.1042M", cut: 218, fixing: "ZI4.2ES1", rail: { code: "ZR4.1059U", cut: 233 } });
    expect(innerFrontSpec("merivobox", "M", 564)).toMatchObject({ cut: 438, fixing: "ZI4.0MS1", rail: null });
    expect(innerFrontSpec("merivobox", "K", 564).fixing).toBe("ZI4.1KS1");
    expect(innerFrontSpec("movento_katalog", "M", 564)).toBeNull();
  });

  it("docinanie: 5 czół 218 mm z profili 1042 = 2 profile (4 + 1), 2 czoła 798 = 2 profile", () => {
    const bars = packCuts([218, 218, 218, 218, 218], 1042, 4);
    expect(bars.map((b) => b.cuts.length)).toEqual([4, 1]);
    expect(bars[0].rest).toBe(1042 - 4 * 218 - 3 * 4);
    expect(packCuts([519, 519], 1042, 4)).toHaveLength(1);   // 519 + rzaz 4 + 519 = 1042 - mieści się
    expect(packCuts([520, 520], 1042, 4)).toHaveLength(2);   // 1044 > 1042
    expect(packCuts([798, 798], 1042)).toHaveLength(2);
  });

  it("zestawienie szuflad projektu i zakupy czół: profile, mocowania", () => {
    const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" };
    const inner = { id: "w", typ: "front", subtype: "szuflada-wewnetrzna", frontIndex: 0, frontCount: 2, distribution: "2", baseZone: { ...zone } };
    setProject(freshProject({ modules: [baseModule({ id: "a", name: "Szafa", elements: [inner, { ...inner, id: "w2", frontIndex: 1 }] })] }));
    const mod = state.project.modules[0];
    recalculateLayout(mod);
    const drawers = collectDrawers(state.project);
    expect(drawers).toHaveLength(2);
    expect(drawers[0]).toMatchObject({ module: "Szafa", inner: true, systemId: "merivobox", lw: 564, front: null });
    expect(drawers[0].innerFront.cut).toBe(438);
    const { items, profiles } = innerFrontPurchases(drawers);
    expect(profiles).toHaveLength(1);                        // 2 × 438 z jednego profilu 1042
    expect(items[0]).toMatchObject({ qty: 1, unit: "szt." });
    expect(items.find((i) => /ZI4/.test(i.name)).qty).toBe(2);
  });
});
