// src/core/state.js
export const state = {
  activeModuleId: "mod-1", // Śledzi, którą szafkę aktualnie edytujemy
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, clearance: 2 },
    front: { active: true, distribution: "1:1:1", drawerSystem: "merivobox", gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
    modules: [
      {
        id: "mod-1",
        name: "Szafka dolna 1",
        type: "base_cabinet",
        dimensions: { width: 600, height: 720, depth: 513 },
        position: { x: 0, y: 0, z: 0 },
        elements: [] 
      }
    ]
  }
};

// Funkcja zwracająca szafkę, którą obecnie edytujemy
export function getActiveModule() {
  return state.project.modules.find(m => m.id === state.activeModuleId) || state.project.modules[0];
}

// --- FAZA 4: Menedżer Pozycji ---
// Układa szafki w rzędzie (jedna obok drugiej)
export function recalculatePositions() {
  let currentX = 0;
  state.project.modules.forEach(mod => {
    mod.position.x = currentX;
    currentX += parseFloat(mod.dimensions.width); 
  });
}

// Funkcja dodająca nową szafkę do projektu
export function addModule(name = "Szafka") {
  const newId = 'mod-' + Date.now();
  
  const newModule = {
    id: newId,
    name: name + ' ' + (state.project.modules.length + 1),
    type: "base_cabinet",
    dimensions: { width: 600, height: 720, depth: 513 }, 
    position: { x: 0, y: 0, z: 0 }, // Pozycja zostanie ustalona za moment
    elements: []
  };
  
  state.project.modules.push(newModule);
  state.activeModuleId = newId; 
  recalculatePositions(); // Przeliczamy od nowa pozycję wszystkich szafek
  
  return newModule;
}