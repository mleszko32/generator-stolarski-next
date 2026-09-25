// src/core/storage.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { state, ensureRoomDefaults, ensurePricingDefaults, ensureSidePanelsDefaults } from "./state.js";
import { migrateLegacyRoom, clampModuleToRoom } from "./layout.js";
import { resetHistory } from "./history.js";

// Konfiguracja klienta Firebase jest z założenia publiczna (leci do przeglądarki)
// i sama z siebie niczego nie chroni. Realną barierą są reguły Firestore w
// firestore.rules — wpuszczają wyłącznie zalogowanego właściciela (OWNER_EMAIL).
const firebaseConfig = {
  apiKey: "AIzaSyDnv-wvIpfM7Idlsiqaj8LTDLw9Zmtm3cg",
  authDomain: "generator-stolarski-next.firebaseapp.com",
  projectId: "generator-stolarski-next",
  storageBucket: "generator-stolarski-next.firebasestorage.app",
  messagingSenderId: "230164946690",
  appId: "1:230164946690:web:23c3c7a37c33e7e921ac1b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Konta z dostępem do chmury. TE SAME adresy muszą być w firestore.rules —
// tutaj to tylko wygodny check po stronie klienta (czytelny komunikat zamiast
// surowego błędu "permission denied"), tam jest właściwe zabezpieczenie.
export const ALLOWED_EMAILS = ["mleszko32@gmail.com", "mebleleszko@gmail.com"];
const isAllowedEmail = (email) => !!email && ALLOWED_EMAILS.includes(String(email).toLowerCase());

// --- AUTORYZACJA ---
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function isOwner() {
  const u = auth.currentUser;
  return !!u && isAllowedEmail(u.email);
}

export async function signInWithGoogle() {
  try {
    const { user } = await signInWithPopup(auth, provider);
    if (!isAllowedEmail(user.email)) {
      await signOut(auth);
      alert(`Zalogowano jako ${user.email}, ale konto nie ma dostępu. Wylogowano.`);
      return null;
    }
    return user;
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
      return null;
    }
    console.error("Błąd logowania:", err);
    alert("❌ Nie udało się zalogować:\n" + (err?.message || err));
    return null;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Błąd wylogowania:", err);
  }
}

// Bramka dla operacji chmurowych. Nie jest zabezpieczeniem (to robią reguły
// Firestore) — daje tylko od razu zrozumiały komunikat.
function requireOwner() {
  if (!auth.currentUser) {
    alert("🔒 Zaloguj się (przycisk w prawym górnym rogu), aby korzystać z chmury.");
    return false;
  }
  if (!isOwner()) {
    alert(`🔒 To konto (${auth.currentUser.email}) nie ma dostępu do chmury.`);
    return false;
  }
  return true;
}

// --- WŁASNY SYSTEM MODALI (Uniwersalny z możliwością zmiany nazw przycisków) ---
export function showCustomDialog(type, title, message, defaultValue = "", okText = "OK", cancelText = "Anuluj") {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '10000', display: 'flex',
      alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: 'white', padding: '24px', borderRadius: '8px', width: '350px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'sans-serif', color: '#1e293b'
    });

    const h3 = document.createElement('h3');
    h3.innerText = title;
    h3.style.marginTop = '0';
    
    const p = document.createElement('p');
    p.innerText = message;
    p.style.fontSize = '14px';
    p.style.marginBottom = '20px';

    box.appendChild(h3);
    box.appendChild(p);

    let input;
    if (type === 'prompt') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      Object.assign(input.style, {
        width: '100%', padding: '10px', marginBottom: '20px', border: '1px solid #cbd5e1',
        borderRadius: '4px', boxSizing: 'border-box', outline: 'none'
      });
      box.appendChild(input);
    }

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.justifyContent = 'flex-end';

    const btnCancel = document.createElement('button');
    btnCancel.innerText = cancelText;
    Object.assign(btnCancel.style, {
      padding: '8px 16px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
    });
    
    const btnOk = document.createElement('button');
    btnOk.innerText = okText;
    
    // Jeśli okText wskazuje na usunięcie, dajmy mu ostrzegawczy kolor
    const okBgColor = okText.toLowerCase().includes('usuń') ? '#ef4444' : '#3b82f6';
    Object.assign(btnOk.style, {
      padding: '8px 16px', background: okBgColor, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
    });

    btnCancel.onclick = () => {
      document.body.removeChild(overlay);
      resolve(type === 'confirm' ? false : null);
    };

    btnOk.onclick = () => {
      document.body.removeChild(overlay);
      resolve(type === 'confirm' ? true : (input ? input.value : true));
    };

    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnOk);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    if (input) input.focus();
  });
}

// Ostatnia treść projektu zapisana w chmurze (ręcznie lub automatycznie) —
// pozwala autozapisowi pominąć zapis, gdy nic się nie zmieniło.
let lastSavedSnapshot = null;
function markSaved() {
  lastSavedSnapshot = JSON.stringify(state.project);
}

// Czy bieżący projekt różni się od ostatnio zapisanego/wczytanego z chmury
// (dla kopii lokalnej, patrz core/localBackup.js).
export function hasUnsavedChanges() {
  return JSON.stringify(state.project) !== lastSavedSnapshot;
}

// --- HISTORIA WERSJI ---
// Przed nadpisaniem projektu w chmurze archiwizujemy jego poprzednią treść.
// Wersje leżą w podkolekcjach projects/{id}/versions (małe metadane - z nich
// budowana jest lista) i projects/{id}/versionData (pełny JSON projektu jako
// tekst - czytany dopiero przy przywracaniu). Podkolekcje wymagają osobnej
// reguły w firestore.rules.
const VERSION_MIN_GAP_MS = 10 * 60 * 1000; // autozapis archiwizuje najwyżej raz na 10 min
const VERSIONS_KEEP = 60;                  // starsze wersje są usuwane
let lastArchiveAt = 0;
let lastArchivedCanon = null;
let versionsDisabled = false; // po błędzie uprawnień nie ponawiamy w tej sesji

// Firestore zwraca pola map w innej kolejności niż stan w pamięci - do
// porównywania i zapisu sortujemy klucze, żeby ta sama treść dawała ten sam tekst.
function canonJson(value) {
  const sort = (v) => Array.isArray(v) ? v.map(sort)
    : (v && typeof v === "object") ? Object.keys(v).sort().reduce((o, k) => { o[k] = sort(v[k]); return o; }, {})
    : v;
  return JSON.stringify(sort(value));
}

function resetVersionSession() {
  lastArchiveAt = 0;
  lastArchivedCanon = null;
}

async function archiveVersion(projectId, projectObj, label, { force = false } = {}) {
  if (versionsDisabled || !projectObj) return false;
  const copy = JSON.parse(JSON.stringify(projectObj));
  delete copy.name;
  const json = canonJson(copy);
  if (json === lastArchivedCanon) return false;
  if (!force && Date.now() - lastArchiveAt < VERSION_MIN_GAP_MS) return false;
  try {
    const createdAt = Date.now();
    const id = String(createdAt).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 6);
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", projectId, "versions", id), {
      createdAt,
      label,
      author: (auth.currentUser && auth.currentUser.email) || "",
      moduleCount: (copy.modules || []).length,
      sizeKB: Math.max(1, Math.round(json.length / 1024)),
    });
    batch.set(doc(db, "projects", projectId, "versionData", id), { json });
    await batch.commit();
    lastArchiveAt = createdAt;
    lastArchivedCanon = json;
    pruneVersions(projectId).catch(() => {});
    return true;
  } catch (error) {
    console.warn("Nie udało się zapisać wersji projektu:", error);
    if (error && error.code === "permission-denied") versionsDisabled = true;
    return false;
  }
}

async function deleteVersionDocs(projectId, ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const batch = writeBatch(db);
    ids.slice(i, i + 200).forEach((id) => {
      batch.delete(doc(db, "projects", projectId, "versions", id));
      batch.delete(doc(db, "projects", projectId, "versionData", id));
    });
    await batch.commit();
  }
}

async function pruneVersions(projectId) {
  const snap = await getDocs(collection(db, "projects", projectId, "versions"));
  const ids = snap.docs.map((d) => d.id).sort(); // id zaczyna się od czasu - rosnąco
  const extra = ids.slice(0, Math.max(0, ids.length - VERSIONS_KEEP));
  if (extra.length) await deleteVersionDocs(projectId, extra);
}

// Lista wersji projektu (najnowsze pierwsze). null = nie udało się pobrać.
export async function listProjectVersions(projectId) {
  if (!requireOwner()) return null;
  try {
    const snap = await getDocs(collection(db, "projects", projectId, "versions"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Błąd pobierania historii wersji:", error);
    return null;
  }
}

export async function deleteProjectVersion(projectId, versionId) {
  if (!requireOwner()) return false;
  try {
    await deleteVersionDocs(projectId, [versionId]);
    return true;
  } catch (error) {
    console.error("Błąd usuwania wersji:", error);
    alert("❌ Nie udało się usunąć wersji:\n" + error.message);
    return false;
  }
}

// Przywraca wersję jako bieżący stan projektu. Bieżący stan (razem z
// niezapisanymi zmianami) trafia najpierw do historii, więc przywrócenie da się cofnąć.
export async function restoreProjectVersion(projectId, versionId) {
  if (!requireOwner()) return false;
  try {
    const snap = await getDoc(doc(db, "projects", projectId, "versionData", versionId));
    if (!snap.exists()) {
      alert("⚠️ Nie znaleziono tej wersji (mogła zostać usunięta).");
      return false;
    }
    const data = JSON.parse(snap.data().json);
    await archiveVersion(projectId, state.project, "Przed przywróceniem wersji", { force: true });
    applyProjectData(data, projectId);
    const toSave = JSON.parse(JSON.stringify(state.project));
    toSave.name = projectId;
    await setDoc(doc(db, "projects", projectId), toSave);
    state.project.name = projectId;
    markSaved();
    return true;
  } catch (error) {
    console.error("Błąd przywracania wersji:", error);
    alert("❌ Nie udało się przywrócić wersji:\n" + (error.message || "Brak szczegółów."));
    return false;
  }
}

// ZAPISYWANIE
export async function saveProjectToCloud(projectId = null) {
  if (!requireOwner()) return;
  try {
    let targetId = projectId;

    if (!targetId) {
      if (state.loadedProjectId) {
        // Używamy zaktualizowanej funkcji z dynamicznymi tekstami przycisków
        const overwrite = await showCustomDialog(
            'confirm', 
            'Zapisywanie projektu', 
            `Pracujesz na wczytanym projekcie: "${state.loadedProjectId}". Co chcesz zrobić?`, 
            "", 
            "NADPISZ zmiany", 
            "Zapisz jako NOWY"
        );
        
        if (overwrite) {
          targetId = state.loadedProjectId;
        } else {
          const newName = await showCustomDialog('prompt', 'Zapisz jako nowy', 'Podaj nazwę dla NOWEGO projektu:', state.loadedProjectId + "_kopia", "Zapisz", "Anuluj");
          if (!newName || newName.trim() === "") return; 
          targetId = newName.trim();
        }
      } else {
        const newName = await showCustomDialog('prompt', 'Zapisz projekt', 'Podaj nazwę projektu do zapisu:', (state.project.name && state.project.name !== 'Zabudowa Wielomodułowa') ? state.project.name : 'Zabudowa_1', "Zapisz", "Anuluj");
        if (!newName || newName.trim() === "") return; 
        targetId = newName.trim();
      }
    }

    targetId = targetId.replace(/[\/\\]/g, "-"); 

    const projectRef = doc(db, "projects", targetId);
    const dataToSave = JSON.parse(JSON.stringify(state.project));
    dataToSave.name = targetId;

    // Historia wersji: poprzednia treść (jeśli projekt już istnieje) i nowy punkt zapisu.
    if (targetId !== state.loadedProjectId) resetVersionSession();
    const prevSnap = await getDoc(projectRef).catch(() => null);
    if (prevSnap && prevSnap.exists()) {
      await archiveVersion(targetId, prevSnap.data(), "Przed zapisem ręcznym", { force: true });
    }

    await setDoc(projectRef, dataToSave);

    state.loadedProjectId = targetId;
    state.project.name = targetId;
    markSaved();
    await archiveVersion(targetId, dataToSave, "Zapis ręczny", { force: true });

    alert(`✅ Projekt "${targetId}" został zapisany pomyślnie!`);
  } catch (error) {
    console.error("Szczegóły błędu Firebase:", error);
    alert("❌ Wystąpił błąd podczas zapisywania projektu:\n" + (error.message || "Brak szczegółów."));
  }
}

// Wstawia dane projektu (z chmury albo z wersji historii) do stanu aplikacji.
export function applyProjectData(data, projectId) {
  state.project = data;
  ensureRoomDefaults(state.project); // projekty zapisane przed dodaniem pomieszczeń mogą nie mieć tego pola
  ensurePricingDefaults(state.project); // ...ani projekty sprzed dodania kosztorysu
  ensureSidePanelsDefaults(state.project); // ...ani projekty sprzed dodania boków dokładanych
  migrateLegacyRoom(state.project); // ...a te sprzed realnego renderowania pokoju mogą mieć martwy, za mały placeholder
  // Projekty zapisane przed poprawką clampModuleToRoom (blendy L-kształtne)
  // mogły zapisać pozycję z blendą przenikającą przez ścianę - ten stan
  // wczytywał się bez żadnej walidacji, a re-clamp uruchamiał się dopiero
  // przy KOLEJNEJ interaktywnej zmianie (drag/obrót/pole liczbowe), więc
  // sama szafka po prostu wisiała tak przy każdym otwarciu projektu.
  (state.project.modules || []).forEach(clampModuleToRoom);
  state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
  state.activeSidePanelId = null;
  state.loadedProjectId = projectId;
  resetHistory(); // cofanie między dwoma różnymi wczytanymi projektami nie ma sensu
}

// WCZYTYWANIE
export async function loadProjectFromCloud(projectId) {
  if (!projectId) return false;
  if (!requireOwner()) return false;

  try {
    const projectRef = doc(db, "projects", projectId);
    const docSnap = await getDoc(projectRef);
    
    if (docSnap.exists()) {
      applyProjectData(docSnap.data(), projectId);
      resetVersionSession();
      markSaved();
      return true;
    } else {
      alert("⚠️ Nie znaleziono takiego projektu w bazie.");
      return false;
    }
  } catch (error) {
    console.error("Błąd podczas wczytywania z Firebase:", error);
    alert("❌ Wystąpił błąd podczas wczytywania projektu.");
    return false;
  }
}

// NOWOŚĆ: USUWANIE PROJEKTU Z BAZY
export async function deleteProjectFromCloud(projectId) {
  if (!requireOwner()) return false;
  try {
    const projectRef = doc(db, "projects", projectId);
    await deleteDoc(projectRef);
    // Podkolekcje nie znikają razem z dokumentem - sprzątamy historię wersji.
    try {
      const vs = await getDocs(collection(db, "projects", projectId, "versions"));
      if (!vs.empty) await deleteVersionDocs(projectId, vs.docs.map((d) => d.id));
    } catch (e) {
      console.warn("Nie udało się usunąć historii wersji:", e);
    }
    
    // Jeśli usunęliśmy projekt, nad którym właśnie pracujemy, zresetujmy jego ślad w pamięci
    if (state.loadedProjectId === projectId) {
        state.loadedProjectId = null;
    }
    
    return true;
  } catch (error) {
    console.error("Błąd podczas usuwania projektu:", error);
    alert("❌ Nie udało się usunąć projektu:\n" + error.message);
    return false;
  }
}

// POBIERANIE LISTY
export async function getSavedProjectsList() {
  if (!requireOwner()) return [];
  try {
    const projectsRef = collection(db, "projects");
    const snapshot = await getDocs(projectsRef);
    const projects = [];
    snapshot.forEach(doc => {
      projects.push(doc.id); 
    });
    return projects;
  } catch (error) {
    console.error("Błąd podczas pobierania listy projektów:", error);
    alert("❌ Nie udało się pobrać listy projektów z chmury.");
    return [];
  }
}

// AUTOZAPIS — bez alertów/promptów (wołane cyklicznie w tle, patrz main.js).
// Celowo NIE zakłada nazwy projektu: dopóki użytkownik choć raz nie zapisze
// ręcznie (i tym samym nie ustali state.loadedProjectId), nie ma dokąd cicho
// zapisywać — inaczej autozapis co chwilę tworzyłby nowe, bezimienne projekty.
// Zwraca 'saved' | 'no-changes' | 'no-project' | 'not-signed-in' | 'error'.
export async function saveProjectSilently() {
  if (!auth.currentUser || !isOwner()) return "not-signed-in";
  if (!state.loadedProjectId) return "no-project";

  const current = JSON.stringify(state.project);
  if (current === lastSavedSnapshot) return "no-changes";

  try {
    const targetId = state.loadedProjectId;
    const projectRef = doc(db, "projects", targetId);
    const dataToSave = JSON.parse(current);
    dataToSave.name = targetId;

    // Historia wersji: raz na jakiś czas zachowujemy treść, którą zaraz nadpiszemy.
    if (!versionsDisabled && Date.now() - lastArchiveAt >= VERSION_MIN_GAP_MS) {
      try {
        const prev = await getDoc(projectRef);
        if (prev.exists()) await archiveVersion(targetId, prev.data(), "Autozapis");
      } catch (e) {
        console.warn("Historia wersji: nie odczytano poprzedniej treści:", e);
      }
    }

    await setDoc(projectRef, dataToSave);
    lastSavedSnapshot = current;
    return "saved";
  } catch (error) {
    console.error("Błąd autozapisu:", error);
    return "error";
  }
}