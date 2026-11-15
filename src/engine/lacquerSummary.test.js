import { describe, it, expect } from "vitest";
import { lacquerByColor, lacquerWithoutMaterial, isLacquerMaterial } from "./lacquerSummary.js";

const mats = [
  { id: "l1", name: "Lakier", color: "NCS S 2005-Y40R" },
  { id: "l2", name: "Lakier", color: "ncs s 2005-y40r" },
  { id: "l3", name: "Lakier", color: "RAL 9016" },
  { id: "w", name: "Egger W1000 PM/ST9" },
];
const p = (materialId, length, width, qty = 1, category = "Front") => ({ category, materialId, length, width, qty });

describe("zestawienie lakieru", () => {
  it("rozpoznaje materiał lakierowany po nazwie", () => {
    expect(isLacquerMaterial(mats[0])).toBe(true);
    expect(isLacquerMaterial(mats[3])).toBe(false);
    expect(isLacquerMaterial(undefined)).toBe(false);
  });

  it("sumuje m² jednej strony wg koloru (wielkość liter i różne materiały tego samego koloru razem)", () => {
    const r = lacquerByColor([p("l1", 1000, 500, 2), p("l2", 600, 500), p("l3", 400, 400), p("w", 800, 800), p("l1", 100, 100, 1, "Korpus")], mats);
    expect(r.map((x) => x.color)).toEqual(["NCS S 2005-Y40R", "RAL 9016"]);
    expect(r[0].areaM2).toBeCloseTo(1.0 + 0.3, 5);
    expect(r[0].pieces).toBe(3);
    expect(r[1].areaM2).toBeCloseTo(0.16, 5);
  });

  it("materiał lakierowany bez koloru = „bez koloru”", () => {
    const r = lacquerByColor([p("x", 100, 100)], [{ id: "x", name: "Lakier" }]);
    expect(r[0].color).toBe("bez koloru");
  });

  it("zgłasza dekor „Lakier” wpisany w pole Dekor (panele i korpusy szafek), też gdy wybrano materiał", () => {
    const project = {
      pricing: { frontMaterials: mats },
      sidePanels: [
        { name: "Bok siedziska", decor: "Lakier ncs s 2005-y40R", materialId: "w" },
        { name: "Blenda", materialId: "l1" },
        { name: "Zwykły bok", decor: "U702" },
      ],
      modules: [{ name: "Szafka A", materials: { korpusDecor: "Lakier RAL 9016" } }, { name: "Szafka B", materials: {} }],
    };
    expect(lacquerWithoutMaterial(project)).toEqual([
      { kind: "element", name: "Bok siedziska", decor: "Lakier ncs s 2005-y40R" },
      { kind: "szafka", name: "Szafka A", decor: "Lakier RAL 9016" },
    ]);
  });
});
