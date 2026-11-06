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
