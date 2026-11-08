import { describe, it, expect } from "vitest";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { state } from "../core/state.js";
import { recalculateLayout } from "../core/layout.js";
import { calculateModuleParts } from "./cabinet.js";

const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" };
const inner = { id: "f0", typ: "front", subtype: "szuflada-wewnetrzna", frontIndex: 0, frontCount: 1, distribution: "1", baseZone: { ...zone } };

describe("czoło szuflady wewnętrznej", () => {
  it("MERIVOBOX: gotowy element systemu - bez formatki frontu", () => {
    setProject(freshProject({ modules: [baseModule({ id: "a", elements: [{ ...inner }] })] }));
    const mod = state.project.modules[0];
    recalculateLayout(mod);
    expect(calculateModuleParts(mod).parts.some((p) => p.name.startsWith("Front szuflady wewn."))).toBe(false);
  });

  it("MOVENTO (skrzynka drewniana): czoło z płyty jak dotąd", () => {
    setProject(freshProject({ modules: [baseModule({ id: "a", front: { drawerSystem: "movento_katalog" }, elements: [{ ...inner }] })] }));
    const mod = state.project.modules[0];
    recalculateLayout(mod);
    expect(calculateModuleParts(mod).parts.some((p) => p.name.startsWith("Front szuflady wewn."))).toBe(true);
  });
});
