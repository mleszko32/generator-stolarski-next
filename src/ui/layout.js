// src/core/layout.js
export function initLayout() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-container" style="display: flex; flex-direction: column; height: 100vh;">
      <header class="topbar">
        <h1>Generator Stolarski Next</h1>
      </header>
      
      <div class="main-workspace" style="display: flex; flex: 1; overflow: hidden;">
        <aside class="sidebar-left" style="width: 300px; overflow-y: auto;">
          <h2>Drzewo projektu</h2>
        </aside>
        
        <!-- NOWY KONTENER NA EDYTOR 2D -->
        <section class="viewport-2d" id="editor-2d-container" style="flex: 1; background: #f8fafc; border-right: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: center; overflow: hidden;">
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
        <p>Status: Płaska struktura (Flat Data) aktywna</p>
      </footer>
    </div>
  `;
}