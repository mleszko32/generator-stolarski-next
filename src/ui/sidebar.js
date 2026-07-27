// src/ui/sidebar.js
import { calculateParts } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js"; 

export function updateSidebar() {
  const leftSidebar = document.querySelector(".sidebar-left");
  
  // Odbieramy oba zestawy danych z naszego silnika
  const { parts, mountingData } = calculateParts();

  let html = `
    <button id="btn-print-2d" style="width: 100%; padding: 10px; margin-bottom: 15px; background-color: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      📄 Generuj Rysunek 2D (Bok)
    </button>
  `;

  html += `<details open style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">`;
  html += `<summary style="font-weight: bold; cursor: pointer; outline: none;">Lista formatek</summary>`;
  html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 20px;">`;

  parts.forEach(part => {
    html += `
      <li style="margin-bottom: 5px;">
        <strong>${part.name}</strong> (x${part.qty})<br>
        <span style="color: #475569;">${part.length} mm x ${part.width} mm</span>
      </li>
    `;
  });

  html += `</ul></details>`;

  if (mountingData && mountingData.length > 0) {
    html += `<details style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none;">Osie prowadnic i nawierty</summary>`;
    html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 0; list-style: none;">`;
    
    mountingData.forEach((slide, index) => {
      let slideY = "Brak";
      if (slide.slideSideHoles && slide.slideSideHoles.length > 0) {
        slideY = slide.slideSideHoles[0].y;
      }

      let frontHolesHtml = "";
      if (slide.frontHoles && slide.frontHoles.length > 0) {
        frontHolesHtml = slide.frontHoles.map(h => 
          `Y: <b>${h.y} mm</b> (X: ${h.xOffset} mm, ⌀${h.diameter})`
        ).join('<br>');
      }

      html += `
        <li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;">
          <strong>Szuflada ${index + 1}</strong><br>
          <div style="margin-top: 4px; color: #1e293b;">
            Oś prowadnicy (bok): <b>${slideY !== "Brak" ? slideY + ' mm' : 'Brak'}</b>
          </div>
          <div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;">
            <b>Front (od dolnej krawędzi):</b><br>
            ${frontHolesHtml}
          </div>
        </li>
      `;
    });
    
    html += `</ul></details>`;
  }

  leftSidebar.innerHTML = html; 

  const printBtn = document.getElementById('btn-print-2d');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      
      // SZUKAMY WYMIARÓW KONKRETNEJ FORMATKI
      // Dzięki temu ignorujemy wymiar korpusu i bierzemy to, co pójdzie na piłę
      const sidePanel = parts.find(p => p.name.toLowerCase().includes('bok'));
      
      let drawHeight = 720;
      let drawDepth = 510;

      if (sidePanel) {
        // Jeśli znajdziemy bok w formakach, bierzemy jego wymiary (czyli głębokość pomniejszoną o plecy)
        drawHeight = sidePanel.length;
        drawDepth = sidePanel.width;
      } else {
        // Zabezpieczenie, gdyby ktoś wykasował boki z logiki
        drawHeight = parseFloat(document.getElementById('input-height').value) || 720;
        drawDepth = parseFloat(document.getElementById('input-depth').value) || 510;
      }
      
      const svgContent = generateSidePanelSVG(drawHeight, drawDepth, mountingData);
      
      const htmlContent = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wydruk na produkcję - Bok szafki</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      display: flex;
      flex-direction: column;
      height: 100vh; /* Rozciąga body na całą wysokość ekranu */
      overflow: hidden; /* Blokuje domyślne przewijanie strony, skrypt odzyskuje kółko myszy */
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    .header {
      background-color: #ffffff;
      padding: 16px 24px;
      border-bottom: 1px solid #cbd5e1;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      z-index: 10;
    }
    
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 20px;
      color: #0f172a;
    }
    
    .header p {
      margin: 0;
      font-size: 13px;
      color: #64748b;
    }

    .svg-container {
      flex-grow: 1;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #f8fafc;
    }
    
    /* Ukrywanie paska nawigacji podczas fizycznego wydruku */
    @media print {
      body { height: auto; overflow: visible; display: block; background: white; }
      .header { display: none; }
      .svg-container { display: block; overflow: visible; background: white; }
    }
  </style>
</head>
<body>
  
  <div class="header">
    <h1>Rysunek techniczny: Bok szafki (nawierty)</h1>
    <p>Wymiary podane od przedniej, dolnej krawędzi formatki (X, Y). Użyj kółka myszy, aby przybliżać/oddalać. Przeciągaj lewym przyciskiem myszy, aby przesuwać obszar roboczy.</p>
  </div>

  <div class="svg-container">
    ${svgContent}
  </div>

</body>
</html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    });
  }
}