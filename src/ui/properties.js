// src/ui/properties.js
import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";

// Rekurencyjna funkcja budująca interfejs struktury wnętrza
function generateInteriorUI(node, path = "interior") {
  // Jeśli węzeł jest podzielony, renderujemy jego dzieci
  if (node.splitDirection !== 'none' && node.children && node.children.length > 0) {
    let childrenHtml = node.children.map((child, index) => {
      return generateInteriorUI(child, `${path}.children[${index}]`);
    }).join('');

    // Dodajemy obramowanie i etykietę, żeby było widać podział
    const directionLabel = node.splitDirection === 'vertical' ? 'Podział Pionowy (Przegrody)' : 'Podział Poziomy (Półki)';
    
    return `
      <div style="border: 1px solid #cbd5e1; margin: 5px 0; padding: 10px; border-radius: 4px; background: #f8fafc;">
        <div style="font-size: 0.85em; color: #64748b; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <span>${directionLabel}</span>
          <button class="btn-clear-space" data-path="${path}" style="background: #ef4444; color: white; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px; font-size: 0.8em;">Usuń podział</button>
        </div>
        <div style="display: flex; gap: 10px; flex-direction: ${node.splitDirection === 'vertical' ? 'row' : 'column'};">
          ${childrenHtml}
        </div>
      </div>
    `;
  }

  // Jeśli węzeł to pusta przestrzeń, dajemy przyciski do jej podziału
  return `
    <div style="flex: 1; border: 1px dashed #94a3b8; padding: 10px; text-align: center; background: #ffffff; border-radius: 4px; min-height: 50px; display: flex; flex-direction: column; justify-content: center; gap: 5px;">
      <span style="font-size: 0.8em; color: #475569;">Pusta komora</span>
      <div style="display: flex; justify-content: center; gap: 5px;">
        <button class="btn-split" data-path="${path}" data-type="vertical" title="Dodaj przegrodę pionową" style="cursor: pointer; padding: 4px 8px;"><b>|</b></button>
        <button class="btn-split" data-path="${path}" data-type="horizontal" title="Dodaj półkę poziomą" style="cursor: pointer; padding: 4px 8px;"><b>-</b></button>
      </div>
    </div>
  `;
}
export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");
  // Pobieramy pierwszy moduł jako domyślny do edycji
  const activeModule = state.project.modules[0];

  rightSidebar.innerHTML = `
    <h2>Parametry</h2>
    <div class="property-group">
      <label>Grubość płyty (mm):</label>
      <input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" />
    </div>
    <div class="property-group">
      <label>Szerokość (mm):</label>
      <input type="number" id="input-width" value="${activeModule.dimensions.width}" />
    </div>
    <div class="property-group">
      <label>Wysokość (mm):</label>
      <input type="number" id="input-height" value="${activeModule.dimensions.height}" />
    </div>
    <div class="property-group">
      <label>Głębokość (mm):</label>
      <input type="number" id="input-depth" value="${activeModule.dimensions.depth}" />
    </div>
    
    <div class="property-group">
      <label>Plecy:</label>
      <select id="input-back-type">
        <option value="nut" ${state.project.backPanel.type === 'nut' ? 'selected' : ''}>W nucie</option>
        <option value="nakladane" ${state.project.backPanel.type === 'nakladane' ? 'selected' : ''}>Nakładane</option>
      </select>
    </div>
    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3>Wypełnienie Korpusu</h3>
    <div id="interior-designer-container">
      ${generateInteriorUI(activeModule.interior)}
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3>Fronty / Strefy</h3>
    <div class="property-group" style="flex-direction: row; align-items: center; justify-content: space-between;">
      <label>Dodaj fronty:</label>
      <input type="checkbox" id="input-front-active" ${state.project.front.active ? 'checked' : ''} style="width: auto;" />
    </div>
    <div id="group-front-clearance" style="${state.project.front.active ? 'display: block;' : 'display: none;'}">
      <div class="property-group">
        <label>Podział wysokości (od dołu):</label>
        <input type="text" id="input-front-distribution" value="${state.project.front.distribution || '1'}" placeholder="np. 1:1:1" />
      </div>
      <div class="property-group">
        <label>System szuflad:</label>
        <select id="input-drawer-system">
          <option value="merivobox" ${state.project.front.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option>
          <option value="legrabox" ${state.project.front.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option>
          <option value="tandembox" ${state.project.front.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX antaro</option>
        </select>
      </div>  
      
      <div class="property-group">
        <label>Przerwa między nimi (mm):</label>
        <input type="number" id="input-front-gap" value="${state.project.front.gap}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz boki [L/P] (mm):</label>
        <input type="number" id="input-front-sides" value="${state.project.front.clearance.sides}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz góra (mm):</label>
        <input type="number" id="input-front-top" value="${state.project.front.clearance.top}" step="0.5" />
      </div>
      <div class="property-group">
        <label>Luz dół (mm):</label>
        <input type="number" id="input-front-bottom" value="${state.project.front.clearance.bottom}" step="0.5" />
      </div>
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const numberInputs = [
    'board-thick', 'width', 'height', 'depth', 
    'front-gap', 'front-sides', 'front-top', 'front-bottom'
  ];
  const updateAll = () => { updateSidebar(); update3D(); };

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        const mod = state.project.modules[0]; // Modyfikujemy pierwszy moduł

        if (id === 'board-thick') state.project.materials.boardThickness = val;
        if (id === 'width') mod.dimensions.width = val;
        if (id === 'height') mod.dimensions.height = val;
        if (id === 'depth') mod.dimensions.depth = val;
        
        if (id === 'front-gap') state.project.front.gap = val;
        if (id === 'front-sides') state.project.front.clearance.sides = val;
        if (id === 'front-top') state.project.front.clearance.top = val;
        if (id === 'front-bottom') state.project.front.clearance.bottom = val;
        updateAll();
      });
    }
  });

  const distInput = document.getElementById('input-front-distribution');
  if (distInput) {
    distInput.addEventListener('input', (e) => {
      state.project.front.distribution = e.target.value;
      updateAll();
    });
  }

  document.getElementById('input-back-type').addEventListener('change', (e) => {
    state.project.backPanel.type = e.target.value;
    updateAll();
  });

  document.getElementById('input-front-active').addEventListener('change', (e) => {
    state.project.front.active = e.target.checked;
    document.getElementById('group-front-clearance').style.display = e.target.checked ? 'block' : 'none';
    updateAll();
  });

  document.getElementById('input-drawer-system').addEventListener('change', (e) => {
    state.project.front.drawerSystem = e.target.value;
    updateAll(); 
  });
}