// src/render/editor2d.js
import { state } from "../core/state.js";
import { updateSidebar } from "../ui/sidebar.js";
import { update3D } from "./viewer3d.js"; 

let isFrontsVisible2D = true;

if (!window.contextMenuListenerAdded) {
  document.addEventListener('click', (e) => {
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu && !existingMenu.contains(e.target)) {
      existingMenu.remove();
    }
  });
  window.contextMenuListenerAdded = true;
}

export function renderEditor2D() {
  const container = document.getElementById('editor-2d-container');
  if (!container) return;
  
  container.innerHTML = '';

  const mod = state.project.modules[0];
  const th = state.project.materials.boardThickness;
  const { width, height } = mod.dimensions;
  
  const f = state.project.front || { active: true, type: 'nakladane', clearance: { sides: 2, top: 2, bottom: 2 } };
  const fc = f.clearance || { sides: 2, top: 2, bottom: 2 };

  // --- KOTWICZENIE FRONTÓW I ZAAWANSOWANY PODZIAŁ SZUFLAD ---
  if (mod.elements) {
    mod.elements.forEach(el => {
      if (el.typ === 'front' && el.baseZone) {
        
        if (el.baseZone.boundBottom) {
          const getBound = (id, type, fallback) => {
            if (id === 'cab-left') return th;
            if (id === 'cab-right') return width - th;
            if (id === 'cab-bottom') return th;
            if (id === 'cab-top') return height - th;
            
            const found = mod.elements.find(e => e.id === id);
            if (found) {
              if (type === 'minX') return found.x + found.w;
              if (type === 'maxX') return found.x;
              if (type === 'minY') return found.y + found.h;
              if (type === 'maxY') return found.y;
            }
            return fallback;
          };

          el.baseZone.minX = getBound(el.baseZone.boundLeft, 'minX', el.baseZone.minX);
          el.baseZone.maxX = getBound(el.baseZone.boundRight, 'maxX', el.baseZone.maxX);
          el.baseZone.minY = getBound(el.baseZone.boundBottom, 'minY', el.baseZone.minY);
          el.baseZone.maxY = getBound(el.baseZone.boundTop, 'maxY', el.baseZone.maxY);
        }

        const isInset = f.type === 'wpuszczane';
        const { minX, maxX, minY, maxY } = el.baseZone;

        let startX, totalW, startY, totalH;

        if (isInset) {
          startX = minX + fc.sides;
          totalW = (maxX - minX) - (fc.sides * 2);
          startY = minY + fc.bottom;
          totalH = (maxY - minY) - fc.bottom - fc.top;
        } else {
          const isLeftOuter = minX <= th + 1; 
          const isRightOuter = maxX >= width - th - 1;
          const isBottomOuter = minY <= th + 1;
          const isTopOuter = maxY >= height - th - 1;

          const overLeft = isLeftOuter ? th - fc.sides : (th / 2) - (el.gap / 2);
          const overRight = isRightOuter ? th - fc.sides : (th / 2) - (el.gap / 2);
          const overBottom = isBottomOuter ? th - fc.bottom : (th / 2) - (el.gap / 2);
          const overTop = isTopOuter ? th - fc.top : (th / 2) - (el.gap / 2);

          startX = minX - overLeft;
          totalW = (maxX - minX) + overLeft + overRight;
          startY = minY - overBottom;
          totalH = (maxY - minY) + overBottom + overTop;
        }

        // Nowa, zaawansowana logika podziału szuflad (z parserem 1:1:141)
        if (el.subtype === 'szuflada') {
          // Fallback na wypadek gdybyś miał zapisane starsze formatki tylko jako liczby
          const distributionStr = String(el.distribution || el.frontCount || "1").trim();
          
          let parsedZones = [];
          if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
            const count = parseInt(distributionStr, 10);
            for (let i = 0; i < count; i++) parsedZones.push({ type: 'fr', value: 1 });
          } else {
            const separator = distributionStr.includes(':') ? ':' : ',';
            parsedZones = distributionStr.split(separator).map(s => {
              let zone = s.trim();
              if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
              const val = parseFloat(zone);
              // Jeśli wartość > 10, traktujemy jako milimetry (wymiar stały)
              return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
            });
          }

          const count = parsedZones.length;
          const totalGaps = el.gap * (count - 1);
          let availableHeight = totalH - totalGaps;

          let fixedTotal = 0;
          let frTotal = 0;
          parsedZones.forEach(z => {
            if (z.type === 'fixed') fixedTotal += z.value;
            if (z.type === 'fr') frTotal += z.value;
          });

          availableHeight -= fixedTotal;
          const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

          // Obliczamy fizyczną wysokość Y od dołu strefy aż do konkretnej szuflady
          let currentY = startY;
          for (let i = 0; i < el.frontIndex; i++) {
            const z = parsedZones[i];
            const h = z.type === 'fixed' ? z.value : z.value * singleFrValue;
            currentY += h + el.gap;
          }

          const myZone = parsedZones[el.frontIndex];
          const myHeight = myZone.type === 'fixed' ? myZone.value : myZone.value * singleFrValue;

          el.x = startX; 
          el.w = totalW;
          el.y = currentY; 
          el.h = myHeight;

        } else if (el.subtype === 'drzwi') {
          el.x = startX; el.w = totalW;
          el.y = startY; el.h = totalH;
        } else if (el.subtype === 'drzwi-lp') {
          const centerGap = el.gap || 3;
          const singleW = (totalW - centerGap) / 2;
          el.w = singleW; el.h = totalH; el.y = startY;
          el.x = el.frontIndex === 0 ? startX : startX + singleW + centerGap; 
        }
      }
    });
  }

  // PRZYCISK: Ukryj / Pokaż fronty w 2D
  const toggleFrontsBtn = document.createElement('button');
  toggleFrontsBtn.innerHTML = isFrontsVisible2D ? '👁️ Ukryj fronty (2D)' : '👁️‍🗨️ Pokaż fronty (2D)';
  toggleFrontsBtn.style.position = 'absolute';
  toggleFrontsBtn.style.top = '10px';
  toggleFrontsBtn.style.right = '10px';
  toggleFrontsBtn.style.padding = '6px 12px';
  toggleFrontsBtn.style.backgroundColor = isFrontsVisible2D ? '#f8fafc' : '#e2e8f0';
  toggleFrontsBtn.style.border = '1px solid #cbd5e1';
  toggleFrontsBtn.style.borderRadius = '4px';
  toggleFrontsBtn.style.cursor = 'pointer';
  toggleFrontsBtn.style.fontSize = '12px';
  toggleFrontsBtn.style.fontWeight = 'bold';
  toggleFrontsBtn.style.color = '#334155';
  toggleFrontsBtn.style.zIndex = '50';
  
  toggleFrontsBtn.onclick = () => {
    isFrontsVisible2D = !isFrontsVisible2D;
    renderEditor2D();
  };
  container.appendChild(toggleFrontsBtn);

  const hint = document.createElement('div');
  hint.style.position = 'absolute';
  hint.style.top = '10px'; hint.style.left = '10px';
  hint.style.color = '#64748b'; hint.style.fontSize = '12px';
  hint.style.pointerEvents = 'none';
  hint.innerHTML = '<b>LPM na pustej przestrzeni:</b> Dodaj półki / fronty <br><b>LPM na elemencie:</b> Edytuj / Usuń';
  container.appendChild(hint);

  const padding = 60;
  const scale = Math.min(
    (container.clientWidth - padding) / width,
    (container.clientHeight - padding) / height
  );

  const cabinetDiv = document.createElement('div');
  cabinetDiv.style.position = 'relative';
  cabinetDiv.style.width = `${width}px`; cabinetDiv.style.height = `${height}px`;
  cabinetDiv.style.transform = `scale(${scale})`; cabinetDiv.style.transformOrigin = 'center center';
  
  const createPart = (x, y, w, h, color) => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = `${x}px`; div.style.bottom = `${y}px`; 
    div.style.width = `${w}px`; div.style.height = `${h}px`;
    div.style.backgroundColor = color; div.style.border = '1px solid #1e293b';
    div.style.boxSizing = 'border-box';
    return div;
  };

  cabinetDiv.appendChild(createPart(0, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(width - th, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, 0, width - th*2, th, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, height - th, width - th*2, th, '#cbd5e1')); 

  // --- RYSOWANIE ELEMENTÓW ---
  mod.elements.forEach(plyta => {
    const isFront = plyta.typ === 'front';

    if (isFront && !isFrontsVisible2D) return;

    const defaultColor = isFront ? 'rgba(59, 130, 246, 0.3)' : '#64748b';
    const hoverColor = isFront ? 'rgba(59, 130, 246, 0.6)' : '#94a3b8';
    
    const div = createPart(plyta.x, plyta.y, plyta.w, plyta.h, defaultColor);
    div.style.cursor = 'pointer'; div.style.transition = 'background-color 0.1s ease';
    
    if (isFront) {
      div.style.border = '1px dashed #2563eb';
      div.style.zIndex = '10';
    }

    div.onmouseenter = () => div.style.backgroundColor = hoverColor; 
    div.onmouseleave = () => div.style.backgroundColor = defaultColor;

    div.onclick = (e) => {
      e.stopPropagation(); 
      
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.position = 'fixed'; 
      menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
      menu.style.backgroundColor = '#ffffff'; menu.style.border = '1px solid #cbd5e1';
      menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; menu.style.borderRadius = '6px';
      menu.style.padding = '4px'; menu.style.zIndex = '1000'; menu.style.minWidth = '180px';
      menu.style.fontFamily = 'sans-serif';

      if (!isFront) {
        const propertiesBtn = document.createElement('div');
        propertiesBtn.innerHTML = '📏 Ustaw wymiar (światło)';
        propertiesBtn.style.padding = '8px 12px'; propertiesBtn.style.cursor = 'pointer';
        propertiesBtn.style.fontSize = '14px'; propertiesBtn.style.color = '#1e293b'; propertiesBtn.style.borderRadius = '4px';
        propertiesBtn.onmouseenter = () => propertiesBtn.style.backgroundColor = '#f1f5f9';
        propertiesBtn.onmouseleave = () => propertiesBtn.style.backgroundColor = 'transparent';
        
        propertiesBtn.onclick = (propEvent) => {
          propEvent.stopPropagation();
          menu.innerHTML = ''; menu.style.padding = '12px'; menu.style.width = '220px';

          const localObstacles = [
            ...mod.elements.filter(el => el.id !== plyta.id && el.typ !== 'front'),
            { id: 'cab-left', x: 0, y: 0, w: th, h: height }, 
            { id: 'cab-right', x: width - th, y: 0, w: th, h: height },
            { id: 'cab-bottom', x: 0, y: 0, w: width, h: th },
            { id: 'cab-top', x: 0, y: height - th, w: width, h: th }
          ];

          let limit1, limit2, label1, label2;
          let currentSpace1, currentSpace2;

          if (plyta.typ === 'poziom') {
            let nearestBelow = 0; let nearestAbove = height;
            const centerX = plyta.x + (plyta.w / 2);

            localObstacles.forEach(obs => {
              if (obs.x < centerX && (obs.x + obs.w) > centerX) {
                if (obs.y + obs.h <= plyta.y && obs.y + obs.h > nearestBelow) nearestBelow = obs.y + obs.h;
                if (obs.y >= plyta.y + plyta.h && obs.y < nearestAbove) nearestAbove = obs.y;
              }
            });

            limit1 = nearestBelow; limit2 = nearestAbove;
            currentSpace1 = Math.round(plyta.y - nearestBelow);
            currentSpace2 = Math.round(nearestAbove - (plyta.y + plyta.h));
            label1 = 'Światło poniżej [mm]:'; label2 = 'Światło powyżej [mm]:';
          } else {
            let nearestLeft = 0; let nearestRight = width;
            const centerY = plyta.y + (plyta.h / 2);

            localObstacles.forEach(obs => {
              if (obs.y < centerY && (obs.y + obs.h) > centerY) {
                if (obs.x + obs.w <= plyta.x && obs.x + obs.w > nearestLeft) nearestLeft = obs.x + obs.w;
                if (obs.x >= plyta.x + plyta.w && obs.x < nearestRight) nearestRight = obs.x;
              }
            });

            limit1 = nearestLeft; limit2 = nearestRight;
            currentSpace1 = Math.round(plyta.x - nearestLeft);
            currentSpace2 = Math.round(nearestRight - (plyta.x + plyta.w));
            label1 = 'Światło z lewej [mm]:'; label2 = 'Światło z prawej [mm]:';
          }

          const totalAvailableSpace = limit2 - limit1 - (plyta.typ === 'poziom' ? plyta.h : plyta.w);

          const createInput = (labelText, value) => {
            const wrap = document.createElement('div'); wrap.style.marginBottom = '8px';
            const lbl = document.createElement('div'); lbl.style.fontSize = '12px'; lbl.style.fontWeight = 'bold'; lbl.innerText = labelText;
            const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.5'; inp.value = value;
            inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; inp.style.padding = '6px';
            inp.style.marginTop = '4px'; inp.style.border = '1px solid #cbd5e1'; inp.style.borderRadius = '4px';
            wrap.appendChild(lbl); wrap.appendChild(inp); return { wrap, inp };
          };

          const input1 = createInput(label1, currentSpace1);
          const input2 = createInput(label2, currentSpace2);

          input1.inp.oninput = () => { input2.inp.value = Math.max(0, totalAvailableSpace - (parseFloat(input1.inp.value) || 0)); };
          input2.inp.oninput = () => { input1.inp.value = Math.max(0, totalAvailableSpace - (parseFloat(input2.inp.value) || 0)); };

          const centerBtn = document.createElement('button');
          centerBtn.innerText = '⬌ Ustaw na środku';
          centerBtn.style.width = '100%'; centerBtn.style.padding = '6px'; centerBtn.style.marginBottom = '12px';
          centerBtn.style.backgroundColor = '#f1f5f9'; centerBtn.style.color = '#334155';
          centerBtn.style.border = '1px solid #cbd5e1'; centerBtn.style.borderRadius = '4px';
          centerBtn.style.cursor = 'pointer'; centerBtn.style.fontSize = '12px'; centerBtn.style.fontWeight = 'bold';
          
          centerBtn.onclick = (centerEvent) => {
            centerEvent.stopPropagation();
            const half = Number((totalAvailableSpace / 2).toFixed(1));
            input1.inp.value = half; input2.inp.value = half;
          };

          const saveBtn = document.createElement('button');
          saveBtn.innerText = 'Zastosuj wymiar';
          saveBtn.style.width = '100%'; saveBtn.style.padding = '8px'; saveBtn.style.backgroundColor = '#2563eb';
          saveBtn.style.color = 'white'; saveBtn.style.border = 'none'; saveBtn.style.borderRadius = '4px';
          saveBtn.style.cursor = 'pointer'; saveBtn.style.fontWeight = 'bold';

          saveBtn.onclick = (saveEvent) => {
            saveEvent.stopPropagation();
            const finalSpace1 = parseFloat(input1.inp.value) || 0;

            if (plyta.typ === 'poziom') {
              plyta.y = limit1 + finalSpace1;
              let minX = 0; let maxX = width;
              const fakeMouseY = plyta.y + (th / 2);
              localObstacles.forEach(obs => {
                if (obs.y < fakeMouseY && (obs.y + obs.h) > fakeMouseY) {
                  const centerX = plyta.x + (plyta.w / 2);
                  if (obs.x + obs.w <= centerX && obs.x + obs.w > minX) minX = obs.x + obs.w;
                  if (obs.x >= centerX && obs.x < maxX) maxX = obs.x;
                }
              });
              plyta.x = minX; plyta.w = maxX - minX;
            } else {
              plyta.x = limit1 + finalSpace1;
              let minY = 0; let maxY = height;
              const fakeMouseX = plyta.x + (th / 2);
              localObstacles.forEach(obs => {
                if (obs.x < fakeMouseX && (obs.x + obs.w) > fakeMouseX) {
                  const centerY = plyta.y + (plyta.h / 2);
                  if (obs.y + obs.h <= centerY && obs.y + obs.h > minY) minY = obs.y + obs.h;
                  if (obs.y >= centerY && obs.y < maxY) maxY = obs.y; 
                }
              });
              plyta.y = minY; plyta.h = maxY - minY;
            }

            menu.remove(); renderEditor2D(); update3D(); updateSidebar();
          };

          menu.appendChild(input1.wrap); menu.appendChild(input2.wrap);
          menu.appendChild(centerBtn); menu.appendChild(saveBtn);
        };
        menu.appendChild(propertiesBtn);
      }

      const deleteBtn = document.createElement('div');
      deleteBtn.innerHTML = isFront ? '🗑️ Usuń front' : '🗑️ Usuń element';
      deleteBtn.style.padding = '8px 12px'; deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '14px'; deleteBtn.style.borderRadius = '4px'; deleteBtn.style.marginTop = '4px';
      deleteBtn.onmouseenter = () => deleteBtn.style.backgroundColor = '#fee2e2'; 
      deleteBtn.onmouseleave = () => deleteBtn.style.backgroundColor = 'transparent';
      
      deleteBtn.onclick = (deleteEvent) => {
        deleteEvent.stopPropagation(); 
        mod.elements = mod.elements.filter(el => el.id !== plyta.id);
        menu.remove(); renderEditor2D(); update3D(); updateSidebar();
      };

      menu.appendChild(deleteBtn); document.body.appendChild(menu);
    };

    cabinetDiv.appendChild(div);
  });

  // --- OBSŁUGA KLIKNIĘCIA W PUSTĄ PRZESTRZEŃ ---
  cabinetDiv.onclick = (e) => {
    e.stopPropagation();
    if (e.target !== cabinetDiv) return;

    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) { existingMenu.remove(); return; }

    const rect = cabinetDiv.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (rect.bottom - e.clientY) / scale;
    
    const obstacles = [
      ...mod.elements.filter(el => el.typ !== 'front'),
      { id: 'cab-left', x: 0, y: 0, w: th, h: height }, 
      { id: 'cab-right', x: width - th, y: 0, w: th, h: height },
      { id: 'cab-bottom', x: 0, y: 0, w: width, h: th },
      { id: 'cab-top', x: 0, y: height - th, w: width, h: th }
    ];

    let minX = 0, maxX = width, minY = 0, maxY = height;
    let boundLeft = 'cab-left', boundRight = 'cab-right', boundBottom = 'cab-bottom', boundTop = 'cab-top';
    
    obstacles.forEach(obs => {
      if (obs.y < mouseY && (obs.y + obs.h) > mouseY) {
        if (obs.x + obs.w <= mouseX && obs.x + obs.w > minX) { minX = obs.x + obs.w; boundLeft = obs.id; }
        if (obs.x >= mouseX && obs.x < maxX) { maxX = obs.x; boundRight = obs.id; }
      }
      if (obs.x < mouseX && (obs.x + obs.w) > mouseX) {
        if (obs.y + obs.h <= mouseY && obs.y + obs.h > minY) { minY = obs.y + obs.h; boundBottom = obs.id; }
        if (obs.y >= mouseY && obs.y < maxY) { maxY = obs.y; boundTop = obs.id; }
      }
    });

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.position = 'fixed'; 
    menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    menu.style.backgroundColor = '#ffffff'; menu.style.border = '1px solid #cbd5e1';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; menu.style.borderRadius = '6px';
    menu.style.padding = '4px'; menu.style.zIndex = '1000'; menu.style.minWidth = '200px';
    menu.style.fontFamily = 'sans-serif';

    const createMenuOption = (text, icon) => {
      const btn = document.createElement('div');
      btn.innerHTML = `${icon} ${text}`;
      btn.style.padding = '8px 12px'; btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px'; btn.style.color = '#1e293b'; btn.style.borderRadius = '4px';
      btn.onmouseenter = () => btn.style.backgroundColor = '#f1f5f9';
      btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
      return btn;
    };

    const btnShelf = createMenuOption('Dodaj półkę', '➖');
    btnShelf.onclick = (event) => {
      event.stopPropagation();
      mod.elements.push({ id: 'poziom-' + Date.now(), typ: 'poziom', x: minX, y: mouseY - (th / 2), w: maxX - minX, h: th });
      menu.remove(); renderEditor2D(); update3D(); updateSidebar();
    };

    const btnPart = createMenuOption('Dodaj przegrodę', '➕');
    btnPart.onclick = (event) => {
      event.stopPropagation();
      mod.elements.push({ id: 'pion-' + Date.now(), typ: 'pion', x: mouseX - (th / 2), y: minY, w: th, h: maxY - minY });
      menu.remove(); renderEditor2D(); update3D(); updateSidebar();
    };

    const separator = document.createElement('hr');
    separator.style.margin = '4px 0'; separator.style.border = 'none'; separator.style.borderTop = '1px solid #e2e8f0';

    const baseZoneParams = { minX, maxX, minY, maxY, boundLeft, boundRight, boundBottom, boundTop };

    const btnDoor = createMenuOption('Wstaw Drzwi (1 szt.)', '🚪');
    btnDoor.onclick = (event) => {
      event.stopPropagation();
      mod.elements.push({
        id: 'front-' + Date.now(), typ: 'front', subtype: 'drzwi',
        baseZone: baseZoneParams, frontCount: 1, frontIndex: 0, gap: 3
      });
      menu.remove(); renderEditor2D(); update3D(); updateSidebar();
    };

    const btnDoorLP = createMenuOption('Wstaw Drzwi (L/P)', '🚪');
    btnDoorLP.onclick = (event) => {
      event.stopPropagation();
      const ts = Date.now();
      const gap = parseFloat(state.project.front?.gap) || 3;
      mod.elements.push({ id: 'front-' + ts + '-L', typ: 'front', subtype: 'drzwi-lp', baseZone: baseZoneParams, frontCount: 2, frontIndex: 0, gap });
      mod.elements.push({ id: 'front-' + ts + '-P', typ: 'front', subtype: 'drzwi-lp', baseZone: baseZoneParams, frontCount: 2, frontIndex: 1, gap });
      menu.remove(); renderEditor2D(); update3D(); updateSidebar();
    };

    const btnDrawers = createMenuOption('Wstaw Szuflady', '📦');
    btnDrawers.onclick = (event) => {
      event.stopPropagation();
      menu.innerHTML = ''; menu.style.padding = '12px'; menu.style.width = '220px';

      const title = document.createElement('div');
      title.innerText = 'Podział na szuflady'; title.style.fontWeight = 'bold';
      title.style.marginBottom = '12px'; title.style.fontSize = '14px';
      
      // Zmieniamy z number na text input
      const createConfigInputText = (labelTxt, defaultVal) => {
        const wrap = document.createElement('div'); wrap.style.marginBottom = '8px';
        const lbl = document.createElement('div'); lbl.style.fontSize = '12px'; lbl.innerText = labelTxt;
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = defaultVal;
        inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; inp.style.padding = '6px';
        inp.style.marginTop = '4px'; inp.style.border = '1px solid #cbd5e1'; inp.style.borderRadius = '4px';
        wrap.appendChild(lbl); wrap.appendChild(inp); return { wrap, inp };
      };

      const inpDist = createConfigInputText('Podział (np. 3 lub 1:1:141):', '3');
      const inpGap = createConfigInputText('Szczelina między frontami [mm]:', state.project.front?.gap || 3);

      const generateBtn = document.createElement('button');
      generateBtn.innerText = 'Zastosuj podział';
      generateBtn.style.width = '100%'; generateBtn.style.padding = '8px'; generateBtn.style.marginTop = '8px';
      generateBtn.style.backgroundColor = '#2563eb'; generateBtn.style.color = 'white'; generateBtn.style.border = 'none';
      generateBtn.style.borderRadius = '4px'; generateBtn.style.cursor = 'pointer'; generateBtn.style.fontWeight = 'bold';

      generateBtn.onclick = (genEvent) => {
        genEvent.stopPropagation();
        
        const distStr = inpDist.inp.value.trim() || "1";
        const gap = parseFloat(inpGap.inp.value) || 0;
        const ts = Date.now();
        
        let count = 1;
        // Rozpoznawanie ilości frontów z wpisanego tekstu
        if (!distStr.includes(':') && !distStr.includes(',') && !isNaN(distStr)) {
          count = parseInt(distStr, 10) || 1;
        } else {
          const separator = distStr.includes(':') ? ':' : ',';
          count = distStr.split(separator).length;
        }

        for(let i = 0; i < count; i++) {
          mod.elements.push({
            id: 'front-' + ts + '-' + i,
            typ: 'front',
            subtype: 'szuflada',
            baseZone: baseZoneParams,
            frontCount: count,
            distribution: distStr, // Zapisujemy konfigurację do użycia przy przeliczaniu!
            frontIndex: i,
            gap: gap
          });
        }
        menu.remove(); renderEditor2D(); update3D(); updateSidebar();
      };

      menu.appendChild(title); menu.appendChild(inpDist.wrap); menu.appendChild(inpGap.wrap); menu.appendChild(generateBtn);
    };

    menu.appendChild(btnShelf);
    menu.appendChild(btnPart);
    menu.appendChild(separator);
    menu.appendChild(btnDoor);
    menu.appendChild(btnDoorLP);
    menu.appendChild(btnDrawers);
    
    document.body.appendChild(menu);
  };

  container.appendChild(cabinetDiv);
}