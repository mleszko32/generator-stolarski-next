import { describe, it, expect, beforeEach } from "vitest";
import { plinthMaterial, moduleFrontMaterialId } from "./plinthMaterial.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { partMaterialLabel, LACQUER_BOARD } from "./materialCatalog.js";

const project = {
  pricing: { frontMaterials: [{ id: "default", name: "Standard" }, { id: "lakier", name: "Lakier" }] },
};

describe("materiał cokołu", () => {
  it("domyślnie jak fronty szafki (najczęstszy materiał), bez frontów - pierwszy z cennika", () => {
    const mod = { elements: [{ typ: "front", materialId: "lakier" }, { typ: "front", materialId: "lakier" }, { typ: "front" }] };
    expect(moduleFrontMaterialId(mod, project)).toBe("lakier");
    expect(plinthMaterial(mod, project)).toEqual({ category: "Front", materialId: "lakier", key: "Front::lakier" });
    expect(plinthMaterial({ elements: [] }, project).materialId).toBe("default");
  });

  it("korpus, dekor i materiał z cennika", () => {
    const mod = { materials: { korpusDecor: "U702" }, elements: [], legs: { plinthMaterial: "korpus" } };
    expect(plinthMaterial(mod, project).category).toBe("Korpus: U702");
    mod.legs.plinthMaterial = "decor:W1000 ST9";
    expect(plinthMaterial(mod, project).category).toBe("Korpus: W1000 ST9");
    mod.legs.plinthMaterial = "front:lakier";
    expect(plinthMaterial(mod, project).materialId).toBe("lakier");
    mod.legs.plinthMaterial = "front:usuniety";
    expect(plinthMaterial(mod, project).materialId).toBe("default");
  });

  it("lakier tnie się z MDF dwustronnego z bazy SAS", () => {
    expect(partMaterialLabel({ category: "Front", materialId: "lakier" }, project)).toBe(`Front: Lakier (${LACQUER_BOARD})`);
    expect(partMaterialLabel({ category: "Front", materialId: "default" }, project)).toBe("Front: Standard");
  });

  describe("w liście formatek", () => {
    beforeEach(() => {
      setProject(freshProject({
        modules: [
          baseModule({ id: "a", legs: { active: true, height: 100, plinth: true, plinthOffset: 40 } }),
          baseModule({ id: "b", position: { x: 600, y: 0, z: 0 }, legs: { active: true, height: 100, plinth: true, plinthOffset: 40 } }),
          baseModule({ id: "c", position: { x: 1200, y: 0, z: 0 }, legs: { active: true, height: 100, plinth: true, plinthOffset: 40, plinthMaterial: "decor:W1000 ST9" } }),
        ],
      }));
    });

    it("sąsiednie szafki z tym samym materiałem - jeden odcinek, inny materiał - osobny", () => {
      const plinths = calculateAllProjectParts().filter((p) => p.name.startsWith("Cokół"));
      expect(plinths).toHaveLength(2);
      const front = plinths.find((p) => p.category === "Front");
      expect(front.length).toBe(1200);
      expect(front.materialId).toBeUndefined(); // projekt bez cennika frontów
      expect(plinths.find((p) => p.category === "Korpus: W1000 ST9").length).toBe(600);
    });
  });
});
