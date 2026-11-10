import { state, addModule, deleteModule, duplicateModule, addSidePanel, addDishwasher, getActiveModule, deleteSidePanel, addCornerModule, addSlopeModule, ensureSidePanelsDefaults } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";
import { buildSidebarTree } from "../core/sidebarTree.js";
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
import { parseFurnitureJson, insertFurniture } from "../core/furnitureImport.js";
import { bindHoverExpand, refitPanel } from "./panelHover.js";
import { clickSelection, activePicks } from "../core/groupSelection.js";

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

const PANEL_ICONS = { bok: 'ti-layout-board', poziomy: 'ti-layout-rows', blenda: 'ti-layout-distribute-vertical', zmywarka: 'ti-wash-machine' };
const PANEL_DEL = { bok: 'Usuń bok dokładany', poziomy: 'Usuń panel poziomy', blenda: 'Usuń blendę', zmywarka: 'Usuń zmywarkę' };
const LOOSE_KEY = 'bez-grupy';

// Stan samego panelu (nie projektu): tekst wyszukiwarki i zwinięte meble.
let treeQuery = '';
const collapsedGroups = new Set();
let menuCloserBound = false;
let pickedIds = new Set(); // szafki dobrane Shiftem w grupie aktywnej - na liście jak aktywna

const refreshAll = () => { initPropertiesPanel(); update3D(); updateSidebar(); };

function isMarked(it) {
  if (it.kind === 'module') return it.id === state.activeModuleId || !!(state.selectedModules && state.selectedModules.has(it.id));
  return it.id === state.activeSidePanelId || !!(state.selectedSidePanels && state.selectedSidePanels.has(it.id));
}

function itemHtml(it) {
  const isModule = it.kind === 'module';
  const isActive = it.id === (isModule ? state.activeModuleId : state.activeSidePanelId) || (isModule && pickedIds.has(it.id));
  const cls = isActive ? ' is-active' : (isMarked(it) ? ' is-selected' : '');
  const icon = isModule ? (MODULE_ICONS[it.type] || MODULE_ICONS.base_cabinet) : PANEL_ICONS[it.panelKind];
  const id = escapeHtml(it.id);
  const code = it.code ? `<span class="li-code" title="Numer mebla na listach formatek">${escapeHtml(it.code)}</span>` : '';
  const actions = isModule
    ? `<button class="icon-btn btn-mod-dup" data-id="${id}" title="Kopiuj szafkę"><i class="ti ti-copy" aria-hidden="true"></i></button>
       <button class="icon-btn btn-mod-del" data-id="${id}" title="Usuń szafkę"><i class="ti ti-trash" aria-hidden="true"></i></button>`
    : `<button class="icon-btn btn-side-panel-del" data-id="${id}" title="${PANEL_DEL[it.panelKind]}"><i class="ti ti-trash" aria-hidden="true"></i></button>`;
  return `
    <div class="list-item ${isModule ? 'module-item' : 'side-panel-item'}${cls}" data-id="${id}" title="${escapeHtml(it.name)} - ${escapeHtml(it.meta)}">
      <i class="ti ${icon} li-icon" aria-hidden="true"></i>
      <div class="li-main">${code}<span class="li-name">${escapeHtml(it.short || it.name)}</span><span class="li-meta">${escapeHtml(it.meta)}</span></div>
      <div class="li-actions">${actions}</div>
    </div>`;
}

// Lista elementów projektu jako drzewo mebli (core/sidebarTree.js). Projekt bez grup = płaska lista.
function treeHtml() {
  pickedIds = activePicks(state.project, { picks: state.editPicks }, state.activeModuleId);
  const tree = buildSidebarTree(state.project, treeQuery);
  if (tree.total === 0) return `<div class="empty-note">Projekt jest pusty. Dodaj pierwszą szafkę z menu „Dodaj” albo zbuduj projekt ze zdjęcia (menu „Narzędzia”).</div>`;
  if (tree.shown === 0) return `<div class="empty-note">Nic nie pasuje do „${escapeHtml(treeQuery.trim())}”.</div>`;
  const filtering = treeQuery.trim() !== '';
  const group = (key, code, label, items) => {
    const open = filtering || !collapsedGroups.has(key);
    return `
      <div class="tree-group">
        <button type="button" class="tree-head${items.some(isMarked) ? ' has-sel' : ''}" data-key="${escapeHtml(key)}" aria-expanded="${open}">
          <i class="ti ti-chevron-${open ? 'down' : 'right'}" aria-hidden="true"></i>
          ${code ? `<span class="li-code" title="Numer mebla na listach formatek">${escapeHtml(code)}</span>` : ''}
          <span class="tree-label">${escapeHtml(label)}</span>
          <span class="tree-count">${items.length}</span>
        </button>
        ${open ? `<div class="tree-items">${items.map(itemHtml).join('')}</div>` : ''}
      </div>`;
  };
  let html = tree.furniture.map(g => group(g.key, g.code, g.label, g.items)).join('');
  if (tree.loose.length) html += tree.furniture.length ? group(LOOSE_KEY, '', 'Bez grupy', tree.loose) : tree.loose.map(itemHtml).join('');
  return html;
}

function renderTree() {
  const root = document.getElementById('sidebar-tree');
  if (!root) return;
  root.innerHTML = treeHtml();
  bindTree(root);
  refitPanel(document.querySelector('.sidebar-left')); // poszerzony po najechaniu - dopasuj do nowej treści
}

function bindTree(root) {
  root.querySelectorAll('.tree-head').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-key');
      if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
      renderTree();
    });
  });

  root.querySelectorAll('.btn-mod-dup').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateModule(e.currentTarget.getAttribute('data-id'));
      refreshAll();
    });
  });

  root.querySelectorAll('.btn-mod-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteModule(e.currentTarget.getAttribute('data-id'));
      refreshAll();
    });
  });

  root.querySelectorAll('.module-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      // Kliknięcie zaznacza całą grupę (szafki + jej blendy/boki); Shift/Ctrl dokłada albo zdejmuje.
      // Tylko JEDNA szafka jest „aktywna” (activeModuleId) - ma otwarty panel właściwości.
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const sel = clickSelection(state.project, { moduleIds: state.selectedModules, panelIds: state.selectedSidePanels, picks: state.editPicks, activeId: state.activeModuleId }, 'module', id, additive);
      state.selectedModules = sel.moduleIds;
      state.selectedSidePanels = sel.panelIds;
      state.editPicks = sel.picks;
      // dobranie szafki w grupie aktywnej (sel.picked) nie zmienia aktywnej szafki
      if (!sel.picked) state.activeModuleId = sel.removed
          ? (state.activeModuleId === id ? Array.from(state.selectedModules).pop() || null : state.activeModuleId)
          : id;
      state.activeSidePanelId = null;
      refreshAll();
    });
  });

  root.querySelectorAll('.side-panel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      // jak przy szafkach: Shift/Ctrl dokłada blendę/bok do zaznaczenia (np. do „Połącz w grupę”)
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      const sel = clickSelection(state.project, { moduleIds: state.selectedModules, panelIds: state.selectedSidePanels, picks: state.editPicks, activeId: state.activeModuleId }, 'panel', id, additive);
      state.selectedModules = sel.moduleIds;
      state.selectedSidePanels = sel.panelIds;
      state.editPicks = sel.picks;
      if (sel.removed) {
        if (state.activeSidePanelId === id) state.activeSidePanelId = null;
        if (!state.activeSidePanelId) state.activeModuleId = Array.from(state.selectedModules).pop() || null;
      } else {
        state.activeSidePanelId = id;
        state.activeModuleId = null;
      }
      refreshAll();
    });
  });

  root.querySelectorAll('.btn-side-panel-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSidePanel(e.currentTarget.getAttribute('data-id'));
      refreshAll();
    });
  });
}

// Lewy panel: u góry (przyklejone) menu „Dodaj” i „Narzędzia” + wyszukiwarka, pod nimi jedna
// lista elementów projektu pogrupowana po meblach. Listy formatek, rysunki i kosztorys są
// tylko w oknie „Produkcja i raporty” (zakładki Produkcja / Wycena na górnym pasku).
export function updateSidebar() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js
  const leftSidebar = document.querySelector(".sidebar-left");
  const item = (id, icon, label, title) => `<button type="button" id="${id}" class="menu-item" title="${title}"><i class="ti ${icon}" aria-hidden="true"></i> ${label}</button>`;

  leftSidebar.innerHTML = `
    <div class="sidebar-head">
      <div class="sidebar-menus">
        <details class="menu">
          <summary class="btn btn-sm"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj <i class="ti ti-chevron-down" aria-hidden="true"></i></summary>
          <div class="menu-pop">
            <div class="menu-title">Szafki</div>
            ${item('btn-add-base', MODULE_ICONS.base_cabinet, 'Szafka dolna', 'Szafka dolna')}
            ${item('btn-add-upper', MODULE_ICONS.upper_cabinet, 'Szafka wisząca', 'Szafka wisząca')}
            ${item('btn-add-tall', MODULE_ICONS.tall_cabinet, 'Słupek', 'Słupek')}
            ${item('btn-add-corner', MODULE_ICONS.corner_cabinet, 'Szafka narożna', 'Szafka narożna z frontem łamanym (front prosty + skośny)')}
            ${item('btn-add-slope', MODULE_ICONS.slope_cabinet, 'Szafka pod skos', 'Szafka pod skos (pod schodami, pod dachem)')}
            <div class="menu-title">AGD</div>
            ${item('btn-add-dishwasher-45', PANEL_ICONS.zmywarka, 'Zmywarka 45 cm', 'Zmywarka do zabudowy 45 cm: front, wieniec nad nią, cokół (bez korpusu)')}
            ${item('btn-add-dishwasher-60', PANEL_ICONS.zmywarka, 'Zmywarka 60 cm', 'Zmywarka do zabudowy 60 cm: front, wieniec nad nią, cokół (bez korpusu)')}
            <div class="menu-title">Panele</div>
            ${item('btn-add-side-panel', PANEL_ICONS.bok, 'Bok dokładany', 'Dekoracyjny panel niezależny od szafek, np. na cały słup')}
            ${item('btn-add-horizontal-panel', PANEL_ICONS.poziomy, 'Panel poziomy', 'Płyta leżąca poza szafkami: półka albo wieniec w niszy (płyta korpusu)')}
            ${item('btn-add-blenda', PANEL_ICONS.blenda, 'Blenda', 'Listwa maskująca szczelinę przy ścianie lub suficie (czoło + kołnierz mocujący)')}
          </div>
        </details>
        <details class="menu">
          <summary class="btn btn-sm"><i class="ti ti-tools" aria-hidden="true"></i> Narzędzia <i class="ti ti-chevron-down" aria-hidden="true"></i></summary>
          <div class="menu-pop">
            ${item('btn-wall-fill', 'ti-layout-columns', 'Rozmieść szafki (ściana / L / U)', 'Wypełnij ścianę albo całą kuchnię L/U szafkami: narożniki, podział, blendy, kolizje z szafkami, oknami i drzwiami')}
            ${item('btn-slope-niche', 'ti-stairs', 'Zabudowa wnęki pod skosem', 'Rząd prostokątnych szafek pod skosem (poddasze): wysokości liczone ze skosu, widok z przodu z wymiarami i zestawienie formatek')}
            ${item('btn-module-library', 'ti-books', 'Biblioteka szafek', 'Własne szablony szafek: zapisz skonfigurowaną szafkę i wstawiaj ją do projektów')}
            ${item('btn-import-furniture', 'ti-file-import', 'Wstaw mebel z pliku', 'Wstaw cały mebel (kilka korpusów, blendy) z pliku JSON - szafki trafiają do projektu jako jedna grupa')}
            ${item('btn-import-ai', 'ti-wand', 'Zbuduj projekt ze zdjęcia (AI)', 'Zdjęcie odręcznego szkicu zamienia się w szafki (wymaga zalogowania)')}
          </div>
        </details>
        <input type="file" id="input-furniture" accept="application/json,.json" multiple style="display: none;" />
        <input type="file" id="input-ai-image" accept="image/png, image/jpeg" style="display: none;" />
      </div>
      <div class="sidebar-search">
        <input id="sidebar-search" class="input" type="search" placeholder="Szukaj szafki lub mebla…" value="${escapeHtml(treeQuery)}" />
        <button id="btn-show-all" class="icon-btn" title="Odznacz wszystko"><i class="ti ti-deselect" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="panel-head">
      <h2>Elementy projektu</h2>
      <span class="panel-hint">Shift / Ctrl = zaznacz wiele</span>
    </div>
    <div id="sidebar-tree" class="tree"></div>
  `;
  renderTree();

  document.getElementById('sidebar-search').addEventListener('input', (e) => { treeQuery = e.target.value; renderTree(); });

  // Menu rozwijane: jedno otwarte naraz, wybór pozycji albo kliknięcie obok zamyka.
  const menus = Array.from(leftSidebar.querySelectorAll('details.menu'));
  menus.forEach(d => {
    d.addEventListener('toggle', () => { if (d.open) menus.forEach(o => { if (o !== d) o.open = false; }); });
    d.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => { d.open = false; }));
  });
  if (!menuCloserBound) {
    menuCloserBound = true;
    // po najechaniu panel poszerza się do najdłuższej nazwy (ui/panelHover.js)
    bindHoverExpand(leftSidebar, { side: 'left', width: 'content', max: 640 });
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.sidebar-left details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    });
  }

  const btnShowAll = document.getElementById('btn-show-all');
  if (btnShowAll) {
    btnShowAll.addEventListener('click', () => {
      state.activeModuleId = null;
      state.activeSidePanelId = null;
      if (state.selectedModules) state.selectedModules.clear();
      state.selectedSidePanels = new Set();
      state.editPicks = new Set();
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  }


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

  const furnitureInput = document.getElementById('input-furniture');
  document.getElementById('btn-import-furniture')?.addEventListener('click', () => furnitureInput.click());
  furnitureInput?.addEventListener('change', async () => {
    const files = Array.from(furnitureInput.files || []);
    furnitureInput.value = '';
    const bad = [];
    let last = null;
    for (const file of files) {
      const furniture = parseFurnitureJson(await file.text());
      if (!furniture) { bad.push(file.name); continue; }
      last = insertFurniture(state.project, furniture);
    }
    if (last && last.length) {
      state.activeModuleId = last[0].id;
      state.selectedModules = new Set(last.map(m => m.id));
      state.selectedSidePanels = new Set(state.project.sidePanels.filter(p => p.groupId && p.groupId === last[0].groupId).map(p => p.id));
      state.activeSidePanelId = null;
    }
    initPropertiesPanel(); update3D(); updateSidebar();
    if (bad.length) showAlert(`To nie jest plik mebla: ${bad.join(', ')}`, 'Wstaw mebel z pliku');
  });

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

  [450, 600].forEach(w => document.getElementById(`btn-add-dishwasher-${w / 10}`)?.addEventListener('click', () => {
    // staje za aktywną szafką dolną (wymiary, nóżki, dekor i front z niej); bez niej - przyciąga się jak bok
    const hadBase = getActiveModule()?.type === 'base_cabinet';
    const panel = addDishwasher(w);
    if (!hadBase) {
      const at = snapSidePanel(panel, 0, 0, state.project);
      panel.position.x = at.x;
      panel.position.z = at.z;
    }
    initPropertiesPanel(); update3D(); updateSidebar();
  }));

  document.getElementById('btn-add-horizontal-panel')?.addEventListener('click', () => {
    const panel = addSidePanel('poziomy');
    const at = snapSidePanel(panel, 0, 0, state.project);
    panel.position.x = at.x;
    panel.position.z = at.z;
    initPropertiesPanel(); update3D(); updateSidebar();
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


}