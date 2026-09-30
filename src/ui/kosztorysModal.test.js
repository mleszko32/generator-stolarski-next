import { describe, it, expect, beforeEach } from "vitest";
import { applyMaterialToZone } from "./kosztorysModal.js";
import { freshProject, baseModule, fullZoneFront, setProject } from "../test/fixtures.js";
import { state } from "../core/state.js";

describe("applyMaterialToZone", () => {
  beforeEach(() => {
    setProject(freshProject({
      modules: [
        baseModule({ id: "dolna1", type: "base_cabinet", elements: [fullZoneFront({ id: "f1" })] }),
        baseModule({ id: "dolna2", type: "base_cabinet", elements: [fullZoneFront({ id: "f2" })] }),
        baseModule({ id: "gorna1", type: "upper_cabinet", elements: [fullZoneFront({ id: "f3" })] }),
        baseModule({ id: "slupek1", type: "tall_cabinet", elements: [fullZoneFront({ id: "f4" })] }),
      ],
    }));
  });

  it("ustawia materialId na wszystkich frontach szafek dolnych, nie ruszając wiszących ani słupków", () => {
    applyMaterialToZone("lakier", "base_cabinet");
    const byId = (id) => state.project.modules.flatMap(m => m.elements).find(e => e.id === id);
    expect(byId("f1").materialId).toBe("lakier");
    expect(byId("f2").materialId).toBe("lakier");
    expect(byId("f3").materialId).toBeUndefined();
    expect(byId("f4").materialId).toBeUndefined();
  });

  it("ustawia materialId tylko na frontach szafek wiszących", () => {
    applyMaterialToZone("fornir", "upper_cabinet");
    const byId = (id) => state.project.modules.flatMap(m => m.elements).find(e => e.id === id);
    expect(byId("f3").materialId).toBe("fornir");
    expect(byId("f1").materialId).toBeUndefined();
    expect(byId("f2").materialId).toBeUndefined();
  });

  it("nadpisuje już ustawiony materialId (świadoma zmiana zbiorcza)", () => {
    state.project.modules[0].elements[0].materialId = "stary";
    applyMaterialToZone("nowy", "base_cabinet");
    expect(state.project.modules[0].elements[0].materialId).toBe("nowy");
  });
});
