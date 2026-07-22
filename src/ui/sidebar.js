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
      // Wyciągamy wartość Y z pierwszego otworu montażowego w tablicy
      let yValue = "Brak";
      if (slide.slideSideHoles && slide.slideSideHoles.length > 0) {
        yValue = slide.slideSideHoles[0].y;
      }

      html += `
        <li style="margin-bottom: 10px;">
          <strong>Szuflada ${index + 1}</strong><br>
          <span>Wysokość (Y): <b>${yValue !== null ? yValue + ' mm' : '<span style="color:red">null</span>'}</b></span>
        </li>
      `;
    });
    
    html += `</ul>`;
  } // Koniec bloku "if"

  leftSidebar.innerHTML = html; // Wstrzykujemy całość do lewego panelu
} // Koniec głównej funkcji updateSidebar