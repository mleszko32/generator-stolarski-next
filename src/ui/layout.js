// src/core/layout.js
export function initLayout() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-container" style="display: flex; flex-direction: column; height: 100vh;">
      
      <!-- ZMODYFIKOWANY NAGŁÓWEK Z PRZYCISKAMI -->
      <header class="topbar" style="display: flex; justify-content: space-between; align-items: center; padding-right: 20px;">
        <h1>Generator Stolarski Next</h1>
        
        <!-- NOWE PRZYCISKI DO OBSŁUGI CHMURY -->
        <div style="display: flex; gap: 10px;">
            <button id="btn-save-cloud" style="padding: 8px 16px; background-color: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
               ☁️ Zapisz projekt
            </button>
            <button id="btn-load-cloud" style="padding: 8px 16px; background-color: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
               📥 Wczytaj projekt
            </button>
        </div>
      </header>
      
      <div class="main-workspace" style="display: flex; flex: 1; overflow: hidden;">
        <aside class="sidebar-left" style="width: 300px; overflow-y: auto;">
          <h2>Drzewo projektu</h2>
        </aside>
        
        <!-- NOWY KONTENER NA EDYTOR 2D -->
        <section class="viewport-2d" id="editor-2d-container" style="flex: 1; background: #f8fafc; border-right: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
          <!-- Divy 2D polecą tutaj -->
        </section>
        
        <!-- NAPRAWIONY KONTENER 3D Z ID -->
        <section id="viewer-3d-container" class="viewport-3d" style="flex: 1; position: relative;">
          <!-- Three.js Canvas wpadnie tutaj -->
        </section>
        
        <aside class="sidebar-right" style="width: 350px; overflow-y: auto;">
          <h2>Parametry</h2>
        </aside>
      </div>
      
      <footer class="statusbar">
        <p>Status: Płaska struktura (Flat Data) aktywna | Baza danych podpięta</p>
      </footer>
    </div>
  `;
}