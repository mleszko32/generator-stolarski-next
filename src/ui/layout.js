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
      <div class="nav-actions">
          <button id="btn-undo" class="btn btn-sm" title="Cofnij (Ctrl+Z)"><i class="ti ti-arrow-back-up" aria-hidden="true"></i></button>
          <button id="btn-redo" class="btn btn-sm" title="Wprzód (Ctrl+Y)"><i class="ti ti-arrow-forward-up" aria-hidden="true"></i></button>
          <button id="btn-room-settings" class="btn btn-sm" title="Wymiary pomieszczenia"><i class="ti ti-home" aria-hidden="true"></i> Pomieszczenie</button>
          <div class="nav-sep"></div>
          <span id="autosave-status"></span>
          <span id="auth-status"></span>
          <button id="btn-auth" class="btn btn-sm"><i class="ti ti-login" aria-hidden="true"></i> Zaloguj</button>
          <button id="btn-save-cloud" class="btn btn-primary btn-sm"><i class="ti ti-device-floppy" aria-hidden="true"></i> Zapisz projekt</button>
          <button id="btn-load-cloud" class="btn btn-sm"><i class="ti ti-folder-open" aria-hidden="true"></i> Wczytaj projekt</button>
          <button id="btn-history" class="btn btn-sm" title="Historia wersji projektu"><i class="ti ti-history" aria-hidden="true"></i> Historia</button>
      </div>
    </div>
    
    <!-- WYMUSZAMY POPRAWNY UKŁAD 3-KOLUMNOWY -->
    <div class="main-content">
      
      <!-- Lewy panel (Lista Modułów) -->
      <div class="sidebar-left"></div>
      
      <!-- Środkowy panel (Wielka Scena 3D) -->
      <div class="center-panel">
          <div id="editor-3d-container"></div>
          <div id="editor-interior-container" style="display: none;"></div>
      </div>
      
      <!-- Prawy panel (Właściwości) -->
      <div class="sidebar-right"></div>
      
    </div>
    
    <div class="status-bar">Status: Pełny tryb 3D aktywny | Baza danych podpięta</div>
  `;
}