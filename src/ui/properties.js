import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";

export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");

  rightSidebar.innerHTML = `
    <h2>Parametry</h2>
    <div class="property-group">
      <label>Grubość płyty (mm):</label>
      <input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" />
    </div>
    <div class="property-group">
      <label>Szerokość (mm):</label>
      <input type="number" id="input-width" value="${state.project.dimensions.width}" />
    </div>
    <div class="property-group">
      <label>Wysokość (mm):</label>
      <input type="number" id="input-height" value="${state.project.dimensions.height}" />
    </div>
    <div class="property-group">
      <label>Głębokość (mm):</label>
      <input type="number" id="input-depth" value="${state.project.dimensions.depth}" />
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
<input type="text" id="input-front-distribution" value="${state.project.front.distribution || '1'}" placeholder="np. 1:1:141" />
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
    
    <h3>System pleców</h3>
    <div class="property-group">
      <label>Montaż:</label>
      <select id="input-back-type">
        <option value="nut" ${state.project.backPanel.type === 'nut' ? 'selected' : ''}>W nucie</option>
        <option value="nakladane" ${state.project.backPanel.type === 'nakladane' ? 'selected' : ''}>Nakładane</option>
      </select>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  // Usunęliśmy 'front-count', bo to teraz ciąg znaków, a nie zwykła liczba
  const numberInputs = [
    'board-thick', 'width', 'height', 'depth', 
    'front-gap', 'front-sides', 'front-top', 'front-bottom'
  ];
  const updateAll = () => { updateSidebar(); update3D(); };

  // 1. Obsługa wszystkich pól numerycznych
  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (id === 'board-thick') state.project.materials.boardThickness = val;
        if (id === 'width') state.project.dimensions.width = val;
        if (id === 'height') state.project.dimensions.height = val;
        if (id === 'depth') state.project.dimensions.depth = val;
        
        if (id === 'front-gap') state.project.front.gap = val;
        if (id === 'front-sides') state.project.front.clearance.sides = val;
        if (id === 'front-top') state.project.front.clearance.top = val;
        if (id === 'front-bottom') state.project.front.clearance.bottom = val;
        updateAll();
      });
    }
  });

  // 2. Oddzielna obsługa pola tekstowego (ciąg dystrybucyjny)
  const distInput = document.getElementById('input-front-distribution');
  if (distInput) {
    distInput.addEventListener('input', (e) => {
      // Zapisujemy wartość jako tekst (string) bezpośrednio do stanu
      state.project.front.distribution = e.target.value;
      updateAll();
    });
  }

  // 3. Obsługa pozostałych elementów (select, checkbox)
  document.getElementById('input-back-type').addEventListener('change', (e) => {
    state.project.backPanel.type = e.target.value;
    updateAll();
  });

  document.getElementById('input-front-active').addEventListener('change', (e) => {
    state.project.front.active = e.target.checked;
    document.getElementById('group-front-clearance').style.display = e.target.checked ? 'block' : 'none';
    updateAll();
  });
}