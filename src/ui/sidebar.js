import { calculateParts } from "../engine/cabinet.js";

export function updateSidebar() {
  const leftSidebar = document.querySelector(".sidebar-left");
  
  // ZMIANA: Odbieramy oba zestawy danych z naszego silnika
  const { parts, mountingData } = calculateParts();

  let html = `<h2>Lista formatek</h2>`;
  html += `<ul class="parts-list">`;

  // Generujemy listę HTML dla formatek
  parts.forEach(part => {
    html += `
      <li>
        <strong>${part.name}</strong> (x${part.qty})<br>
        <span>${part.length} mm x ${part.width} mm</span>
      </li>
    `;
  });

  html += `</ul>`;

  // NOWOŚĆ: Sekcja nawiertów wyświetlana pod formatkami
  if (mountingData && mountingData.length > 0) {
    html += `<hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">`;
    html += `<h2>Osie prowadnic (od dołu)</h2>`;
    html += `<ul class="parts-list">`;
    
    mountingData.forEach((slide, index) => {
      // Oś prowadnicy na boku korpusu
      let slideY = "Brak";
      if (slide.slideSideHoles && slide.slideSideHoles.length > 0) {
        slideY = slide.slideSideHoles[0].y;
      }

      // Nawierty mocowania frontu (formatujemy do zgrabnej listy)
      let frontHolesHtml = "";
      if (slide.frontHoles && slide.frontHoles.length > 0) {
        frontHolesHtml = slide.frontHoles.map(h => 
          `Y: <b>${h.y} mm</b> (X: ${h.xOffset} mm, ⌀${h.diameter})`
        ).join('<br>');
      }

      html += `
        <li style="margin-bottom: 15px;">
          <strong>Szuflada ${index + 1}</strong><br>
          
          <div style="margin-top: 4px; color: #1e293b;">
            Korpus (Oś prowadnicy): <b>${slideY !== "Brak" ? slideY + ' mm' : 'Brak'}</b>
          </div>
          
          <div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;">
            <b>Front (od dolnej krawędzi):</b><br>
            ${frontHolesHtml}
          </div>
        </li>
      `;
    });
    
    html += `</ul>`;
  } // Koniec bloku "if"

  leftSidebar.innerHTML = html; 
} // Koniec głównej funkcji