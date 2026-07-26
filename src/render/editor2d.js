// src/render/editor2d.js
import { state } from "../core/state.js";
import { updateSidebar } from "../ui/sidebar.js";
import { update3D } from "./viewer3d.js"; 

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

  const hint = document.createElement('div');
  hint.style.position = 'absolute';
  hint.style.top = '10px';
  hint.style.left = '10px';
  hint.style.color = '#64748b';
  hint.style.fontSize = '12px';
  hint.innerHTML = '<b>LPM:</b> Wstaw Półkę <br><b>Shift + LPM:</b> Wstaw Przegrodę <br><b>LPM na elemencie:</b> Edytuj / Usuń';
  container.appendChild(hint);

  const padding = 60;
  const scale = Math.min(
    (container.clientWidth - padding) / width,
    (container.clientHeight - padding) / height
  );

  const cabinetDiv = document.createElement('div');
  cabinetDiv.style.position = 'relative';
  cabinetDiv.style.width = `${width}px`;
  cabinetDiv.style.height = `${height}px`;
  cabinetDiv.style.transform = `scale(${scale})`;
  cabinetDiv.style.transformOrigin = 'center center';
  
  const createPart = (x, y, w, h, color) => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = `${x}px`;
    div.style.bottom = `${y}px`; 
    div.style.width = `${w}px`;
    div.style.height = `${h}px`;
    div.style.backgroundColor = color;
    div.style.border = '1px solid #1e293b';
    div.style.boxSizing = 'border-box';
    return div;
  };

  // Obrys szafki
  cabinetDiv.appendChild(createPart(0, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(width - th, 0, th, height, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, 0, width - th*2, th, '#cbd5e1')); 
  cabinetDiv.appendChild(createPart(th, height - th, width - th*2, th, '#cbd5e1')); 

  mod.elements.forEach(plyta => {
    const div = createPart(plyta.x, plyta.y, plyta.w, plyta.h, '#64748b');
    div.style.cursor = 'pointer';
    div.style.transition = 'background-color 0.1s ease';

    div.onmouseenter = () => div.style.backgroundColor = '#94a3b8'; 
    div.onmouseleave = () => div.style.backgroundColor = '#64748b';

    div.onclick = (e) => {
      e.stopPropagation(); 
      
      const existingMenu = document.getElementById('context-menu');
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.style.position = 'fixed'; 
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.backgroundColor = '#ffffff';
      menu.style.border = '1px solid #cbd5e1';
      menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      menu.style.borderRadius = '6px';
      menu.style.padding = '4px';
      menu.style.zIndex = '1000';
      menu.style.minWidth = '180px';
      menu.style.fontFamily = 'sans-serif';

      // --- MENU: WŁAŚCIWOŚCI (ŚWIATŁO) ---
      const propertiesBtn = document.createElement('div');
      propertiesBtn.innerHTML = '📏 Ustaw wymiar (światło)';
      propertiesBtn.style.padding = '8px 12px';
      propertiesBtn.style.cursor = 'pointer';
      propertiesBtn.style.fontSize = '14px';
      propertiesBtn.style.color = '#1e293b';
      propertiesBtn.style.borderRadius = '4px';
      propertiesBtn.onmouseenter = () => propertiesBtn.style.backgroundColor = '#f1f5f9';
      propertiesBtn.onmouseleave = () => propertiesBtn.style.backgroundColor = 'transparent';
      
      propertiesBtn.onclick = (propEvent) => {
        propEvent.stopPropagation();
        
        menu.innerHTML = '';
        menu.style.padding = '12px';
        menu.style.width = '220px';

        const obstacles = [
          ...mod.elements.filter(el => el.id !== plyta.id),
          { x: 0, y: 0, w: th, h: height }, 
          { x: width - th, y: 0, w: th, h: height },
          { x: 0, y: 0, w: width, h: th },
          { x: 0, y: height - th, w: width, h: th }
        ];

        let limit1, limit2, label1, label2;
        let currentSpace1, currentSpace2;

        if (plyta.typ === 'poziom') {
          let nearestBelow = 0;
          let nearestAbove = height;
          const centerX = plyta.x + (plyta.w / 2);

          obstacles.forEach(obs => {
            if (obs.x < centerX && (obs.x + obs.w) > centerX) {
              if (obs.y + obs.h <= plyta.y && obs.y + obs.h > nearestBelow) nearestBelow = obs.y + obs.h;
              if (obs.y >= plyta.y + plyta.h && obs.y < nearestAbove) nearestAbove = obs.y;
            }
          });

          limit1 = nearestBelow;
          limit2 = nearestAbove;
          currentSpace1 = Math.round(plyta.y - nearestBelow);
          currentSpace2 = Math.round(nearestAbove - (plyta.y + plyta.h));
          label1 = 'Światło poniżej [mm]:';
          label2 = 'Światło powyżej [mm]:';
        } else {
          let nearestLeft = 0;
          let nearestRight = width;
          const centerY = plyta.y + (plyta.h / 2);

          obstacles.forEach(obs => {
            if (obs.y < centerY && (obs.y + obs.h) > centerY) {
              if (obs.x + obs.w <= plyta.x && obs.x + obs.w > nearestLeft) nearestLeft = obs.x + obs.w;
              if (obs.x >= plyta.x + plyta.w && obs.x < nearestRight) nearestRight = obs.x;
            }
          });

          limit1 = nearestLeft;
          limit2 = nearestRight;
          currentSpace1 = Math.round(plyta.x - nearestLeft);
          currentSpace2 = Math.round(nearestRight - (plyta.x + plyta.w));
          label1 = 'Światło z lewej [mm]:';
          label2 = 'Światło z prawej [mm]:';
        }

        const totalAvailableSpace = limit2 - limit1 - (plyta.typ === 'poziom' ? plyta.h : plyta.w);

        const createInput = (labelText, value) => {
          const wrap = document.createElement('div');
          wrap.style.marginBottom = '8px';
          const lbl = document.createElement('div');
          lbl.style.fontSize = '12px';
          lbl.style.fontWeight = 'bold';
          lbl.innerText = labelText;
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.step = '0.5'; // Pozwala na wpisywanie połówek milimetrów
          inp.value = value;
          inp.style.width = '100%';
          inp.style.boxSizing = 'border-box';
          inp.style.padding = '6px';
          inp.style.marginTop = '4px';
          inp.style.border = '1px solid #cbd5e1';
          inp.style.borderRadius = '4px';
          wrap.appendChild(lbl);
          wrap.appendChild(inp);
          return { wrap, inp };
        };

        const input1 = createInput(label1, currentSpace1);
        const input2 = createInput(label2, currentSpace2);

        // Automatyczne przeliczanie drugiego wymiaru
        input1.inp.oninput = () => {
          const val = parseFloat(input1.inp.value) || 0;
          input2.inp.value = Math.max(0, totalAvailableSpace - val);
        };
        input2.inp.oninput = () => {
          const val = parseFloat(input2.inp.value) || 0;
          input1.inp.value = Math.max(0, totalAvailableSpace - val);
        };

        // --- PRZYCISK: WYŚRODKUJ ---
        const centerBtn = document.createElement('button');
        centerBtn.innerText = '⬌ Ustaw na środku';
        centerBtn.style.width = '100%';
        centerBtn.style.padding = '6px';
        centerBtn.style.marginBottom = '12px';
        centerBtn.style.backgroundColor = '#f1f5f9';
        centerBtn.style.color = '#334155';
        centerBtn.style.border = '1px solid #cbd5e1';
        centerBtn.style.borderRadius = '4px';
        centerBtn.style.cursor = 'pointer';
        centerBtn.style.fontSize = '12px';
        centerBtn.style.fontWeight = 'bold';
        centerBtn.onmouseenter = () => centerBtn.style.backgroundColor = '#e2e8f0';
        centerBtn.onmouseleave = () => centerBtn.style.backgroundColor = '#f1f5f9';

        centerBtn.onclick = (centerEvent) => {
          centerEvent.stopPropagation();
          const half = Number((totalAvailableSpace / 2).toFixed(1));
          input1.inp.value = half;
          input2.inp.value = half;
        };

        // --- PRZYCISK: ZASTOSUJ ---
        const saveBtn = document.createElement('button');
        saveBtn.innerText = 'Zastosuj wymiar';
        saveBtn.style.width = '100%';
        saveBtn.style.padding = '8px';
        saveBtn.style.backgroundColor = '#2563eb';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.fontWeight = 'bold';
        saveBtn.onmouseenter = () => saveBtn.style.backgroundColor = '#1d4ed8';
        saveBtn.onmouseleave = () => saveBtn.style.backgroundColor = '#2563eb';

        saveBtn.onclick = (saveEvent) => {
          saveEvent.stopPropagation();
          const finalSpace1 = parseFloat(input1.inp.value) || 0;

          if (plyta.typ === 'poziom') {
            plyta.y = limit1 + finalSpace1;
            
            let minX = 0; let maxX = width;
            const fakeMouseY = plyta.y + (th / 2);
            obstacles.forEach(obs => {
              if (obs.y < fakeMouseY && (obs.y + obs.h) > fakeMouseY) {
                const centerX = plyta.x + (plyta.w / 2);
                if (obs.x + obs.w <= centerX && obs.x + obs.w > minX) minX = obs.x + obs.w;
                if (obs.x >= centerX && obs.x < maxX) maxX = obs.x;
              }
            });
            plyta.x = minX;
            plyta.w = maxX - minX;

          } else {
            plyta.x = limit1 + finalSpace1;
            
            let minY = 0; let maxY = height;
            const fakeMouseX = plyta.x + (th / 2);
            obstacles.forEach(obs => {
              if (obs.x < fakeMouseX && (obs.x + obs.w) > fakeMouseX) {
                const centerY = plyta.y + (plyta.h / 2);
                if (obs.y + obs.h <= centerY && obs.y + obs.h > minY) minY = obs.y + obs.h;
                if (obs.y >= centerY && obs.y < maxY) maxY = obs.y; 
              }
            });
            plyta.y = minY;
            plyta.h = maxY - minY;
          }

          menu.remove();
          renderEditor2D();
          update3D();
          updateSidebar();
        };

        menu.appendChild(input1.wrap);
        menu.appendChild(input2.wrap);
        menu.appendChild(centerBtn);
        menu.appendChild(saveBtn);
        
        setTimeout(() => input1.inp.select(), 10);
      };

      // --- MENU: USUŃ ---
      const deleteBtn = document.createElement('div');
      deleteBtn.innerHTML = '🗑️ Usuń element';
      deleteBtn.style.padding = '8px 12px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '14px';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.marginTop = '4px';
      deleteBtn.onmouseenter = () => deleteBtn.style.backgroundColor = '#fee2e2'; 
      deleteBtn.onmouseleave = () => deleteBtn.style.backgroundColor = 'transparent';
      
      deleteBtn.onclick = (deleteEvent) => {
        deleteEvent.stopPropagation(); 
        mod.elements = mod.elements.filter(el => el.id !== plyta.id);
        menu.remove();
        renderEditor2D();
        update3D();
        updateSidebar();
      };

      menu.appendChild(propertiesBtn);
      menu.appendChild(deleteBtn);
      document.body.appendChild(menu);
    };

    cabinetDiv.appendChild(div);
  });

  // --- OBSŁUGA KLIKNIĘCIA (Dodawanie) ---
  cabinetDiv.onclick = (e) => {
    if (e.target !== cabinetDiv) return;

    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) return;

    const rect = cabinetDiv.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (rect.bottom - e.clientY) / scale;
    
    const obstacles = [
      ...mod.elements,
      { x: 0, y: 0, w: th, h: height }, 
      { x: width - th, y: 0, w: th, h: height },
      { x: 0, y: 0, w: width, h: th },
      { x: 0, y: height - th, w: width, h: th }
    ];

    if (e.shiftKey) {
      let minY = 0; let maxY = height;
      obstacles.forEach(obs => {
        if (obs.x < mouseX && (obs.x + obs.w) > mouseX) {
          if (obs.y + obs.h <= mouseY && obs.y + obs.h > minY) minY = obs.y + obs.h;
          if (obs.y >= mouseY && obs.y < maxY) maxY = obs.y; 
        }
      });
      mod.elements.push({ id: 'pion-' + Date.now(), typ: 'pion', x: mouseX - (th / 2), y: minY, w: th, h: maxY - minY });
    } else {
      let minX = 0; let maxX = width;
      obstacles.forEach(obs => {
        if (obs.y < mouseY && (obs.y + obs.h) > mouseY) {
          if (obs.x + obs.w <= mouseX && obs.x + obs.w > minX) minX = obs.x + obs.w;
          if (obs.x >= mouseX && obs.x < maxX) maxX = obs.x;
        }
      });
      mod.elements.push({ id: 'poziom-' + Date.now(), typ: 'poziom', x: minX, y: mouseY - (th / 2), w: maxX - minX, h: th });
    }

    renderEditor2D();
    update3D();
    updateSidebar();
  };

  container.appendChild(cabinetDiv);
}