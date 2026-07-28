// src/core/state.js
export const state = {
  activeModuleId: null, 
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    front: { active: true, distribution: "1:1:1", drawerSystem: "merivobox", gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
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
  
  // Domyślne ustawienia nóżek i cokołu
  let legs = { active: true, height: 100, plinth: true, plinthOffset: 40 };

  if (isUpper) {
    name = "Szafka wisząca";
    height = 720;
    depth = 320;
    posY = 1450;
    legs = { active: false, height: 100, plinth: false, plinthOffset: 40 }; // Wiszące nie mają nóżek
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
    legs: legs, // NOWY PARAMETR
    elements: []
  };
  
  state.project.modules.push(newModule);
  state.activeModuleId = newId; 
  
  return newModule;
}