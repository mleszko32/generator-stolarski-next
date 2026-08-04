// src/ui/layout.js
export function initLayout() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="top-nav">
      <div class="logo">Generator Stolarski Next</div>
      <div class="nav-actions">
          <button id="btn-save-cloud" class="btn-primary" style="background: #f59e0b; color: white;">☁️ Zapisz projekt</button>
          <button id="btn-load-cloud" class="btn-primary" style="background: #10b981; color: white;">📥 Wczytaj projekt</button>
      </div>
    </div>
    
    <!-- WYMUSZAMY POPRAWNY UKŁAD 3-KOLUMNOWY -->
    <div class="main-content" style="display: flex; flex-direction: row; height: calc(100vh - 80px); width: 100%; overflow: hidden;">
      
      <!-- Lewy panel (Lista Modułów) -->
      <div class="sidebar-left" style="width: 320px; min-width: 320px; overflow-y: auto; background: #fff; border-right: 1px solid #cbd5e1;"></div>
      
      <!-- Środkowy panel (Wielka Scena 3D) -->
      <div class="center-panel" style="flex: 1; position: relative; overflow: hidden; background: #f1f5f9;">
          <div id="editor-3d-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
      </div>
      
      <!-- Prawy panel (Właściwości) -->
      <div class="sidebar-right" style="width: 320px; min-width: 320px; overflow-y: auto; background: #fff; border-left: 1px solid #cbd5e1;"></div>
      
    </div>
    
    <div class="status-bar">Status: Pełny tryb 3D aktywny | Baza danych podpięta</div>
  `;
}