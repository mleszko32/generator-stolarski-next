import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js"; // NOWY IMPORT

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
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const widthInput = document.getElementById("input-width");
  const heightInput = document.getElementById("input-height");
  const depthInput = document.getElementById("input-depth");

  widthInput.addEventListener("input", (e) => {
    state.project.dimensions.width = Number(e.target.value);
    updateSidebar(); // Przelicz i odśwież panel przy zmianie
  });

  heightInput.addEventListener("input", (e) => {
    state.project.dimensions.height = Number(e.target.value);
    updateSidebar(); // Przelicz i odśwież panel przy zmianie
  });

  depthInput.addEventListener("input", (e) => {
    state.project.dimensions.depth = Number(e.target.value);
    updateSidebar(); // Przelicz i odśwież panel przy zmianie
  });
}