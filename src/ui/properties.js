import { state } from "../core/state.js";

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

  // Po wstrzyknięciu HTML-a, podłączamy nasłuchiwanie na polach tekstowych
  setupEventListeners();
}

function setupEventListeners() {
  // Pobieramy referencje do naszych pól input po ich ID
  const widthInput = document.getElementById("input-width");
  const heightInput = document.getElementById("input-height");
  const depthInput = document.getElementById("input-depth");

  // Nasłuchujemy zdarzenia "input" (każde wciśnięcie klawisza/zmiana wartości)
  widthInput.addEventListener("input", (e) => {
    state.project.dimensions.width = Number(e.target.value);
    console.log("Aktualny stan projektu (Szerokość):", state.project.dimensions);
  });

  heightInput.addEventListener("input", (e) => {
    state.project.dimensions.height = Number(e.target.value);
    console.log("Aktualny stan projektu (Wysokość):", state.project.dimensions);
  });

  depthInput.addEventListener("input", (e) => {
    state.project.dimensions.depth = Number(e.target.value);
    console.log("Aktualny stan projektu (Głębokość):", state.project.dimensions);
  });
}