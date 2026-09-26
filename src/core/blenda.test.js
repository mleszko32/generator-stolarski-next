import { describe, it, expect, beforeEach } from "vitest";
import { migrateLegacyFillers, addBlenda, addSidePanel, ensureSidePanelsDefaults, state } from "./state.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const legacy = (over = {}) => baseModule({
  position: { x: 100, y: 0, z: 0 },
  legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
  fillers: {
    left: { active: true, width: 50, depth: 80, height: null, offsetY: 0 },
    right: { active: false, width: 50, depth: 80, height: null, offsetY: 0 },
    top: { active: false, height: 50, depth: 80, width: null, offsetY: 0 },
  },
  ...over,
});

describe("migrateLegacyFillers", () => {
  let project;
  beforeEach(() => {
    project = freshProject({ modules: [legacy()], sidePanels: [] });
    setProject(project);
  });

  it("przenosi aktywną blendę szafki do osobnego elementu w tym samym miejscu", () => {
    migrateLegacyFillers(project);
    expect(project.modules[0].fillers).toBeUndefined();
    expect(project.sidePanels).toHaveLength(1);
    const b = project.sidePanels[0];
    expect(b.kind).toBe("blenda");
    expect(b.flange).toBe("prawa");
    expect(b.dimensions).toEqual({ width: 50, height: 720, depth: 80 });
    // szafka 600x513 przy x=100: blenda lewa stoi na x=50..100, czoło 2 mm przed frontem
    expect(b.position.x).toBe(50);
    expect(b.position.z).toBe(453);
    expect(b.position.y).toBe(100); // nóżki
    expect(b.rotation).toBe(0);
  });

  it("nieaktywne blendy znikają bez tworzenia elementów, migracja jest idempotentna", () => {
    project.modules[0].fillers.left.active = false;
    migrateLegacyFillers(project);
    migrateLegacyFillers(project);
    expect(project.sidePanels).toHaveLength(0);
  });

  it("uwzględnia obrót szafki (90°: blenda lewa leci na -Z, czoło od strony -X)", () => {
    project.modules[0].position = { x: 0, y: 0, z: 0 };
    project.modules[0].rotation = 90;
    migrateLegacyFillers(project);
    const b = project.sidePanels[0];
    expect(b.rotation).toBe(90);
    expect(b.position.x).toBe(-20);
    expect(b.position.z).toBe(-50);
  });

  it("blenda górna obejmuje szafkę i blendy boczne, kołnierz przy dolnej krawędzi", () => {
    project.modules[0].fillers.top = { active: true, height: 50, depth: 80, width: null, offsetY: 0 };
    migrateLegacyFillers(project);
    const top = project.sidePanels.find((p) => p.name.startsWith("Blenda górna"));
    expect(top.flange).toBe("dol");
    expect(top.dimensions.width).toBe(650); // 600 + lewa 50
    expect(top.dimensions.height).toBe(50);
    expect(top.position.y).toBe(100 + 720);
  });

  it("ensureSidePanelsDefaults uruchamia migrację przy wczytywaniu projektu", () => {
    ensureSidePanelsDefaults(project);
    expect(project.sidePanels.some((p) => p.kind === "blenda")).toBe(true);
  });
});

describe("blenda jako osobny element", () => {
  beforeEach(() => {
    setProject(freshProject({ modules: [baseModule()], sidePanels: [] }));
  });

  it("addBlenda tworzy element z domyślnymi wymiarami i zaznacza go", () => {
    const b = addBlenda();
    expect(b.kind).toBe("blenda");
    expect(state.activeSidePanelId).toBe(b.id);
    expect(addSidePanel("blenda").kind).toBe("blenda");
    expect(addSidePanel().kind).toBeUndefined(); // zwykły bok
  });

  it("daje dwie formatki: czoło (Front) i mocowanie (Korpus, głębokość - grubość płyty)", () => {
    const b = addBlenda();
    b.dimensions = { width: 50, height: 720, depth: 80 };
    const parts = calculateAllProjectParts().filter((p) => p.name.startsWith("Blenda"));
    const czolo = parts.find((p) => p.name.includes("Czoło"));
    const mocowanie = parts.find((p) => p.name.includes("Mocowanie"));
    expect(czolo).toMatchObject({ length: 720, width: 50, category: "Front" });
    expect(mocowanie).toMatchObject({ length: 720, width: 62, category: "Korpus" });
  });

  it("blenda górna/dolna ma mocowanie o długości równej szerokości, a 'brak' - bez mocowania", () => {
    const b = addBlenda();
    b.dimensions = { width: 650, height: 50, depth: 80 };
    b.flange = "dol";
    let parts = calculateAllProjectParts().filter((p) => p.name.includes("Mocowanie"));
    expect(parts[0]).toMatchObject({ length: 650, width: 62 });
    b.flange = "brak";
    parts = calculateAllProjectParts().filter((p) => p.name.includes("Mocowanie"));
    expect(parts).toHaveLength(0);
  });
});
