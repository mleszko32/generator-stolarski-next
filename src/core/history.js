// src/core/history.js
//
// Historia cofnij/wprzód. state.project to zwykły, mutowalny obiekt zmieniany
// bezpośrednio w kilkunastu miejscach aplikacji (sidebar.js, properties.js,
// viewer3d.js) — zamiast śledzić każdą pojedynczą mutację, robimy migawki
// (JSON) całego state.project + activeModuleId i zatwierdzamy je do historii
// z debounce'em. Dzięki temu ciągłe operacje (przeciąganie modułu w 3D,
// wpisywanie w polu tekstowym) zlewają się w JEDEN krok cofania zamiast
// setek mikro-kroków.
//
// scheduleCheckpoint() jest wołane z update3D()/updateSidebar()/
// initPropertiesPanel() — czyli z tych samych miejsc, które już dziś każda
// mutacja w aplikacji woła po sobie (patrz CLAUDE.md: "Update flow"). Dzięki
// temu nie trzeba było ręcznie dotykać każdego z kilkudziesięciu miejsc,
// które zmieniają state.
import { state, ensureRoomDefaults } from "./state.js";
import { migrateLegacyRoom } from "./layout.js";

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 600;

let undoStack = [];
let redoStack = [];
let lastSnapshot = null;
let debounceTimer = null;
const listeners = [];

function snapshotNow() {
  return JSON.stringify({ project: state.project, activeModuleId: state.activeModuleId });
}

function notify() {
  const info = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
  listeners.forEach(cb => cb(info));
}

function commitCheckpoint() {
  const current = snapshotNow();
  if (current === lastSnapshot) return;
  undoStack.push(lastSnapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  lastSnapshot = current;
  notify();
}

// Wołaj raz, gdy projekt jest gotowy (start aplikacji, po wczytaniu innego
// projektu z chmury) — ustawia punkt zerowy i czyści historię. Cofanie
// między dwoma różnymi wczytanymi projektami nie ma sensu.
export function resetHistory() {
  clearTimeout(debounceTimer);
  undoStack = [];
  redoStack = [];
  lastSnapshot = snapshotNow();
  notify();
}

// Bezpiecznie wołać po każdej (nawet mikroskopijnej) zmianie stanu — kolejne
// wywołania w ciągu DEBOUNCE_MS scalają się w jeden checkpoint.
export function scheduleCheckpoint() {
  if (lastSnapshot === null) {
    lastSnapshot = snapshotNow();
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(commitCheckpoint, DEBOUNCE_MS);
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

function applySnapshot(json) {
  const data = JSON.parse(json);
  state.project = data.project;
  ensureRoomDefaults(state.project);
  migrateLegacyRoom(state.project);
  state.activeModuleId = data.activeModuleId;
  // Jeśli aktywny moduł zniknął w tej migawce (np. cofnięcie dodania modułu,
  // gdy on sam był zaznaczony), wybierz sensowny fallback zamiast wskazywać w pustkę.
  if (state.activeModuleId && !state.project.modules.some(m => m.id === state.activeModuleId)) {
    state.activeModuleId = state.project.modules[0]?.id ?? null;
  }
}

// Cofa jeden krok. Zwraca true, jeśli coś się zmieniło (wtedy trzeba
// odświeżyć UI: update3D() + updateSidebar() + initPropertiesPanel()).
export function undo() {
  clearTimeout(debounceTimer);
  commitCheckpoint(); // zatwierdź niedokończoną (jeszcze nie zdebounce'owaną) zmianę, żeby jej nie zgubić
  if (undoStack.length === 0) return false;
  redoStack.push(lastSnapshot);
  const prev = undoStack.pop();
  applySnapshot(prev);
  lastSnapshot = prev;
  notify();
  return true;
}

// Ponawia cofnięty krok. Zwraca true, jeśli coś się zmieniło.
export function redo() {
  if (redoStack.length === 0) return false;
  clearTimeout(debounceTimer);
  undoStack.push(lastSnapshot);
  const next = redoStack.pop();
  applySnapshot(next);
  lastSnapshot = next;
  notify();
  return true;
}

// Rejestruje callback wołany od razu i po każdej zmianie canUndo/canRedo —
// do włączania/wyłączania przycisków Cofnij/Wprzód w UI.
export function onHistoryChange(cb) {
  listeners.push(cb);
  cb({ canUndo: canUndo(), canRedo: canRedo() });
}
