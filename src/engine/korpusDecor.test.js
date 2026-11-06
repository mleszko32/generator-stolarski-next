import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../core/state.js";
import { freshProject, setProject, baseModule } from "../test/fixtures.js";
import { calculateAllProjectParts, collectProjectParts } from "./cabinet.js";
import { calculateProjectCost } from "./cost.js";
import { korpusCategory, baseCategory } from "../core/materialCatalog.js";

// Dekor korpusu per szafka: mod.materials.korpusDecor -> formatki „Korpus: <dekor>”.
describe("dekor korpusu per szafka", () => {
  beforeEach(() => {
    setProject(freshProject({
      modules: [
        baseModule({ id: "a", name: "Szafka A", materials: { korpusDecor: "U740 PM" } }),
        baseModule({ id: "b", name: "Szafka B", position: { x: 600, y: 0, z: 0 } }),
        baseModule({ id: "c", name: "Szafka C", position: { x: 1200, y: 0, z: 0 }, materials: { korpusDecor: "W1000 ST9" } }),
      ],
      sidePanels: [
        { id: "p1", kind: "poziomy", name: "Półka", decor: "U740 PM", position: { x: 0, y: 1500, z: 0 }, rotation: 0, dimensions: { width: 1000, height: 18, depth: 300 } },
        { id: "p2", name: "Bok", decor: "", position: { x: 1800, y: 0, z: 0 }, rotation: 0, dimensions: { width: 18, height: 720, depth: 600 } },
      ],
    }));
    state.project.pricing = { ...(state.project.pricing || {}), materials: { Korpus: 50, "Korpus: U740 PM": 120 } };
  });

  it("pomocnicze nazwy kategorii", () => {
    expect(korpusCategory("  ")).toBe("Korpus");
    expect(korpusCategory("U740 PM")).toBe("Korpus: U740 PM");
    expect(baseCategory("Korpus: U740 PM")).toBe("Korpus");
    expect(baseCategory("Front")).toBe("Front");
  });

  it("formatki korpusu dostają dekor szafki, fronty i HDF bez zmian", () => {
    const raw = collectProjectParts();
    const of = (name) => raw.filter((p) => p.moduleName === name);
    expect(new Set(of("Szafka A").filter((p) => baseCategory(p.category) === "Korpus").map((p) => p.category))).toEqual(new Set(["Korpus: U740 PM"]));
    expect(of("Szafka B").some((p) => p.category === "Korpus")).toBe(true);
    expect(of("Szafka B").some((p) => p.category.startsWith("Korpus: "))).toBe(false);
    expect(of("Szafka C").filter((p) => p.category.startsWith("Korpus")).every((p) => p.category === "Korpus: W1000 ST9")).toBe(true);
    // plecy HDF zostają „Plecy”
    expect(of("Szafka A").some((p) => p.category === "Plecy")).toBe(true);
    // panel poziomy z dekorem liczy się razem z szafką A, bok bez dekoru - jak dotąd front
    expect(raw.find((p) => p.moduleName === "Półka").category).toBe("Korpus: U740 PM");
    expect(raw.find((p) => p.moduleName === "Bok").category).toBe("Front");
  });

  it("te same wymiary w różnych dekorach to osobne wiersze", () => {
    const boki = calculateAllProjectParts().filter((p) => p.name === "Bok (L/P)");
    expect(boki.map((p) => p.category).sort()).toEqual(["Korpus", "Korpus: U740 PM", "Korpus: W1000 ST9"]);
  });

  it("kosztorys: osobna pozycja na dekor, własna cena, bez ceny - cena Korpus", () => {
    const mats = calculateProjectCost().materials;
    const cats = mats.map((m) => m.category);
    expect(cats.slice(0, 3)).toEqual(["Korpus", "Korpus: U740 PM", "Korpus: W1000 ST9"]);
    expect(mats.find((m) => m.category === "Korpus: U740 PM").pricePerM2).toBe(120);
    expect(mats.find((m) => m.category === "Korpus: W1000 ST9").pricePerM2).toBe(50);
  });
});
