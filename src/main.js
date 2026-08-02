// src/main.js
import "./styles/global.css";
import { initLayout } from "./ui/layout.js"; 
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js";
import { init3DViewer, update3D } from "./render/viewer3d.js"; 
import { renderEditor2D } from "./render/editor2d.js"; 

// ZMIANA: Importujemy funkcję do usuwania projektów oraz customowy dialog
import { saveProjectToCloud, loadProjectFromCloud, getSavedProjectsList, deleteProjectFromCloud, showCustomDialog } from "./core/storage.js";

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
      btn.innerHTML = `📁 <b>${projName}</b>`;
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
          renderEditor2D();      
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