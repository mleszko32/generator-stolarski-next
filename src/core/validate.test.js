import { describe, it, expect, beforeEach } from "vitest";
import { validateProject, findInteriorCollisions } from "./validate.js";
import { freshProject, baseModule, fullZoneFront, setProject } from "../test/fixtures.js";
import { state } from "./state.js";

const messages = (res) => res.issues.map((i) => i.message);
const has = (res, level, fragment) => res.issues.some((i) => i.level === level && i.message.includes(fragment));

describe("validateProject", () => {
  beforeEach(() => {
    setProject(freshProject({ modules: [baseModule()] }));
  });

  it("poprawna szafka nie ma błędów ani ostrzeżeń", () => {
    const res = validateProject();
    expect(res.counts.error).toBe(0);
    expect(res.counts.warn).toBe(0);
  });

  it("pusty projekt daje tylko informację", () => {
    setProject(freshProject({ modules: [] }));
    const res = validateProject();
    expect(res.counts).toEqual({ error: 0, warn: 0, info: 1 });
  });

  it("wykrywa szafkę wystającą poza pomieszczenie i ponad sufit", () => {
    state.project.modules[0].position = { x: 3200, y: 0, z: 0 };
    expect(has(validateProject(), "error", "poza obrys")).toBe(true);

    state.project.modules[0].position = { x: 0, y: 2500, z: 0 };
    expect(has(validateProject(), "error", "wysokość pomieszczenia")).toBe(true);
  });

  it("wykrywa kolizję dwóch szafek, ale nie piętrowania jedna nad drugą", () => {
    const b = baseModule({ id: "mod-b", name: "Druga", position: { x: 300, y: 0, z: 0 } });
    state.project.modules.push(b);
    expect(has(validateProject(), "error", "Nachodzi na szafkę")).toBe(true);

    // ta sama pozycja w rzucie, ale druga wisi wysoko nad pierwszą
    b.position = { x: 0, y: 1450, z: 0 };
    b.legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };
    expect(has(validateProject(), "error", "Nachodzi na szafkę")).toBe(false);
  });

  it("szafki obok siebie (styk krawędzi) nie kolidują", () => {
    state.project.modules.push(baseModule({ id: "mod-b", name: "Obok", position: { x: 600, y: 0, z: 0 } }));
    expect(has(validateProject(), "error", "Nachodzi na szafkę")).toBe(false);
  });

  it("ostrzega o zbyt szerokich drzwiach", () => {
    const mod = state.project.modules[0];
    mod.dimensions.width = 900;
    mod.elements = [fullZoneFront({ baseZone: { minX: 18, maxX: 882, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 } })];
    const res = validateProject();
    expect(has(res, "warn", "Drzwi szerokie")).toBe(true);
  });

  it("ostrzega o bardzo szerokiej półce", () => {
    const mod = state.project.modules[0];
    mod.dimensions.width = 1000;
    mod.elements = [{ id: "p1", typ: "poziom", x: 18, y: 300, w: 964, h: 18, isStructural: false }];
    expect(has(validateProject(), "warn", "Półka szeroka")).toBe(true);
  });

  it("przywraca state.project po sprawdzeniu", () => {
    const before = state.project;
    validateProject(freshProject({ modules: [baseModule({ id: "x" })] }));
    expect(state.project).toBe(before);
  });

  it("uwagi są posortowane: błędy przed ostrzeżeniami", () => {
    const mod = state.project.modules[0];
    mod.position = { x: 3300, y: 0, z: 0 };
    mod.dimensions.width = 900;
    mod.elements = [fullZoneFront({ baseZone: { minX: 18, maxX: 882, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 } })];
    const levels = validateProject().issues.map((i) => i.level);
    expect(levels).toEqual([...levels].sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a] - { error: 0, warn: 1, info: 2 }[b])));
    expect(messages(validateProject()).length).toBeGreaterThan(1);
  });
});

describe("kolizje wnętrza: półka w strefie szuflad", () => {
  const drawerFront = (over = {}) => ({
    id: "front-d1", typ: "front", subtype: "szuflada", frontIndex: 0, frontCount: 3, gap: 3,
    baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
    ...over,
  });
  const shelf = (y) => ({ id: "p1", typ: "poziom", x: 18, y, w: 564, h: 18, isStructural: false });

  beforeEach(() => {
    setProject(freshProject({ modules: [baseModule()] }));
  });

  it("półka w środku strefy 3 szuflad jest błędem", () => {
    state.project.modules[0].elements = [drawerFront(), shelf(350)];
    const res = validateProject();
    expect(has(res, "error", "strefie szuflad")).toBe(true);
  });

  it("półka poza strefą szuflad (nad nimi) jest poprawna", () => {
    state.project.modules[0].elements = [
      drawerFront({ baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 400, offsetBottom: 0, offsetTop: 0 } }),
      shelf(400),
    ];
    expect(has(validateProject(), "error", "strefie szuflad")).toBe(false);
  });

  it("przegroda pionowa przecinająca strefę szuflad jest błędem", () => {
    state.project.modules[0].elements = [
      drawerFront(),
      { id: "pion1", typ: "pion", x: 291, y: 18, w: 18, h: 684, isStructural: true },
    ];
    expect(has(validateProject(), "error", "Przegroda pionowa")).toBe(true);
  });

  it("findInteriorCollisions zwraca komunikaty dla szafki", () => {
    const mod = state.project.modules[0];
    mod.elements = [drawerFront(), shelf(350)];
    expect(findInteriorCollisions(mod)).toHaveLength(1);
  });
});
