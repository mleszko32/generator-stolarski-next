// Wspólne fixture'y dla testów. Cały kod domenowy czyta singleton `state`
// (src/core/state.js), więc testy podmieniają `state.project` na świeży obiekt
// w beforeEach i nie współdzielą mutacji między sobą.
import { state } from "../core/state.js";

export function freshProject(overrides = {}) {
  return {
    name: "Test",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    front: {
      active: true,
      distribution: "1:1:1",
      drawerSystem: "merivobox",
      gap: 3,
      type: "nakladane",
      clearance: { sides: 1.5, top: 5, bottom: 0 },
      hinges: { topOffset: 100, bottomOffset: 100, margin: 40 },
    },
    room: { width: 3500, height: 2600, depth: 600 },
    modules: [],
    ...overrides,
  };
}

// Prosty moduł szafki dolnej z pełnym korpusem, bez elementów wnętrza.
export function baseModule(overrides = {}) {
  return {
    id: "mod-test",
    name: "Szafka",
    type: "base_cabinet",
    dimensions: { width: 600, height: 720, depth: 513 },
    position: { x: 0, y: 0, z: 0 },
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 },
    legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
    front: { hinges: { topOffset: 100, bottomOffset: 100, margin: 40 } },
    elements: [],
    ...overrides,
  };
}

// Front z baseZone pokrywającym całe wnętrze korpusu (od płyty do płyty).
export function fullZoneFront(overrides = {}) {
  return {
    id: "front-1",
    typ: "front",
    subtype: "drzwi",
    frontIndex: 0,
    gap: 3,
    baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
    ...overrides,
  };
}

export function setProject(project) {
  state.project = project;
  state.activeModuleId = project.modules[0]?.id ?? null;
  state.loadedProjectId = null;
}
