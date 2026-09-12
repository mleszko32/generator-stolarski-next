// src/core/state.js
// depth:600 z poprzedniego (martwego, nigdy nie renderowanego) pola room nie ma
// sensu jako realny pokój - to szerokość korytarza, nie mieściłby się w nim nawet
// jeden rząd szafek. Skoro pokój od teraz faktycznie się renderuje, domyślne
// wymiary muszą być realistyczne (typowa mała kuchnia).
export const DEFAULT_ROOM = { width: 4000, height: 2600, depth: 3000 };

// state.project bywa podmieniane w całości w kilku miejscach (wczytanie projektu z
// chmury w storage.js, cofnij/wprzód w history.js), a nie tylko tworzone raz przy
// starcie — dlatego samo ustawienie `room` w domyślnym obiekcie state poniżej NIE
// wystarcza. Wołaj to po każdej takiej podmianie state.project, żeby stare projekty
// bez pola room (lub z niepełnym/nieliczbowym room) dostały sensowne wartości zamiast
// wywalać się przy renderowaniu pokoju w 3D.
export function ensureRoomDefaults(project) {
  if (!project.room || typeof project.room !== 'object') {
    project.room = { ...DEFAULT_ROOM };
  } else {
    project.room.width = parseFloat(project.room.width) || DEFAULT_ROOM.width;
    project.room.height = parseFloat(project.room.height) || DEFAULT_ROOM.height;
    project.room.depth = parseFloat(project.room.depth) || DEFAULT_ROOM.depth;
  }
  return project.room;
}

export const state = {
  activeModuleId: null, 
  loadedProjectId: null, 
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    front: { active: true, distribution: "1:1:1", drawerSystem: "merivobox", gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
    room: { ...DEFAULT_ROOM },
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
    rotation: 0, // stopnie: 0/90/180/270 - w którą ścianę "patrzy" front modułu
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 },
    legs: legs,
    // NOWOŚĆ: Lokalne, edytowalne ustawienia zawiasów dla konkretnego modułu
    front: { hinges: { topOffset: 100, bottomOffset: 100, margin: 40 } },
    elements: []
  };
  
  state.project.modules.push(newModule);
  state.activeModuleId = newId; 
  
  return newModule;
}

export function deleteModule(moduleId) {
  state.project.modules = state.project.modules.filter(m => m.id !== moduleId);
  if (state.activeModuleId === moduleId) {
    state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
  }
}

export function duplicateModule(moduleId) {
  const target = state.project.modules.find(m => m.id === moduleId);
  if (!target) return null;
  
  const newMod = JSON.parse(JSON.stringify(target));
  
  newMod.id = 'mod-' + Date.now() + Math.random().toString(36).substring(2, 6);
  newMod.name = newMod.name + " (Kopia)";
  newMod.rotation = newMod.rotation || 0; // zabezpieczenie dla modułów sprzed tego pola
  
  let nextX = 0;
  if (state.project.modules.length > 0) {
    nextX = Math.max(...state.project.modules.map(m => m.position.x + parseFloat(m.dimensions.width))) + 50; 
  }
  newMod.position.x = nextX;
  
  if (newMod.elements) {
    newMod.elements.forEach(el => {
      el.id = 'el-' + Date.now() + Math.random().toString(36).substring(2, 9);
    });
  }
  
  state.project.modules.push(newMod);
  state.activeModuleId = newMod.id;
  return newMod;
}