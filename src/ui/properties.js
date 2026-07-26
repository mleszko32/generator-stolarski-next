// src/ui/properties.js
import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { renderEditor2D } from "../render/editor2d.js"; 

export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");
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
    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
      <button id="btn-add-shelf" style="flex: 1; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">+ Dodaj Półkę</button>
      <button id="btn-add-partition" style="flex: 1; padding: 10px; background: #16a34a; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">+ Przegrodę</button>
    </div>
    <p style="font-size: 0.8em; color: #64748b;">Kliknij element na rysunku 2D, aby nim zarządzać.</p>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3>Ustawienia Frontów i Szuflad</h3>
    <p style="font-size: 0.8em; color: #64748b; margin-bottom: 10px;">(Wstawiaj szuflady klikając w puste strefy na widoku 2D)</p>
    
    <div id="group-front-clearance">
      <div class="property-group">
        <label>Typ frontów:</label>
        <select id="input-front-type">
          <option value="nakladane" ${(!state.project.front.type || state.project.front.type === 'nakladane') ? 'selected' : ''}>Nakładane</option>
          <option value="wpuszczane" ${state.project.front.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option>
        </select>
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
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const numberInputs = [
    'board-thick', 'width', 'height', 'depth', 
    'front-gap', 'front-sides', 'front-top', 'front-bottom'
  ];
  
  // Zaktualizowana funkcja odświeżająca - usunęliśmy stąd globalne nadpisywanie frontów!
  // Teraz tylko czysto odświeża widoki.
  const updateAll = () => { 
    renderEditor2D();
    update3D(); 
    updateSidebar(); 
  };
  
  const typeInput = document.getElementById('input-front-type');
  if (typeInput) {
    typeInput.addEventListener('change', (e) => {
      state.project.front.type = e.target.value;
      updateAll();
    });
  }

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        const mod = state.project.modules[0]; 

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

  document.getElementById('btn-add-shelf').addEventListener('click', () => {
    const mod = state.project.modules[0];
    const th = state.project.materials.boardThickness;
    mod.elements.push({
      id: 'poziom-' + Date.now(),
      typ: 'poziom',
      x: th, 
      y: mod.dimensions.height / 2 - (th/2), 
      w: mod.dimensions.width - (th * 2),
      h: th
    });
    updateAll();
  });

  document.getElementById('btn-add-partition').addEventListener('click', () => {
    const mod = state.project.modules[0];
    const th = state.project.materials.boardThickness;
    mod.elements.push({
      id: 'pion-' + Date.now(),
      typ: 'pion',
      x: mod.dimensions.width / 2 - (th/2), 
      y: th, 
      w: th,
      h: mod.dimensions.height - (th * 2)
    });
    updateAll();
  });

  document.getElementById('input-back-type').addEventListener('change', (e) => {
    state.project.backPanel.type = e.target.value;
    updateAll();
  });

  document.getElementById('input-drawer-system').addEventListener('change', (e) => {
    state.project.front.drawerSystem = e.target.value;
    updateAll(); 
  });
}