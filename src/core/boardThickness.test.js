import { describe, it, expect } from "vitest";
import { decorThickness, moduleBoardThickness } from "./boardThickness.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";

describe("grubość płyty z dekoru", () => {
  it("czyta grubość z nazwy z bazy płyt", () => {
    expect(decorThickness("Egger W1000 PM/ST9 19mm Biały Premium PerfectSense Mat")).toBe(19);
    expect(decorThickness("Egger U702 ST9 18mm Kaszmir")).toBe(18);
    expect(decorThickness("W1000 ST38 18mm (18.6mm) Biały Premium")).toBe(18);
    expect(decorThickness("W908/W908 SM/SM-MB Biały bazowy 18mm 2800x2070 Dwustronna")).toBe(18);
    expect(decorThickness("Egger W1000")).toBeNull();
    expect(decorThickness("")).toBeNull();
  });

  it("szafka bez grubości w dekorze bierze grubość projektu", () => {
    const project = { materials: { boardThickness: 18 } };
    expect(moduleBoardThickness({ materials: { korpusDecor: "Egger W1000 PM/ST9 19mm" } }, project)).toBe(19);
    expect(moduleBoardThickness({ materials: { korpusDecor: "Egger W1000" } }, project)).toBe(18);
    expect(moduleBoardThickness({}, project)).toBe(18);
  });

  it("szafka w płycie 19 mm ma węższe wieńce niż w 18 mm", () => {
    setProject(freshProject({
      modules: [
        baseModule({ id: "a", name: "A", materials: { korpusDecor: "Egger U702 ST9 18mm Kaszmir" } }),
        baseModule({ id: "b", name: "B", position: { x: 600, y: 0, z: 0 }, materials: { korpusDecor: "Egger W1000 PM/ST9 19mm" } }),
      ],
    }));
    const parts = calculateAllProjectParts();
    const lengths = (cat) => parts.filter((p) => p.category === cat).flatMap((p) => [p.length, p.width]);
    // szafka 600: wieniec między bokami 600 - 2·grubość
    expect(lengths("Korpus: Egger U702 ST9 18mm Kaszmir")).toContain(564);
    expect(lengths("Korpus: Egger W1000 PM/ST9 19mm")).toContain(562);
    expect(lengths("Korpus: Egger W1000 PM/ST9 19mm")).not.toContain(564);
  });
});

describe("płyty sklejane (36 mm = 2 × 18 mm)", async () => {
  const { sidePanelLayers, applyPanelDecorThickness } = await import("./boardThickness.js");
  const project = { materials: { boardThickness: 18 } };
  it("zmiana dekoru zachowuje liczbę sklejonych płyt", () => {
    const shelf = { kind: "poziomy", dimensions: { width: 1200, height: 36, depth: 300 } };
    expect(sidePanelLayers(shelf, project)).toBe(2);
    applyPanelDecorThickness(shelf, "Egger U740 PM 18mm Taupe");
    expect(shelf.dimensions.height).toBe(36);
    applyPanelDecorThickness(shelf, "Egger W1000 PM/ST9 19mm");
    expect(shelf.dimensions.height).toBe(38);
    const leg = { kind: "bok", dimensions: { width: 36, height: 740, depth: 600 } };
    applyPanelDecorThickness(leg, "Egger U740 PM 18mm");
    expect(leg.dimensions.width).toBe(36);
    const single = { kind: "poziomy", dimensions: { width: 800, height: 18, depth: 300 } };
    applyPanelDecorThickness(single, "Egger W1000 PM/ST9 19mm");
    expect(single.dimensions.height).toBe(19);
  });

  it("panel 36 mm daje dwie formatki", () => {
    setProject(freshProject({ modules: [], sidePanels: [
      { id: "p", kind: "poziomy", decor: "Egger U740 PM 18mm", dimensions: { width: 1200, height: 36, depth: 300 }, position: { x: 0, y: 0, z: 0 } },
    ] }));
    const part = calculateAllProjectParts().find((p) => p.name.startsWith("Panel poziomy"));
    expect(part.qty).toBe(2);
    expect(part.name).toContain("sklejane ×2");
  });
});

describe("zmiana dekoru korpusu dopasowuje wnętrze do grubości płyty", async () => {
  const { setModuleKorpusDecor } = await import("./korpusDecorChange.js");
  const { state } = await import("./state.js");
  const { buildZoneTree, splitZoneHorizontal } = await import("./zoneTree.js");
  it("półka dostaje szerokość światła i grubość nowej płyty", () => {
    setProject(freshProject({ modules: [baseModule({ id: "a" })] }));
    const mod = state.project.modules[0];
    splitZoneHorizontal(mod, buildZoneTree(mod));
    const shelf = mod.elements.find((e) => e.typ === "poziom");
    expect(shelf.w).toBe(564);
    setModuleKorpusDecor(mod, "Egger W1000 PM/ST9 19mm", state.project);
    expect(mod.materials.korpusDecor).toBe("Egger W1000 PM/ST9 19mm");
    expect(shelf.x).toBe(19);
    expect(shelf.w).toBeCloseTo(562);
    expect(shelf.h).toBe(19);
    setModuleKorpusDecor(mod, "", state.project);
    expect(mod.materials).toBeUndefined();
    expect(shelf.w).toBeCloseTo(564);
  });
});
