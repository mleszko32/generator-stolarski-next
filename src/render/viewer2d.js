// src/render/viewer2d.js

export function generateSidePanelSVG(height, depth, mountingData) {
  // Zwiększone marginesy, aby zmieścić oznaczenie bazy i wymiary
  const marginX = 100; 
  const marginY = 100;
  const svgWidth = depth + marginX * 2;
  const svgHeight = height + marginY * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%" style="background-color: #ffffff; font-family: sans-serif;">`;

  // Definicja strzałek
  svg += `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#475569" />
      </marker>
      <!-- Niebieska strzałka dla wskaźnika Bazy -->
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#2563eb" />
      </marker>
    </defs>
  `;

  svg += `<g transform="translate(${marginX}, ${marginY})">`;

  // 1. Obrys formatki boku
  svg += `<rect x="0" y="0" width="${depth}" height="${height}" fill="#f8fafc" stroke="#1e293b" stroke-width="2" />`;

  // 2. Znacznik BAZY (Lewy dolny róg - punkt zerowy)
  svg += `
    <g transform="translate(0, ${height})">
      <circle cx="0" cy="0" r="5" fill="#2563eb" />
      <!-- Oś X (od przodu) -->
      <line x1="0" y1="25" x2="60" y2="25" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)" />
      <text x="30" y="42" font-size="13" fill="#2563eb" text-anchor="middle" font-weight="bold">X (przód)</text>
      <!-- Oś Y (od dołu) -->
      <line x1="-25" y1="0" x2="-25" y2="-60" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)" />
      <text x="-35" y="-30" font-size="13" fill="#2563eb" text-anchor="middle" font-weight="bold" transform="rotate(-90, -35, -30)">Y (dół)</text>
    </g>
  `;

  // 3. Gabaryt - Głębokość (góra)
  svg += `<line x1="0" y1="-20" x2="${depth}" y2="-20" stroke="#475569" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)" />`;
  svg += `<text x="${depth / 2}" y="-30" font-size="14" fill="#1e293b" text-anchor="middle" font-weight="bold">${depth} mm</text>`;

  // 4. Gabaryt - Wysokość (lewa strona, przesunięte by nie nachodzić na bazę)
  svg += `<line x1="-50" y1="0" x2="-50" y2="${height}" stroke="#475569" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)" />`;
  svg += `<text x="-60" y="${height / 2}" font-size="14" fill="#1e293b" text-anchor="middle" font-weight="bold" transform="rotate(-90, -60, ${height / 2})">${height} mm</text>`;

  // 5. Nanoszenie nawiertów i osi prowadnic
  if (mountingData) {
    mountingData.forEach((drawer) => {
      if (!drawer.slideSideHoles || drawer.slideSideHoles.length === 0) return;

      const axisYFromBottom = drawer.slideSideHoles[0].y; 
      const svgY = height - axisYFromBottom;

      // Przerywana oś prowadnicy
      svg += `<line x1="0" y1="${svgY}" x2="${depth}" y2="${svgY}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6,4" />`;
      
      // Pionowa linia wymiarowa po prawej stronie, łącząca dolną krawędź z osią
      svg += `<line x1="${depth + 15}" y1="${height}" x2="${depth + 15}" y2="${svgY}" stroke="#94a3b8" stroke-width="1.5" marker-start="url(#arrow)" marker-end="url(#arrow)" />`;
      
      // Wartość Y w pionie na linii wymiarowej
      const textY = svgY + (axisYFromBottom / 2);
      svg += `<text x="${depth + 22}" y="${textY}" font-size="13" fill="#0f172a" font-weight="bold" transform="rotate(-90, ${depth + 22}, ${textY})" text-anchor="middle">${axisYFromBottom.toFixed(1)}</text>`;

      // Punkty wierceń i same wartości X nad nimi
      drawer.slideSideHoles.forEach(hole => {
        const svgX = hole.x;
        const hY = height - hole.y; 

        svg += `<circle cx="${svgX}" cy="${hY}" r="4" fill="#dc2626" />`;
        // Czysta liczba nad czerwonym punktem (zastępuje "X: ...")
        svg += `<text x="${svgX}" y="${hY - 10}" font-size="13" fill="#dc2626" text-anchor="middle" font-weight="bold">${svgX.toFixed(1)}</text>`;
      });
    });
  }

  svg += `</g></svg>`;
  return svg;
}