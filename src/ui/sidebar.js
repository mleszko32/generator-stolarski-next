import { calculateParts, calculateProjectHardware } from "../engine/cabinet.js";
import { state, getActiveModule, addModule, deleteModule, duplicateModule, addSidePanel, deleteSidePanel, addCornerModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";
import { openCutPlanModal } from "./cutPlanModal.js";
import { openProductionHub } from "./productionHub.js";
import { escapeHtml } from "../utils/dom.js";
import { openModuleLibrary } from "./moduleLibraryModal.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";
import { openCsvExport } from "./csvEditor.js";
import { openKosztorysModal } from "./kosztorysModal.js";
import { printHardwareList } from "./hardwareList.js";
import { openTechnicalDrawing } from "./technicalDrawing.js";

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


export function updateSidebar() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js
  const leftSidebar = document.querySelector(".sidebar-left");
  const { parts, mountingData } = calculateParts();
  const activeMod = getActiveModule();
  const projectHardware = calculateProjectHardware();
  
  let html = `
    <h2 style="font-size: 14px; margin-bottom: 10px; color: #1e293b;">Lista Szafek (Moduły)</h2>
    <div style="font-size: 10px; color: #64748b; margin-bottom: 8px;">Użyj SHIFT aby zaznaczyć wiele szafek.</div>
  `;

  html += `
      <div style="margin-bottom: 15px;">
          <button id="btn-import-ai" class="btn btn-block">
              <i class="ti ti-wand" aria-hidden="true"></i> Zbuduj projekt ze zdjęcia (AI)
          </button>
          <input type="file" id="input-ai-image" accept="image/png, image/jpeg" style="display: none;" />
      </div>
  `;

  if (state.project.modules.length === 0) {
     html += `<div style="font-size: 11px; color: #64748b; margin-bottom: 10px; text-align: center;">Brak szafek. Dodaj pierwszą ręcznie lub wczytaj szkic!</div>`;
  } else {
    const isAllActive = state.activeModuleId === null;
    const bgAll = isAllActive ? '#3b82f6' : '#f8fafc';
    const colorAll = isAllActive ? '#ffffff' : '#1e293b';
    const borderAll = isAllActive ? '#2563eb' : '#cbd5e1';
    
    html += `
      <div id="btn-show-all" style="padding: 10px; margin-bottom: 15px; background-color: ${bgAll}; color: ${colorAll}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${borderAll}; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s;">
        <i class="ti ti-eye-off" aria-hidden="true"></i> Odznacz wszystko
      </div>
    `;

    state.project.modules.forEach(m => {
      // Kliknięcie zgrupowanej szafki zaznacza CAŁĄ grupę (selectedModules),
      // ale tylko JEDNA z nich jest "aktywna" (activeModuleId) - to ona ma
      // otwarty panel właściwości/rysunek techniczny. Bez rozróżnienia obie
      // były podświetlone identycznie na niebiesko, więc nie dało się
      // rozpoznać, który moduł grupy jest faktycznie edytowany (zgłoszony bug).
      const isActive = m.id === state.activeModuleId;
      const isSelected = state.selectedModules && state.selectedModules.has(m.id);
      const bg = isActive ? '#3b82f6' : (isSelected ? '#dbeafe' : '#f8fafc');
      const color = isActive ? '#ffffff' : '#1e293b';
      const border = isActive ? '#2563eb' : (isSelected ? '#93c5fd' : '#cbd5e1');

      let icon = '<i class="ti ti-layout-bottombar" aria-hidden="true"></i>';
      if (m.type === 'upper_cabinet') icon = '<i class="ti ti-cloud" aria-hidden="true"></i>';
      if (m.type === 'tall_cabinet') icon = '<i class="ti ti-layout-sidebar" aria-hidden="true"></i>';
      if (m.type === 'corner_cabinet') icon = '<i class="ti ti-corner-up-right" aria-hidden="true"></i>';

      const groupIcon = m.groupId ? `<span title="Zgrupowana z innymi szafkami" style="color: ${isActive ? '#bae6fd' : '#ef4444'}; font-size:12px; margin-left:6px;">🔗</span>` : '';

      html += `
        <div class="module-item" data-id="${m.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background-color: ${bg}; color: ${color}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${border}; transition: all 0.2s; user-select: none;">
          <div style="flex-grow: 1; pointer-events: none;">
            ${icon} ${escapeHtml(m.name)} ${groupIcon} <span style="font-weight: normal; font-size: 11px; opacity: 0.8; margin-left: 2px;">(${m.dimensions.width}x${m.dimensions.height})</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-mod-action btn-mod-dup" data-id="${m.id}" title="Kopiuj szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-copy" aria-hidden="true"></i></button>
            <button class="btn-mod-action btn-mod-del" data-id="${m.id}" title="Usuń szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </div>
      `;
    });
  }

  html += `
      <div style="display: flex; gap: 4px; margin-top: 8px;">
        <button id="btn-add-base" class="btn btn-sm" style="flex: 1;" title="Szafka dolna"><i class="ti ti-plus" aria-hidden="true"></i> Dolna</button>
        <button id="btn-add-upper" class="btn btn-sm" style="flex: 1;" title="Szafka wisząca"><i class="ti ti-plus" aria-hidden="true"></i> Wisząca</button>
        <button id="btn-add-tall" class="btn btn-sm" style="flex: 1;" title="Słupek"><i class="ti ti-plus" aria-hidden="true"></i> Słupek</button>
      </div>
      <button id="btn-add-corner" class="btn btn-neutral btn-block btn-sm" style="margin-top: 6px;" title="Szafka narożna z frontem łamanym (front prosty + skośny)"><i class="ti ti-plus" aria-hidden="true"></i> Narożna</button>
      <button id="btn-add-side-panel" class="btn btn-teal btn-block btn-sm" style="margin-top: 6px;" title="Dekoracyjny panel niezależny od modułów, np. na cały słup szafek"><i class="ti ti-plus" aria-hidden="true"></i> Bok dokładany</button>
      <button id="btn-module-library" class="btn btn-block btn-sm" style="margin-top: 6px;" title="Własne szablony szafek: zapisz skonfigurowaną szafkę i wstawiaj ją do projektów"><i class="ti ti-books" aria-hidden="true"></i> Biblioteka szafek</button>
    </div>
    <hr style="margin: 15px 0; border: 0; border-top: 1px dashed #cbd5e1;">
  `;

  // Boki dokładane (core/state.js: addSidePanel) - samodzielne obiekty
  // projektu (nie właściwość modułu jak blenda), więc osobna lista niezależna
  // od "Lista Szafek" wyżej.
  if (state.project.sidePanels.length > 0) {
    html += `<details open style="margin-bottom: 15px;"><summary style="font-weight: bold; cursor: pointer; outline: none; color: #0f766e;"><i class="ti ti-layout-board" aria-hidden="true"></i> Boki dokładane</summary><div style="margin-top: 8px;">`;
    state.project.sidePanels.forEach(p => {
      const isActive = p.id === state.activeSidePanelId;
      const bg = isActive ? '#0f766e' : '#f0fdfa';
      const color = isActive ? '#ffffff' : '#134e4a';
      const border = isActive ? '#0f766e' : '#99f6e4';
      html += `
        <div class="side-panel-item" data-id="${p.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background-color: ${bg}; color: ${color}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${border}; transition: all 0.2s; user-select: none;">
          <div style="flex-grow: 1; pointer-events: none;">
            <i class="ti ti-layout-board" aria-hidden="true"></i> ${escapeHtml(p.name || 'Bok dokładany')} <span style="font-weight: normal; font-size: 11px; opacity: 0.8; margin-left: 2px;">(${p.dimensions.height}×${p.dimensions.depth})</span>
          </div>
          <button class="btn-side-panel-del" data-id="${p.id}" title="Usuń bok dokładany" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      `;
    });
    html += `</div></details>`;
  }

  if (state.project.modules.length > 0) {
    html += `
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        <button id="btn-production" class="btn btn-block btn-sm">
          <i class="ti ti-building-factory-2" aria-hidden="true"></i> Produkcja i raporty
        </button>
      </div>
    `;
    if (!activeMod) {
      html += `<div style="font-size: 11px; color: #ef4444; margin-top: -10px; margin-bottom: 15px; text-align: center;">Wybierz szafkę, aby wygenerować rysunek.</div>`;
    }
  }

  if (activeMod) {
    html += `<details style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none;">Lista formatek (Aktywna)</summary>`;
    
    html += `
      <div style="overflow-x: auto; margin-top: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; background: #fff;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px; color: #334155; font-weight: bold;">Element</th>
              <th style="padding: 8px; color: #334155; font-weight: bold;">Wymiar (mm)</th>
              <th style="padding: 8px; text-align: center; color: #334155; font-weight: bold;">Ilość</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (parts && parts.length > 0) {
        parts.forEach((part, index) => {
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            html += `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#eff6ff'" onmouseout="this.style.backgroundColor='${rowBg}'">
                    <td style="padding: 8px; font-weight: 600; color: #1e293b;">${escapeHtml(part.name)}</td>
                    <td style="padding: 8px; color: #64748b; white-space: nowrap;">${part.length} &times; ${part.width}</td>
                    <td style="padding: 8px; text-align: center;">
                        <span style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: bold; padding: 2px 8px; border-radius: 12px; min-width: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">
                            ${part.qty}
                        </span>
                    </td>
                </tr>
            `;
        });
    } else {
        html += `<tr><td colspan="3" style="padding: 15px; text-align: center; color: #94a3b8;">Brak elementów</td></tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>
    </details>
    `;

    if (mountingData && mountingData.length > 0) {
      html += `<details style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;"><summary style="font-weight: bold; cursor: pointer; outline: none;">Nawierty (Aktywna)</summary><ul class="parts-list" style="margin-top: 10px; padding-left: 0; list-style: none;">`;
      let currentDrawerIndex = 1;
      mountingData.forEach((item) => {
        if (item.type === 'door') {
          const sidePl = item.side === 'left' ? 'Lewe' : 'Prawe';
          const holesHtml = item.hinges.map(h => `Oś Y: <b>${h.y.toFixed(1)} mm</b>`).join('<br>');
          html += `<li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;"><strong>${escapeHtml(item.name)} (${sidePl})</strong><br><div style="margin-top: 4px; color: #1e293b;">Liczba zawiasów: <b>${item.hinges.length} szt.</b></div><div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;"><b>Prowadniki:</b><br>${holesHtml}</div></li>`;
        } else if (item.type === 'drawer') {
          let slideY = item.slideSideHoles && item.slideSideHoles.length > 0 ? item.slideSideHoles[0].y : "Brak";
          let frontHolesHtml = item.frontHoles ? item.frontHoles.map(h => `Y: <b>${Number(h.y).toFixed(1)} mm</b>`).join('<br>') : "";
          html += `<li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;"><strong>Szuflada ${currentDrawerIndex}</strong><br><div style="margin-top: 4px; color: #1e293b;">Oś prowadnicy: <b>${slideY !== "Brak" ? slideY + ' mm' : 'Brak'}</b></div><div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;"><b>Front (od dołu):</b><br>${frontHolesHtml}</div></li>`;
          currentDrawerIndex++;
        }
      });
      html += `</ul></details>`;
    }
  }

  if (state.project.modules.length > 0) {
    html += `<details style="background: #fffbeb; padding: 10px; border-radius: 6px; border: 1px solid #fcd34d;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none; color: #92400e;"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Lista zakupów (Okucia)</summary>`;
    html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 20px;">`;
    
    if (projectHardware.length === 0) {
      html += `<li style="font-size: 11px; color: #b45309;">Brak zdefiniowanych okuć w projekcie.</li>`;
    } else {
      projectHardware.forEach(hw => {
        html += `<li style="margin-bottom: 6px; font-size: 12px; color: #78350f;"><strong>${escapeHtml(hw.name)}</strong><br><span style="color: #92400e;">Ilość: <b>${hw.qty} ${escapeHtml(hw.unit)}</b></span></li>`;
      });
    }
    html += `</ul></details>`;
  }

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

  const btnAddSidePanel = document.getElementById('btn-add-side-panel');
  if (btnAddSidePanel) {
    btnAddSidePanel.addEventListener('click', () => { addSidePanel(); initPropertiesPanel(); update3D(); updateSidebar(); });
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

 const printBtn = document.getElementById('btn-print-2d');
  if (printBtn && activeMod) {
    printBtn.addEventListener('click', () => openTechnicalDrawing());
  }

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => openCsvExport());
  }

  const exportHardwareBtn = document.getElementById('btn-export-hardware');
  if (exportHardwareBtn) {
    exportHardwareBtn.addEventListener('click', () => printHardwareList());
  }

  const productionBtn = document.getElementById('btn-production');
  if (productionBtn) productionBtn.addEventListener('click', () => openProductionHub());

  const cutPlanBtn = document.getElementById('btn-cutplan');
  if (cutPlanBtn) {
    cutPlanBtn.addEventListener('click', () => {
      openCutPlanModal();
    });
  }

  const kosztorysBtn = document.getElementById('btn-kosztorys');
  if (kosztorysBtn) {
    kosztorysBtn.addEventListener('click', () => {
      openKosztorysModal();
    });
  }
}