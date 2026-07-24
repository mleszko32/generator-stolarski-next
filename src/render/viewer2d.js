// src/render/viewer2d.js

export function generateSidePanelSVG(height, depth, mountingData) {
  // Marginesy na rysunku, żeby wymiary się zmieściły
  const margin = 50; 
  const svgWidth = depth + margin * 2;
  const svgHeight = height + margin * 2;

  // Rozpoczynamy budowanie kodu SVG (ZAUWAŻ GRAWIS NA POCZĄTKU I KOŃCU)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%" style="background-color: #f8fafc; border: 1px solid #ccc;">`;

  // Przesuwamy cały rysunek o margines, żeby nie rysować od samego brzegu
  svg += `<g transform="translate(${margin}, ${margin})">`;

  // 1. Rysujemy obrys formatki boku (np. prawego)
  svg += `<rect x="0" y="0" width="${depth}" height="${height}" fill="#e2e8f0" stroke="#475569" stroke-width="2" />`;

  // Dodajemy wymiary gabarytowe formati
  svg += `<text x="${depth / 2}" y="-10" font-family="sans-serif" font-size="14" fill="#ef4444" text-anchor="middle">Głębokość: ${depth} mm</text>`;
  svg += `<text x="-10" y="${height / 2}" font-family="sans-serif" font-size="14" fill="#ef4444" text-anchor="middle" transform="rotate(-90, -10, ${height / 2})">Wysokość: ${height} mm</text>`;

  // 2. Nanosimy nawierty
  if (mountingData) {
    mountingData.forEach((drawer, index) => {
      if (!drawer.slideSideHoles) return;
      
      drawer.slideSideHoles.forEach(hole => {
        // Z modelu 3D: hole.y rośnie w górę od środka
        // W SVG: y rośnie w dół. 
        const svgY = height - (hole.y + (height / 2)); 
        
        // Z modelu 3D: hole.x to dystans od krawędzi przedniej
        const svgX = hole.x;

        // Rysujemy otwór (promień 2.5 mm dla wiertła 5 mm)
        svg += `<circle cx="${svgX}" cy="${svgY}" r="2.5" fill="#1e293b" />`;
        
        // Dopisujemy obok otworu jego współrzędne (X, Y od przedniej dolnej krawędzi)
        const warsztatY = (hole.y + (height / 2)).toFixed(1);
        svg += `<text x="${svgX + 5}" y="${svgY - 5}" font-family="sans-serif" font-size="8" fill="#64748b">${svgX}, ${warsztatY}</text>`;
      });
    });
  }

  svg += `</g></svg>`;
  return svg;
}