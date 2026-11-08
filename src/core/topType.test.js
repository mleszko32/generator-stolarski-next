import { describe, it, expect } from "vitest";
import { topInnerY } from "./topType.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { getCorpusParts, getCorpusHoles } from "../engine/carcaseParts.js";
import { getCabinetInnerRect } from "./zoneTree.js";
import { state } from "./state.js";

describe("korpus bez wieńca górnego", () => {
  it("wnętrze sięga do górnej krawędzi boków", () => {
    expect(topInnerY({ topType: "brak" }, 103, 18)).toBe(103);
    expect(topInnerY({ topType: "pelny" }, 103, 18)).toBe(85);
    expect(topInnerY({ topType: "trawersy_pion", traverseWidth: 80 }, 720, 18)).toBe(640);
  });

  it("brak formatki i otworów wieńca górnego, wnęka 103 - 18", () => {
    setProject(freshProject({ modules: [baseModule({ id: "a", dimensions: { width: 1324, height: 103, depth: 580 }, construction: { topType: "brak" } })] }));
    const mod = state.project.modules[0];
    const wience = getCorpusParts(mod, state.project).filter((p) => p.name.startsWith("W"));
    expect(wience).toHaveLength(1);
    const holes = getCorpusHoles(mod, state.project)[0].holes;
    expect(holes.every((h) => h.y < 50)).toBe(true);
    expect(getCabinetInnerRect(mod)).toMatchObject({ minY: 18, maxY: 103 });
  });

  it("przełączenie na brak wieńca wydłuża przegrodę do góry boków", async () => {
    const { splitZoneVertical, buildZoneTree: bt } = await import("./zoneTree.js");
    const { refitInterior } = await import("./korpusDecorChange.js");
    setProject(freshProject({ modules: [baseModule({ id: "a", dimensions: { width: 1000, height: 120, depth: 580 } })] }));
    const mod = state.project.modules[0];
    splitZoneVertical(mod, bt(mod));
    expect(mod.elements.find((e) => e.typ === "pion").h).toBe(84);
    refitInterior(mod, () => { mod.construction = { topType: "brak" }; });
    expect(mod.elements.find((e) => e.typ === "pion").h).toBeCloseTo(102);
  });

  it("szuflada pod blatem: front 100 (luz 3 u góry), wnęka skrzynki 85", async () => {
    const { recalculateLayout } = await import("./layout.js");
    const { drawerSpec } = await import("./drawerSpec.js");
    setProject(freshProject({ modules: [baseModule({ id: "a", dimensions: { width: 600, height: 103, depth: 580 },
      construction: { topType: "brak" }, front: { clearance: { top: 3, bottom: 0 } },
      elements: [{ id: "f", typ: "front", subtype: "szuflada", frontCount: 1, distribution: "1", frontIndex: 0,
        baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 103, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" } }] })] }));
    const mod = state.project.modules[0];
    recalculateLayout(mod);
    const f = mod.elements[0];
    expect(f.y).toBe(0);
    expect(f.h).toBe(100);
    expect(drawerSpec(mod, f, state.project).availableSpace ?? 85).toBe(85);
  });
});

describe("front nakładany przy trawersie pionowym", () => {
  it("zakrywa trawers jak wieniec: front 780 - luz 5 = 775, nie 693", async () => {
    const { recalculateLayout } = await import("./layout.js");
    const mk = (topType) => {
      setProject(freshProject({ modules: [baseModule({ id: "a", dimensions: { width: 700, height: 780, depth: 560 },
        construction: { topType, traverseWidth: 100 }, front: { clearance: { top: 5, bottom: 0 } },
        elements: [{ id: "f", typ: "front", subtype: "szuflada", frontCount: 1, distribution: "1", frontIndex: 0,
          baseZone: { minX: 18, maxX: 682, minY: 18, maxY: 680, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" } }] })] }));
      const mod = state.project.modules[0];
      recalculateLayout(mod);
      return mod.elements[0].h;
    };
    expect(mk("trawersy_pion")).toBe(775);
    expect(mk("pelny")).toBe(775);
    expect(mk("trawersy_poziom")).toBe(775);
  });
});
