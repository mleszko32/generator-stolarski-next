// src/core/state.js
export const state = {
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: {
      boardThickness: 18,
      backThickness: 3
    },
    backPanel: {
      type: "nakladane",
      offset: 20,
      grooveDepth: 7,
      clearance: 2
    },
    front: {
      active: true,
      distribution: "1:1:1",
      drawerSystem: "merivobox",
      gap: 3,
      clearance: { sides: 1.5, top: 5, bottom: 0 }
    },
    modules: [
      {
        id: "mod-1",
        type: "base_cabinet",
        dimensions: { width: 600, height: 720, depth: 513 },
        position: { x: 0, y: 0, z: 0 },
        // ZAMIAST DRZEWA INTERIOR - PŁASKA LISTA WSTAWIONYCH ELEMENTÓW
        elements: [] 
      }
    ]
  }
};