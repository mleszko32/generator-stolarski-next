import { describe, it, expect } from "vitest";
import { decorLabel, catalogLabels, addCatalogDecor, partMaterialLabel } from "./materialCatalog.js";

const project = () => ({
  materials: { boardThickness: 18, backThickness: 3, decors: { Korpus: "Egger W1000 ST9 Biały premium" } },
  pricing: { frontMaterials: [{ id: "a", name: "Lakier biały mat" }, { id: "b", name: "Egger H1145 ST10" }] },
});

describe("katalog materiałów", () => {
  it("składa napis pozycji", () => {
    expect(decorLabel({ producer: "Egger", code: "U702 ST9", name: "Szary kaszmirowy" })).toBe("Egger U702 ST9 Szary kaszmirowy");
    expect(decorLabel({ producer: "", code: "", name: "HDF biały 3 mm" })).toBe("HDF biały 3 mm");
  });

  it("ma płyty Egger z cennika SAS", () => {
    const labels = catalogLabels({});
    expect(labels.length).toBeGreaterThan(200);
    expect(labels).toContain("Egger F186 ST9 18mm Beton Chicago Jasnoszary");
  });

  it("dopisuje własną pozycję bez powtórzeń", () => {
    const p = project();
    expect(addCatalogDecor(p, { producer: "Kronospan", code: "K001", name: "Test" })).toBe(true);
    expect(addCatalogDecor(p, { producer: "Kronospan", code: "K001", name: "Test" })).toBe(false);
    expect(addCatalogDecor(p, { producer: "", code: "", name: "" })).toBe(false);
    expect(catalogLabels(p)).toContain("Kronospan K001 Test");
  });

  it("podstawia materiał w formatce", () => {
    const p = project();
    expect(partMaterialLabel({ category: "Korpus" }, p)).toBe("Korpus: Egger W1000 ST9 Biały premium");
    expect(partMaterialLabel({ category: "Plecy" }, p)).toBe("Plecy");
    expect(partMaterialLabel({ category: "Front", materialId: "b" }, p)).toBe("Front: Egger H1145 ST10");
    // brak / usunięty materiał frontu = pierwsza pozycja cennika
    expect(partMaterialLabel({ category: "Front", materialId: "x" }, p)).toBe("Front: Lakier biały mat");
  });
});
