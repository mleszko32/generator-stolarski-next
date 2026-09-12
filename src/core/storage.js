// src/core/storage.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { state, ensureRoomDefaults } from "./state.js";
import { migrateLegacyRoom } from "./layout.js";
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

// Jedyne konto z dostępem do chmury. TEN SAM adres musi być w firestore.rules —
// tutaj to tylko wygodny check po stronie klienta (czytelny komunikat zamiast
// surowego błędu "permission denied"), tam jest właściwe zabezpieczenie.
export const OWNER_EMAIL = "mleszko32@gmail.com";

// --- AUTORYZACJA ---
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function isOwner() {
  const u = auth.currentUser;
  return !!u && u.email === OWNER_EMAIL;
}

export async function signInWithGoogle() {
  try {
    const { user } = await signInWithPopup(auth, provider);
    if (user.email !== OWNER_EMAIL) {
      await signOut(auth);
      alert(`Zalogowano jako ${user.email}, ale dostęp ma tylko ${OWNER_EMAIL}. Wylogowano.`);
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
    alert(`🔒 Dostęp do chmury ma tylko konto ${OWNER_EMAIL}.`);
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
        const newName = await showCustomDialog('prompt', 'Zapisz projekt', 'Podaj nazwę projektu do zapisu:', 'Zabudowa_1', "Zapisz", "Anuluj");
        if (!newName || newName.trim() === "") return; 
        targetId = newName.trim();
      }
    }

    targetId = targetId.replace(/[\/\\]/g, "-"); 

    const projectRef = doc(db, "projects", targetId);
    const dataToSave = JSON.parse(JSON.stringify(state.project));
    dataToSave.name = targetId; 
    
    await setDoc(projectRef, dataToSave);

    state.loadedProjectId = targetId;
    state.project.name = targetId;
    markSaved();

    alert(`✅ Projekt "${targetId}" został zapisany pomyślnie!`);
  } catch (error) {
    console.error("Szczegóły błędu Firebase:", error);
    alert("❌ Wystąpił błąd podczas zapisywania projektu:\n" + (error.message || "Brak szczegółów."));
  }
}

// WCZYTYWANIE
export async function loadProjectFromCloud(projectId) {
  if (!projectId) return false;
  if (!requireOwner()) return false;

  try {
    const projectRef = doc(db, "projects", projectId);
    const docSnap = await getDoc(projectRef);
    
    if (docSnap.exists()) {
      state.project = docSnap.data();
      ensureRoomDefaults(state.project); // projekty zapisane przed dodaniem pomieszczeń mogą nie mieć tego pola
      migrateLegacyRoom(state.project); // ...a te sprzed realnego renderowania pokoju mogą mieć martwy, za mały placeholder
      state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
      state.loadedProjectId = projectId;
      markSaved();
      resetHistory(); // cofanie między dwoma różnymi wczytanymi projektami nie ma sensu
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

    await setDoc(projectRef, dataToSave);
    lastSavedSnapshot = current;
    return "saved";
  } catch (error) {
    console.error("Błąd autozapisu:", error);
    return "error";
  }
}