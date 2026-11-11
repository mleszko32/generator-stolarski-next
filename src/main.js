// src/main.js
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "./styles/global.css";
import { initLayout } from "./ui/layout.js"; 
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js";
import { init3DViewer, update3D, updateRoom, getScreenMoveDirs } from "./render/viewer3d.js";
import { moveSelectionOf, moveSelection } from "./core/alignCommands.js";
import { openProductionHub, closeProductionHub } from "./ui/productionHub.js";
import { state, ensureRoomDefaults, ensurePricingDefaults, ensureSidePanelsDefaults, getActiveModule } from "./core/state.js";
import { openRoomSettingsModal } from "./ui/roomPanel.js";
import { clampModuleToRoom, migrateLegacyRoom } from "./core/layout.js";


// ZMIANA: Importujemy funkcję do usuwania projektów oraz customowy dialog
import { saveProjectToCloud, loadProjectFromCloud, getSavedProjectsMeta, showCustomDialog } from "./core/storage.js";
import { openLoadProjectModal } from "./ui/loadProjectModal.js";
import { onAuthChange, signInWithGoogle, signOutUser, getCurrentUser, saveProjectSilently } from "./core/storage.js";
import { undo, redo, onHistoryChange, resetHistory } from "./core/history.js";
import { openVersionHistory } from "./ui/versionHistory.js";
import { showAlert } from "./utils/modal.js";
import { readLocalBackup, clearLocalBackup, startLocalBackup } from "./core/localBackup.js";
import { applyProjectData } from "./core/storage.js";
import { openHelp } from "./ui/helpModal.js";
import { initAssistantBridge } from "./ui/assistantBridge.js";

const navIcon = (name, text) => `<i class="ti ti-${name}" aria-hidden="true"></i> ${text}`;

ensureRoomDefaults(state.project);
ensurePricingDefaults(state.project);
ensureSidePanelsDefaults(state.project);
migrateLegacyRoom(state.project);
initLayout();
document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => {
  const mode = b.dataset.mode;
  if (mode === 'projekt') closeProductionHub();
  else openProductionHub(mode === 'wycena' ? 'kosztorys' : 'formatki');
}));
initPropertiesPanel();
updateSidebar();
init3DViewer();
resetHistory(); // punkt zerowy historii cofnij/wprzód, po pierwszym renderze
initAssistantBridge(); // window.gsn — pilot dla Claude'a (ui/assistantBridge.js)

// --- COFNIJ / WPRZÓD ---
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

// Po cofnięciu/ponowieniu state.project bywa całkiem inną migawką (inne
// moduły, inne id) — tak jak po wczytaniu projektu z chmury odświeżamy
// wszystkie trzy panele, a nie tylko ten, w którym coś kliknięto.
function refreshAfterHistoryJump() {
  updateRoom(); // migawka może mieć inne wymiary pokoju niż to, co jest zbudowane w 3D
  initPropertiesPanel();
  updateSidebar();
  update3D();
}

if (btnUndo) btnUndo.addEventListener('click', () => { if (undo()) refreshAfterHistoryJump(); });
if (btnRedo) btnRedo.addEventListener('click', () => { if (redo()) refreshAfterHistoryJump(); });

onHistoryChange(({ canUndo, canRedo }) => {
  [[btnUndo, canUndo], [btnRedo, canRedo]].forEach(([btn, enabled]) => {
    if (!btn) return;
    btn.disabled = !enabled; // wygląd wyłączonego przycisku: .btn:disabled w global.css
  });
});

// Przy otwartym oknie (modal, hub) skróty nie działają: cofanie podmienia cały
// state.project, a okno dalej edytowałoby stary obiekt (zmiany znikałyby bez śladu),
// a "R" obracałoby szafkę schowaną pod oknem.
const isOverlayOpen = () => !!document.querySelector('.modal-overlay, .hub-overlay');

// Skróty klawiszowe Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z jako alternatywa dla redo).
// Pomijamy pola tekstowe, żeby nie podbierać natywnego cofania w inputach.
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (isOverlayOpen()) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;

  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (undo()) refreshAfterHistoryJump();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault();
    if (redo()) refreshAfterHistoryJump();
  }
});

// Skrót R — obrót aktywnego modułu o 90° (to samo pole co przyciski w
// ui/properties.js i w menu kontekstowym 3D, patrz render/viewer3d.js).
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isOverlayOpen()) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
  if (e.key.toLowerCase() !== 'r') return;

  const mod = getActiveModule();
  if (!mod) return;
  e.preventDefault();
  mod.rotation = ((mod.rotation || 0) + 90) % 360;
  clampModuleToRoom(mod);
  update3D();
  updateSidebar();
  initPropertiesPanel();
});

// Strzałki — przesunięcie zaznaczonych szafek / boków o 1 mm (z Shift o 10 mm) w kierunku
// widocznym na ekranie; PageUp / PageDown w górę i w dół. Ruch zatrzymuje się na sąsiadach
// i ścianach (core/alignCommands.js).
const MOVE_KEYS = { ArrowLeft: ['right', -1], ArrowRight: ['right', 1], ArrowUp: ['forward', 1], ArrowDown: ['forward', -1], PageUp: ['y', 1], PageDown: ['y', -1] };
window.addEventListener('keydown', (e) => {
  const key = MOVE_KEYS[e.key];
  if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
  if (isOverlayOpen()) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
  const dirs = getScreenMoveDirs();
  const sel = moveSelectionOf(state);
  if (!dirs || (!sel.moduleIds.size && !sel.panelIds.size)) return;
  e.preventDefault();
  const step = (e.shiftKey ? 10 : 1) * key[1];
  const move = key[0] === 'y' ? { dy: step } : { ['d' + dirs[key[0]].axis]: step * dirs[key[0]].sign };
  const r = moveSelection(state.project, sel, move);
  if (!r.dx && !r.dy && !r.dz) return;
  update3D();
  updateSidebar();
  initPropertiesPanel();
});

// --- AUTOZAPIS ---
// Cichy zapis co 2 minuty, tylko dla zalogowanego właściciela i tylko gdy
// jest już ustalona nazwa projektu (patrz saveProjectSilently w storage.js)
// oraz coś realnie się zmieniło od ostatniego zapisu.
const AUTOSAVE_INTERVAL_MS = 2 * 60 * 1000;
const autosaveStatusEl = document.getElementById('autosave-status');
let autosaveTimer = null;

async function runAutosave() {
  const result = await saveProjectSilently();
  if (!autosaveStatusEl || result !== 'saved') return;
  const t = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  autosaveStatusEl.innerText = `Autozapis ${t}`;
}

function startAutosave() {
  if (autosaveTimer) return;
  autosaveTimer = setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
  if (autosaveStatusEl) autosaveStatusEl.innerText = '';
}


// --- POMOC (instrukcja obsługi, ui/helpModal.js) ---
document.getElementById('btn-help')?.addEventListener('click', () => openHelp());
window.addEventListener('keydown', (e) => {
  if (e.key !== 'F1') return;
  e.preventDefault(); // F1 w przeglądarce otwiera jej własną pomoc
  openHelp();
});

// --- POMIESZCZENIE ---
const btnRoom = document.getElementById('btn-room-settings');
if (btnRoom) btnRoom.addEventListener('click', () => openRoomSettingsModal());

// --- OBSŁUGA PRZYCISKÓW CHMURY ---
const btnSave = document.getElementById('btn-save-cloud');
const btnLoad = document.getElementById('btn-load-cloud');

// Odświeżenie widoku po wczytaniu projektu z chmury albo przywróceniu wersji z historii.
// Ściany/podłoga pokoju nie przebudowują się w update3D() (patrz viewer3d.js:
// updateRoom) - bez tego po wczytaniu projektu 3D dalej pokazywał poprzedni pokój,
// mimo że state.project.room był już wczytany.
function refreshAfterProjectLoad() {
  updateRoom();
  initPropertiesPanel();
  updateSidebar();
  update3D();
}

// --- LOGOWANIE (Google) ---
// Chmura działa tylko dla zalogowanego właściciela. Przyciski zapisu/wczytania
// są nieaktywne, dopóki nie ma sesji.
const btnAuth = document.getElementById('btn-auth');
const authStatus = document.getElementById('auth-status');
const btnHistory = document.getElementById('btn-history');
const cloudButtons = [btnSave, btnLoad, btnHistory].filter(Boolean);

function reflectAuth(user) {
  const signedIn = !!user;
  if (authStatus) authStatus.innerText = signedIn ? `✓ ${user.email}` : 'niezalogowany';
  if (btnAuth) btnAuth.innerHTML = signedIn ? navIcon('logout', 'Wyloguj') : navIcon('login', 'Zaloguj (Google)');
  cloudButtons.forEach(b => { b.disabled = !signedIn; }); // wygląd: .btn:disabled w global.css
  if (signedIn) startAutosave(); else stopAutosave();
}

if (btnAuth) {
  btnAuth.addEventListener('click', async () => {
    btnAuth.disabled = true;
    if (getCurrentUser()) await signOutUser();
    else await signInWithGoogle();
    btnAuth.disabled = false;
  });
}

onAuthChange(reflectAuth); // odpala się od razu ze stanem początkowym (null lub sesja z localStorage)

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    btnSave.innerHTML = navIcon('loader-2', 'Zapisywanie...');
    await saveProjectToCloud(); 
    btnSave.innerHTML = navIcon('device-floppy', 'Zapisz projekt');
  });
}

if (btnHistory) {
  btnHistory.addEventListener('click', () => openVersionHistory(refreshAfterProjectLoad));
}

if (btnLoad) {
  btnLoad.addEventListener('click', async () => {
    if (btnLoad.disabled) return;
    btnLoad.disabled = true;
    btnLoad.innerHTML = navIcon('loader-2', 'Szukam...');

    const projects = await getSavedProjectsMeta();
    btnLoad.innerHTML = navIcon('folder-open', 'Wczytaj projekt');
    btnLoad.disabled = false;
    if (!projects) return;

    if (projects.length === 0) {
      showAlert("Brak zapisanych projektów w chmurze.");
      return;
    }

    // Okno z zakładkami statusów i wyszukiwarką (ui/loadProjectModal.js).
    openLoadProjectModal(projects, async (projName) => {
      // Dwa nakładające się wczytania mogłyby skończyć w odwrotnej kolejności.
      btnLoad.disabled = true;
      btnLoad.innerHTML = navIcon('loader-2', 'Wczytywanie...');
      try {
        const success = await loadProjectFromCloud(projName);
        if (success) refreshAfterProjectLoad();
      } finally {
        btnLoad.innerHTML = navIcon('folder-open', 'Wczytaj projekt');
        btnLoad.disabled = false;
      }
    });
  });
}

// --- KOPIA LOKALNA (niezapisana praca) ---
// Kopia w localStorage istnieje tylko dla zmian, których nie ma w chmurze (patrz
// core/localBackup.js). Jeśli została po poprzedniej sesji, proponujemy przywrócenie.
// Po przywróceniu projekt NIE jest podpięty do projektu w chmurze (autozapis nie
// nadpisze niczego po cichu) - trzeba go zapisać ręcznie.
(async function offerLocalRestore() {
  try {
    const backup = readLocalBackup();
    if (backup && state.project.modules.length === 0) {
      const when = new Date(backup.savedAt).toLocaleString('pl-PL');
      const name = backup.project.name || backup.loadedProjectId || 'bez nazwy';
      const restore = await showCustomDialog(
        'confirm', 'Niezapisana praca',
        `Znaleziono kopię niezapisanej pracy z ${when} (projekt: ${name}, szafek: ${backup.project.modules.length}). Przywrócić? Po przywróceniu zapisz projekt w chmurze.`,
        '', 'Przywróć', 'Odrzuć'
      );
      if (restore) {
        if (applyProjectData(backup.project, null)) refreshAfterProjectLoad();
        // Uszkodzona kopia (applyProjectData pokazał już błąd) - usuwamy ją, inaczej to samo
        // pytanie i ten sam błąd wracałyby przy każdym starcie.
        else clearLocalBackup();
      } else {
        clearLocalBackup();
      }
    }
  } catch (e) {
    console.warn('Kopia lokalna: nie udało się przywrócić:', e);
  }
  startLocalBackup();
})();
