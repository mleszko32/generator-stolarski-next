import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";

export function initPropertiesPanel() {
  const rightSidebar = document.querySelector(".sidebar-right");

  rightSidebar.innerHTML = `
    <h2>Parametry</h2>
    
    <div class="property-group">
      <label>Szerokość szafki (mm):</label>
      <input type="number" id="input-width" value="${state.project.dimensions.width}" />
    </div>
    
    <div class="property-group">
      <label>Wysokość szafki (mm):</label>
      <input type="number" id="input-height" value="${state.project.dimensions.height}" />
    </div>
    
    <div class="property-group">
      <label>Głębokość szafki (mm):</label>
      <input type="number" id="input-depth" value="${state.project.dimensions.depth}" />
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    
    <h3>System pleców</h3>
    <div class="property-group">
      <label>Typ montażu:</label>
      <select id="input-back-type">
        <option value="nut" ${state.project.backPanel.type === 'nut' ? 'selected' : ''}>W nucie (boki)</option>
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
  const inputs = ['width', 'height', 'depth', 'shelves', 'back-offset'];
  const updateAll = () => { updateSidebar(); update3D(); };

  inputs.forEach(id => {
    document.getElementById(`input-${id}`).addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (id === 'width') state.project.dimensions.width = val;
      if (id === 'height') state.project.dimensions.height = val;
      if (id === 'depth') state.project.dimensions.depth = val;
      if (id === 'shelves') state.project.interior.shelvesCount = val;
      if (id === 'back-offset') state.project.backPanel.offset = val;
      updateAll();
    });
  });

  const typeInput = document.getElementById('input-back-type');
  const offsetGroup = document.getElementById('group-back-offset');
  
  typeInput.addEventListener('change', (e) => {
    state.project.backPanel.type = e.target.value;
    // Ukrywamy pole "Odsunięcie nutu", gdy wybrano nakładane
    offsetGroup.style.display = e.target.value === 'nakladane' ? 'none' : 'block';
    updateAll();
  });
}