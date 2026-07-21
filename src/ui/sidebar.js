import { calculateParts } from "../engine/cabinet.js";

export function updateSidebar() {
  const leftSidebar = document.querySelector(".sidebar-left");
  
  // Pobieramy przeliczone formatki z naszego silnika
  const parts = calculateParts();

  let html = `<h2>Lista formatek</h2>`;
  html += `<ul class="parts-list">`;

  // Generujemy listę HTML na podstawie wyników
  parts.forEach(part => {
    html += `
      <li>
        <strong>${part.name}</strong> (x${part.qty})<br>
        <span>${part.length} mm x ${part.width} mm</span>
      </li>
    `;
  });

  html += `</ul>`;
  leftSidebar.innerHTML = html; // Wstrzykujemy do lewego panelu
}