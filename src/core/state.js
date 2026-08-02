// src/core/state.js
export const state = {
  activeModuleId: null, 
  loadedProjectId: null, 
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    front: { active: true, distribution: "1:1:1", drawerSystem: "merivobox", gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
    room: {
      width: 3500,  
      height: 2600, 
      depth: 600    
    },
    modules: [] 
  }
};

export function getActiveModule() {
  return state.project.modules.find(m => m.id === state.activeModuleId) || null;
}

export function addModule(type = "base_cabinet") {
  const newId = 'mod-' + Date.now();
  const isUpper = type === 'upper_cabinet';
  const isTall = type === 'tall_cabinet';

  let name = "Szafka dolna";
  let height = 720;
  let depth = 513;
  let posY = 0;
  
  let legs = { active: true, height: 100, plinth: true, plinthOffset: 40 };

  if (isUpper) {
    name = "Szafka wisząca";
    height = 720;
    depth = 320;
    posY = 1450;
    legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };
  } else if (isTall) {
    name = "Słupek";
    height = 2070;
    depth = 513;
    posY = 0;
  }

  let nextX = 0;
  if (state.project.modules.length > 0) {
    nextX = Math.max(...state.project.modules.map(m => m.position.x + parseFloat(m.dimensions.width)));
  }
  
  const newModule = {
    id: newId,
    name: name + ' ' + (state.project.modules.length + 1),
    type: type,
    dimensions: { width: 600, height: height, depth: depth }, 
    position: { x: nextX, y: posY, z: 0 }, 
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 },
    legs: legs,
    elements: []
  };
  
  state.project.modules.push(newModule);
  state.activeModuleId = newId; 
  
  return newModule;
}

// NOWOŚĆ: Usuwanie szafki
export function deleteModule(moduleId) {
  state.project.modules = state.project.modules.filter(m => m.id !== moduleId);
  if (state.activeModuleId === moduleId) {
    state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
  }
}

// NOWOŚĆ: Kopiowanie szafki wraz z zawartością
export function duplicateModule(moduleId) {
  const target = state.project.modules.find(m => m.id === moduleId);
  if (!target) return null;
  
  const newMod = JSON.parse(JSON.stringify(target));
  
  // Zapewniamy całkowicie unikalne ID dla nowej szafki
  newMod.id = 'mod-' + Date.now() + Math.random().toString(36).substring(2, 6);
  newMod.name = newMod.name + " (Kopia)";
  
  let nextX = 0;
  if (state.project.modules.length > 0) {
    nextX = Math.max(...state.project.modules.map(m => m.position.x + parseFloat(m.dimensions.width))) + 50; 
  }
  newMod.position.x = nextX;
  
  // KLUCZOWE ZABEZPIECZENIE: Wszystkie elementy (półki/szuflady) sklonowanej szafki 
  // otrzymują absolutnie unikalne ID. Rozwiązuje to problem usunięcia np. wszystkich na raz!
  if (newMod.elements) {
    newMod.elements.forEach(el => {
      el.id = 'el-' + Date.now() + Math.random().toString(36).substring(2, 9);
    });
  }
  
  state.project.modules.push(newMod);
  state.activeModuleId = newMod.id;
  return newMod;
}