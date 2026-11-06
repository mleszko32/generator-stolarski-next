import { describe, it, expect } from "vitest";
import { replaceMaterial } from "./materialReplace.js";
import { partMaterial, projectDecorLegend } from "./decorColors.js";

const makeProject = () => ({
  materials: { boardThickness: 18, decors: { Szuflada: "U702" } },
  pricing: { frontMaterials: [{ id: "default", name: "Standard", pricePerM2: 0 }, { id: "lak", name: "Lakier", pricePerM2: 300 }] },
  modules: [
    { id: "a", type: "base_cabinet", dimensions: { width: 600, height: 720, depth: 510 }, materials: { korpusDecor: "Egger U702 ST9 18mm" },
      legs: { active: true, plinth: true, plinthMaterial: "decor:Egger U702 ST9 18mm" },
      elements: [{ id: "f1", typ: "front", subtype: "drzwi", materialId: "lak" }] },
    { id: "b", type: "base_cabinet", dimensions: { width: 600, height: 720, depth: 510 },
      elements: [{ id: "f2", typ: "front", subtype: "drzwi", materialId: "default" }] },
  ],
  sidePanels: [
    { id: "p", kind: "poziomy", decor: "Egger U702 ST9 18mm", dimensions: { width: 800, height: 18, depth: 300 } },
    { id: "bl", kind: "blenda", materialId: "lak", dimensions: { width: 50, height: 720, depth: 80 } },
  ],
});

describe("podmiana materiału z legendy", () => {
  it("dekor korpusu: szafki, panel poziomy (z grubością) i cokół w tym dekorze", () => {
    const pr = makeProject();
    const key = partMaterial("corpus", { moduleId: "a" }, pr).key;
    expect(replaceMaterial(pr, key, "Egger W1000 PM/ST9 19mm")).toBe(3);
    expect(pr.modules[0].materials.korpusDecor).toBe("Egger W1000 PM/ST9 19mm");
    expect(pr.modules[1].materials).toBeUndefined(); // szafka bez dekoru bez zmian
    expect(pr.sidePanels[0]).toMatchObject({ decor: "Egger W1000 PM/ST9 19mm", dimensions: { height: 19 } });
    expect(pr.modules[0].legs.plinthMaterial).toBe("decor:Egger W1000 PM/ST9 19mm");
  });

  it("materiał frontów: fronty i czoło blendy w nowym materiale z cennika", () => {
    const pr = makeProject();
    const key = partMaterial("front", { moduleId: "a", elementId: "f1" }, pr).key;
    replaceMaterial(pr, key, "Egger U740 PM/ST9 19mm");
    const mat = pr.pricing.frontMaterials.find((m) => m.name === "Egger U740 PM/ST9 19mm");
    expect(mat).toBeTruthy();
    expect(pr.modules[0].elements[0].materialId).toBe(mat.id);
    expect(pr.sidePanels[1].materialId).toBe(mat.id);
    expect(pr.modules[1].elements[0].materialId).toBe("default"); // inny materiał bez zmian
    expect(projectDecorLegend(pr, { all: true }).some((e) => e.label === "Lakier")).toBe(false);
  });

  it("szafka bez dekoru (pozycja domyślna) dostaje dekor; szuflady - dekor projektu", () => {
    const pr = makeProject();
    replaceMaterial(pr, "~KORPUS", "Egger W980 ST2 18mm");
    expect(pr.modules[1].materials.korpusDecor).toBe("Egger W980 ST2 18mm");
    replaceMaterial(pr, "S:U702", "Egger W1000 ST9 18mm");
    expect(pr.materials.decors.Szuflada).toBe("Egger W1000 ST9 18mm");
    expect(replaceMaterial(pr, "S:U702", "  ")).toBe(0);
  });
});
