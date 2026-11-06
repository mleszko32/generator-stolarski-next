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
    expect(partMaterialLabel({ category: "Front", materialId: "x" }, p)).toMatch(/^Front: Lakier biały mat \(Egger W908/);
  });
});

describe("materiał frontów zaznaczonych szafek po nazwie", async () => {
  const { assignFrontMaterialByName } = await import("./materialCatalog.js");
  it("istniejąca pozycja cennika po nazwie, inaczej nowa; wszystkie fronty szafek", () => {
    const project = { pricing: { frontMaterials: [{ id: "a", name: "Lakier", pricePerM2: 300 }] } };
    const mods = [{ elements: [{ typ: "front" }, { typ: "poziom" }] }, { elements: [{ typ: "front", materialId: "x" }] }];
    expect(assignFrontMaterialByName(mods, " lakier ", project)).toBe("a");
    expect(mods.flatMap((m) => m.elements).filter((e) => e.typ === "front").every((e) => e.materialId === "a")).toBe(true);
    const id = assignFrontMaterialByName(mods, "Egger W1000 PM/ST9 19mm", project);
    expect(project.pricing.frontMaterials).toHaveLength(2);
    expect(project.pricing.frontMaterials[1]).toMatchObject({ id, name: "Egger W1000 PM/ST9 19mm", pricePerM2: 0 });
    expect(mods[1].elements[0].materialId).toBe(id);
    expect(assignFrontMaterialByName(mods, "  ", project)).toBeNull();
  });
});

describe("lakier RAL / NCS z listy materiałów frontów", async () => {
  const { assignFrontMaterialByName, frontMaterialSuggestions } = await import("./materialCatalog.js");
  it("podpowiedzi zawierają lakiery RAL i NCS oraz płyty", () => {
    const s = frontMaterialSuggestions({ pricing: { frontMaterials: [{ id: "a", name: "Lakier" }] } });
    expect(s).toContain("Lakier RAL 9016 Traffic white");
    expect(s).toContain("Lakier NCS S 0502-Y");
    expect(s.some((l) => /W1000/.test(l))).toBe(true);
  });
  it("wybór lakieru tworzy „Lakier” z kolorem i ceną istniejącego lakieru; ten sam kod - ta sama pozycja", () => {
    const project = { pricing: { frontMaterials: [{ id: "l1", name: "Lakier", color: "NCS S 0500-N", pricePerM2: 350 }] } };
    const mods = [{ elements: [{ typ: "front" }] }];
    expect(assignFrontMaterialByName(mods, "Lakier NCS S 0500-N", project)).toBe("l1");
    const id = assignFrontMaterialByName(mods, "Lakier RAL 9016 Traffic white", project);
    const mat = project.pricing.frontMaterials.find((m) => m.id === id);
    expect(mat).toMatchObject({ name: "Lakier", color: "RAL 9016 Traffic white", pricePerM2: 350 });
    expect(assignFrontMaterialByName(mods, "RAL 9016", project)).toBe(id);
  });
});
