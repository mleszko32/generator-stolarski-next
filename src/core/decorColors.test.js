import { describe, it, expect } from "vitest";
import { decorColor, isLightColor, frontMaterialColor, partColor, projectDecorLegend } from "./decorColors.js";

describe("kolory dekorów w 3D", () => {
  it("pusta nazwa = kolor domyślny, ten sam dekor = ten sam kolor", () => {
    expect(decorColor("")).toBeNull();
    expect(decorColor("U740 PM")).toBe(decorColor("u740 pm"));
  });

  it("kod Egger wybiera rodzinę: W jasne, H nie jasne", () => {
    expect(isLightColor(decorColor("Egger W1000 ST9 Biały premium"))).toBe(true);
    expect(isLightColor(decorColor("Egger H1145 ST10 Dąb Bardolino"))).toBe(false);
  });

  it("nazwa bez kodu ze słowem „biały” daje biel, nie losową barwę", () => {
    expect(isLightColor(decorColor("Front lamelowy biały"))).toBe(true);
    expect(isLightColor(decorColor("Lakier biały mat"))).toBe(true);
  });

  const project = {
    pricing: { frontMaterials: [{ id: "default", name: "Standard" }, { id: "m2", name: "Lakier mat" }] },
    modules: [
      { id: "a", materials: { korpusDecor: "H3303 ST10" }, legs: { active: true, plinth: true },
        elements: [{ id: "f1", typ: "front", materialId: "m2" }, { id: "f2", typ: "front", materialId: "m2" }] },
      { id: "b", legs: { active: true, plinth: true, plinthMaterial: "decor:W1000 ST9" }, elements: [] },
    ],
    sidePanels: [{ id: "p", kind: "poziomy", decor: "U740 PM" }, { id: "s", kind: "blenda", decor: "lakier MAT" }],
  };

  it("front: nietknięty Standard domyślny, inne wg nazwy - jak dekor blendy o tej nazwie", () => {
    expect(frontMaterialColor(undefined, project)).toBeNull();
    expect(frontMaterialColor("m2", project)).toBe(decorColor("Lakier mat"));
    expect(partColor("front", { moduleId: "a", elementId: "f1" }, project)).toBe(frontMaterialColor("m2", project));
    expect(partColor("front", { sidePanelId: "s" }, project)).toBe(frontMaterialColor("m2", project));
  });

  it("cokół w kolorze swojego materiału, nóżki bez koloru", () => {
    // szafka a: cokół jak fronty (Lakier mat), szafka b: dekor W1000
    expect(partColor("plinth", { moduleId: "a", type: "plinth" }, project)).toBe(decorColor("Lakier mat"));
    expect(partColor("plinth", { moduleId: "b", type: "plinth" }, project)).toBe(decorColor("W1000 ST9"));
    expect(partColor("corpus", { moduleId: "a", type: "plinth" }, project)).toBeNull();
  });

  it("legenda: dekory i materiały, ta sama nazwa raz (w grupie Front)", () => {
    const leg = projectDecorLegend(project);
    expect(leg.filter((l) => l.group === "Korpus").map((l) => l.label)).toEqual(["bez dekoru (z projektu)", "H3303 ST10", "U740 PM", "W1000 ST9"]);
    expect(leg.filter((l) => l.group === "Front").map((l) => l.label)).toEqual(["Lakier mat"]);
    expect(projectDecorLegend({ modules: [{ id: "x", elements: [] }] })).toEqual([]);
  });

  it("korpus i półki wg dekoru szafki, panele wg pola Dekor", () => {
    expect(partColor("corpus", { moduleId: "a" }, project)).toBe(decorColor("H3303 ST10"));
    expect(partColor("shelf", { moduleId: "a", elementId: "x" }, project)).toBe(decorColor("H3303 ST10"));
    expect(partColor("corpus", { moduleId: "b" }, project)).toBeNull();
    expect(partColor("corpus", { sidePanelId: "p" }, project)).toBe(decorColor("U740 PM"));
  });
});

describe("kolor skrzynek szuflad i dekor korpusu projektu", () => {
  const project = {
    materials: { decors: { Szuflada: "Egger U702 ST9 18mm Kaszmir", Korpus: "Egger W1000 ST9" } },
    modules: [{ id: "a", elements: [{ id: "d", typ: "front", subtype: "szuflada" }] }],
  };
  it("skrzynka w dekorze Szuflada, korpus bez własnego dekoru w dekorze projektu", () => {
    expect(partColor("drawerBox", { moduleId: "a", elementId: "d" }, project)).toBe(decorColor("Egger U702 ST9 18mm Kaszmir"));
    expect(partColor("corpus", { moduleId: "a" }, project)).toBe(decorColor("Egger W1000 ST9"));
  });
  it("legenda ma grupę Szuflady", () => {
    const leg = projectDecorLegend(project);
    expect(leg.find((l) => l.group === "Szuflada").label).toBe("Egger U702 ST9 18mm Kaszmir");
  });
});

describe("legenda materiałów: tryb wszystkich materiałów i klucze brył", async () => {
  const { partMaterial, materialPaletteMap, MATERIAL_PALETTE } = await import("./decorColors.js");
  const project = {
    pricing: { frontMaterials: [{ id: "default", name: "Standard" }, { id: "lak", name: "Lakier", color: "NCS S 0500-N" }] },
    modules: [{ id: "a", materials: { korpusDecor: "Egger W1000 PM/ST9 19mm" }, elements: [{ id: "f", typ: "front", materialId: "lak" }] }],
    sidePanels: [{ id: "b", kind: "blenda", materialId: "lak" }],
  };
  it("bryła i legenda mają ten sam klucz materiału", () => {
    const leg = projectDecorLegend(project, { all: true });
    const keys = leg.map((e) => e.key);
    expect(keys).toContain(partMaterial("front", { moduleId: "a", elementId: "f" }, project).key);
    expect(keys).toContain(partMaterial("corpus", { moduleId: "a" }, project).key);
    // czoło blendy w tym samym materiale co fronty - jedna pozycja
    expect(partMaterial("front", { sidePanelId: "b" }, project).key).toBe(partMaterial("front", { moduleId: "a", elementId: "f" }, project).key);
    expect(partMaterial("corpus", { moduleId: "a", type: "plinth" }, project)).toBeNull(); // nóżki
  });
  it("paleta materiałów: każdy materiał inny kolor", () => {
    const leg = projectDecorLegend(project, { all: true });
    const pal = materialPaletteMap(leg);
    expect(new Set(pal.values()).size).toBe(leg.length);
    expect(pal.get(leg[0].key)).toBe(MATERIAL_PALETTE[0]);
  });
});

describe("plecy HDF", () => {
  const mod = (id, backPanel) => ({ id, type: "base_cabinet", dimensions: { width: 600, height: 720, depth: 500 }, elements: [], backPanel });
  const project = (modules) => ({ modules, sidePanels: [], materials: { decors: {} } });

  it("bryła pleców (typ hdf) bierze dekor HDF szafki, z kluczem w grupie Plecy", async () => {
    const { partMaterial, hdfColor } = await import("./decorColors.js");
    const p = project([mod("a", { type: "nut", decor: "HDF Woodeco HU1506 Kaszmirowy Beż 3mm" })]);
    expect(partMaterial("hdf", { moduleId: "a", type: "corpus", part: "back" }, p))
      .toMatchObject({ group: "Plecy", key: "P:HDF WOODECO HU1506 KASZMIROWY BEŻ 3MM", color: hdfColor("HDF Woodeco HU1506 Kaszmirowy Beż 3mm") });
  });

  it("legenda ma grupę Plecy; szafka bez pleców (brak) nie dodaje pozycji", async () => {
    const { projectDecorLegend, partMaterial } = await import("./decorColors.js");
    const p = project([mod("a", { decor: "HDF Woodeco HD3037 Dąb olejowany II 3mm" }), mod("b", { type: "brak", decor: "HDF Woodeco HU1506 Kaszmirowy Beż 3mm" })]);
    const plecy = projectDecorLegend(p).filter((e) => e.group === "Plecy");
    expect(plecy.map((e) => e.label)).toEqual(["HDF Woodeco HD3037 Dąb olejowany II 3mm"]);
    expect(partMaterial("hdf", { moduleId: "b", type: "corpus", part: "back" }, p)).toBeNull();
  });
});

describe("czoło szuflady wewnętrznej MERIVOBOX", () => {
  const mod = (system) => ({ id: "a", type: "base_cabinet", dimensions: { width: 600, height: 720, depth: 500 }, front: system ? { drawerSystem: system } : {},
    elements: [{ id: "f1", typ: "front", subtype: "szuflada-wewnetrzna" }] });
  const project = (m) => ({ modules: [m], sidePanels: [], materials: { decors: {} }, pricing: { frontMaterials: [{ id: "default", name: "Standard" }] } });

  it("nie trafia do legendy jako „Standard” ani nie ma materiału bryły", async () => {
    const { partMaterial, projectDecorLegend } = await import("./decorColors.js");
    const p = project(mod("merivobox"));
    expect(partMaterial("front", { moduleId: "a", elementId: "f1" }, p)).toBeNull();
    expect(projectDecorLegend(p, { all: true }).some((e) => e.group === "Front")).toBe(false);
  });

  it("czoło innego systemu (np. LEGRABOX) zostaje frontem z cennika", async () => {
    const { partMaterial } = await import("./decorColors.js");
    expect(partMaterial("front", { moduleId: "a", elementId: "f1" }, project(mod("legrabox")))).toMatchObject({ group: "Front" });
  });
});

describe("blat", () => {
  const project = (decor) => ({ modules: [], sidePanels: [], materials: { decors: decor ? { Blat: decor } : {} } });
  it("bryła blatu bierze dekor „Blat” projektu, z osobnym kluczem", async () => {
    const { partMaterial, projectDecorLegend } = await import("./decorColors.js");
    const e = partMaterial("worktop", { worktop: true }, project("F186 ST9 beton"));
    expect(e).toMatchObject({ key: "B:F186 ST9 BETON", group: "Blat", label: "F186 ST9 beton" });
    expect(partMaterial("worktop", { worktop: true }, project("")).key).toBe("~BLAT");
    expect(projectDecorLegend(project("F186 ST9 beton")).map((x) => x.key)).toEqual(["B:F186 ST9 BETON"]);
    expect(projectDecorLegend(project(""))).toEqual([]);
  });
});
