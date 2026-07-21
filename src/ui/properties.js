import { state } from "../core/state.js";

export function initPropertiesPanel() {
  // Szukamy naszego prawego panelu, który stworzyliśmy w layout.js
  const rightSidebar = document.querySelector(".sidebar-right");

  // Wstrzykujemy kod HTML z polami formularza, pobierając wartości prosto z obiektu 'state'
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
}