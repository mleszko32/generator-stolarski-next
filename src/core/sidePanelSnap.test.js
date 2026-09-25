import { describe, it, expect, beforeEach } from "vitest";
import { snapSidePanel, getModuleBoxWithFillers } from "./sidePanelSnap.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const panel = (over = {}) => ({
  id: "sp1", name: "Bok", position: { x: 0, y: 0, z: 0 }, rotation: 0,
  dimensions: { width: 18, height: 2600, depth: 600 }, ...over,
});

// szafka 600 x 720 x 513 przy x=1000, z=0 (tył przy ścianie)
const cab = (over = {}) => baseModule({ id: "m1", position: { x: 1000, y: 0, z: 0 }, ...over });

describe("snapSidePanel", () => {
  let project;
  beforeEach(() => {
    project = freshProject({ modules: [cab()], sidePanels: [] });
    setProject(project);
  });

  it("dosuwa bok do prawej krawędzi szafki bez szczeliny", () => {
    const p = panel();
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 1600 + 25, 0);
    expect(r.x).toBe(1600); // lewa krawędź boku = prawy bok szafki
  });

  it("dosuwa bok do lewej krawędzi szafki (bok po lewej stronie)", () => {
    const p = panel();
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 1000 - 18 - 30, 0);
    expect(r.x).toBe(1000 - 18);
  });

  it("uwzględnia blendę: bok staje przy blendzie, nie przy korpusie", () => {
    project.modules[0].fillers = { right: { active: true, width: 50 } };
    const p = panel();
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 1600 + 60, 0);
    expect(r.x).toBe(1650);
  });

  it("wyrównuje tył boku z tyłem szafki i przód z przodem", () => {
    const p = panel({ dimensions: { width: 18, height: 2600, depth: 600 } });
    project.sidePanels.push(p);
    // tył szafki z=0: propozycja z=+25 -> z=0
    expect(snapSidePanel(p, 1600, 25).z).toBe(0);
    // przód szafki z=513: bok głęb. 500 -> z=13, żeby przody się zrównały
    const q = panel({ dimensions: { width: 18, height: 2600, depth: 500 } });
    project.sidePanels = [q];
    expect(snapSidePanel(q, 1600, 35).z).toBe(13);
  });

  it("bok upuszczony nad szafką jest wypychany na jej bok, nie wchodzi w korpus", () => {
    const p = panel();
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 1100, 100); // środek szafki
    const insideX = r.x + 18 > 1000 && r.x < 1600;
    const insideZ = r.z < 513;
    expect(insideX && insideZ).toBe(false);
  });

  it("nie przyciąga do szafki, która nie pokrywa się z bokiem w głąb pomieszczenia", () => {
    const p = panel({ dimensions: { width: 18, height: 2600, depth: 300 } });
    project.sidePanels.push(p);
    // bok daleko z przodu (z=1000..1300) - szafka stoi przy z=0..513
    const r = snapSidePanel(p, 1600 + 25, 1000);
    expect(r.x).toBe(1625);
  });

  it("przyciąga do ściany pokoju", () => {
    const p = panel();
    project.sidePanels.push(p);
    expect(snapSidePanel(p, 20, 2500).x).toBe(0);
  });

  it("nie przyciąga do szafki wiszącej, gdy bok jest pod nią (brak wspólnej wysokości)", () => {
    project.modules = [cab({ id: "up", position: { x: 1000, y: 1450, z: 0 }, dimensions: { width: 600, height: 720, depth: 320 }, legs: { active: false, height: 100 } })];
    const p = panel({ dimensions: { width: 18, height: 700, depth: 600 } }); // y 0..700
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 1600 + 25, 0);
    expect(r.x).toBe(1625);
  });
});

describe("getModuleBoxWithFillers", () => {
  it("blenda prawa poszerza obrys w +X przy obrocie 0, a w -X przy 180", () => {
    const m = cab({ fillers: { right: { active: true, width: 50 } } });
    expect(getModuleBoxWithFillers(m).x1).toBe(1650);
    m.rotation = 180;
    const b = getModuleBoxWithFillers(m);
    expect(b.x0).toBe(950);
    expect(b.x1).toBe(1600);
  });
});

describe("snapSidePanel - wypychanie przy ścianie", () => {
  it("bok upuszczony w szafce stojącej przy lewej ścianie ląduje po jej PRAWEJ stronie", () => {
    const project = freshProject({ modules: [baseModule({ id: "m0", position: { x: 0, y: 0, z: 0 } })], sidePanels: [] });
    setProject(project);
    const p = { id: "sp1", position: { x: 0, y: 0, z: 0 }, rotation: 0, dimensions: { width: 18, height: 2600, depth: 600 } };
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 0, 0);
    expect(r.x).toBe(600);
  });
});

describe("snapSidePanel - bok między stykającymi się szafkami", () => {
  it("trafia na koniec rzędu, nie do środka jednej z szafek", () => {
    const project = freshProject({
      modules: [
        baseModule({ id: "a", position: { x: 0, y: 0, z: 0 } }),
        baseModule({ id: "b", position: { x: 600, y: 0, z: 0 } }),
      ],
      sidePanels: [],
    });
    setProject(project);
    const p = { id: "sp1", position: { x: 0, y: 0, z: 0 }, rotation: 0, dimensions: { width: 18, height: 2600, depth: 600 } };
    project.sidePanels.push(p);
    const r = snapSidePanel(p, 590, 0);
    expect(r.x).toBe(1200);
  });
});
