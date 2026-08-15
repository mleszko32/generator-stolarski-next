// src/ui/sidebar.js
import { calculateParts, calculateAllProjectParts, calculateProjectHardware } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js"; 
import { state, getActiveModule, addModule, deleteModule, duplicateModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";

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
    l.innerHTML = `<div>🪄 ${msg}</div><div style="font-size:14px; margin-top:15px; color:#94a3b8;">Sztuczna Inteligencja rozrysowuje wnęki i półki. Cierpliwości...</div>`;
    l.style.display = 'flex';
}

function hideLoading() {
    const l = document.getElementById('ai-loader');
    if(l) l.style.display = 'none';
}

function openCsvEditorModal(partsList) {
    const catOrder = { 'Korpus': 1, 'Front': 2, 'Szuflada': 3, 'Plecy': 4, 'Inne': 5 };
    partsList.sort((a, b) => (catOrder[a.category] || 99) - (catOrder[b.category] || 99));

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        backgroundColor: '#fff', width: '95%', maxWidth: '900px', maxHeight: '90vh',
        borderRadius: '8px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
    });

    const header = document.createElement('div');
    header.innerHTML = `<h2 style="margin:0 0 15px 0; color:#1e293b;">Menedżer formatek (Pre-flight)</h2>`;
    
    const tableContainer = document.createElement('div');
    Object.assign(tableContainer.style, { overflowY: 'auto', flexGrow: '1', marginBottom: '15px' });

    let tableHtml = `
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
        <thead style="background: #f8fafc; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <tr>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Kategoria</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Nazwa elementu</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 90px;">Dł. (mm)</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 90px;">Szer. (mm)</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 70px;">Ilość</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Źródło / Szafki</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 50px;">Usuń</th>
          </tr>
        </thead>
        <tbody id="csv-editor-tbody">
    `;

    partsList.forEach((p, idx) => {
        let catColor = '#94a3b8';
        if(p.category === 'Korpus') catColor = '#3b82f6';
        if(p.category === 'Front') catColor = '#8b5cf6';
        if(p.category === 'Szuflada') catColor = '#f59e0b';
        if(p.category === 'Plecy') catColor = '#10b981';

        tableHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
            <td style="padding: 6px;"><input type="text" value="${p.category || 'Inne'}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-weight:bold; color:${catColor};"></td>
            <td style="padding: 6px;"><input type="text" value="${p.name}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.length}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.width}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.qty}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="text" value="${p.modules.join(' + ')}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-size:11px; color:#64748b;"></td>
            <td style="padding: 6px; text-align:center;"><button class="btn-del-row" style="background:#ef4444; color:white; border:none; border-radius:3px; cursor:pointer; padding:4px 8px;">❌</button></td>
          </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' });
    
    footer.innerHTML = `
        <button id="csv-btn-add" style="background:#3b82f6; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">➕ Dodaj pusty wiersz</button>
        <div style="display: flex; gap: 10px; align-items: center;">
            <select id="csv-export-filter" style="padding: 9px; border-radius: 5px; border: 1px solid #cbd5e1; font-weight: bold; color: #1e293b; cursor: pointer; background: #f8fafc; outline: none;">
                <option value="all">Zapisz wszystko (Całość)</option>
                <option value="Korpus">Tylko Korpusy</option>
                <option value="Front">Tylko Fronty</option>
                <option value="Szuflada">Tylko Szuflady</option>
                <option value="Plecy">Tylko Plecy (HDF)</option>
            </select>
            <button id="csv-btn-cancel" style="background:#94a3b8; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">Anuluj</button>
            <button id="csv-btn-save" style="background:#10b981; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">💾 Pobierz plik CSV</button>
        </div>
    `;

    modal.appendChild(header);
    modal.appendChild(tableContainer);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('csv-btn-add').addEventListener('click', () => {
        const tbody = document.getElementById('csv-editor-tbody');
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #e2e8f0";
        tr.innerHTML = `
            <td style="padding: 6px;"><input type="text" value="Inne" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-weight:bold; color:#ef4444;"></td>
            <td style="padding: 6px;"><input type="text" value="Nowa formatka" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="0" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="0" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="1" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="text" value="Ręcznie dodane" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-size:11px; color:#64748b;"></td>
            <td style="padding: 6px; text-align:center;"><button class="btn-del-row" style="background:#ef4444; color:white; border:none; border-radius:3px; cursor:pointer; padding:4px 8px;">❌</button></td>
        `;
        tbody.appendChild(tr);
        attachDeleteEvents();
    });

    function attachDeleteEvents() {
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = function() { this.closest('tr').remove(); };
        });
    }
    attachDeleteEvents();

    document.getElementById('csv-btn-cancel').addEventListener('click', () => { document.body.removeChild(overlay); });

    document.getElementById('csv-btn-save').addEventListener('click', () => {
        const filterMode = document.getElementById('csv-export-filter').value;
        let csvContent = "\uFEFFKategoria;Nazwa;Dlugosc(mm);Szerokosc(mm);Ilosc;Zrodlo\n";
        
        const rows = document.querySelectorAll('#csv-editor-tbody tr');
        rows.forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const cat = inputs[0].value.replace(/"/g, '""');
            
            if (filterMode !== 'all' && cat !== filterMode) {
                return; 
            }

            const name = inputs[1].value.replace(/"/g, '""');
            const len = inputs[2].value;
            const wid = inputs[3].value;
            const qty = inputs[4].value;
            const src = inputs[5].value.replace(/"/g, '""');
            
            csvContent += `"${cat}";"${name}";${len};${wid};${qty};"${src}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        
        const projName = state.project.name.replace(/\s+/g, '_');
        const fileNameSuffix = filterMode === 'all' ? 'Cale_Zlecenie' : filterMode;
        link.download = `Formatki_${fileNameSuffix}_${projName}.csv`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        document.body.removeChild(overlay);
    });
}

export function updateSidebar() {
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
          <button id="btn-import-ai" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #9333ea, #6366f1); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); transition: transform 0.1s;">
              🪄 Zbuduj projekt ze zdjęcia (AI)
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
        👁️ Odznacz wszystko
      </div>
    `;

    state.project.modules.forEach(m => {
      // ZMIANA: Obsługa multiselecta dla stylów
      const isActive = (state.selectedModules && state.selectedModules.has(m.id)) || m.id === state.activeModuleId;
      const bg = isActive ? '#3b82f6' : '#f8fafc';
      const color = isActive ? '#ffffff' : '#1e293b';
      const border = isActive ? '#2563eb' : '#cbd5e1';
      
      let icon = '🗄️';
      if (m.type === 'upper_cabinet') icon = '☁️';
      if (m.type === 'tall_cabinet') icon = '🚪';

      html += `
        <div class="module-item" data-id="${m.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background-color: ${bg}; color: ${color}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${border}; transition: all 0.2s;">
          <div style="flex-grow: 1; pointer-events: none;">
            ${icon} ${m.name} <span style="font-weight: normal; font-size: 11px; opacity: 0.8;">(${m.dimensions.width}x${m.dimensions.height})</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-mod-action btn-mod-dup" data-id="${m.id}" title="Kopiuj szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;">📋</button>
            <button class="btn-mod-action btn-mod-del" data-id="${m.id}" title="Usuń szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;">🗑️</button>
          </div>
        </div>
      `;
    });
  }

  html += `
      <div style="display: flex; gap: 4px; margin-top: 8px;">
        <button id="btn-add-base" style="flex: 1; padding: 6px; background-color: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;" title="Szafka dolna">➕ Dolna</button>
        <button id="btn-add-upper" style="flex: 1; padding: 6px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;" title="Szafka wisząca">➕ Wisząca</button>
        <button id="btn-add-tall" style="flex: 1; padding: 6px; background-color: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;" title="Słupek">➕ Słupek</button>
      </div>
    </div>
    <hr style="margin: 15px 0; border: 0; border-top: 1px dashed #cbd5e1;">
  `;

  if (state.project.modules.length > 0) {
    html += `
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        <div style="display: flex; gap: 6px;">
            <select id="print-view-mode" ${!activeMod ? 'disabled' : ''} style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 11px; background: white; outline: none; cursor: pointer;">
                <option value="all">Wszystko razem</option>
                <option value="korpus">Tylko Korpus</option>
                <option value="boki">Tylko Boki (L+P)</option>
                <option value="bokL">Tylko Bok Lewy</option>
                <option value="bokR">Tylko Bok Prawy</option>
                <option value="front">Tylko Fronty Zewn.</option>
                <option value="frontInner">Tylko Fronty Wewn.</option>
            </select>
            <button id="btn-print-2d" ${!activeMod ? 'disabled style="opacity: 0.5;"' : ''} style="flex: 1; padding: 8px; background-color: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">
              📄 Drukuj
            </button>
        </div>
        <button id="btn-export-csv" style="width: 100%; padding: 8px; background-color: #059669; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">
          📊 Menedżer Formatek (CSV)
        </button>
        <button id="btn-export-hardware" style="width: 100%; padding: 9px; background-color: #d97706; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          🛒 Pobierz listę zakupów (CSV)
        </button>
      </div>
    `;
    if (!activeMod) {
      html += `<div style="font-size: 11px; color: #ef4444; margin-top: -10px; margin-bottom: 15px; text-align: center;">Wybierz szafkę, aby wygenerować rysunek.</div>`;
    }
  }

  if (activeMod) {
    html += `<details open style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none;">Lista formatek (Aktywna)</summary>`;
    html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 20px;">`;
    parts.forEach(part => { html += `<li style="margin-bottom: 5px;"><strong>${part.name}</strong> (x${part.qty})<br><span style="color: #475569;">${part.length} mm x ${part.width} mm</span></li>`; });
    html += `</ul></details>`;

    if (mountingData && mountingData.length > 0) {
      html += `<details style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;"><summary style="font-weight: bold; cursor: pointer; outline: none;">Nawierty (Aktywna)</summary><ul class="parts-list" style="margin-top: 10px; padding-left: 0; list-style: none;">`;
      let currentDrawerIndex = 1;
      mountingData.forEach((item) => {
        if (item.type === 'door') {
          const sidePl = item.side === 'left' ? 'Lewe' : 'Prawe';
          const holesHtml = item.hinges.map(h => `Oś Y: <b>${h.y.toFixed(1)} mm</b>`).join('<br>');
          html += `<li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;"><strong>${item.name} (${sidePl})</strong><br><div style="margin-top: 4px; color: #1e293b;">Liczba zawiasów: <b>${item.hinges.length} szt.</b></div><div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;"><b>Prowadniki:</b><br>${holesHtml}</div></li>`;
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
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none; color: #92400e;">🛒 Lista zakupów (Okucia)</summary>`;
    html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 20px;">`;
    
    if (projectHardware.length === 0) {
      html += `<li style="font-size: 11px; color: #b45309;">Brak zdefiniowanych okuć w projekcie.</li>`;
    } else {
      projectHardware.forEach(hw => {
        html += `<li style="margin-bottom: 6px; font-size: 12px; color: #78350f;"><strong>${hw.name}</strong><br><span style="color: #92400e;">Ilość: <b>${hw.qty} ${hw.unit}</b></span></li>`;
      });
    }
    html += `</ul></details>`;
  }

  leftSidebar.innerHTML = html; 

  const btnShowAll = document.getElementById('btn-show-all');
  if (btnShowAll) {
    btnShowAll.addEventListener('click', () => {
      state.activeModuleId = null;
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

  // ZMIANA: Obsługa klawiszy Shift i Ctrl przy klikaniu szafki
  document.querySelectorAll('.module-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (!state.selectedModules) state.selectedModules = new Set();
          if (state.selectedModules.has(id)) {
              state.selectedModules.delete(id);
              if (state.activeModuleId === id) state.activeModuleId = Array.from(state.selectedModules).pop() || null;
          } else {
              state.selectedModules.add(id);
              state.activeModuleId = id;
          }
      } else {
          state.selectedModules = new Set([id]);
          state.activeModuleId = id;
      }
      
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

  // AI i reszta funkcji pozostaje bez zmian
  const btnAi = document.getElementById('btn-import-ai');
  const inputAi = document.getElementById('input-ai-image');

  if (btnAi && inputAi) {
      btnAi.addEventListener('click', () => { inputAi.click(); });
      inputAi.addEventListener('change', async (e) => { /* ... kod AI ... */ });
  }

  const printBtn = document.getElementById('btn-print-2d');
  if (printBtn && activeMod) {
    printBtn.addEventListener('click', () => { /* ... kod drukowania ... */ });
  }

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const allParts = calculateAllProjectParts();
      if(allParts.length === 0) {
          alert("Twój projekt jest pusty. Dodaj szafkę, aby wygenerować formatki.");
          return;
      }
      openCsvEditorModal(allParts);
    });
  }
}