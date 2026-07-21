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
    
    <h3>Front</h3>
    <div class="property-group" style="flex-direction: row; align-items: center; justify-content: space-between;">
      <label>Dodaj front:</label>
      <input type="checkbox" id="input-front-active" ${state.project.front.active ? 'checked' : ''} style="width: auto;" />
    </div>
    <div id="group-front-clearance" style="${state.project.front.active ? 'display: block;' : 'display: none;'}">
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
    <div class="property-group" id="group-back-offset" style="${state.project.backPanel.type === 'nakladane' ? 'display: none;' : ''}">
      <label>Odsunięcie nutu (mm):</label>
      <input type="number" id="input-back-offset" value="${state.project.backPanel.offset}" />
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <div class="property-group">
      <label>Ilość półek:</label>
      <input type="number" id="input-shelves" value="${state.project.interior.shelvesCount}" min="0" max="10" />
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const inputs = ['board-thick', 'width', 'height', 'depth', 'shelves', 'back-offset', 'front-sides', 'front-top', 'front-bottom'];
  const updateAll = () => { updateSidebar(); update3D(); };

  inputs.forEach(id => {
    document.getElementById(`input-${id}`).addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (id === 'board-thick') state.project.materials.boardThickness = val;
      if (id === 'width') state.project.dimensions.width = val;
      if (id === 'height') state.project.dimensions.height = val;
      if (id === 'depth') state.project.dimensions.depth = val;
      if (id === 'shelves') state.project.interior.shelvesCount = val;
      if (id === 'back-offset') state.project.backPanel.offset = val;
      if (id === 'front-sides') state.project.front.clearance.sides = val;
      if (id === 'front-top') state.project.front.clearance.top = val;
      if (id === 'front-bottom') state.project.front.clearance.bottom = val;
      updateAll();
    });
  });

  document.getElementById('input-back-type').addEventListener('change', (e) => {
    state.project.backPanel.type = e.target.value;
    document.getElementById('group-back-offset').style.display = e.target.value === 'nakladane' ? 'none' : 'block';
    updateAll();
  });

  document.getElementById('input-front-active').addEventListener('change', (e) => {
    state.project.front.active = e.target.checked;
    document.getElementById('group-front-clearance').style.display = e.target.checked ? 'block' : 'none';
    updateAll();
  });
}