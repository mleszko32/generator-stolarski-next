// src/main.js
import "./styles/global.css";
import { initLayout } from "./ui/layout.js"; // Upewnij się, że ścieżka jest poprawna
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js";
import { init3DViewer, update3D } from "./render/viewer3d.js"; 
import { renderEditor2D } from "./render/editor2d.js"; 

// Import funkcji Firebase
import { saveProjectToCloud, loadProjectFromCloud } from "./core/storage.js";

console.log("Generator Stolarski Next uruchomiony");

initLayout();
initPropertiesPanel();
updateSidebar();
init3DViewer(); 
renderEditor2D(); 

// --- OBSŁUGA PRZYCISKÓW CHMURY ---
const btnSave = document.getElementById('btn-save-cloud');
const btnLoad = document.getElementById('btn-load-cloud');

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    // Okienko z pytaniem o nazwę
    const projectName = prompt("Podaj nazwę projektu do zapisu:", "kuchnia-klient-1");
    if (!projectName) return; // Jeśli użytkownik kliknie "Anuluj", przerywamy

    btnSave.innerText = "⏳ Zapisywanie...";
    await saveProjectToCloud(projectName.trim()); 
    btnSave.innerText = "☁️ Zapisz projekt";
  });
}

if (btnLoad) {
  btnLoad.addEventListener('click', async () => {
    // Okienko z pytaniem o nazwę
    const projectName = prompt("Podaj nazwę projektu do wczytania:", "kuchnia-klient-1");
    if (!projectName) return;

    btnLoad.innerText = "⏳ Wczytywanie...";
    const success = await loadProjectFromCloud(projectName.trim());
    
    if (success) {
      initPropertiesPanel(); 
      updateSidebar();       
      renderEditor2D();      
      update3D();            
    }
    
    btnLoad.innerText = "📥 Wczytaj projekt";
  });
}