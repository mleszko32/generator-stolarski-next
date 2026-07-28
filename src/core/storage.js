// src/core/storage.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { state } from "./state.js";

// TUTAJ WKLEJ SWÓJ CONFIG Z FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyDnv-wvIpfM7Idlsiqaj8LTDLw9Zmtm3cg",
  authDomain: "generator-stolarski-next.firebaseapp.com",
  projectId: "generator-stolarski-next",
  storageBucket: "generator-stolarski-next.firebasestorage.app",
  messagingSenderId: "230164946690",
  appId: "1:230164946690:web:23c3c7a37c33e7e921ac1b"
};

// Inicjalizacja Firebase i bazy danych Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ZAPISYWANIE
export async function saveProjectToCloud(projectId = "domyslny-projekt") {
  try {
    const projectRef = doc(db, "projects", projectId);
    
    // Tworzymy czystą kopię obiektu projektu (pozbywamy się potencjalnych referencji)
    const dataToSave = JSON.parse(JSON.stringify(state.project));
    
    await setDoc(projectRef, dataToSave);
    alert("✅ Projekt zapisany w chmurze pomyślnie!");
  } catch (error) {
    console.error("Błąd podczas zapisu do Firebase:", error);
    alert("❌ Wystąpił błąd podczas zapisywania projektu.");
  }
}

// WCZYTYWANIE
export async function loadProjectFromCloud(projectId = "domyslny-projekt") {
  try {
    const projectRef = doc(db, "projects", projectId);
    const docSnap = await getDoc(projectRef);
    
    if (docSnap.exists()) {
      // Nadpisujemy cały nasz lokalny stan danymi z chmury
      state.project = docSnap.data();
      
      // Resetujemy aktywny moduł, żeby aplikacja otworzyła pierwszą szafkę z wczytanej listy
      state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
      
      return true; // Sukces
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