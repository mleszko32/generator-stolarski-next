// src/core/storage.js
import { initializeApp } from "firebase/app";
// ZMIANA: Dodano collection i getDocs do pobierania listy
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { state } from "./state.js";

// ⚠️ UWAGA: WKLEJ TUTAJ Z POWROTEM SWOJE KLUCZE FIREBASE! ⚠️
const firebaseConfig = {
  apiKey: "TWOJ_API_KEY",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ZAPISYWANIE
export async function saveProjectToCloud(projectId = "domyslny-projekt") {
  try {
    const projectRef = doc(db, "projects", projectId);
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
      state.project = docSnap.data();
      state.activeModuleId = state.project.modules.length > 0 ? state.project.modules[0].id : null;
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

// NOWOŚĆ: POBIERANIE LISTY ZAPISANYCH PROJEKTÓW
export async function getSavedProjectsList() {
  try {
    const projectsRef = collection(db, "projects");
    const snapshot = await getDocs(projectsRef);
    const projects = [];
    snapshot.forEach(doc => {
      projects.push(doc.id); // doc.id to u nas nazwa projektu nadana przy zapisie
    });
    return projects;
  } catch (error) {
    console.error("Błąd podczas pobierania listy projektów:", error);
    alert("❌ Nie udało się pobrać listy projektów z chmury.");
    return [];
  }
}