import { state, addModule, deleteModule, duplicateModule, addSidePanel, deleteSidePanel, addCornerModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";
import { openProductionHub } from "./productionHub.js";
import { escapeHtml } from "../utils/dom.js";
import { openModuleLibrary } from "./moduleLibraryModal.js";
import { snapSidePanel } from "../core/sidePanelSnap.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";

function showLoading(msg) {
    let l = document.getElementById('ai-loader');
    if(!l) {
        l = document.createElement('div');
        l.id = 'ai-loader';
        Object.assign(l.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#10b981', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '9999',
            fontSize: '24px', fontWeight: 'bold', flexDirection: 'column'
        });
        document.body.appendChild(l);
    }
    l.innerHTML = `<div><i class="ti ti-wand" aria-hidden="true"></i> ${msg}</div><div style="font-size:14px; margin-top:15px; color:#94a3b8;">Sztuczna Inteligencja rozrysowuje wnęki i półki. Cierpliwości...</div>`;
    l.style.display = 'flex';
}

function hideLoading() {
    const l = document.getElementById('ai-loader');
    if(l) l.style.display = 'none';
}


const MODULE_ICONS = {
  base_cabinet: 'ti-layout-bottombar',
  upper_cabinet: 'ti-cloud',
  tall_cabinet: 'ti-layout-sidebar',
  corner_cabinet: 'ti-corner-up-right',
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
        <div class="list-item module-item${cls}" data-id="${m.id}">
          <i class="ti ${MODULE_ICONS[m.type] || MODULE_ICONS.base_cabinet} li-icon" aria-hidden="true"></i>
          <div class="li-main"><span class="li-name">${escapeHtml(m.name)}</span>${group}<span class="li-meta">${m.dimensions.width} × ${m.dimensions.height}</span></div>
          <div class="li-actions">
            <button class="icon-btn btn-mod-dup" data-id="${m.id}" title="Kopiuj szafkę"><i class="ti ti-copy" aria-hidden="true"></i></button>
            <button class="icon-btn btn-mod-del" data-id="${m.id}" title="Usuń szafkę"><i class="ti ti-trash" aria-hidden="true"></i></button>
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
        <div class="list-item side-panel-item${isActive ? ' is-active' : ''}" data-id="${p.id}">
          <i class="ti ${icon} li-icon" aria-hidden="true"></i>
          <div class="li-main"><span class="li-name">${escapeHtml(p.name || fallbackName)}</span><span class="li-meta">${meta}</span></div>
          <div class="li-actions"><button class="icon-btn btn-side-panel-del" data-id="${p.id}" title="${delTitle}"><i class="ti ti-trash" aria-hidden="true"></i></button></div>
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

  const btnModuleLibrary = document.getElementById('btn-module-library');
  if (btnModuleLibrary) {
    btnModuleLibrary.addEventListener('click', () => openModuleLibrary(() => { initPropertiesPanel(); update3D(); updateSidebar(); }));
  }

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

          const mimeType = file.type;
          showLoading("Rozszyfrowuję strukturę wnęk i półek...");

          const reader = new FileReader();
          reader.onload = async (ev) => {
              const base64Image = ev.target.result.split(',')[1];

              try {
                  const response = await fetch('/api/gemini', { 
                      method: "POST", 
                      headers: { "Content-Type": "application/json" }, 
                      body: JSON.stringify({ base64Image, mimeType }) 
                  });
                  
                  const data = await response.json();
                  
                  if (data.error) throw new Error(data.error.message || data.error);
                  
                  const rawJson = data.candidates[0].content.parts[0].text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                  const aiModules = JSON.parse(rawJson);
                  
                  let currentX = 0;
                  if (state.project.modules.length > 0) {
                      const lastMod = state.project.modules[state.project.modules.length - 1];
                      currentX = lastMod.position.x + parseFloat(lastMod.dimensions.width);
                  }

                  const generatedModules = aiModules.map(aiMod => {
                      const w = parseFloat(aiMod.width) || 600;
                      const h = parseFloat(aiMod.height) || (aiMod.type === 'tall_cabinet' ? 2000 : 720);
                      const d = aiMod.type === 'upper_cabinet' ? 300 : 510;
                      const posY = aiMod.type === 'upper_cabinet' ? 1400 : 0;
                      
                      const mod = {
                          id: 'mod-' + Date.now() + Math.random().toString(36).substr(2,5),
                          name: aiMod.name || 'Moduł AI',
                          type: aiMod.type || 'base_cabinet',
                          dimensions: { width: w, height: h, depth: d },
                          position: { x: currentX, y: posY, z: 0 },
                          legs: { active: aiMod.type !== 'upper_cabinet', height: 100, plinth: true, plinthOffset: 40 },
                          backPanel: { type: 'nakladane', offset: 16 },
                          elements: []
                      };
                      
                      currentX += w; 

                      const th = parseFloat(state.project.materials?.boardThickness) || 18;
                      const internalH = h - (th * 2);
                      const gapFront = parseFloat(state.project.front?.gap) || 3;

                      if (aiMod.sections && aiMod.sections.length > 0) {
                          let currentY = th;
                          const totalSectionsHeight = aiMod.sections.reduce((sum, sec) => sum + (parseFloat(sec.height) || 0), 0);
                          const scale = totalSectionsHeight > 0 ? internalH / totalSectionsHeight : 1;

                          aiMod.sections.forEach((sec, idx) => {
                              const secH = (parseFloat(sec.height) || (internalH / aiMod.sections.length)) * scale;
                              let zoneMinY = currentY;
                              let zoneMaxY = currentY + secH;
                              
                              if (idx === aiMod.sections.length - 1) zoneMaxY = h - th; 

                              const bZone = { minX: th, maxX: w - th, minY: zoneMinY, maxY: zoneMaxY, offsetBottom: 0, offsetTop: 0 };
                              
                              const sType = sec.type || 'drzwi';
                              const count = parseInt(sec.count) || 1;

                              if (sType === 'szuflady') {
                                  for(let i = 0; i < count; i++) {
                                      mod.elements.push({
                                          id: 'front-' + Date.now() + Math.random().toString(36).substr(2,5),
                                          typ: 'front', subtype: 'szuflada',
                                          baseZone: { ...bZone },
                                          frontCount: count, distribution: count.toString(), frontIndex: i, gap: gapFront, forceVariant: 'auto', forceNL: null
                                      });
                                  }
                              } else if (sType === 'drzwi_lp') {
                                  mod.elements.push({ id: 'front-L-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 0, gap: gapFront });
                                  mod.elements.push({ id: 'front-P-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 1, gap: gapFront });
                              } else if (sType === 'drzwi') {
                                  mod.elements.push({ id: 'front-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi', baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: gapFront, openingSide: 'left' });
                              }
                              
                              if (idx < aiMod.sections.length - 1) {
                                  mod.elements.push({
                                      id: 'poziom-' + Date.now() + Math.random().toString(36).substring(2, 6),
                                      typ: 'poziom', x: th, y: zoneMaxY, w: w - (th * 2), h: th, isStructural: true 
                                  });
                                  currentY = zoneMaxY + th;
                              }
                          });
                      } else {
                          const bZone = { minX: th, maxX: w - th, minY: th, maxY: h - th, offsetBottom: 0, offsetTop: 0 };
                          mod.elements.push({ id: 'front-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi', baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: gapFront, openingSide: 'left' });
                      }

                      return mod;
                  });

                  state.project.modules.push(...generatedModules);
                  hideLoading();
                  initPropertiesPanel();
                  updateSidebar();
                  update3D();
                  
              } catch(err) {
                  hideLoading();
                  alert("⚠️ Sztuczna Inteligencja napotkała problem: " + err.message);
              }
              inputAi.value = "";
          };
          reader.readAsDataURL(file);
      });
  }

  const productionBtn = document.getElementById('btn-production');
  if (productionBtn) productionBtn.addEventListener('click', () => openProductionHub());


}