// src/main.js
import "./styles/global.css";
import { initLayout } from "./ui/layout.js"; 
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js";
import { init3DViewer, update3D } from "./render/viewer3d.js";
import { escapeHtml } from "./utils/dom.js";
import { state, ensureRoomDefaults, getActiveModule } from "./core/state.js";
import { openRoomSettingsModal } from "./ui/roomPanel.js";


// ZMIANA: Importujemy funkcję do usuwania projektów oraz customowy dialog
import { saveProjectToCloud, loadProjectFromCloud, getSavedProjectsList, deleteProjectFromCloud, showCustomDialog } from "./core/storage.js";
import { onAuthChange, signInWithGoogle, signOutUser, getCurrentUser, saveProjectSilently } from "./core/storage.js";
import { undo, redo, onHistoryChange, resetHistory } from "./core/history.js";

console.log("Generator Stolarski Next uruchomiony");

ensureRoomDefaults(state.project);
initLayout();
initPropertiesPanel();
updateSidebar();
init3DViewer();
resetHistory(); // punkt zerowy historii cofnij/wprzód, po pierwszym renderze

// --- COFNIJ / WPRZÓD ---
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

// Po cofnięciu/ponowieniu state.project bywa całkiem inną migawką (inne
// moduły, inne id) — tak jak po wczytaniu projektu z chmury odświeżamy
// wszystkie trzy panele, a nie tylko ten, w którym coś kliknięto.
function refreshAfterHistoryJump() {
  initPropertiesPanel();
  updateSidebar();
  update3D();
}

if (btnUndo) btnUndo.addEventListener('click', () => { if (undo()) refreshAfterHistoryJump(); });
if (btnRedo) btnRedo.addEventListener('click', () => { if (redo()) refreshAfterHistoryJump(); });

onHistoryChange(({ canUndo, canRedo }) => {
  [[btnUndo, canUndo], [btnRedo, canRedo]].forEach(([btn, enabled]) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.5';
    btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  });
});

// Skróty klawiszowe Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z jako alternatywa dla redo).
// Pomijamy pola tekstowe, żeby nie podbierać natywnego cofania w inputach.
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
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
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
  if (e.key.toLowerCase() !== 'r') return;

  const mod = getActiveModule();
  if (!mod) return;
  e.preventDefault();
  mod.rotation = ((mod.rotation || 0) + 90) % 360;
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
  autosaveStatusEl.innerText = `💾 Autozapis ${t}`;
}

function startAutosave() {
  if (autosaveTimer) return;
  autosaveTimer = setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
  if (autosaveStatusEl) autosaveStatusEl.innerText = '';
}


// --- POMIESZCZENIE ---
const btnRoom = document.getElementById('btn-room-settings');
if (btnRoom) btnRoom.addEventListener('click', () => openRoomSettingsModal());

// --- OBSŁUGA PRZYCISKÓW CHMURY ---
const btnSave = document.getElementById('btn-save-cloud');
const btnLoad = document.getElementById('btn-load-cloud');

// --- LOGOWANIE (Google) ---
// Chmura działa tylko dla zalogowanego właściciela. Przyciski zapisu/wczytania
// są nieaktywne, dopóki nie ma sesji.
const btnAuth = document.getElementById('btn-auth');
const authStatus = document.getElementById('auth-status');
const cloudButtons = [btnSave, btnLoad].filter(Boolean);

function reflectAuth(user) {
  const signedIn = !!user;
  if (authStatus) authStatus.innerText = signedIn ? `✓ ${user.email}` : 'niezalogowany';
  if (btnAuth) btnAuth.innerText = signedIn ? '🚪 Wyloguj' : '🔑 Zaloguj (Google)';
  cloudButtons.forEach(b => {
    b.disabled = !signedIn;
    b.style.opacity = signedIn ? '1' : '0.5';
    b.style.cursor = signedIn ? 'pointer' : 'not-allowed';
  });
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
    btnSave.innerText = "⏳ Zapisywanie...";
    await saveProjectToCloud(); 
    btnSave.innerText = "☁️ Zapisz projekt";
  });
}

if (btnLoad) {
  btnLoad.addEventListener('click', async () => {
    btnLoad.innerText = "⏳ Szukam...";
    
    const projects = await getSavedProjectsList();
    btnLoad.innerText = "📥 Wczytaj projekt";

    if (projects.length === 0) {
      alert("Brak zapisanych projektów w chmurze.");
      return;
    }

    // --- TWORZENIE OKIENKA POPUP (MODAL) ---
    const modalOverlay = document.createElement('div');
    Object.assign(modalOverlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '9999', display: 'flex',
      alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)'
    });

    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
      backgroundColor: '#fff', padding: '24px', borderRadius: '8px',
      width: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)', fontFamily: 'sans-serif'
    });

    const title = document.createElement('h3');
    title.innerText = "Wybierz projekt do wczytania";
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    title.style.color = '#1e293b';
    modalContent.appendChild(title);

    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
      display: 'flex', flexDirection: 'column', gap: '8px',
      overflowY: 'auto', paddingRight: '5px'
    });

    // Tworzenie przycisków dla każdego projektu
    projects.forEach(projName => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';

      const btn = document.createElement('button');
      btn.innerHTML = `📁 <b>${escapeHtml(projName)}</b>`;
      Object.assign(btn.style, {
        flexGrow: '1', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1',
        borderRadius: '6px', cursor: 'pointer', textAlign: 'left', color: '#334155', fontSize: '14px'
      });
      btn.onmouseenter = () => btn.style.backgroundColor = '#e2e8f0';
      btn.onmouseleave = () => btn.style.backgroundColor = '#f8fafc';
      
      // AKCJA: Wczytywanie projektu
      btn.onclick = async () => {
        modalOverlay.remove();
        btnLoad.innerText = "⏳ Wczytywanie...";
        
        const success = await loadProjectFromCloud(projName);
        if (success) {
          initPropertiesPanel(); 
          updateSidebar();       
          update3D();            
        }
        btnLoad.innerText = "📥 Wczytaj projekt";
      };

      // NOWOŚĆ: Przycisk usuwania
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '🗑️';
      delBtn.title = 'Usuń projekt bezpowrotnie';
      Object.assign(delBtn.style, {
        padding: '12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5',
        borderRadius: '6px', cursor: 'pointer', color: '#991b1b', fontSize: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      });
      delBtn.onmouseenter = () => delBtn.style.backgroundColor = '#fecaca';
      delBtn.onmouseleave = () => delBtn.style.backgroundColor = '#fee2e2';

      // AKCJA: Usuwanie z bazy po potwierdzeniu w Custom Dialog
      delBtn.onclick = async () => {
        const confirmDelete = await showCustomDialog(
            'confirm', 
            'Usuwanie projektu', 
            `Czy na pewno chcesz usunąć projekt "${projName}" z chmury? Tej operacji NIE można cofnąć!`,
            "",
            "Usuń trwale",
            "Zostaw"
        );
        
        if (confirmDelete) {
          const success = await deleteProjectFromCloud(projName);
          if (success) {
            row.remove(); // Usuwa kafelek projektu z listy bez odświeżania całej aplikacji
          }
        }
      };
      
      row.appendChild(btn);
      row.appendChild(delBtn);
      listContainer.appendChild(row);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "Zamknij okno";
    Object.assign(closeBtn.style, {
      marginTop: '20px', padding: '10px', width: '100%', cursor: 'pointer',
      backgroundColor: '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold'
    });
    closeBtn.onclick = () => modalOverlay.remove();

    modalContent.appendChild(listContainer);
    modalContent.appendChild(closeBtn);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
  });
}

window.addEventListener('cabinetMoved', () => {
  initPropertiesPanel(); // Odświeża suwaki i inputy z prawej strony
});