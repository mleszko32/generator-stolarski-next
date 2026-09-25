// src/core/localBackup.js
//
// Kopia awaryjna projektu w przeglądarce (localStorage), niezależna od chmury i
// logowania: chroni przed utratą pracy przy zamknięciu karty, awarii albo braku
// internetu w warsztacie. Kopia istnieje tylko dla NIEZAPISANYCH zmian - po
// zapisie w chmurze (albo wczytaniu projektu) jest kasowana, więc po zwykłym
// odświeżeniu strony nic nie wyskakuje. Przy starcie aplikacja proponuje
// przywrócenie, jeśli kopia została.
import { state } from "./state.js";
import { hasUnsavedChanges } from "./storage.js";

const KEY = "gsn-local-backup-v1";
export const LOCAL_BACKUP_INTERVAL_MS = 20 * 1000;

let lastWritten = null;

function storageOrNull() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (e) {
    return null; // np. zablokowany dostęp w trybie prywatnym
  }
}

// Zwraca { savedAt, loadedProjectId, project } albo null.
export function readLocalBackup() {
  const ls = storageOrNull();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.project || !Array.isArray(data.project.modules)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearLocalBackup() {
  const ls = storageOrNull();
  lastWritten = null;
  if (!ls) return;
  try { ls.removeItem(KEY); } catch (e) { /* ignorujemy */ }
}

// Jeden krok cyklu: zapisuje kopię, gdy są niezapisane zmiany, kasuje, gdy
// wszystko jest już w chmurze. Pusty projekt pomijamy (nie kasujemy nic -
// przy starcie kopia musi przetrwać do decyzji użytkownika).
// Zwraca 'written' | 'cleared' | 'skipped' | 'error'.
export function runLocalBackupTick() {
  const ls = storageOrNull();
  if (!ls) return "skipped";
  if (!state.project.modules || state.project.modules.length === 0) return "skipped";
  if (!hasUnsavedChanges()) {
    clearLocalBackup();
    return "cleared";
  }
  const json = JSON.stringify(state.project);
  if (json === lastWritten) return "skipped";
  try {
    ls.setItem(KEY, JSON.stringify({ savedAt: Date.now(), loadedProjectId: state.loadedProjectId, project: state.project }));
    lastWritten = json;
    return "written";
  } catch (e) {
    console.warn("Nie udało się zapisać kopii lokalnej projektu:", e);
    return "error";
  }
}

export function startLocalBackup() {
  const timer = setInterval(runLocalBackupTick, LOCAL_BACKUP_INTERVAL_MS);
  // Przy zamykaniu / chowaniu karty zapisujemy od razu, nie czekając na cykl.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") runLocalBackupTick();
  });
  window.addEventListener("pagehide", runLocalBackupTick);
  return timer;
}
