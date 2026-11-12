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

  it("pozostałe systemy metalowe (GTV Axis Pro, antaro, TANDEMBOX, LEGRABOX): czoło z płyty", () => {
    ["gtv_axis_18", "gtv_axis_16", "antaro", "tandembox", "legrabox"].forEach((sys) => {
      setProject(freshProject({ modules: [baseModule({ id: "a", front: { drawerSystem: sys }, elements: [{ ...inner }] })] }));
      const mod = state.project.modules[0];
      recalculateLayout(mod);
      expect(calculateModuleParts(mod).parts.filter((p) => p.name.startsWith("Front szuflady wewn.")), sys).toHaveLength(1);
    });
  });

  it("MOVENTO (skrzynka drewniana): czoło z płyty jak dotąd", () => {
    setProject(freshProject({ modules: [baseModule({ id: "a", front: { drawerSystem: "movento_katalog" }, elements: [{ ...inner }] })] }));
    const mod = state.project.modules[0];
    recalculateLayout(mod);
    expect(calculateModuleParts(mod).parts.some((p) => p.name.startsWith("Front szuflady wewn."))).toBe(true);
  });
});

describe("skrzynki MOVENTO z płyty korpusu szafki", () => {
  it("front.drawerBoxFromKorpus: formatki skrzynki w kategorii „Korpus: <dekor>”, bez opcji - Szuflada", async () => {
    const { calculateAllProjectParts } = await import("./cabinet.js");
    const mk = (fromKorpus) => {
      setProject(freshProject({ modules: [baseModule({ id: "a", materials: { korpusDecor: "U702 18mm" },
        front: { drawerSystem: "movento_forum", drawerBoxFromKorpus: fromKorpus }, elements: [{ ...inner }] })] }));
      recalculateLayout(state.project.modules[0]);
      return calculateAllProjectParts().filter((p) => /Bok szuflady|Front szuflady wewn/.test(p.name)).map((p) => p.category).sort();
    };
    expect(mk(true)).toEqual(["Korpus: U702 18mm", "Korpus: U702 18mm"]);   // skrzynka i front w korpusie
    expect(mk(false)).toEqual(["Front", "Szuflada"]);
  });
});
