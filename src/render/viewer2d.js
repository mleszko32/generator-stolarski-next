// src/render/viewer2d.js
import { calculateShelfHoles } from '../core/shelfMath.js';
import { calculateDrawerHoles } from '../core/drawerMath.js';
import { state } from '../core/state.js';

export function generateSidePanelSVG(height, depth, mountingData = [], viewMode = 'all') {
  const mod = state.project.modules.find(m => m.id === state.activeModuleId) || state.project.modules[0];
  if (!mod) return '<svg></svg>';

  const config = state.project;
  const cabWidth = parseFloat(mod.dimensions?.width) || 600;
  const th = parseFloat(config.materials?.boardThickness) || 18;

  const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;
  const viewH = sideH; 

  // --- DYNAMICZNY UKŁAD (Rysujemy tylko wybrane) ---
  let currentX = 80;
  const gapBetween = 400; 
  
  let cabX = -9999, bokLX = -9999, bokRX = -9999, frontX = -9999;

  if (viewMode === 'all' || viewMode === 'korpus') { 
      cabX = currentX; currentX += cabWidth + gapBetween; 
  }
  if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') { 
      bokLX = currentX; currentX += depth + gapBetween; 
  }
  if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') { 
      bokRX = currentX; currentX += depth + gapBetween; 
  }
  if (viewMode === 'all' || viewMode === 'front') { 
      frontX = currentX; currentX += cabWidth + gapBetween; 
  }

  const marginRight = 400; 
  const marginY = 180; 
  const svgWidth = Math.max(800, currentX - gapBetween + marginRight);
  const svgHeight = sideH + marginY * 2;

  const formatVal = (val) => Number(Number(val).toFixed(1));

  const dimV = (x, y1, y2, val, color="#dc2626", marker="arrow-red") => {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const midY = (minY + maxY) / 2;
      let res = `<line x1="${x}" y1="${minY}" x2="${x}" y2="${maxY}" stroke="${color}" stroke-width="1.5" marker-start="url(#${marker})" marker-end="url(#${marker})" />`;
      res += `<rect x="${x-18}" y="${midY-8}" width="36" height="16" fill="#f8fafc" />`;
      res += `<text x="${x}" y="${midY+4}" font-size="10" fill="${color}" font-weight="bold" text-anchor="middle">${val}</text>`;
      return res;
  };

  const dimH = (x1, x2, y, val, color="#dc2626", marker="arrow-red") => {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const midX = (minX + maxX) / 2;
      let res = `<line x1="${minX}" y1="${y}" x2="${maxX}" y2="${y}" stroke="${color}" stroke-width="1.5" marker-start="url(#${marker})" marker-end="url(#${marker})" />`;
      res += `<rect x="${midX-16}" y="${y-8}" width="32" height="16" fill="#f8fafc" />`;
      res += `<text x="${midX}" y="${y+4}" font-size="10" fill="${color}" font-weight="bold" text-anchor="middle">${val}</text>`;
      return res;
  };

  let svg = `<svg id="side-panel-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 -100 ${svgWidth} ${svgHeight + 100}" width="100%" height="100%" style="background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; cursor: grab;">`;

  svg += `
    <defs>
      <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#dc2626" />
      </marker>
      <marker id="arrow-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#475569" />
      </marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#0284c7" />
      </marker>
      <marker id="arrow-purple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#9333ea" />
      </marker>
      <marker id="arrow-amber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#f59e0b" />
      </marker>
      <marker id="arrow-slate" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#64748b" />
      </marker>
    </defs>
    <g transform="translate(0, ${marginY})">
  `;

  // --- LEGENDA NAWIERTÓW (Rysowana zawsze u góry) ---
  svg += `
    <g transform="translate(80, -150)">
        <text x="0" y="0" font-size="14" fill="#1e293b" font-weight="bold">LEGENDA NAWIERTÓW I WYMIARÓW:</text>
        <circle cx="0" cy="20" r="4" fill="#9333ea"/><circle cx="12" cy="20" r="1.5" fill="#9333ea"/>
        <text x="22" y="24" font-size="12" fill="#9333ea">Konstrukcja: Wieńce / Półki stałe (Kołki + Wkręty)</text>
        <circle cx="0" cy="45" r="2.5" fill="#f59e0b"/>
        <text x="22" y="49" font-size="12" fill="#f59e0b">Podpórki półek ruchomych (5mm)</text>
        <circle cx="340" cy="20" r="2.5" fill="#0284c7"/>
        <text x="352" y="24" font-size="12" fill="#0284c7">Prowadnice szuflad (5mm)</text>
        <circle cx="340" cy="45" r="2.5" fill="#dc2626"/>
        <text x="352" y="49" font-size="12" fill="#dc2626">Mocowania frontu szuflady</text>
        <circle cx="560" cy="20" r="2.5" fill="#16a34a"/>
        <text x="572" y="24" font-size="12" fill="#16a34a">Zawiasy i prowadniki zawiasów</text>
    </g>
  `;

  svg += `<line x1="60" y1="${sideH}" x2="${svgWidth - 100}" y2="${sideH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" />`;
  svg += `<text x="${svgWidth - 90}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold">0 mm (Baza modułu)</text>`;

  // ==========================================
  // CZĘŚĆ 1: KORPUS WNĘTRZE
  // ==========================================
  if (viewMode === 'all' || viewMode === 'korpus') {
      svg += `<text x="${cabX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS WNĘTRZE</text>`;
      
      if (isTopBottomFullWidth) {
        svg += `<rect x="${cabX}" y="0" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX}" y="${viewH - th}" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX}" y="${th}" width="${th}" height="${viewH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX + cabWidth - th}" y="${th}" width="${th}" height="${viewH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
      } else {
        svg += `<rect x="${cabX}" y="0" width="${th}" height="${viewH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        svg += `<rect x="${cabX + cabWidth - th}" y="0" width="${th}" height="${viewH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        svg += `<rect x="${cabX + th}" y="${viewH - th}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        
        if (cons.topType === 'pelny') {
          svg += `<rect x="${cabX + th}" y="0" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        } else if (cons.topType === 'trawersy_pion') {
          svg += `<rect x="${cabX + th}" y="0" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
          svg += `<rect x="${cabX + cabWidth - th * 2}" y="0" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        } else if (cons.topType === 'trawersy_poziom') {
          svg += `<rect x="${cabX + th}" y="0" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        }
      }

      if (mod && mod.elements) {
        mod.elements.forEach(el => {
          if (el.typ === 'front') return;
          const elSvgX = cabX + el.x;
          let drawY = isTopBottomFullWidth ? el.y - th : el.y;
          const elSvgY = viewH - drawY - el.h; 
          let fillColor = (el.typ === 'poziom' && el.isStructural) ? '#a7f3d0' : '#cbd5e1'; 
          svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
        });

        let yLines = [th, height - th];
        mod.elements.forEach(el => { if (el.typ === 'poziom') { yLines.push(el.y, el.y + el.h); } });
        yLines = [...new Set(yLines)].sort((a, b) => a - b);
        
        svg += `<g class="layer-dim-gaps">`;
        for (let i = 0; i < yLines.length - 1; i += 2) {
          const y1 = yLines[i];
          const y2 = yLines[i+1];
          const gap = formatVal(y2 - y1);
          if (gap > 0.5) {
            let drawY1 = y1; let drawY2 = y2;
            if (isTopBottomFullWidth) { drawY1 -= th; drawY2 -= th; }
            
            const svgY1 = viewH - drawY1;
            const svgY2 = viewH - drawY2;
            const midY = (svgY1 + svgY2) / 2;
            const midX = cabX + cabWidth / 2;
            
            svg += `<line x1="${midX}" y1="${svgY1}" x2="${midX}" y2="${svgY2}" stroke="#475569" stroke-width="1" marker-start="url(#arrow-dim)" marker-end="url(#arrow-dim)" />`;
            svg += `<rect x="${midX - 16}" y="${midY - 8}" width="32" height="16" fill="#f8fafc" />`;
            svg += `<text x="${midX}" y="${midY + 4}" font-size="11" fill="#475569" font-weight="bold" text-anchor="middle">${gap}</text>`;
          }
        }
        svg += `</g>`;
      }
  }

  // ==========================================
  // CZĘŚĆ 2 i 3: BOKI (Rysowanie obrysów)
  // ==========================================
  if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
      svg += `<text x="${bokLX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK LEWY</text>`;
      svg += `<rect x="${bokLX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
      svg += `<text x="${bokLX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
      svg += `<text x="${bokLX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
  }

  if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
      svg += `<text x="${bokRX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK PRAWY</text>`;
      svg += `<rect x="${bokRX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
      svg += `<text x="${bokRX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokRX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
      svg += `<text x="${bokRX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokRX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
  }

  // --- ZBIERANIE OSI Y DLA BOKÓW I RYSOWANIE KROPEK ---
  let drawerYs = new Set();
  let corpusYs = new Set(); 
  let shelfYs = new Set(); 

  const shelfHoles = calculateShelfHoles();
  if (shelfHoles && shelfHoles.length > 0) {
    shelfHoles.forEach(hole => {
      let calcY = isTopBottomFullWidth ? hole.y - th : hole.y;
      const svgY = sideH - calcY;
      
      const isStruct = hole.isStructural === true || hole.type === 'konstrukcyjna';
      const color = isStruct ? '#9333ea' : '#f59e0b';
      const radius = hole.diameter ? (hole.diameter / 2) : 2.5; 
      const layerClass = isStruct ? 'layer-holes-corpus' : 'layer-holes-shelf';
      
      svg += `<g class="${layerClass}">`;
      if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
          svg += `<circle cx="${bokLX + hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      }
      if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
          svg += `<circle cx="${bokRX + depth - hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      }
      svg += `</g>`;

      if (isStruct && hole.isCenter) corpusYs.add(calcY);
      else if (!isStruct && hole.isCenter) shelfYs.add(calcY);
    });
  }

  if (mountingData) {
    mountingData.forEach((data) => {
      if (data.type === 'door') {
        data.hinges.forEach(hinge => {
          let calcY = isTopBottomFullWidth ? hinge.y - th : hinge.y;
          const svgY = sideH - calcY;
          
          svg += `<g class="layer-holes-hinge">`;
          if (data.side === 'left' && (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki')) {
            const svgX = bokLX + 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
            svg += `<text x="${svgX + 8}" y="${svgY + 4}" font-size="10" font-weight="bold" fill="#16a34a">Y: ${formatVal(hinge.y)}</text>`;
          } else if (data.side === 'right' && (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki')) {
            const svgX = bokRX + depth - 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
            svg += `<text x="${svgX - 8}" y="${svgY + 4}" font-size="10" font-weight="bold" fill="#16a34a" text-anchor="end">Y: ${formatVal(hinge.y)}</text>`;
          }
          svg += `</g>`;
        });
      } 
      else if (data.type === 'drawer' && data.slideSideHoles && data.slideSideHoles.length > 0) {
        let calcY = isTopBottomFullWidth ? data.slideSideHoles[0].y - th : data.slideSideHoles[0].y;
        drawerYs.add(calcY);
        const svgY = sideH - calcY;
        
        svg += `<g class="layer-holes-drawer">`;
        data.slideSideHoles.forEach(hole => {
          if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
              svg += `<circle cx="${bokLX + hole.x}" cy="${svgY}" r="2.5" fill="#0284c7" />`;
          }
          if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
              svg += `<circle cx="${bokRX + depth - hole.x}" cy="${svgY}" r="2.5" fill="#0284c7" />`;
          }
        });
        svg += `</g>`;
      }
      else if (data.type === 'corpus') {
        svg += `<g class="layer-holes-corpus">`;
        data.holes.forEach(h => {
          let calcY = isTopBottomFullWidth ? h.y - th : h.y;
          if (h.holeType === 'screw') corpusYs.add(calcY);

          const svgY = sideH - calcY;
          const radius = h.holeType === 'screw' ? 1.5 : 4; 
          const color = '#9333ea';

          if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
              svg += `<circle cx="${bokLX + h.xFromFront}" cy="${svgY}" r="${radius}" fill="${color}" />`;
          }
          if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
              svg += `<circle cx="${bokRX + depth - h.xFromFront}" cy="${svgY}" r="${radius}" fill="${color}" />`;
          }
        });
        svg += `</g>`;
      }
    });
  }

  // --- RYSOWANIE STRZAŁK WYMIAROWYCH (DLA WYBRANYCH BOKÓW) ---
  const sortedDrawerYs = Array.from(drawerYs).sort((a,b) => a - b);
  const sortedCorpusYs = Array.from(corpusYs).sort((a,b) => a - b);
  const sortedShelfYs = Array.from(shelfYs).sort((a,b) => a - b);

  if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
      let currentDimX_L = bokLX - 25;
      
      if (sortedDrawerYs.length > 0) {
        svg += `<g class="layer-holes-drawer">`;
        sortedDrawerYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokLX}" y1="${holeSvgY}" x2="${currentDimX_L}" y2="${holeSvgY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_L, sideH, holeSvgY, formatVal(calcY), "#0284c7", "arrow-blue");
          currentDimX_L -= 25;
        });
        svg += `</g>`;
      }

      if (sortedCorpusYs.length > 0) {
        svg += `<g class="layer-holes-corpus">`;
        sortedCorpusYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokLX}" y1="${holeSvgY}" x2="${currentDimX_L}" y2="${holeSvgY}" stroke="#9333ea" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_L, sideH, holeSvgY, formatVal(calcY), "#9333ea", "arrow-purple");
          currentDimX_L -= 25;
        });
        svg += `</g>`;
      }
      
      if (sortedShelfYs.length > 0) {
        svg += `<g class="layer-holes-shelf">`; 
        sortedShelfYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokLX}" y1="${holeSvgY}" x2="${currentDimX_L}" y2="${holeSvgY}" stroke="#f59e0b" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_L, sideH, holeSvgY, formatVal(calcY), "#f59e0b", "arrow-amber");
          currentDimX_L -= 25;
        });
        svg += `</g>`;
      }

      if (sortedShelfYs.length > 1) {
          svg += `<g class="layer-holes-shelf">`;
          for (let i = 0; i < sortedShelfYs.length - 1; i++) {
              let svgY1 = sideH - sortedShelfYs[i];
              let svgY2 = sideH - sortedShelfYs[i+1];
              let val = formatVal(sortedShelfYs[i+1] - sortedShelfYs[i]);
              let dimXL = bokLX + 37 + 20; 
              svg += dimV(dimXL, svgY1, svgY2, val, "#f59e0b", "arrow-amber");
          }
          svg += `</g>`;
      }

      if (mountingData) {
          const drawerMounts = mountingData.filter(d => d.type === 'drawer' && d.slideSideHoles && d.slideSideHoles.length > 0);
          if (drawerMounts.length > 0) {
              drawerMounts.sort((a, b) => a.slideSideHoles[0].y - b.slideSideHoles[0].y);
              const highestDrawer = drawerMounts[drawerMounts.length - 1];
              let lastCalcY = isTopBottomFullWidth ? highestDrawer.slideSideHoles[0].y - th : highestDrawer.slideSideHoles[0].y;
              let highestHoleSvgY = sideH - lastCalcY;

              svg += `<g class="layer-holes-drawer">`;
              highestDrawer.slideSideHoles.forEach((hole, idx) => {
                  let dimY = highestHoleSvgY - 40 - (idx * 20); 
                  let holeX = bokLX + hole.x;
                  svg += `<line x1="${holeX}" y1="${highestHoleSvgY + 20}" x2="${holeX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  svg += `<line x1="${bokLX}" y1="${highestHoleSvgY + 20}" x2="${bokLX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  svg += dimH(bokLX, holeX, dimY, formatVal(hole.x), "#0284c7", "arrow-blue");
              });
              svg += `</g>`;
          }
      }
  }

  if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
      let currentDimX_R = bokRX + depth + 25;
      
      if (sortedDrawerYs.length > 0) {
        svg += `<g class="layer-holes-drawer">`;
        sortedDrawerYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokRX + depth}" y1="${holeSvgY}" x2="${currentDimX_R}" y2="${holeSvgY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_R, sideH, holeSvgY, formatVal(calcY), "#0284c7", "arrow-blue");
          currentDimX_R += 25;
        });
        svg += `</g>`;
      }

      if (sortedCorpusYs.length > 0) {
        svg += `<g class="layer-holes-corpus">`;
        sortedCorpusYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokRX + depth}" y1="${holeSvgY}" x2="${currentDimX_R}" y2="${holeSvgY}" stroke="#9333ea" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_R, sideH, holeSvgY, formatVal(calcY), "#9333ea", "arrow-purple");
          currentDimX_R += 25;
        });
        svg += `</g>`;
      }
      
      if (sortedShelfYs.length > 0) {
        svg += `<g class="layer-holes-shelf">`;
        sortedShelfYs.forEach(calcY => {
          let holeSvgY = sideH - calcY;
          svg += `<line x1="${bokRX + depth}" y1="${holeSvgY}" x2="${currentDimX_R}" y2="${holeSvgY}" stroke="#f59e0b" stroke-width="0.5" stroke-dasharray="2,2" />`;
          svg += dimV(currentDimX_R, sideH, holeSvgY, formatVal(calcY), "#f59e0b", "arrow-amber");
          currentDimX_R += 25;
        });
        svg += `</g>`;
      }

      if (sortedShelfYs.length > 1) {
          svg += `<g class="layer-holes-shelf">`;
          for (let i = 0; i < sortedShelfYs.length - 1; i++) {
              let svgY1 = sideH - sortedShelfYs[i];
              let svgY2 = sideH - sortedShelfYs[i+1];
              let val = formatVal(sortedShelfYs[i+1] - sortedShelfYs[i]);
              let dimXR = bokRX + depth - 37 - 20;
              svg += dimV(dimXR, svgY1, svgY2, val, "#f59e0b", "arrow-amber");
          }
          svg += `</g>`;
      }

      // --- PRAWY BOK: Poziome wymiary od przedniej krawędzi ---
      if (mountingData) {
          const drawerMounts = mountingData.filter(d => d.type === 'drawer' && d.slideSideHoles && d.slideSideHoles.length > 0);
          if (drawerMounts.length > 0) {
              drawerMounts.sort((a, b) => a.slideSideHoles[0].y - b.slideSideHoles[0].y);
              const highestDrawer = drawerMounts[drawerMounts.length - 1];
              let lastCalcY = isTopBottomFullWidth ? highestDrawer.slideSideHoles[0].y - th : highestDrawer.slideSideHoles[0].y;
              let highestHoleSvgY = sideH - lastCalcY;

              svg += `<g class="layer-holes-drawer">`;
              highestDrawer.slideSideHoles.forEach((hole, idx) => {
                  let dimY = highestHoleSvgY - 40 - (idx * 20); 
                  let holeX = bokRX + depth - hole.x; // Od przedniej krawędzi prawego boku
                  let edgeX = bokRX + depth;

                  svg += `<line x1="${holeX}" y1="${highestHoleSvgY + 20}" x2="${holeX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  svg += `<line x1="${edgeX}" y1="${highestHoleSvgY + 20}" x2="${edgeX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  svg += dimH(edgeX, holeX, dimY, formatVal(hole.x), "#0284c7", "arrow-blue");
              });
              svg += `</g>`;
          }
      }
  }

  // ==========================================
  // CZĘŚĆ 4: FRONTY (MOCOWANIA I PODZIAŁY)
  // ==========================================
  if (viewMode === 'all' || viewMode === 'front') {
      svg += `<text x="${frontX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONT (Podział zewnętrzny)</text>`;

      if (mod && mod.elements) {
        const fronts = mod.elements.filter(el => el.typ === 'front').sort((a, b) => a.y - b.y);
        
        fronts.forEach(front => {
          let drawY = isTopBottomFullWidth ? front.y - th : front.y;
          const elSvgY = viewH - drawY - front.h; 
          const isDrawer = front.subtype === 'szuflada';
          const isDoor = front.subtype.includes('drzwi');
          
          let fillColor = isDrawer ? '#eff6ff' : '#f0fdf4'; 
          let strokeColor = isDrawer ? '#3b82f6' : '#22c55e';
          
          const fWidth = front.w || cabWidth;
          const fSvgX = frontX + (front.x || 0);

          svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />`;

          let labelText = isDrawer ? `Szuflada` : `Drzwi`;
          svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">${labelText}</text>`;

          if (isDoor && mountingData) {
            svg += `<g class="layer-holes-hinge">`;
            const doorData = mountingData.find(m => m.type === 'door' && m.frontId === front.id);
            if (doorData && doorData.hinges) {
              doorData.hinges.forEach((hinge) => {
                 const isLeft = doorData.side === 'left';
                 const cupX = isLeft ? fSvgX + hinge.cupXOffset : fSvgX + fWidth - hinge.cupXOffset;
                 
                 let drawHoleY = isTopBottomFullWidth ? front.y + hinge.relY - th : front.y + hinge.relY;
                 const holeSvgY = viewH - drawHoleY;

                 svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="17.5" fill="#fcfdfd" stroke="#16a34a" stroke-width="1.5" />`;
                 svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="2.5" fill="#16a34a" />`;

                 const yBottom = Number(hinge.relY).toFixed(1);
                 svg += `<text x="${cupX + (isLeft ? 22 : -22)}" y="${holeSvgY + 4}" font-size="10" fill="#16a34a" font-weight="bold" text-anchor="${isLeft ? 'start' : 'end'}">Y: ${yBottom}</text>`;
              });
            }
            svg += `</g>`;
          }
          
          if (isDrawer && mountingData) {
            svg += `<g class="layer-front-holes">`;
            const drawerData = mountingData.find(m => m.type === 'drawer' && m.frontId === front.id);
            if (drawerData && drawerData.frontHoles) {
              drawerData.frontHoles.forEach((hole, idx) => {
                 const xL = Number(hole.xOffsetLeft ?? hole.xOffset ?? 20.5);
                 const xR = Number(hole.xOffsetRight ?? hole.xOffset ?? 20.5);

                 const holeX_Left = fSvgX + xL;
                 const holeX_Right = fSvgX + fWidth - xR;
                 
                 let drawHoleY = isTopBottomFullWidth ? front.y + hole.y - th : front.y + hole.y;
                 const holeSvgY = viewH - drawHoleY;

                 svg += `<circle cx="${holeX_Left}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;
                 svg += `<circle cx="${holeX_Right}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;

                 const frontBottomY = elSvgY + front.h;
                 
                 let dimXLeft = holeX_Left - 18 - (idx * 20);
                 svg += `<line x1="${holeX_Left}" y1="${holeSvgY}" x2="${dimXLeft}" y2="${holeSvgY}" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2" />`;
                 svg += dimV(dimXLeft, frontBottomY, holeSvgY, hole.y.toFixed(1), "#dc2626", "arrow-red");

                 if (idx === 0) {
                     let dimY = holeSvgY - 20; 
                     svg += `<line x1="${fSvgX}" y1="${holeSvgY}" x2="${fSvgX}" y2="${dimY}" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2" />`;
                     svg += `<line x1="${holeX_Left}" y1="${holeSvgY}" x2="${holeX_Left}" y2="${dimY}" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2" />`;
                     svg += dimH(fSvgX, holeX_Left, dimY, xL.toFixed(1), "#dc2626", "arrow-red");

                     svg += `<line x1="${holeX_Right}" y1="${holeSvgY}" x2="${holeX_Right}" y2="${dimY}" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2" />`;
                     svg += `<line x1="${fSvgX + fWidth}" y1="${holeSvgY}" x2="${fSvgX + fWidth}" y2="${dimY}" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2" />`;
                     svg += dimH(holeX_Right, fSvgX + fWidth, dimY, xR.toFixed(1), "#dc2626", "arrow-red");
                 }
              });
            }
            svg += `</g>`;
          }
        });
      }
  }

  svg += `</g></svg>`;
  return svg;
}