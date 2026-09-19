// src/ui/layout.js
export function initLayout() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="top-nav">
      <div class="logo">Generator Stolarski Next</div>
      <div class="mode-tabs" role="tablist" aria-label="Tryb pracy">
          <button type="button" class="mode-tab active" data-mode="projekt" role="tab">Projekt</button>
          <button type="button" class="mode-tab" data-mode="produkcja" role="tab">Produkcja</button>
          <button type="button" class="mode-tab" data-mode="wycena" role="tab">Wycena</button>
      </div>
      <div class="nav-actions" style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-undo" class="btn btn-sm" title="Cofnij (Ctrl+Z)"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></button>
          <button id="btn-redo" class="btn btn-sm" title="Wprzód (Ctrl+Y)"><i class="ti ti-arrow-forward-up" aria-hidden="true"></i></button>
          <button id="btn-room-settings" class="btn btn-sm" title="Wymiary pomieszczenia"><i class="ti ti-home" aria-hidden="true"></i> Pomieszczenie</button>
          <div style="width: 1px; height: 22px; background: rgba(255,255,255,0.3); margin: 0 4px;"></div>
          <span id="autosave-status" style="color: #cbd5e1; font-size: 12px;"></span>
          <span id="auth-status" style="color: #e2e8f0; font-size: 13px;"></span>
          <button id="btn-auth" class="btn btn-sm"><i class="ti ti-login" aria-hidden="true"></i> Zaloguj</button>
          <button id="btn-save-cloud" class="btn btn-primary btn-sm"><i class="ti ti-device-floppy" aria-hidden="true"></i> Zapisz projekt</button>
          <button id="btn-load-cloud" class="btn btn-sm"><i class="ti ti-folder-open" aria-hidden="true"></i> Wczytaj projekt</button>
      </div>
    </div>
    
    <!-- WYMUSZAMY POPRAWNY UKŁAD 3-KOLUMNOWY -->
    <div class="main-content" style="display: flex; flex-direction: row; height: calc(100vh - 80px); width: 100%; overflow: hidden;">
      
      <!-- Lewy panel (Lista Modułów) -->
      <div class="sidebar-left" style="width: 320px; min-width: 320px; overflow-y: auto; background: #fff; border-right: 1px solid #cbd5e1;"></div>
      
      <!-- Środkowy panel (Wielka Scena 3D) -->
      <div class="center-panel" style="flex: 1; position: relative; overflow: hidden; background: #f1f5f9;">
          <div id="editor-3d-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
          <div id="editor-interior-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #f8fafc; display: none;"></div>
      </div>
      
      <!-- Prawy panel (Właściwości) -->
      <div class="sidebar-right" style="width: 320px; min-width: 320px; overflow-y: auto; background: #fff; border-left: 1px solid #cbd5e1;"></div>
      
    </div>
    
    <div class="status-bar">Status: Pełny tryb 3D aktywny | Baza danych podpięta</div>
  `;
}