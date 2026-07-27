// src/render/editor2d.js
import { state } from "../core/state.js";
import { updateSidebar } from "../ui/sidebar.js";
import { update3D } from "./viewer3d.js"; 

let isFrontsVisible2D = true;
let isDimensionsVisible = true; 

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
  
  const th = parseFloat(state.project.materials.boardThickness) || 18;
  const width = parseFloat(mod.dimensions.width) || 600;
  const height = parseFloat(mod.dimensions.height) || 720;
  
  const f = state.project.front || {};
  const fc = f.clearance || {};
  const isInset = f.type === 'wpuszczane';

  const cSides = parseFloat(fc.sides ?? fc.leftRight ?? fc.boki ?? 2) || 0;
  const cTop = parseFloat(fc.top ?? fc.gora ?? 2) || 0;
  const cBottom = parseFloat(fc.bottom ?? fc.dol ?? 2) || 0;

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
            return parseFloat(fallback) || 0;
          };

          el.baseZone.minX = getBound(el.baseZone.boundLeft, 'minX', el.baseZone.minX);
          el.baseZone.maxX = getBound(el.baseZone.boundRight, 'maxX', el.baseZone.maxX);
          el.baseZone.minY = getBound(el.baseZone.boundBottom, 'minY', el.baseZone.minY);
          el.baseZone.maxY = getBound(el.baseZone.boundTop, 'maxY', el.baseZone.maxY);
        }

        const minX = parseFloat(el.baseZone.minX) || 0;
        const maxX = parseFloat(el.baseZone.maxX) || width;
        const minY = parseFloat(el.baseZone.minY) || 0;
        const maxY = parseFloat(el.baseZone.maxY) || height;

        const gapVal = parseFloat(el.gap ?? f.gap ?? 3) || 0;

        let startX, totalW, startY, totalH;

        if (el.subtype === 'szuflada-wewnetrzna') {
          const gX = el.intGapX !== undefined ? parseFloat(el.intGapX) : 15;
          const gY = el.intGapY !== undefined ? parseFloat(el.intGapY) : 5;
          startX = minX + gX;
          totalW = (maxX - minX) - (gX * 2);
          startY = minY + gY;
          totalH = (maxY - minY) - (gY * 2);
        } else {
          const isBoundLeftFront = el.baseZone.boundLeft && el.baseZone.boundLeft.startsWith('front');
          const isBoundRightFront = el.baseZone.boundRight && el.baseZone.boundRight.startsWith('front');
          const isBoundBottomFront = el.baseZone.boundBottom && el.baseZone.boundBottom.startsWith('front');
          const isBoundTopFront = el.baseZone.boundTop && el.baseZone.boundTop.startsWith('front');

          const isLeftOuter = minX <= th + 1; 
          const isRightOuter = maxX >= width - th - 1;
          const isBottomOuter = minY <= th + 1;
          const isTopOuter = maxY >= height - th - 1;

          const overLeft = isLeftOuter ? (isInset ? -cSides : th - cSides) : (isBoundLeftFront ? -gapVal : ((th / 2) - (gapVal / 2)));
          const overRight = isRightOuter ? (isInset ? -cSides : th - cSides) : (isBoundRightFront ? -gapVal : ((th / 2) - (gapVal / 2)));
          const overBottom = isBottomOuter ? (isInset ? -cBottom : th - cBottom) : (isBoundBottomFront ? -gapVal : ((th / 2) - (gapVal / 2)));
          const overTop = isTopOuter ? (isInset ? -cTop : th - cTop) : (isBoundTopFront ? -gapVal : ((th / 2) - (gapVal / 2)));

          startX = minX - overLeft;
          totalW = (maxX - minX) + overLeft + overRight;
          startY = minY - overBottom;
          totalH = (maxY - minY) + overBottom + overTop;
        }

        if (el.subtype === 'szuflada' || el.subtype === 'szuflada-wewnetrzna') {
          const distributionStr = String(el.distribution || el.frontCount || "1").trim();
          let parsedZones = [];
          if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
            const count = parseInt(distributionStr, 10) || 1;
            for (let i = 0; i < count; i++) parsedZones.push({ type: 'fr', value: 1 });
          } else {
            const separator = distributionStr.includes(':') ? ':' : ',';
            parsedZones = distributionStr.split(separator).map(s => {
              let zone = s.trim();
              if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
              const val = parseFloat(zone) || 1;
              return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
            });
          }

          const count = parsedZones.length;
          const totalGaps = gapVal * (count - 1);
          let availableHeight = totalH - totalGaps;

          let fixedTotal = 0; let frTotal = 0;
          parsedZones.forEach(z => { if (z.type === 'fixed') fixedTotal += z.value; if (z.type === 'fr') frTotal += z.value; });
          availableHeight -= fixedTotal;
          const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

          let currentY = startY;
          for (let i = 0; i < el.frontIndex; i++) {
            const z = parsedZones[i] || { type: 'fr', value: 1 };
            const h = z.type === 'fixed' ? z.value : z.value * singleFrValue;
            currentY += h + gapVal;
          }

          const myZone = parsedZones[el.frontIndex] || { type: 'fr', value: 1 };
          const myHeight = myZone.type === 'fixed' ? myZone.value : myZone.value * singleFrValue;

          el.x = isNaN(startX) ? 0 : startX; 
          el.w = isNaN(totalW) ? 100 : totalW;
          el.y = isNaN(currentY) ? 0 : currentY; 
          el.h = isNaN(myHeight) ? 100 : myHeight;

        } else if (el.subtype === 'drzwi') {
          el.x = isNaN(startX) ? 0 : startX; el.w = isNaN(totalW) ? 100 : totalW;
          el.y = isNaN(startY) ? 0 : startY; el.h = isNaN(totalH) ? 100 : totalH;
        } else if (el.subtype === 'drzwi-lp') {
          const singleW = (totalW - gapVal) / 2;
          el.w = isNaN(singleW) ? 50 : singleW; el.h = isNaN(totalH) ? 100 : totalH; el.y = isNaN(startY) ? 0 : startY;
          let myX = el.frontIndex === 0 ? startX : startX + singleW + gapVal; 
          el.x = isNaN(myX) ? 0 : myX;
        }
      }
    });
  }

  const toggleFrontsBtn = document.createElement('button');
  toggleFrontsBtn.innerHTML = isFrontsVisible2D ? '👁️ Ukryj fronty (2D)' : '👁️‍🗨️ Pokaż fronty (2D)';
  toggleFrontsBtn.style.position = 'absolute'; toggleFrontsBtn.style.top = '10px'; toggleFrontsBtn.style.right = '10px'; toggleFrontsBtn.style.padding = '6px 12px'; toggleFrontsBtn.style.backgroundColor = isFrontsVisible2D ? '#f8fafc' : '#e2e8f0'; toggleFrontsBtn.style.border = '1px solid #cbd5e1'; toggleFrontsBtn.style.borderRadius = '4px'; toggleFrontsBtn.style.cursor = 'pointer'; toggleFrontsBtn.style.fontSize = '12px'; toggleFrontsBtn.style.fontWeight = 'bold'; toggleFrontsBtn.style.zIndex = '50';
  toggleFrontsBtn.onclick = () => { isFrontsVisible2D = !isFrontsVisible2D; renderEditor2D(); };
  container.appendChild(toggleFrontsBtn);

  const toggleDimsBtn = document.createElement('button');
  toggleDimsBtn.innerHTML = isDimensionsVisible ? '📐 Ukryj wymiary' : '📏 Pokaż wymiary';
  toggleDimsBtn.style.position = 'absolute'; toggleDimsBtn.style.top = '10px'; toggleDimsBtn.style.right = '160px'; toggleDimsBtn.style.padding = '6px 12px'; toggleDimsBtn.style.backgroundColor = isDimensionsVisible ? '#e0f2fe' : '#f8fafc'; toggleDimsBtn.style.border = '1px solid #7dd3fc'; toggleDimsBtn.style.borderRadius = '4px'; toggleDimsBtn.style.cursor = 'pointer'; toggleDimsBtn.style.fontSize = '12px'; toggleDimsBtn.style.fontWeight = 'bold'; toggleDimsBtn.style.zIndex = '50';
  toggleDimsBtn.onclick = () => { isDimensionsVisible = !isDimensionsVisible; renderEditor2D(); };
  container.appendChild(toggleDimsBtn);

  const paddingX = isDimensionsVisible ? 240 : 60; 
  const paddingY = isDimensionsVisible ? 180 : 60; 
  const scale = Math.min((container.clientWidth - paddingX) / width, (container.clientHeight - paddingY) / height);

  const cabinetDiv = document.createElement('div');
  cabinetDiv.style.position = 'relative';
  cabinetDiv.style.width = `${width}px`; 
  cabinetDiv.style.height = `${height}px`;
  
  const translateX = isDimensionsVisible ? 70 : 0;
  const translateY = isDimensionsVisible ? -50 : 0;
  cabinetDiv.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
  cabinetDiv.style.transformOrigin = 'center center';
  
  const hitBox = document.createElement('div');
  hitBox.style.position = 'absolute'; hitBox.style.left = '0'; hitBox.style.bottom = '0'; hitBox.style.width = '100%'; hitBox.style.height = '100%'; hitBox.style.pointerEvents = 'none'; 
  cabinetDiv.appendChild(hitBox);
  
  const createPart = (x, y, w, h, color) => {
    const div = document.createElement('div');
    div.style.position = 'absolute'; div.style.left = `${Number(x) || 0}px`; div.style.bottom = `${Number(y) || 0}px`; 
    div.style.width = `${Number(w) || 0}px`; div.style.height = `${Number(h) || 0}px`;
    div.style.backgroundColor = color; div.style.border = '1px solid #1e293b'; div.style.boxSizing = 'border-box';
    return div;
  };

  cabinetDiv.appendChild(createPart(0, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(width - th, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, 0, width - th*2, th, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, height - th, width - th*2, th, '#cbd5e1')); 

  mod.elements.forEach(plyta => {
    const isFront = plyta.typ === 'front';
    if (isFront && !isFrontsVisible2D) return;
    if (isNaN(plyta.x) || isNaN(plyta.y) || isNaN(plyta.w) || isNaN(plyta.h)) return; 

    const isStructural = plyta.typ === 'poziom' && plyta.isStructural;
    const isInternalDrawer = plyta.subtype === 'szuflada-wewnetrzna';
    
    let defaultColor = '#cbd5e1'; 
    let hoverColor = '#94a3b8';
    
    if (isFront) {
        if (isInternalDrawer) {
            defaultColor = 'rgba(245, 158, 11, 0.2)'; 
            hoverColor = 'rgba(245, 158, 11, 0.5)';
        } else {
            defaultColor = 'rgba(59, 130, 246, 0.3)'; 
            hoverColor = 'rgba(59, 130, 246, 0.6)';
        }
    } else if (isStructural) {
        defaultColor = '#86efac';
        hoverColor = '#4ade80';
    }
    
    const div = createPart(plyta.x, plyta.y, plyta.w, plyta.h, defaultColor);
    div.style.cursor = 'pointer'; div.style.transition = 'background-color 0.1s ease';
    
    if (isFront) {
      div.style.border = isInternalDrawer ? '2px dashed #f59e0b' : '1px dashed #2563eb'; 
      div.style.zIndex = '10'; div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.justifyContent = 'center';
      
      if (plyta.subtype.includes('szuflada')) {
        const innerBox = document.createElement('div'); innerBox.style.position = 'absolute'; innerBox.style.width = '80%'; innerBox.style.height = '60%'; innerBox.style.bottom = '15%'; innerBox.style.border = '2px solid rgba(255, 255, 255, 0.8)'; innerBox.style.borderTop = 'none'; innerBox.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; innerBox.style.boxSizing = 'border-box'; innerBox.style.pointerEvents = 'none';
        const line = document.createElement('div'); line.style.position = 'absolute'; line.style.bottom = '20%'; line.style.left = '0'; line.style.width = '100%'; line.style.borderBottom = '1px dashed rgba(255, 255, 255, 0.6)'; innerBox.appendChild(line); div.appendChild(innerBox);
      } else if (plyta.subtype.includes('drzwi')) {
         const handle = document.createElement('div'); handle.style.width = '12px'; handle.style.height = '12px'; handle.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; handle.style.borderRadius = '50%'; handle.style.pointerEvents = 'none'; handle.style.position = 'absolute';
         if (plyta.subtype === 'drzwi-lp') {
            handle.style.top = '50%'; if (plyta.id.endsWith('-L')) handle.style.right = '15px'; else handle.style.left = '15px'; 
         } else { handle.style.top = '50%'; handle.style.left = '15px'; }
         div.appendChild(handle);
      }
    }

    div.onmouseenter = () => div.style.backgroundColor = hoverColor; 
    div.onmouseleave = () => div.style.backgroundColor = defaultColor;

    div.onclick = (e) => {
      e.stopPropagation(); 
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.position = 'fixed'; menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
      menu.style.backgroundColor = '#ffffff'; menu.style.border = '1px solid #cbd5e1'; menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; menu.style.borderRadius = '6px'; menu.style.padding = '4px'; menu.style.zIndex = '1000'; menu.style.minWidth = '240px'; menu.style.fontFamily = 'sans-serif';

      // --- WSPÓLNE FUNKCJE DO BUDOWY MENU ---
      const createMenuOption = (text, icon, color = '#1e293b') => {
        const btn = document.createElement('div'); btn.innerHTML = `${icon} <span style="margin-left: 6px;">${text}</span>`; btn.style.padding = '8px 12px'; btn.style.cursor = 'pointer'; btn.style.fontSize = '14px'; btn.style.color = color; btn.style.borderRadius = '4px';
        btn.onmouseenter = () => btn.style.backgroundColor = '#f1f5f9'; btn.onmouseleave = () => btn.style.backgroundColor = 'transparent'; return btn;
      };
      const createHeader = (text, color = '#64748b') => {
        const hdr = document.createElement('div'); hdr.innerText = text; hdr.style.fontSize = '11px'; hdr.style.color = color; hdr.style.textTransform = 'uppercase'; hdr.style.margin = '8px 8px 4px 8px'; hdr.style.fontWeight = 'bold'; return hdr;
      };

      // === OPCJE DLA FRONTU ===
      if (isFront) {
        menu.appendChild(createHeader('Opcje frontu'));
        
        // Funkcja wymuszająca pozycję półki na podstawie frontu (tzw. bottom-up)
        const topBoundId = plyta.baseZone?.boundTop;
        const topBoundEl = mod.elements.find(e => e.id === topBoundId);
        
        // Jeśli nad frontem fizycznie jest półka, pozwólmy ją "popchnąć"
        if (topBoundEl && topBoundEl.typ === 'poziom') {
            const btnSnap = createMenuOption('Dopasuj półkę nad frontami', '↕️', '#059669');
            btnSnap.onclick = (evt) => {
                evt.stopPropagation();
                // Szukamy wszystkich frontów wygenerowanych w tej samej "wnęce"
                const siblings = mod.elements.filter(e => e.typ === 'front' && e.baseZone?.boundTop === topBoundId && e.baseZone?.boundBottom === plyta.baseZone.boundBottom);
                
                let maxFrontTop = 0;
                siblings.forEach(sib => {
                    const topEdge = sib.y + sib.h;
                    if (topEdge > maxFrontTop) maxFrontTop = topEdge;
                });

                // Sprawdzamy nałożenie półki (standard to grubość/2 - szczelina/2)
                const gapVal = parseFloat(plyta.gap ?? state.project.front?.gap ?? 3) || 0;
                const overTop = (th / 2) - (gapVal / 2);
                
                // Nowa pozycja Y półki (liczona od dołu, jako jej dolna krawędź)
                topBoundEl.y = maxFrontTop - overTop;

                menu.remove(); renderEditor2D(); update3D(); updateSidebar();
            };
            menu.appendChild(btnSnap);
        }
      }

      // === OPCJE DLA PŁYT KORPUSU (PÓŁEK I PIONÓW) ===
      if (plyta.typ === 'poziom' || plyta.typ === 'pion') {
        const isPoziom = plyta.typ === 'poziom';
        const obstacles = [
          ...mod.elements.filter(el => el.typ !== 'front' && el.id !== plyta.id),
          { id: 'cab-left', x: 0, y: 0, w: th, h: height }, { id: 'cab-right', x: width - th, y: 0, w: th, h: height },
          { id: 'cab-bottom', x: 0, y: 0, w: width, h: th }, { id: 'cab-top', x: 0, y: height - th, w: width, h: th }
        ];

        let boundMin = 0; let boundMax = isPoziom ? height : width;

        if (isPoziom) {
          obstacles.forEach(obs => {
            if (obs.x < plyta.x + plyta.w && obs.x + obs.w > plyta.x) {
              if (obs.y + obs.h <= plyta.y && obs.y + obs.h > boundMin) boundMin = obs.y + obs.h;
              if (obs.y >= plyta.y + plyta.h && obs.y < boundMax) boundMax = obs.y;
            }
          });
        } else {
          obstacles.forEach(obs => {
            if (obs.y < plyta.y + plyta.h && obs.y + obs.h > plyta.y) {
              if (obs.x + obs.w <= plyta.x && obs.x + obs.w > boundMin) boundMin = obs.x + obs.w;
              if (obs.x >= plyta.x + plyta.w && obs.x < boundMax) boundMax = obs.x;
            }
          });
        }

        const currentSpace1 = Math.round((isPoziom ? plyta.y : plyta.x) - boundMin);
        const currentSpace2 = Math.round(boundMax - ((isPoziom ? plyta.y : plyta.x) + (isPoziom ? plyta.h : plyta.w)));
        const maxSpace = currentSpace1 + currentSpace2;

        const moveWrap = document.createElement('div');
        moveWrap.style.padding = '10px'; moveWrap.style.borderBottom = '1px solid #e2e8f0'; moveWrap.style.marginBottom = '4px'; moveWrap.style.backgroundColor = '#f8fafc'; moveWrap.style.borderRadius = '4px 4px 0 0';
        moveWrap.innerHTML = `<div style="font-size:12px; font-weight:bold; color:#334155; margin-bottom:10px; text-align:center;">Regulacja światła [mm]</div>`;

        const createInputRow = (labelTxt, val) => {
          const row = document.createElement('div');
          row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.marginBottom = '6px';
          const lbl = document.createElement('span'); lbl.innerText = labelTxt; lbl.style.fontSize = '12px'; lbl.style.color = '#475569';
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = val;
          inp.style.width = '60px'; inp.style.padding = '4px'; inp.style.border = '1px solid #cbd5e1'; inp.style.borderRadius = '4px'; inp.style.textAlign = 'center'; inp.style.fontWeight = 'bold';
          row.appendChild(lbl); row.appendChild(inp); return { row, inp };
        };

        const inp1Data = createInputRow(isPoziom ? '↕️ Światło pod półką:' : '↔️ Światło z lewej:', currentSpace1);
        const inp2Data = createInputRow(isPoziom ? '↕️ Światło nad półką:' : '↔️ Światło z prawej:', currentSpace2);
        
        const inp1 = inp1Data.inp; const inp2 = inp2Data.inp;
        inp1.oninput = () => { const v = parseFloat(inp1.value); if(!isNaN(v)) inp2.value = maxSpace - v; };
        inp2.oninput = () => { const v = parseFloat(inp2.value); if(!isNaN(v)) inp1.value = maxSpace - v; };

        const applyBtn = document.createElement('button'); applyBtn.innerText = 'Zatwierdź'; applyBtn.style.width = '100%'; applyBtn.style.padding = '6px'; applyBtn.style.backgroundColor = '#2563eb'; applyBtn.style.color = 'white'; applyBtn.style.border = 'none'; applyBtn.style.borderRadius = '4px'; applyBtn.style.cursor = 'pointer'; applyBtn.style.fontWeight = 'bold'; applyBtn.style.marginTop = '4px';

        const applyPosition = (evt) => {
          evt.stopPropagation(); const newVal1 = parseFloat(inp1.value);
          if (!isNaN(newVal1)) { if (isPoziom) plyta.y = boundMin + newVal1; else plyta.x = boundMin + newVal1; menu.remove(); renderEditor2D(); update3D(); updateSidebar(); }
        };

        applyBtn.onclick = applyPosition; inp1.onkeydown = (evt) => { if (evt.key === 'Enter') applyPosition(evt); }; inp2.onkeydown = (evt) => { if (evt.key === 'Enter') applyPosition(evt); };

        moveWrap.appendChild(inp2Data.row); moveWrap.appendChild(inp1Data.row); moveWrap.appendChild(applyBtn); menu.appendChild(moveWrap); setTimeout(() => inp1.focus(), 10);
      }

      if (plyta.typ === 'poziom') {
        const btnStruct = createMenuOption(plyta.isStructural ? 'Zmień na półkę ruchomą' : 'Zmień na konstrukcyjną', '🔩', plyta.isStructural ? '#2e7d32' : '#1e293b');
        btnStruct.onclick = (evt) => { evt.stopPropagation(); plyta.isStructural = !plyta.isStructural; menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };
        menu.appendChild(btnStruct);
      }

      // === WSPÓLNE (USUWANIE) ===
      menu.appendChild(createHeader('Akcje'));
      const btnDelete = createMenuOption(isFront ? 'Usuń fronty z tej wnęki' : 'Usuń element', '🗑️', '#dc2626');
      btnDelete.onmouseenter = () => btnDelete.style.backgroundColor = '#fee2e2'; 
      btnDelete.onclick = (evt) => { 
        evt.stopPropagation(); 
        // Jeśli usuwamy fronty, usuną się od razu wszystkie wygenerowane z danego podziału (np. obie szuflady naraz)
        if (isFront && plyta.baseZone) {
            mod.elements = mod.elements.filter(el => !(el.typ === 'front' && el.baseZone.boundTop === plyta.baseZone.boundTop && el.baseZone.boundBottom === plyta.baseZone.boundBottom));
        } else {
            mod.elements = mod.elements.filter(el => el.id !== plyta.id); 
        }
        menu.remove(); renderEditor2D(); update3D(); updateSidebar(); 
      };
      menu.appendChild(btnDelete); 

      document.body.appendChild(menu);
    };

    cabinetDiv.appendChild(div);
  });

  if (isDimensionsVisible) {
    let yLines = [0, th, height - th, height];
    let xLines = [0, th, width - th, width];
    mod.elements.forEach(el => { if (el.typ === 'poziom') { yLines.push(el.y); yLines.push(el.y + el.h); } if (el.typ === 'pion') { xLines.push(el.x); xLines.push(el.x + el.w); } });
    yLines = [...new Set(yLines)].sort((a, b) => a - b); xLines = [...new Set(xLines)].sort((a, b) => a - b);

    const createDimLine = (x, y, w, h) => { const line = createPart(x, y, w, h, '#94a3b8'); line.style.pointerEvents = 'none'; return line; };
    const dimOffY = -45; 
    yLines.forEach((y, i) => {
      cabinetDiv.appendChild(createDimLine(dimOffY - 5, y, 10, 2)); 
      if (i < yLines.length - 1) {
        const nextY = yLines[i + 1]; const gap = nextY - y;
        if (gap > 0.5) {
          cabinetDiv.appendChild(createDimLine(dimOffY - 1, y, 2, gap)); 
          const txt = document.createElement('div'); const val = Number(gap.toFixed(1));
          txt.innerText = val; txt.style.position = 'absolute'; txt.style.right = `calc(100% + 55px)`; txt.style.bottom = `${y + gap / 2}px`; txt.style.transform = 'translateY(50%)'; txt.style.fontSize = val === th ? '12px' : '16px'; txt.style.color = val === th ? '#64748b' : '#0f172a'; txt.style.fontWeight = 'bold'; txt.style.textAlign = 'right'; txt.style.width = '100px'; txt.style.pointerEvents = 'none';
          cabinetDiv.appendChild(txt);
        }
      }
    });

    const dimOffX = -45;
    xLines.forEach((x, i) => {
      cabinetDiv.appendChild(createDimLine(x, dimOffX - 5, 2, 10)); 
      if (i < xLines.length - 1) {
        const nextX = xLines[i + 1]; const gap = nextX - x;
        if (gap > 0.5) {
          cabinetDiv.appendChild(createDimLine(x, dimOffX - 1, gap, 2)); 
          const txt = document.createElement('div'); const val = Number(gap.toFixed(1));
          txt.innerText = val; txt.style.position = 'absolute'; txt.style.left = `${x + gap / 2}px`; txt.style.bottom = `${dimOffX - 35}px`; txt.style.transform = 'translateX(-50%)'; txt.style.fontSize = val === th ? '12px' : '16px'; txt.style.color = val === th ? '#64748b' : '#0f172a'; txt.style.fontWeight = 'bold'; txt.style.textAlign = 'center'; txt.style.pointerEvents = 'none';
          cabinetDiv.appendChild(txt);
        }
      }
    });
  }

  cabinetDiv.onclick = (e) => {
    e.stopPropagation();
    if (e.target !== cabinetDiv) return;
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) { existingMenu.remove(); return; }

    const rect = hitBox.getBoundingClientRect(); 
    const mouseX = (e.clientX - rect.left) / scale; 
    const mouseY = (rect.bottom - e.clientY) / scale;
    
    const localObstacles = [
      ...mod.elements.filter(el => el.typ !== 'front'),
      { id: 'cab-left', x: 0, y: 0, w: th, h: height }, { id: 'cab-right', x: width - th, y: 0, w: th, h: height },
      { id: 'cab-bottom', x: 0, y: 0, w: width, h: th }, { id: 'cab-top', x: 0, y: height - th, w: width, h: th }
    ];

    let zoneMinX = 0, zoneMaxX = width, zoneMinY = 0, zoneMaxY = height;
    let boundLeft = 'cab-left', boundRight = 'cab-right', boundBottom = 'cab-bottom', boundTop = 'cab-top';
    
    localObstacles.forEach(obs => {
      if (obs.y < mouseY && (obs.y + obs.h) > mouseY) {
        if (obs.x + obs.w <= mouseX && obs.x + obs.w > zoneMinX) { zoneMinX = obs.x + obs.w; boundLeft = obs.id; }
        if (obs.x >= mouseX && obs.x < zoneMaxX) { zoneMaxX = obs.x; boundRight = obs.id; }
      }
      if (obs.x < mouseX && (obs.x + obs.w) > mouseX) {
        if (obs.y + obs.h <= mouseY && obs.y + obs.h > zoneMinY) { zoneMinY = obs.y + obs.h; boundBottom = obs.id; }
        if (obs.y >= mouseY && obs.y < zoneMaxY) { zoneMaxY = obs.y; boundTop = obs.id; }
      }
    });
    
    const localBaseZone = { minX: zoneMinX, maxX: zoneMaxX, minY: zoneMinY, maxY: zoneMaxY, boundLeft, boundRight, boundBottom, boundTop };

    let colMinX = 0, colMaxX = width, colMinY = 0, colMaxY = height;
    let colBoundLeft = 'cab-left', colBoundRight = 'cab-right', colBoundBottom = 'cab-bottom', colBoundTop = 'cab-top';
    
    localObstacles.forEach(obs => {
      if (obs.typ === 'pion' || obs.id.startsWith('cab-')) {
        if (obs.y < mouseY && (obs.y + obs.h) > mouseY) {
          if (obs.x + obs.w <= mouseX && obs.x + obs.w > colMinX) { colMinX = obs.x + obs.w; colBoundLeft = obs.id; }
          if (obs.x >= mouseX && obs.x < colMaxX) { colMaxX = obs.x; colBoundRight = obs.id; }
        }
      }
    });

    const frontObstacles = [
      ...mod.elements.filter(el => el.typ === 'front'),
      { id: 'cab-bottom', x: 0, y: 0, w: width, h: th }, { id: 'cab-top', x: 0, y: height - th, w: width, h: th }
    ];

    frontObstacles.forEach(obs => {
      if (obs.x < colMaxX && (obs.x + obs.w) > colMinX) {
        if (obs.y + obs.h <= mouseY && obs.y + obs.h > colMinY) { colMinY = obs.y + obs.h; colBoundBottom = obs.id; }
        if (obs.y >= mouseY && obs.y < colMaxY) { colMaxY = obs.y; colBoundTop = obs.id; }
      }
    });
    
    const colBaseZone = { minX: colMinX, maxX: colMaxX, minY: colMinY, maxY: colMaxY, boundLeft: colBoundLeft, boundRight: colBoundRight, boundBottom: colBoundBottom, boundTop: colBoundTop };

    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.position = 'fixed'; menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    menu.style.backgroundColor = '#ffffff'; menu.style.border = '1px solid #cbd5e1'; menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; menu.style.borderRadius = '6px'; menu.style.padding = '4px'; menu.style.zIndex = '1000'; menu.style.minWidth = '220px'; menu.style.fontFamily = 'sans-serif';

    const createMenuOption = (text, icon, color = '#1e293b') => {
      const btn = document.createElement('div'); btn.innerHTML = `${icon} <span style="margin-left: 6px;">${text}</span>`; btn.style.padding = '8px 12px'; btn.style.cursor = 'pointer'; btn.style.fontSize = '14px'; btn.style.color = color; btn.style.borderRadius = '4px';
      btn.onmouseenter = () => btn.style.backgroundColor = '#f1f5f9'; btn.onmouseleave = () => btn.style.backgroundColor = 'transparent'; return btn;
    };
    const createHeader = (text, color = '#64748b') => {
      const hdr = document.createElement('div'); hdr.innerText = text; hdr.style.fontSize = '11px'; hdr.style.color = color; hdr.style.textTransform = 'uppercase'; hdr.style.margin = '8px 8px 4px 8px'; hdr.style.fontWeight = 'bold'; return hdr;
    };

    menu.appendChild(createHeader('Elementy konstrukcyjne'));
    
    const btnShelf = createMenuOption('Półka (w miejscu myszki)', '➖');
    btnShelf.onclick = (event) => { event.stopPropagation(); mod.elements.push({ id: 'poziom-' + Date.now(), typ: 'poziom', x: zoneMinX, y: mouseY - (th / 2), w: zoneMaxX - zoneMinX, h: th, isStructural: false }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };

    const btnShelfHalf = createMenuOption('Półka (dokładnie w połowie)', '➗');
    btnShelfHalf.onclick = (event) => { event.stopPropagation(); const halfY = zoneMinY + (zoneMaxY - zoneMinY) / 2; mod.elements.push({ id: 'poziom-' + Date.now(), typ: 'poziom', x: zoneMinX, y: halfY - (th / 2), w: zoneMaxX - zoneMinX, h: th, isStructural: false }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };

    const btnPartHalf = createMenuOption('Przegroda (w połowie)', '➕');
    btnPartHalf.onclick = (event) => { event.stopPropagation(); const halfX = zoneMinX + (zoneMaxX - zoneMinX) / 2; mod.elements.push({ id: 'pion-' + Date.now(), typ: 'pion', x: halfX - (th / 2), y: zoneMinY, w: th, h: zoneMaxY - zoneMinY }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };

    menu.appendChild(btnShelf); menu.appendChild(btnShelfHalf); menu.appendChild(btnPartHalf);

    const showDrawerMenu = (event, targetBaseZone, subtypeName, titleTxt) => {
      event.stopPropagation();
      menu.innerHTML = ''; menu.style.padding = '12px'; menu.style.width = '240px';
      const title = document.createElement('div'); title.innerText = titleTxt; title.style.fontWeight = 'bold'; title.style.marginBottom = '12px'; title.style.fontSize = '14px';
      const createConfigInputText = (labelTxt, defaultVal) => { const wrap = document.createElement('div'); wrap.style.marginBottom = '8px'; const lbl = document.createElement('div'); lbl.style.fontSize = '12px'; lbl.innerText = labelTxt; const inp = document.createElement('input'); inp.type = 'text'; inp.value = defaultVal; inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; inp.style.padding = '6px'; inp.style.marginTop = '4px'; inp.style.border = '1px solid #cbd5e1'; inp.style.borderRadius = '4px'; wrap.appendChild(lbl); wrap.appendChild(inp); return { wrap, inp }; };
      
      const inpDist = createConfigInputText('Podział (np. 3 lub 200:200):', '3');
      const inpGap = createConfigInputText('Szczelina między frontami [mm]:', parseFloat(state.project.front?.gap) || 3);
      
      let inpIntGapX = null, inpIntGapY = null;
      if (subtypeName === 'szuflada-wewnetrzna') {
        inpIntGapX = createConfigInputText('Luz na boki (np. pod zawiasy) [mm]:', '15');
        inpIntGapY = createConfigInputText('Luz góra/dół (od korpusu) [mm]:', '5');
      }
      
      const generateBtn = document.createElement('button'); generateBtn.innerText = 'Zastosuj podział'; generateBtn.style.width = '100%'; generateBtn.style.padding = '8px'; generateBtn.style.marginTop = '8px'; generateBtn.style.backgroundColor = '#2563eb'; generateBtn.style.color = 'white'; generateBtn.style.border = 'none'; generateBtn.style.borderRadius = '4px'; generateBtn.style.cursor = 'pointer'; generateBtn.style.fontWeight = 'bold';

      generateBtn.onclick = (genEvent) => {
        genEvent.stopPropagation();
        const distStr = inpDist.inp.value.trim() || "1"; 
        const gapValInput = parseFloat(inpGap.inp.value) || 0; 
        const ts = Date.now();
        
        let genCount = 1;
        if (!distStr.includes(':') && !distStr.includes(',') && !isNaN(distStr)) genCount = parseInt(distStr, 10) || 1;
        else genCount = distStr.split(distStr.includes(':') ? ':' : ',').length;

        const gX = inpIntGapX ? parseFloat(inpIntGapX.inp.value) || 0 : 0;
        const gY = inpIntGapY ? parseFloat(inpIntGapY.inp.value) || 0 : 0;

        for(let i = 0; i < genCount; i++) { 
            mod.elements.push({ 
                id: 'front-' + ts + '-' + i, 
                typ: 'front', 
                subtype: subtypeName, 
                baseZone: targetBaseZone, 
                frontCount: genCount, 
                distribution: distStr, 
                frontIndex: i, 
                gap: gapValInput,
                intGapX: gX,
                intGapY: gY
            }); 
        }
        menu.remove(); renderEditor2D(); update3D(); updateSidebar();
      };
      
      menu.appendChild(title); 
      menu.appendChild(inpDist.wrap); 
      menu.appendChild(inpGap.wrap); 
      if (inpIntGapX) { menu.appendChild(inpIntGapX.wrap); menu.appendChild(inpIntGapY.wrap); }
      menu.appendChild(generateBtn);
    };

    menu.appendChild(createHeader('Zabuduj wnękę (między półkami)'));

    const btnDoor = createMenuOption('Drzwi pojedyncze', '🚪');
    btnDoor.onclick = (event) => { event.stopPropagation(); mod.elements.push({ id: 'front-' + Date.now(), typ: 'front', subtype: 'drzwi', baseZone: localBaseZone, frontCount: 1, frontIndex: 0, gap: 3 }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };
    menu.appendChild(btnDoor);

    const btnDrawers = createMenuOption('Szuflady (zewnętrzne)', '📦');
    btnDrawers.onclick = (event) => showDrawerMenu(event, localBaseZone, 'szuflada', 'Szuflady w tej wnęce');
    menu.appendChild(btnDrawers);

    const btnInternalDrawers = createMenuOption('Szuflady wewnętrzne', '📥', '#d97706');
    btnInternalDrawers.onclick = (event) => showDrawerMenu(event, localBaseZone, 'szuflada-wewnetrzna', 'Wewnętrzne szuflady');
    menu.appendChild(btnInternalDrawers);

    menu.appendChild(createHeader('Zabuduj resztę (ignoruje półki)', '#2563eb'));

    const btnDoorCol = createMenuOption('Drzwi na całą wysokość', '🚪', '#1e40af');
    btnDoorCol.onclick = (event) => { event.stopPropagation(); mod.elements.push({ id: 'front-' + Date.now(), typ: 'front', subtype: 'drzwi', baseZone: colBaseZone, frontCount: 1, frontIndex: 0, gap: 3 }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };
    menu.appendChild(btnDoorCol);

    const btnDoorLP = createMenuOption('Drzwi L/P na całą wysokość', '🚪', '#1e40af');
    btnDoorLP.onclick = (event) => { event.stopPropagation(); const ts = Date.now(); const gapLp = parseFloat(state.project.front?.gap) || 3; mod.elements.push({ id: 'front-' + ts + '-L', typ: 'front', subtype: 'drzwi-lp', baseZone: colBaseZone, frontCount: 2, frontIndex: 0, gap: gapLp }); mod.elements.push({ id: 'front-' + ts + '-P', typ: 'front', subtype: 'drzwi-lp', baseZone: colBaseZone, frontCount: 2, frontIndex: 1, gap: gapLp }); menu.remove(); renderEditor2D(); update3D(); updateSidebar(); };
    menu.appendChild(btnDoorLP);

    const btnDrawersCol = createMenuOption('Szuflady na całą wysokość', '📦', '#1e40af');
    btnDrawersCol.onclick = (event) => showDrawerMenu(event, colBaseZone, 'szuflada', 'Szuflady w całym pionie');
    menu.appendChild(btnDrawersCol);

    document.body.appendChild(menu);
  };
  container.appendChild(cabinetDiv);
}