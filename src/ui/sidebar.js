import { state, addModule, deleteModule, duplicateModule, addSidePanel, deleteSidePanel, addCornerModule, addSlopeModule, ensureSidePanelsDefaults } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";
import { openProductionHub } from "./productionHub.js";
import { escapeHtml } from "../utils/dom.js";
import { openModuleLibrary } from "./moduleLibraryModal.js";
import { openWallFillModal } from "./wallFillModal.js";
import { openSlopeNicheModal } from "./slopeNicheModal.js";
import { snapSidePanel } from "../core/sidePanelSnap.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";
import { showAlert, openModal } from "../utils/modal.js";
import { sanitizeAiModules, buildModulesFromAi } from "../core/aiSketchImport.js";
import { getIdToken } from "../core/storage.js";
import { clampModuleToRoom } from "../core/layout.js";

// Okno oczekiwania na wynik AI (wspólne openModal, bez zamykania w trakcie).
let aiLoader = null;
function showLoading(msg) {
    hideLoading();
    aiLoader = openModal({
        title: 'Import szkicu (AI)', closeButton: false, dismissable: false, width: 420,
        body: `<p><i class="ti ti-wand" aria-hidden="true"></i> ${escapeHtml(msg)}</p><p class="empty-note">Sztuczna inteligencja rozrysowuje wnęki i półki. Cierpliwości...</p>`,
    });
}

function hideLoading() {
    if (aiLoader) aiLoader.close();
    aiLoader = null;
}

// Zdjęcie z telefonu potrafi mieć kilka MB (limit zapytania Vercela to 4,5 MB) - zmniejszamy
// do 1600 px na dłuższym boku i zapisujemy jako JPEG. Format, którego przeglądarka nie
// umie narysować (np. HEIC), idzie bez zmian.
async function prepareImage(file) {
    const MAX = 1600;
    try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bmp.width * k);
        canvas.height = Math.round(bmp.height * k);
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        if (bmp.close) bmp.close();
        return { base64Image: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
    } catch (e) {
        const dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
            r.readAsDataURL(file);
        });
        return { base64Image: String(dataUrl).split(',')[1], mimeType: file.type };
    }
}


const MODULE_ICONS = {
  base_cabinet: 'ti-layout-bottombar',
  upper_cabinet: 'ti-cloud',
  tall_cabinet: 'ti-layout-sidebar',
  corner_cabinet: 'ti-corner-up-right',
  slope_cabinet: 'ti-stairs',
};

// Lewy panel: Szafki (lista + dodawanie), Boki dokładane, Narzędzia. Listy
// formatek, nawiertów i okuć, które dawniej dublowały się tu i w oknie
// "Produkcja i raporty", mieszkają teraz tylko w tym oknie (ui/productionHub.js).
export function updateSidebar() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js
  const leftSidebar = document.querySelector(".sidebar-left");
  const modules = state.project.modules;

  let html = `
    <section class="panel-section">
      <div class="panel-head">
        <h2>Szafki</h2>
        <span class="panel-hint">Shift = zaznacz wiele</span>
      </div>`;

  if (modules.length === 0) {
    html += `<div class="empty-note">Brak szafek. Dodaj pierwszą albo zbuduj projekt ze szkicu.</div>`;
  } else {
    html += `<button id="btn-show-all" class="btn btn-sm btn-block${state.activeModuleId === null ? ' active' : ''}" style="margin-bottom:8px"><i class="ti ti-eye-off" aria-hidden="true"></i> Odznacz wszystko</button>`;
    modules.forEach(m => {
      // Kliknięcie zgrupowanej szafki zaznacza CAŁĄ grupę (selectedModules), ale tylko
      // JEDNA z nich jest "aktywna" (activeModuleId) - ma otwarty panel właściwości.
      const isActive = m.id === state.activeModuleId;
      const isSelected = state.selectedModules && state.selectedModules.has(m.id);
      const cls = isActive ? ' is-active' : (isSelected ? ' is-selected' : '');
      const group = m.groupId ? `<i class="ti ti-link li-group" title="Zgrupowana z innymi szafkami" aria-hidden="true"></i>` : '';
      html += `
        <div class="list-item module-item${cls}" data-id="${escapeHtml(m.id)}">
          <i class="ti ${MODULE_ICONS[m.type] || MODULE_ICONS.base_cabinet} li-icon" aria-hidden="true"></i>
          <div class="li-main"><span class="li-name">${escapeHtml(m.name)}</span>${group}<span class="li-meta">${escapeHtml(m.dimensions.width)} × ${escapeHtml(m.dimensions.height)}</span></div>
          <div class="li-actions">
            <button class="icon-btn btn-mod-dup" data-id="${escapeHtml(m.id)}" title="Kopiuj szafkę"><i class="ti ti-copy" aria-hidden="true"></i></button>
            <button class="icon-btn btn-mod-del" data-id="${escapeHtml(m.id)}" title="Usuń szafkę"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </div>`;
    });
  }

  html += `
      <div class="btn-grid" style="margin-top:8px">
        <button id="btn-add-base" class="btn btn-sm" title="Szafka dolna"><i class="ti ti-plus" aria-hidden="true"></i> Dolna</button>
        <button id="btn-add-upper" class="btn btn-sm" title="Szafka wisząca"><i class="ti ti-plus" aria-hidden="true"></i> Wisząca</button>
        <button id="btn-add-tall" class="btn btn-sm" title="Słupek"><i class="ti ti-plus" aria-hidden="true"></i> Słupek</button>
        <button id="btn-add-corner" class="btn btn-sm" title="Szafka narożna z frontem łamanym (front prosty + skośny)"><i class="ti ti-plus" aria-hidden="true"></i> Narożna</button>
        <button id="btn-add-slope" class="btn btn-sm" title="Szafka pod skos (pod schodami, pod dachem)"><i class="ti ti-plus" aria-hidden="true"></i> Skos</button>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-head">
        <h2>Boki dokładane</h2>
        <button id="btn-add-side-panel" class="btn btn-sm" title="Dekoracyjny panel niezależny od szafek, np. na cały słup"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj</button>
      </div>`;

  // Boki dokładane i blendy (core/state.js: addSidePanel / addBlenda) - samodzielne
  // obiekty projektu, obie listy z jednej tablicy project.sidePanels (pole kind).
  const sideItem = (p, icon, fallbackName, delTitle, meta) => {
    const isActive = p.id === state.activeSidePanelId;
    return `
        <div class="list-item side-panel-item${isActive ? ' is-active' : ''}" data-id="${escapeHtml(p.id)}">
          <i class="ti ${icon} li-icon" aria-hidden="true"></i>
          <div class="li-main"><span class="li-name">${escapeHtml(p.name || fallbackName)}</span><span class="li-meta">${escapeHtml(meta)}</span></div>
          <div class="li-actions"><button class="icon-btn btn-side-panel-del" data-id="${escapeHtml(p.id)}" title="${delTitle}"><i class="ti ti-trash" aria-hidden="true"></i></button></div>
        </div>`;
  };
  const boks = state.project.sidePanels.filter(p => p.kind !== 'blenda');
  const blendy = state.project.sidePanels.filter(p => p.kind === 'blenda');
  if (boks.length === 0) html += `<div class="empty-note">Brak boków dokładanych.</div>`;
  boks.forEach(p => { html += sideItem(p, 'ti-layout-board', 'Bok dokładany', 'Usuń bok dokładany', `${p.dimensions.height} × ${p.dimensions.depth}`); });

  html += `
    </section>

    <section class="panel-section">
      <div class="panel-head">
        <h2>Blendy</h2>
        <button id="btn-add-blenda" class="btn btn-sm" title="Listwa maskująca szczelinę przy ścianie lub suficie (czoło + kołnierz mocujący)"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj</button>
      </div>`;
  if (blendy.length === 0) html += `<div class="empty-note">Brak blend.</div>`;
  blendy.forEach(p => { html += sideItem(p, 'ti-layout-distribute-vertical', 'Blenda', 'Usuń blendę', `${p.dimensions.width} × ${p.dimensions.height}`); });

  html += `
    </section>

    <section class="panel-section">
      <div class="panel-head"><h2>Narzędzia</h2></div>
      <div class="btn-stack">
        <button id="btn-wall-fill" class="btn btn-sm btn-block" title="Wypełnij ścianę albo całą kuchnię L/U szafkami: narożniki, podział, blendy, kolizje z szafkami, oknami i drzwiami"><i class="ti ti-layout-columns" aria-hidden="true"></i> Rozmieść szafki (ściana / L / U)</button>
        <button id="btn-slope-niche" class="btn btn-sm btn-block" title="Rząd prostokątnych szafek pod skosem (poddasze): wysokości liczone ze skosu, widok z przodu z wymiarami i zestawienie formatek"><i class="ti ti-stairs" aria-hidden="true"></i> Zabudowa wnęki pod skosem</button>
        <button id="btn-module-library" class="btn btn-sm btn-block" title="Własne szablony szafek: zapisz skonfigurowaną szafkę i wstawiaj ją do projektów"><i class="ti ti-books" aria-hidden="true"></i> Biblioteka szafek</button>
        <button id="btn-import-ai" class="btn btn-sm btn-block"><i class="ti ti-wand" aria-hidden="true"></i> Zbuduj projekt ze zdjęcia (AI)</button>
        <input type="file" id="input-ai-image" accept="image/png, image/jpeg" style="display: none;" />
        ${modules.length > 0 ? `<button id="btn-production" class="btn btn-sm btn-block btn-primary"><i class="ti ti-building-factory-2" aria-hidden="true"></i> Produkcja i raporty</button>` : ''}
      </div>
    </section>
  `;

  leftSidebar.innerHTML = html; 

  const btnShowAll = document.getElementById('btn-show-all');
  if (btnShowAll) {
    btnShowAll.addEventListener('click', () => {
      state.activeModuleId = null;
      state.activeSidePanelId = null;
      if (state.selectedModules) state.selectedModules.clear();
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  }

  document.querySelectorAll('.btn-mod-dup').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); 
      duplicateModule(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  });

  document.querySelectorAll('.btn-mod-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); 
      deleteModule(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel();  update3D(); updateSidebar();
    });
  });

  document.querySelectorAll('.module-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const clickedMod = state.project.modules.find(m => m.id === id);
      
      const gId = clickedMod && clickedMod.groupId;
      const idsToSelect = gId ? state.project.modules.filter(m => m.groupId === gId).map(m => m.id) : [id];
      
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (!state.selectedModules) state.selectedModules = new Set();
          const allSelected = idsToSelect.every(i => state.selectedModules.has(i));
          if (allSelected) {
              idsToSelect.forEach(i => state.selectedModules.delete(i));
              if (state.activeModuleId === id) state.activeModuleId = Array.from(state.selectedModules).pop() || null;
          } else {
              idsToSelect.forEach(i => state.selectedModules.add(i));
              state.activeModuleId = id;
          }
      } else {
          state.selectedModules = new Set(idsToSelect);
          state.activeModuleId = id;
      }
      state.activeSidePanelId = null;

      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  const setupAddBtn = (id, type) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { addModule(type); initPropertiesPanel();  update3D(); updateSidebar(); });
  };
  setupAddBtn('btn-add-base', 'base_cabinet'); setupAddBtn('btn-add-upper', 'upper_cabinet'); setupAddBtn('btn-add-tall', 'tall_cabinet');

  const btnAddCorner = document.getElementById('btn-add-corner');
  if (btnAddCorner) {
    btnAddCorner.addEventListener('click', () => {
      // addCornerModule() sam woła ensureCornerDefaults (core/layout.js) -
      // domyślne fronty obu ramion są bound-based i nadążają za zmianą
      // wymiarów bez ręcznego przeliczania (patrz core/state.js).
      addCornerModule();
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  }

  document.getElementById('btn-add-slope')?.addEventListener('click', () => {
    addSlopeModule();
    initPropertiesPanel();
    update3D();
    updateSidebar();
  });

  const btnModuleLibrary = document.getElementById('btn-module-library');
  if (btnModuleLibrary) {
    btnModuleLibrary.addEventListener('click', () => openModuleLibrary(() => { initPropertiesPanel(); update3D(); updateSidebar(); }));
  }

  document.getElementById('btn-slope-niche')?.addEventListener('click', () => openSlopeNicheModal(() => { initPropertiesPanel(); update3D(); updateSidebar(); }));
  document.getElementById('btn-wall-fill')?.addEventListener('click', () => openWallFillModal(() => { initPropertiesPanel(); update3D(); updateSidebar(); }));

  const btnAddBlenda = document.getElementById('btn-add-blenda');
  if (btnAddBlenda) {
    btnAddBlenda.addEventListener('click', () => {
      const blenda = addSidePanel('blenda');
      // Startuje w (0,0,0) - przyciągamy do sąsiedztwa szafek, żeby nie wchodziła w korpus.
      const at = snapSidePanel(blenda, 0, 0, state.project);
      blenda.position.x = at.x;
      blenda.position.z = at.z;
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  }

  const btnAddSidePanel = document.getElementById('btn-add-side-panel');
  if (btnAddSidePanel) {
    btnAddSidePanel.addEventListener('click', () => {
      const panel = addSidePanel();
      // Nowy bok startuje w (0,0,0), czyli zwykle w środku pierwszej szafki - przyciągamy
      // go do sąsiedztwa szafek, żeby nie wchodził w korpus.
      const at = snapSidePanel(panel, 0, 0, state.project);
      panel.position.x = at.x;
      panel.position.z = at.z;
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  }

  document.querySelectorAll('.side-panel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      state.activeSidePanelId = id;
      state.activeModuleId = null;
      if (state.selectedModules) state.selectedModules.clear();
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  document.querySelectorAll('.btn-side-panel-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSidePanel(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  const btnAi = document.getElementById('btn-import-ai');
  const inputAi = document.getElementById('input-ai-image');

  if (btnAi && inputAi) {
      btnAi.addEventListener('click', () => {
          inputAi.click();
      });

      inputAi.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          inputAi.value = "";

          const token = await getIdToken();
          if (!token) {
              showAlert("Import szkicu wymaga zalogowania (przycisk „Zaloguj (Google)”).");
              return;
          }

          showLoading("Rozszyfrowuję strukturę wnęk i półek...");
          try {
              const { base64Image, mimeType } = await prepareImage(file);
              const response = await fetch('/api/gemini', {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                  body: JSON.stringify({ base64Image, mimeType })
              });
              // Błąd platformy (np. 413) przychodzi jako tekst, nie JSON.
              const data = await response.json().catch(() => null);
              if (!response.ok || !data) throw new Error((data && data.error) || `serwer odpowiedział kodem ${response.status}`);

              // Dane od modelu są niezaufane - walidacja i budowa szafek w core/aiSketchImport.js.
              const aiModules = sanitizeAiModules(data.modules);
              if (aiModules.length === 0) throw new Error("nie rozpoznano żadnej szafki na zdjęciu.");

              const generated = buildModulesFromAi(aiModules, state.project);
              state.project.modules.push(...generated);
              ensureSidePanelsDefaults(state.project);
              generated.forEach((m) => clampModuleToRoom(m));
              hideLoading();
              initPropertiesPanel();
              updateSidebar();
              update3D();
          } catch(err) {
              hideLoading();
              showAlert("⚠️ Sztuczna Inteligencja napotkała problem: " + err.message);
          }
      });
  }

  const productionBtn = document.getElementById('btn-production');
  if (productionBtn) productionBtn.addEventListener('click', () => openProductionHub());


}