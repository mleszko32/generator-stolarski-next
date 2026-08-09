// src/ui/sidebar.js
import { calculateParts, calculateAllProjectParts, calculateProjectHardware } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js"; 
import { state, getActiveModule, addModule, deleteModule, duplicateModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";

// Funkcje pomocnicze do ładowania
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
    l.innerHTML = `<div>🪄 ${msg}</div><div style="font-size:14px; margin-top:15px; color:#94a3b8;">To potrwa kilkanaście sekund. Twój układ jest w drodze!</div>`;
    l.style.display = 'flex';
}

function hideLoading() {
    const l = document.getElementById('ai-loader');
    if(l) l.style.display = 'none';
}

export function updateSidebar() {
  const leftSidebar = document.querySelector(".sidebar-left");
  const { parts, mountingData } = calculateParts(); 
  const activeMod = getActiveModule();
  const projectHardware = calculateProjectHardware();
  
  let html = `
    <h2 style="font-size: 14px; margin-bottom: 10px; color: #1e293b;">Lista Szafek (Moduły)</h2>
    <div style="margin-bottom: 15px;">
  `;

  // NOWY PRZYCISK AI W GŁÓWNYM MENU
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
        👁️ Pokaż całą zabudowę (3D)
      </div>
    `;

    state.project.modules.forEach(m => {
      const isActive = m.id === state.activeModuleId;
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
          📊 Formatki CSV
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
      state.activeModuleId = e.currentTarget.getAttribute('data-id');
      initPropertiesPanel();  update3D(); updateSidebar();       
    });
  });

  const setupAddBtn = (id, type) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { addModule(type); initPropertiesPanel();  update3D(); updateSidebar(); });
  };
  setupAddBtn('btn-add-base', 'base_cabinet'); setupAddBtn('btn-add-upper', 'upper_cabinet'); setupAddBtn('btn-add-tall', 'tall_cabinet');

  // --- LOGIKA AI (Import ze zdjęcia) ---
  const btnAi = document.getElementById('btn-import-ai');
  const inputAi = document.getElementById('input-ai-image');

  if (btnAi && inputAi) {
      btnAi.addEventListener('click', () => {
          // Używamy zdiagnozowanego modelu 1.5 Pro
          let key = localStorage.getItem('gemini_api_key');
          if (!key) {
              key = window.prompt("Podaj klucz API Google Gemini (AIza...):");
              if (!key) return;
              localStorage.setItem('gemini_api_key', key.trim());
          }
          inputAi.click();
      });

      inputAi.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const key = localStorage.getItem('gemini_api_key');
          const mimeType = file.type;

          showLoading("Rozszyfrowuję Twój projekt...");

          const reader = new FileReader();
          reader.onload = async (ev) => {
              const base64Image = ev.target.result.split(',')[1];

              try {
                  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`;
                  
                  const promptText = `
                  Jesteś ekspertem stolarstwa. Przeanalizuj odręczny szkic szafek/modułów.
                  Zwróć WYŁĄCZNIE tablicę JSON, gdzie każdy obiekt to osobny moduł (szafka), czytając szkic od LEWEJ do PRAWEJ.
                  
                  Wymagany format wyjściowy:
                  [
                    {
                      "name": "Nazwa szafki",
                      "type": "base_cabinet", // Opcje: "base_cabinet", "upper_cabinet", "tall_cabinet"
                      "width": 600, // Zgadnij jeśli nie ma cyfr.
                      "height": 720, // Baza to zazwyczaj 720, słupek 2000, wisząca 720
                      "drawers": 0, // Ile ma szuflad od frontu? Podaj liczbę.
                      "doors": 2 // Ile ma drzwi na froncie? (1 lub 2). Daj 0 jeśli to same szuflady.
                    }
                  ]
                  
                  Nie dodawaj żadnego innego tekstu, żadnych znaczników. Tylko surowy JSON zaczynający się od znaku '['.
                  `;

                  const payload = {
                      contents: [{ parts: [
                          { text: promptText }, 
                          { inline_data: { mime_type: mimeType, data: base64Image } }
                      ]}]
                  };

                  const response = await fetch(apiUrl, { 
                      method: "POST", 
                      headers: { "Content-Type": "application/json" }, 
                      body: JSON.stringify(payload) 
                  });
                  const data = await response.json();
                  
                  if (data.error) throw new Error(data.error.message);
                  
                  const rawJson = data.candidates[0].content.parts[0].text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                  const aiModules = JSON.parse(rawJson);
                  
                  // Budujemy szafki w State na podstawie JSONa
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
                      
                      currentX += w + 50; // Dodajemy 5 cm przerwy dla czytelności po wrzuceniu

                      const baseMinY = 18;
                      const baseMaxY = h - 18;
                      const bZone = { minX: 18, maxX: w - 18, minY: baseMinY, maxY: baseMaxY, offsetBottom: 0, offsetTop: 0 };

                      // Wrzucamy elementy na bazie rozpoznania AI
                      if (aiMod.drawers && aiMod.drawers > 0) {
                          for(let i = 0; i < aiMod.drawers; i++) {
                              mod.elements.push({
                                  id: 'front-' + Date.now() + Math.random().toString(36).substr(2,5),
                                  typ: 'front', subtype: 'szuflada',
                                  baseZone: { ...bZone },
                                  frontCount: aiMod.drawers, distribution: "1", frontIndex: i, gap: parseFloat(state.project.front?.gap) || 3, forceVariant: 'auto', forceNL: null
                              });
                          }
                      } else if (aiMod.doors && aiMod.doors > 1) {
                          mod.elements.push({ id: 'front-L-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 0, gap: parseFloat(state.project.front?.gap) || 3 });
                          mod.elements.push({ id: 'front-P-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 1, gap: parseFloat(state.project.front?.gap) || 3 });
                      } else {
                          mod.elements.push({ id: 'front-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi', baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: parseFloat(state.project.front?.gap) || 3, openingSide: 'left' });
                      }
                      return mod;
                  });

                  // Zapis do systemu
                  state.project.modules.push(...generatedModules);
                  hideLoading();
                  initPropertiesPanel();
                  updateSidebar();
                  update3D();
                  
              } catch(err) {
                  hideLoading();
                  alert("⚠️ Sztuczna Inteligencja napotkała problem: " + err.message);
              }
              // Resetujemy input żeby można było wybrać ten sam plik drugi raz
              inputAi.value = "";
          };
          reader.readAsDataURL(file);
      });
  }

  const printBtn = document.getElementById('btn-print-2d');
  if (printBtn && activeMod) {
    printBtn.addEventListener('click', () => {
      try {
          const sidePanel = parts.find(p => p.name.toLowerCase().includes('bok'));
          let drawHeight = sidePanel ? sidePanel.length : (parseFloat(activeMod.dimensions.height) || 720);
          let drawDepth = sidePanel ? sidePanel.width : (parseFloat(activeMod.dimensions.depth) || 510);
          
          const viewModeSelect = document.getElementById('print-view-mode');
          const viewMode = viewModeSelect ? viewModeSelect.value : 'all';

          const svgContent = generateSidePanelSVG(drawHeight, drawDepth, mountingData || [], viewMode);
          
          const htmlContent = `
            <!DOCTYPE html>
            <html lang="pl">
            <head>
                <meta charset="UTF-8">
                <title>Wydruk na produkcję</title>
                <style>
                    body { margin: 0; padding: 0; background-color: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; } 
                    .header { background-color: #ffffff; padding: 16px 24px; border-bottom: 1px solid #cbd5e1; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); z-index: 10; display: flex; justify-content: space-between; align-items: center; } 
                    .header-text h1 { margin: 0 0 6px 0; font-size: 20px; color: #0f172a; } 
                    .header-text p { margin: 0; font-size: 13px; color: #64748b; } 
                    .controls { display: flex; flex-wrap: wrap; gap: 12px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: bold; color: #334155; }
                    .controls label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
                    .controls input { cursor: pointer; width: 16px; height: 16px; }
                    .svg-container { flex-grow: 1; width: 100%; height: 100%; overflow: hidden; background-color: #f8fafc; cursor: grab; } 
                    .svg-container:active { cursor: grabbing; }
                    @media print { 
                        body { height: auto; overflow: visible; display: block; background: white; } 
                        .header { display: none; } 
                        .svg-container { display: block; overflow: visible; background: white; } 
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-text">
                        <h1>Rysunek techniczny (Nawierty)</h1>
                        <p>Wymiary liczone od krawędzi i bazy. <b>Przeciągaj LKM</b> (przesunięcie) | <b>Kółko myszy</b> (Zoom).</p>
                    </div>
                    <div class="controls">
                        <label style="color:#9333ea;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-corpus', this)"> Konstrukcja (Wieńce/Stałe)</label>
                        <label style="color:#f59e0b;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-shelf', this)"> Podpórki (Ruchome)</label>
                        <label style="color:#16a34a;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-hinge', this)"> Zawiasy i Prowadniki</label>
                        <label style="color:#0284c7;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-drawer', this)"> Prowadnice Szuflad</label>
                        <label style="color:#dc2626;"><input type="checkbox" checked onchange="toggleLayer('layer-front-holes', this)"> Mocowania Frontów</label>
                    </div>
                </div>
                <div class="svg-container" id="svg-viewport">
                    ${svgContent}
                </div>
                <script>
                    function toggleLayer(layerName, checkbox) {
                        const elements = document.querySelectorAll('.' + layerName);
                        elements.forEach(el => { el.style.display = checkbox.checked ? '' : 'none'; });
                    }
                    const svg = document.getElementById('side-panel-svg');
                    let isPanning = false; let startPoint = { x: 0, y: 0 }; let startViewBox = { x: 0, y: 0 };
                    document.body.style.userSelect = 'none';
                    svg.addEventListener('mousedown', (e) => {
                        isPanning = true; startPoint = { x: e.clientX, y: e.clientY };
                        startViewBox = { x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y }; svg.style.cursor = 'grabbing';
                    });
                    window.addEventListener('mousemove', (e) => {
                        if (!isPanning) return; const CTM = svg.getScreenCTM();
                        const dx = (e.clientX - startPoint.x) / CTM.a; const dy = (e.clientY - startPoint.y) / CTM.d;
                        svg.viewBox.baseVal.x = startViewBox.x - dx; svg.viewBox.baseVal.y = startViewBox.y - dy;
                    });
                    window.addEventListener('mouseup', () => { isPanning = false; svg.style.cursor = 'grab'; });
                    window.addEventListener('mouseleave', () => { isPanning = false; svg.style.cursor = 'grab'; });
                    svg.addEventListener('wheel', (e) => {
                        e.preventDefault(); const zoom = e.deltaY > 0 ? 1.1 : 0.9; const pt = svg.createSVGPoint();
                        pt.x = e.clientX; pt.y = e.clientY; const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                        svg.viewBox.baseVal.x = svgP.x - (svgP.x - svg.viewBox.baseVal.x) * zoom;
                        svg.viewBox.baseVal.y = svgP.y - (svgP.y - svg.viewBox.baseVal.y) * zoom;
                        svg.viewBox.baseVal.width *= zoom; svg.viewBox.baseVal.height *= zoom;
                    }, { passive: false });
                </script>
            </body>
            </html>`;

          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          window.open(URL.createObjectURL(blob), '_blank');
      } catch (err) {
          console.error("Błąd generowania rysunku:", err);
          alert("Wystąpił błąd podczas generowania SVG: " + err.message);
      }
    });
  }

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const allParts = calculateAllProjectParts();
      if(allParts.length === 0) return;
      let csvContent = "\uFEFFNazwa;Dlugosc(mm);Szerokosc(mm);Ilosc;Zrodlo\n";
      allParts.forEach(part => { csvContent += `"${part.name}";${part.length};${part.width};${part.qty};"${part.modules.join(" + ")}"\n`; });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Formatki_${state.project.name.replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}