// src/core/state.js
import { ensureCornerDefaults } from "./layout.js";
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

// Ceny materiałów/okuć (kosztorys) - jak room, to dane PROJEKTU (zapisywane/
// wczytywane razem z nim w Firestore), więc stare projekty sprzed dodania tej
// funkcji nie mają tego pola wcale. Wołaj po każdej podmianie state.project
// (main.js, history.js, storage.js), analogicznie do ensureRoomDefaults.
// `hardware` to słownik nazwa-okucia -> cena, bo lista okuć jest dynamiczna
// (np. "Nóżka regulowana H-100" zależy od wysokości nóżek w projekcie) -
// nie da się z góry przewidzieć stałego zestawu pozycji.
//
// `materials` to cena za m² PER KATEGORIA formatki (Korpus/Front/Szuflada/
// Plecy, patrz engine/cabinet.js: kategorie części) - front jest zwykle
// innym, droższym materiałem niż korpus (lakier, fornir, okleina), więc
// jedna wspólna cena za "płytę" nie miała sensu (zgłoszona uwaga).
export const PRICING_MATERIAL_CATEGORIES = ['Korpus', 'Front', 'Szuflada', 'Plecy'];

export const DEFAULT_VAT_PERCENT = 23;

// Robocizna, montaż, transport, rabat i VAT - pola dodane po pierwszej wersji
// kosztorysu, więc starsze projekty (i chmura) ich nie mają. Brak pola = 0,
// z wyjątkiem VAT (domyślnie 23%); jawne 0 w VAT zostaje zerem.
function nonNeg(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
export function migratePricingExtras(p) {
  const hr = (o) => ({ hours: nonNeg(o && o.hours), rate: nonNeg(o && o.rate) });
  p.labor = hr(p.labor);
  p.assembly = hr(p.assembly);
  p.transport = nonNeg(p.transport);
  p.discountPercent = Math.min(100, nonNeg(p.discountPercent));
  p.vatPercent = nonNeg(p.vatPercent, DEFAULT_VAT_PERCENT);
  return p;
}

export function ensurePricingDefaults(project) {
  if (!project.pricing || typeof project.pricing !== 'object') {
    project.pricing = { materials: {}, marginPercent: 0, hardware: {} };
  }
  const p = project.pricing;

  // Migracja z pierwszej wersji kosztorysu (jedna cena "boardPricePerM2" na
  // całą płytę meblową + osobna "hdfPricePerM2" na plecy) - rozbijamy ją na
  // nowe kategorie, żeby użytkownicy, którzy zdążyli już wpisać ceny, ich
  // nie stracili.
  if (!p.materials || typeof p.materials !== 'object') {
    const legacyBoard = parseFloat(p.boardPricePerM2) || 0;
    p.materials = { Korpus: legacyBoard, Front: legacyBoard, Szuflada: legacyBoard, Plecy: parseFloat(p.hdfPricePerM2) || 0 };
  }
  delete p.boardPricePerM2;
  delete p.hdfPricePerM2;

  PRICING_MATERIAL_CATEGORIES.forEach(cat => {
    p.materials[cat] = parseFloat(p.materials[cat]) || 0;
  });
  p.marginPercent = parseFloat(p.marginPercent) || 0;
  if (!p.hardware || typeof p.hardware !== 'object') p.hardware = {};
  migratePricingExtras(p);

  return p;
}

// Boki dokładane (dekoracyjne panele boczne w dekorze frontów) - w
// przeciwieństwie do blendy (mod.fillers), NIE należą do jednego modułu:
// mają objąć np. cały słup dolna+górna szafka naraz, a domyślnie sięgają od
// podłogi do sufitu niezależnie od wysokości modułów za nimi (zgłoszona
// potrzeba). To pierwszy samodzielny obiekt projektu obok `modules` - stare
// projekty sprzed tej funkcji nie mają wcale pola `sidePanels`.
export function ensureSidePanelsDefaults(project) {
  if (!Array.isArray(project.sidePanels)) {
    project.sidePanels = [];
  }
  return project.sidePanels;
}

export const state = {
  activeModuleId: null,
  activeSidePanelId: null,
  loadedProjectId: null,
  project: {
    name: "Zabudowa Wielomodułowa",
    materials: { boardThickness: 18, backThickness: 3 },
    construction: { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100 },
    front: { active: true, distribution: "1:1:1", drawerSystem: "merivobox", gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
    room: { ...DEFAULT_ROOM },
    pricing: { materials: { Korpus: 0, Front: 0, Szuflada: 0, Plecy: 0 }, marginPercent: 0, hardware: {}, labor: { hours: 0, rate: 0 }, assembly: { hours: 0, rate: 0 }, transport: 0, discountPercent: 0, vatPercent: DEFAULT_VAT_PERCENT },
    modules: [],
    sidePanels: []
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

// Szafka narożna (kąt prosty, BEZ ścięcia narożnika - zgłoszona korekta:
// pierwsza wersja miała ścięty, skośny front, użytkownik chce ostry kąt
// 90° jak w typowym "narożniku ślepym" z dwoma zwykłymi, prostymi
// frontami, po jednym na ramię). PIERWSZY nieprostokątny moduł w aplikacji
// - bryła to dwa ramiona (legA=dimensions.width, legB) spotykające się pod
// kątem prostym (patrz render/viewer3d.js: renderCornerCabinet, engine/
// cabinet.js: getCornerCorpusParts). Oba fronty są tworzone od razu tutaj
// - w przeciwieństwie do zwykłego modułu użytkownik NIE dokłada ich
// ręcznie przez generyczny mechanizm stref - zamiast tego dostają od razu
// jeden domyślny front drzwiowy każde (ensureCornerDefaults, core/layout.js),
// przez ten sam generyczny mechanizm (core/zoneTree.js: assignFront) co
// fronty zwykłych modułów, tylko z bound-tokenami corner-A-*/corner-B-*
// zamiast cab-* - dzięki temu nadążają same za zmianą legA/legB/depth/
// height, a dodatkowo można je dalej dzielić na więcej frontów/półek przez
// ten sam edytor wnętrza co zwykły moduł (ui/interiorEditor.js,
// ui/cornerConfigModal.js), tylko przypisany do konkretnego ramienia.
export function addCornerModule() {
  const newId = 'mod-' + Date.now();
  const legA = 860, legB = 860, depth = 540, height = 720;

  let nextX = 0;
  if (state.project.modules.length > 0) {
    nextX = Math.max(...state.project.modules.map(m => (parseFloat(m.position.x) || 0) + (parseFloat(m.dimensions.width) || 0)));
  }

  const newModule = {
    id: newId,
    name: 'Szafka narożna ' + (state.project.modules.length + 1),
    type: 'corner_cabinet',
    dimensions: { width: legA, legB: legB, depth: depth, height: height },
    position: { x: nextX, y: 0, z: 0 },
    rotation: 0,
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 },
    legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
    front: { hinges: { topOffset: 100, bottomOffset: 100, margin: 40 } },
    elements: []
  };

  state.project.modules.push(newModule);
  state.activeModuleId = newId;
  ensureCornerDefaults(newModule);

  return newModule;
}

export function getActiveSidePanel() {
  return state.project.sidePanels.find(p => p.id === state.activeSidePanelId) || null;
}

export function addSidePanel() {
  const newId = 'side-' + Date.now();
  const room = state.project.room || DEFAULT_ROOM;

  const newPanel = {
    id: newId,
    name: 'Bok dokładany ' + (state.project.sidePanels.length + 1),
    decor: '', // wolna etykieta dekoru (np. "Front biały połysk") - trafia do nazwy formatki
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    // width = grubość płyty (jak th w bokach korpusu); height/depth jak w
    // module - dzięki temu getWorldFootprint(panel) z core/layout.js działa
    // bez zmian. Domyślnie podłoga->sufit, bo bok ma obejmować kilka modułów
    // naraz, nie tylko jeden (zgłoszona potrzeba).
    dimensions: {
      width: parseFloat(state.project.materials?.boardThickness) || 18,
      height: parseFloat(room.height) || DEFAULT_ROOM.height,
      depth: 600
    }
  };

  state.project.sidePanels.push(newPanel);
  state.activeSidePanelId = newId;
  state.activeModuleId = null;

  return newPanel;
}

export function deleteSidePanel(panelId) {
  state.project.sidePanels = state.project.sidePanels.filter(p => p.id !== panelId);
  if (state.activeSidePanelId === panelId) {
    state.activeSidePanelId = null;
  }
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