// src/render/viewer2d.js
import { calculateShelfHoles } from '../core/shelfMath.js';
import { state } from '../core/state.js';

export function generateSidePanelSVG(height, depth, mountingData) {
  const mod = state.project.modules[0];
  const cabWidth = parseFloat(mod?.dimensions?.width) || 600;
  const th = parseFloat(state.project.materials?.boardThickness) || 18;

  const cabX = 80;                 
  const gapBetween = 180;          
  const bokX = cabX + cabWidth + gapBetween; 
  const marginRight = 250; 
  const marginY = 80;
  
  const svgWidth = bokX + depth + marginRight;
  const svgHeight = height + marginY * 2;

  const formatVal = (val) => Number(Number(val).toFixed(1));

  let svg = `<svg id="side-panel-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="100%" style="background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; cursor: grab;">`;

  svg += `
    <script type="text/javascript">
      <![CDATA[
        setTimeout(() => {
          const svg = document.getElementById('side-panel-svg');
          if (!svg) return;
          let isPanning = false; let startPoint = { x: 0, y: 0 }; let viewBox = svg.viewBox.baseVal;
          svg.addEventListener('wheel', (e) => {
            e.preventDefault(); const zoom = e.deltaY > 0 ? 1.1 : 0.9; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
            viewBox.x = svgP.x - (svgP.x - viewBox.x) * zoom; viewBox.y = svgP.y - (svgP.y - viewBox.y) * zoom;
            viewBox.width *= zoom; viewBox.height *= zoom;
          }, { passive: false });
          svg.addEventListener('mousedown', (e) => {
            isPanning = true; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            startPoint = pt.matrixTransform(svg.getScreenCTM().inverse()); svg.style.cursor = 'grabbing';
          });
          window.addEventListener('mousemove', (e) => {
            if (!isPanning) return; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
            const currentPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
            viewBox.x -= (currentPoint.x - startPoint.x); viewBox.y -= (currentPoint.y - startPoint.y);
          });
          window.addEventListener('mouseup', () => { isPanning = false; svg.style.cursor = 'grab'; });
          window.addEventListener('mouseleave', () => { isPanning = false; svg.style.cursor = 'grab'; });
        }, 100);
      ]]>
    </script>
    <defs>
      <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#dc2626" />
      </marker>
      <marker id="arrow-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#475569" />
      </marker>
    </defs>
    <g transform="translate(0, ${marginY})">
  `;

  // ==========================================
  // CZĘŚĆ LEWA: KORPUS WNĘTRZE
  // ==========================================
  svg += `<text x="${cabX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS WNĘTRZE</text>`;

  svg += `<rect x="${cabX}" y="0" width="${th}" height="${height}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  svg += `<rect x="${cabX + cabWidth - th}" y="0" width="${th}" height="${height}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  svg += `<rect x="${cabX + th}" y="0" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  svg += `<rect x="${cabX + th}" y="${height - th}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  if (mod && mod.elements) {
    mod.elements.forEach(el => {
      if (el.typ === 'front') return;
      const elSvgX = cabX + el.x;
      const elSvgY = height - el.y - el.h; 
      let fillColor = '#cbd5e1'; 
      
      if (el.typ === 'poziom' && el.isStructural) fillColor = '#a7f3d0'; 

      svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
    });

    let yLines = [th, height - th];
    mod.elements.forEach(el => {
      if (el.typ === 'poziom') { yLines.push(el.y, el.y + el.h); }
    });
    yLines = [...new Set(yLines)].sort((a, b) => a - b);
    
    for (let i = 0; i < yLines.length - 1; i += 2) {
      const y1 = yLines[i];
      const y2 = yLines[i+1];
      const gap = formatVal(y2 - y1);
      if (gap > 0.5) {
        const svgY1 = height - y1;
        const svgY2 = height - y2;
        const midY = (svgY1 + svgY2) / 2;
        const midX = cabX + cabWidth / 2;
        
        svg += `<line x1="${midX}" y1="${svgY1}" x2="${midX}" y2="${svgY2}" stroke="#475569" stroke-width="1" marker-start="url(#arrow-dim)" marker-end="url(#arrow-dim)" />`;
        svg += `<rect x="${midX - 16}" y="${midY - 8}" width="32" height="16" fill="#f8fafc" />`;
        svg += `<text x="${midX}" y="${midY + 4}" font-size="11" fill="#475569" font-weight="bold" text-anchor="middle">${gap}</text>`;
      }
    }
  }

  // ==========================================
  // CZĘŚĆ PRAWA: BOK SZAFY (NAWIERTY)
  // ==========================================
  svg += `<text x="${bokX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK SZAFY</text>`;
  svg += `<rect x="${bokX}" y="0" width="${depth}" height="${height}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  svg += `<text x="${bokX + 15}" y="${height / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokX + 15}, ${height / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
  svg += `<text x="${bokX + depth - 15}" y="${height / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokX + depth - 15}, ${height / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;

  svg += `<line x1="${cabX - 20}" y1="${height}" x2="${bokX + depth + 140}" y2="${height}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" />`;
  svg += `<text x="${bokX + depth + 150}" y="${height + 4}" font-size="12" fill="#1e293b" font-weight="bold">0 mm (Baza modułu)</text>`;

  const topSetbackY = -10;
  svg += `<line x1="${bokX}" y1="${topSetbackY}" x2="${bokX + 37}" y2="${topSetbackY}" stroke="#dc2626" stroke-width="1" marker-start="url(#arrow-red)" marker-end="url(#arrow-red)" />`;
  svg += `<text x="${bokX + 18.5}" y="${topSetbackY - 6}" font-size="10" fill="#dc2626" text-anchor="middle" font-weight="bold">37</text>`;

  svg += `<line x1="${bokX + depth - 37}" y1="${topSetbackY}" x2="${bokX + depth}" y2="${topSetbackY}" stroke="#dc2626" stroke-width="1" marker-start="url(#arrow-red)" marker-end="url(#arrow-red)" />`;
  svg += `<text x="${bokX + depth - 18.5}" y="${topSetbackY - 6}" font-size="10" fill="#dc2626" text-anchor="middle" font-weight="bold">37</text>`;

  // --- NAWIERTY POD PÓŁKI ---
  const shelfHoles = calculateShelfHoles();
  
  if (shelfHoles && shelfHoles.length > 0) {
    shelfHoles.forEach(hole => {
      const svgX = bokX + depth - hole.x; 
      const svgY = height - hole.y;
      
      const radius = hole.diameter ? (hole.diameter / 2) : (hole.isCenter ? 3 : 2);
      const color = hole.color || (hole.isCenter ? '#d97706' : '#fcd34d');
      
      svg += `<circle cx="${svgX}" cy="${svgY}" r="${radius}" fill="${color}" />`;
    });

    const uniqueYs = [...new Set(shelfHoles.map(h => h.y))].sort((a, b) => b - a);

    uniqueYs.forEach(y => {
      const holeObj = shelfHoles.find(h => h.y === y && h.isCenter);
      if (!holeObj) return; 

      const isCenter = true;
      const isStructural = (holeObj.isStructural === true);
      
      const svgY = height - y;
      const yBottom = formatVal(y);
      const yTop = formatVal(height - y);
      const label = `${yBottom} (${yTop})`;

      const color = isStructural ? '#ea580c' : '#fcd34d';
      const fontSize = isStructural ? 12 : 10;
      const fontWeight = isStructural ? 'bold' : 'normal';

      const lineEndX = bokX + depth + (isStructural ? 60 : 40);
      svg += `<line x1="${bokX + depth}" y1="${svgY}" x2="${lineEndX}" y2="${svgY}" stroke="${color}" stroke-width="1" stroke-dasharray="2,2" />`;
      svg += `<text x="${lineEndX + 8}" y="${svgY + (isStructural ? 4 : 3)}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">${label}</text>`;

      if (isStructural) {
        svg += `<line x1="${cabX + cabWidth}" y1="${svgY}" x2="${bokX}" y2="${svgY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4,4" />`;
        svg += `<text x="${cabX + cabWidth + gapBetween/2}" y="${svgY - 6}" font-size="12" font-weight="bold" fill="#1e3a8a" text-anchor="middle">Oś: ${yBottom}</text>`;
      }
    });

    const centerYs = [...new Set(shelfHoles.filter(h => h.isCenter && h.isStructural).map(h => h.y))].sort((a, b) => b - a);
    if (centerYs.length > 1) {
      const dimX = bokX + depth / 2; 
      for (let i = 0; i < centerYs.length - 1; i++) {
        const y1 = centerYs[i];
        const y2 = centerYs[i + 1];
        const svgY1 = height - y1;
        const svgY2 = height - y2;
        const dist = formatVal(y1 - y2);

        svg += `<line x1="${dimX}" y1="${svgY1}" x2="${dimX}" y2="${svgY2}" stroke="#ea580c" stroke-width="0.75" />`;
        
        const midY = (svgY1 + svgY2) / 2;
        const boxWidth = 36;
        const boxHeight = 16;
        svg += `<rect x="${dimX - boxWidth/2}" y="${midY - boxHeight/2}" width="${boxWidth}" height="${boxHeight}" fill="#ffffff" stroke="#ea580c" stroke-width="1" rx="2" />`;
        svg += `<text x="${dimX}" y="${midY + 3.5}" font-size="10" fill="#ea580c" font-weight="bold" text-anchor="middle">${dist}</text>`;
      }
    }
  }

  // --- NAWIERTY POD PROWADNICE (Niebieskie) ---
  if (mountingData) {
    mountingData.forEach((drawer) => {
      if (!drawer.slideSideHoles || drawer.slideSideHoles.length === 0) return;

      const axisYFromBottom = formatVal(drawer.slideSideHoles[0].y);
      const svgY = height - drawer.slideSideHoles[0].y;
      const yFromTop = formatVal(height - drawer.slideSideHoles[0].y);

      // ZMIANA: Szukamy najdalej odsuniętego otworu (najbardziej z tyłu) by podczepić pod niego początek linii
      const maxHoleX = Math.max(...drawer.slideSideHoles.map(h => h.x));
      const rearHoleSvgX = bokX + depth - maxHoleX;
      const lineEndX = bokX + depth + 140;

      // ZMIANA: Linia osi rysowana od tylnego otworu w prawo na zewnątrz
      svg += `<line x1="${rearHoleSvgX}" y1="${svgY}" x2="${lineEndX}" y2="${svgY}" stroke="#bae6fd" stroke-width="1" stroke-dasharray="4,4" />`;

      drawer.slideSideHoles.forEach(hole => {
        const svgX = bokX + depth - hole.x;
        
        // Punkt nawiertu prowadnicy
        svg += `<circle cx="${svgX}" cy="${svgY}" r="3" fill="#0284c7" />`;
        
        // ZMIANA: Dodanie wymiaru X opuszczonego w dół pod każdy nawiert
        svg += `<line x1="${svgX}" y1="${svgY + 5}" x2="${svgX}" y2="${svgY + 18}" stroke="#7dd3fc" stroke-width="1" />`;
        svg += `<text x="${svgX}" y="${svgY + 28}" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">${formatVal(hole.x)}</text>`;
      });

      // Prawa etykieta opisu
      const label = `Prowadnik: ${axisYFromBottom} (${yFromTop})`;
      svg += `<text x="${lineEndX + 8}" y="${svgY + 4}" font-size="12" font-weight="bold" fill="#0284c7">${label}</text>`;
    });
  }

  svg += `</g></svg>`;
  return svg;
}