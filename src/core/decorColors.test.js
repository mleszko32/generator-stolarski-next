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
    pricing: { frontMaterials: [{ id: "m1", name: "Standard" }, { id: "m2", name: "Lakier mat" }] },
    modules: [{ id: "a", materials: { korpusDecor: "H3303 ST10" }, elements: [{ id: "f1", typ: "front", materialId: "m2" }, { id: "f2", typ: "front" }] },
      { id: "b", elements: [] }],
    sidePanels: [{ id: "p", kind: "poziomy", decor: "U740 PM" }, { id: "s", materialId: "m2" }],
  };

  it("front: pierwszy materiał domyślny, kolejne własny kolor", () => {
    expect(frontMaterialColor(undefined, project)).toBeNull();
    expect(frontMaterialColor("m2", project)).not.toBeNull();
    expect(partColor("front", { moduleId: "a", elementId: "f2" }, project)).toBeNull();
    expect(partColor("front", { moduleId: "a", elementId: "f1" }, project)).toBe(frontMaterialColor("m2", project));
  });

  it("legenda: dekory korpusu i paneli, materiały frontów, pozycje domyślne", () => {
    const leg = projectDecorLegend(project);
    expect(leg.filter((l) => l.group === "Korpus").map((l) => l.label)).toEqual(["bez dekoru (z projektu)", "H3303 ST10", "U740 PM"]);
    expect(leg.filter((l) => l.group === "Front").map((l) => l.label)).toEqual(["Standard", "Lakier mat"]);
    expect(leg.find((l) => l.label === "U740 PM").color).toBe(decorColor("U740 PM"));
    expect(projectDecorLegend({ modules: [{ id: "x", elements: [] }] })).toEqual([]);
  });

  it("korpus i półki wg dekoru szafki, panele wg pola Dekor", () => {
    expect(partColor("corpus", { moduleId: "a" }, project)).toBe(decorColor("H3303 ST10"));
    expect(partColor("shelf", { moduleId: "a", elementId: "x" }, project)).toBe(decorColor("H3303 ST10"));
    expect(partColor("corpus", { moduleId: "b" }, project)).toBeNull();
    expect(partColor("corpus", { sidePanelId: "p" }, project)).toBe(decorColor("U740 PM"));
    expect(partColor("front", { sidePanelId: "s" }, project)).toBe(frontMaterialColor("m2", project));
  });
});
