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

    <div class="property-group">
      <label>Ilość półek:</label>
      <input type="number" id="input-shelves" value="${state.project.interior.shelvesCount}" min="0" max="10" />
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const widthInput = document.getElementById("input-width");
  const heightInput = document.getElementById("input-height");
  const depthInput = document.getElementById("input-depth");
  const shelvesInput = document.getElementById("input-shelves");

  // Pomocnicza funkcja odświeżająca wszystko naraz
  const updateAll = () => {
    updateSidebar();
    update3D();
  };

  widthInput.addEventListener("input", (e) => {
    state.project.dimensions.width = Number(e.target.value);
    updateAll();
  });

  heightInput.addEventListener("input", (e) => {
    state.project.dimensions.height = Number(e.target.value);
    updateAll();
  });

  depthInput.addEventListener("input", (e) => {
    state.project.dimensions.depth = Number(e.target.value);
    updateAll();
  });

  shelvesInput.addEventListener("input", (e) => {
    state.project.interior.shelvesCount = Number(e.target.value);
    updateAll();
  });
}