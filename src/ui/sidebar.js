// src/ui/sidebar.js
import { calculateParts } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js"; 

export function updateSidebar() {
  const leftSidebar = document.querySelector(".sidebar-left");
  const { parts, mountingData } = calculateParts();

  let html = `
    <button id="btn-print-2d" style="width: 100%; padding: 10px; margin-bottom: 15px; background-color: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      📄 Rysunek techniczny
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
    
    // Filtrujemy szuflady i rozbijamy licznik, żeby zachować spójną numerację
    let currentDrawerIndex = 1;

    mountingData.forEach((item) => {
      // DRZWI (ZAWIASY)
      if (item.type === 'door') {
        const sidePl = item.side === 'left' ? 'Lewe' : 'Prawe';
        const holesHtml = item.hinges.map(h => `Oś Y: <b>${h.y.toFixed(1)} mm</b> (Od dołu frontu: ${h.relY.toFixed(1)} mm)`).join('<br>');
        
        html += `
          <li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;">
            <strong>${item.name} (${sidePl})</strong><br>
            <div style="margin-top: 4px; color: #1e293b;">
              Liczba zawiasów: <b>${item.hinges.length} szt.</b>
            </div>
            <div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;">
              <b>Osie prowadników i puszek:</b><br>
              ${holesHtml}
            </div>
          </li>
        `;
      } 
      // SZUFLADY
      else if (item.type === 'drawer') {
        let slideY = "Brak";
        if (item.slideSideHoles && item.slideSideHoles.length > 0) {
          slideY = item.slideSideHoles[0].y;
        }

        let frontHolesHtml = "";
        if (item.frontHoles && item.frontHoles.length > 0) {
          frontHolesHtml = item.frontHoles.map(h => {
            const xL = Number(h.xOffsetLeft ?? h.xOffset ?? 20.5).toFixed(1);
            const xR = Number(h.xOffsetRight ?? h.xOffset ?? 20.5).toFixed(1);
            return `Y: <b>${Number(h.y).toFixed(1)} mm</b> (X lewy: ${xL} mm, X prawy: ${xR} mm, ⌀${h.diameter})`;
          }).join('<br>');
        }

        html += `
          <li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;">
            <strong>Szuflada ${currentDrawerIndex}</strong><br>
            <div style="margin-top: 4px; color: #1e293b;">
              Oś prowadnicy (bok): <b>${slideY !== "Brak" ? slideY + ' mm' : 'Brak'}</b>
            </div>
            <div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;">
              <b>Front (od dolnej krawędzi):</b><br>
              ${frontHolesHtml}
            </div>
          </li>
        `;
        currentDrawerIndex++;
      }
    });
    
    html += `</ul></details>`;
  }

  leftSidebar.innerHTML = html; 

  const printBtn = document.getElementById('btn-print-2d');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const sidePanel = parts.find(p => p.name.toLowerCase().includes('bok'));
      let drawHeight = 720;
      let drawDepth = 510;

      if (sidePanel) {
        drawHeight = sidePanel.length;
        drawDepth = sidePanel.width;
      } else {
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
  <title>Wydruk na produkcję - Rysunek techniczny</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .header { background-color: #ffffff; padding: 16px 24px; border-bottom: 1px solid #cbd5e1; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); z-index: 10; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; color: #0f172a; }
    .header p { margin: 0; font-size: 13px; color: #64748b; }
    .svg-container { flex-grow: 1; width: 100%; height: 100%; overflow: hidden; display: flex; justify-content: center; align-items: center; background-color: #f8fafc; }
    @media print { body { height: auto; overflow: visible; display: block; background: white; } .header { display: none; } .svg-container { display: block; overflow: visible; background: white; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Rysunek techniczny (Nawierty i Podziały)</h1>
    <p>Wymiary podane od przedniej, dolnej krawędzi formatki (X, Y). Użyj kółka myszy, aby przybliżać/oddalać. Przeciągaj lewym przyciskiem myszy, aby przesuwać obszar roboczy.</p>
  </div>
  <div class="svg-container">${svgContent}</div>
</body>
</html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    });
  }
}