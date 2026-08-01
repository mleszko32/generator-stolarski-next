// src/render/viewer2d.js
import { calculateShelfHoles } from '../core/shelfMath.js';
import { calculateDrawerHoles } from '../core/drawerMath.js';
import { state } from '../core/state.js';

export function generateSidePanelSVG(height, depth, mountingData) {
  const mod = state.project.modules.find(m => m.id === state.activeModuleId) || state.project.modules[0];
  if (!mod) return '<svg></svg>';

  const config = state.project;
  const cabWidth = parseFloat(mod.dimensions?.width) || 600;
  const th = parseFloat(config.materials?.boardThickness) || 18;

  const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;

  // --- UKŁAD POZIOMY (4 Kolumny) ---
  const cabX = 80;                 
  const gapBetween = 280; 
  
  const bokLX = cabX + cabWidth + gapBetween; 
  const bokRX = bokLX + depth + gapBetween;
  const frontX = bokRX + depth + gapBetween + 100;
  
  const marginRight = 200; 
  const marginY = 180; 
  
  const svgWidth = frontX + cabWidth + marginRight;
  const svgHeight = sideH + marginY * 2;

  const formatVal = (val) => Number(Number(val).toFixed(1));

  // Wymiarowanie pionowe
  const dimV = (x, y1, y2, val, color="#dc2626", marker="arrow-red") => {
      const midY = (y1 + y2) / 2;
      let res = `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1.5" marker-start="url(#${marker})" marker-end="url(#${marker})" />`;
      res += `<rect x="${x-18}" y="${midY-8}" width="36" height="16" fill="#f8fafc" />`;
      res += `<text x="${x}" y="${midY+4}" font-size="10" fill="${color}" font-weight="bold" text-anchor="middle">${val}</text>`;
      return res;
  };

  // Wymiarowanie poziome
  const dimH = (x1, x2, y, val, color="#dc2626", marker="arrow-red") => {
      const midX = (x1 + x2) / 2;
      let res = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1.5" marker-start="url(#${marker})" marker-end="url(#${marker})" />`;
      res += `<rect x="${midX-16}" y="${y-8}" width="32" height="16" fill="#f8fafc" />`;
      res += `<text x="${midX}" y="${y+4}" font-size="10" fill="${color}" font-weight="bold" text-anchor="middle">${val}</text>`;
      return res;
  };

  let svg = `<svg id="side-panel-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 -100 ${svgWidth} ${svgHeight + 100}" width="100%" height="100%" style="background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; cursor: grab;">`;

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
      <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#dc2626" />
      </marker>
      <marker id="arrow-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#475569" />
      </marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#0284c7" />
      </marker>
    </defs>
    <g transform="translate(0, ${marginY})">
  `;

  // --- LEGENDA NAWIERTÓW ---
  svg += `
    <g transform="translate(${cabX}, -150)">
        <text x="0" y="0" font-size="14" fill="#1e293b" font-weight="bold">LEGENDA NAWIERTÓW:</text>
        
        <circle cx="0" cy="20" r="2.5" fill="#16a34a"/>
        <text x="12" y="24" font-size="12" fill="#64748b">Prowadnik (Zawias 5mm)</text>
        
        <circle cx="0" cy="45" r="2.5" fill="#0284c7"/>
        <text x="12" y="49" font-size="12" fill="#64748b">Prowadnica (Szuflada 5mm)</text>
        
        <circle cx="200" cy="20" r="1.5" fill="#f97316"/>
        <text x="212" y="24" font-size="12" fill="#64748b">Wkręt (Nawiert 3mm)</text>
        
        <circle cx="200" cy="45" r="4" fill="#9333ea"/>
        <text x="212" y="49" font-size="12" fill="#64748b">Kołek drewniany (8mm)</text>
    </g>
  `;

  // ==========================================
  // CZĘŚĆ 1: KORPUS WNĘTRZE
  // ==========================================
  svg += `<text x="${cabX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS WNĘTRZE</text>`;

  const viewH = sideH;
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
      let drawY = el.y;
      if (isTopBottomFullWidth) drawY = el.y - th;
      
      const elSvgY = viewH - drawY - el.h; 
      let fillColor = '#cbd5e1'; 
      if (el.typ === 'poziom' && el.isStructural) fillColor = '#a7f3d0'; 

      svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
    });

    let yLines = [th, height - th];
    mod.elements.forEach(el => {
      if (el.typ === 'poziom') { yLines.push(el.y, el.y + el.h); }
    });
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

  // Linia bazy (podłoga)
  svg += `<line x1="${cabX - 20}" y1="${sideH}" x2="${frontX + cabWidth + 80}" y2="${sideH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" />`;
  svg += `<text x="${frontX + cabWidth + 90}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold">0 mm (Baza modułu)</text>`;

  // ==========================================
  // CZĘŚĆ 2: BOK LEWY
  // ==========================================
  svg += `<text x="${bokLX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK LEWY</text>`;
  svg += `<rect x="${bokLX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  svg += `<text x="${bokLX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
  svg += `<text x="${bokLX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;

  // ==========================================
  // CZĘŚĆ 3: BOK PRAWY
  // ==========================================
  svg += `<text x="${bokRX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK PRAWY</text>`;
  svg += `<rect x="${bokRX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  svg += `<text x="${bokRX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokRX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
  svg += `<text x="${bokRX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokRX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;

  // --- RYSOWANIE NAWIERTÓW PÓŁEK ---
  const shelfHoles = calculateShelfHoles();
  if (shelfHoles && shelfHoles.length > 0) {
    shelfHoles.forEach(hole => {
      let calcY = hole.y;
      if (isTopBottomFullWidth) calcY -= th;
      const svgY = sideH - calcY;
      const radius = hole.diameter ? (hole.diameter / 2) : 2.5; 
      const color = hole.color || (hole.isCenter ? '#d97706' : '#fcd34d');
      
      svg += `<circle cx="${bokLX + depth - hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      svg += `<circle cx="${bokRX + hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
    });
  }

  // --- ZBIERANIE I RYSOWANIE NAWIERTÓW + WYMIARY (BOKI) ---
  if (mountingData) {
    let slideBaseYs = [];

    mountingData.forEach((data) => {
      // ZAWIASY
      if (data.type === 'door') {
        data.hinges.forEach(hinge => {
          let calcY = hinge.y;
          if (isTopBottomFullWidth) calcY -= th;
          const svgY = sideH - calcY;
          
          svg += `<g class="layer-holes-hinge">`;
          if (data.side === 'left') {
            const svgX = bokLX + depth - 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
          } else {
            const svgX = bokRX + 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
          }
          svg += `</g>`;
        });
      } 
      
      // PROWADNICE SZUFLAD (Zapisujemy współrzędne Y by wymiarować je zbiorczo na zewnątrz)
      else if (data.type === 'drawer' && data.slideSideHoles && data.slideSideHoles.length > 0) {
        slideBaseYs.push(data.slideSideHoles[0].y);
        const baseHoleY = data.slideSideHoles[0].y;
        let calcY = baseHoleY;
        if (isTopBottomFullWidth) calcY -= th;
        const svgY = sideH - calcY;

        svg += `<g class="layer-holes-drawer">`;
        data.slideSideHoles.forEach(hole => {
          svg += `<circle cx="${bokLX + depth - hole.x}" cy="${svgY}" r="2.5" fill="#0284c7" />`;
          svg += `<circle cx="${bokRX + hole.x}" cy="${svgY}" r="2.5" fill="#0284c7" />`;
        });
        svg += `</g>`;
      }

      // KONSTRUKCJA KORPUSU
      else if (data.type === 'corpus') {
        svg += `<g class="layer-holes-corpus">`;
        data.holes.forEach(h => {
          let calcY = h.y;
          const svgY = sideH - calcY;
          const radius = h.holeType === 'screw' ? 1.5 : 4; 
          const color = h.holeType === 'screw' ? '#f97316' : '#9333ea';

          svg += `<circle cx="${bokLX + depth - h.xFromFront}" cy="${svgY}" r="${radius}" fill="${color}" />`;
          svg += `<circle cx="${bokRX + h.xFromFront}" cy="${svgY}" r="${radius}" fill="${color}" />`;
        });
        svg += `</g>`;
      }
    });

    // --- NOWE STRZAŁKI WYMIAROWE DLA PROWADNIC (ABSOLUTNE OD DOŁU BOKU) ---
    slideBaseYs.sort((a, b) => a - b);
    if (slideBaseYs.length > 0) {
      svg += `<g class="layer-holes-drawer">`;
      
      slideBaseYs.forEach((baseY, index) => {
        let calcY = baseY;
        if (isTopBottomFullWidth) calcY -= th;
        let holeSvgY = sideH - calcY;
        
        // PRAWY BOK: Pionowe wymiary od zera (podłoga formatki) do otworu
        let dimX = bokRX - 25 - (index * 25);
        svg += dimV(dimX, sideH, holeSvgY, formatVal(calcY), "#0284c7", "arrow-blue");
      });

      // LEWY BOK: Wyciąganie poziomych wymiarów z najniższej prowadnicy
      const drawerMounts = mountingData.filter(d => d.type === 'drawer' && d.slideSideHoles && d.slideSideHoles.length > 0);
      if (drawerMounts.length > 0) {
          drawerMounts.sort((a, b) => a.slideSideHoles[0].y - b.slideSideHoles[0].y);
          const lowestDrawer = drawerMounts[0];
          
          let firstCalcY = lowestDrawer.slideSideHoles[0].y;
          if (isTopBottomFullWidth) firstCalcY -= th;
          let firstHoleSvgY = sideH - firstCalcY;

          lowestDrawer.slideSideHoles.forEach((hole, idx) => {
              // Zmiana (Czerwony marker): Przesuwamy linie poziome powyżej otworów
              let dimY = firstHoleSvgY - 25 - (idx * 20); 
              let holeX = bokLX + depth - hole.x;
              let edgeX = bokLX + depth; // Przednia krawędź boku

              svg += `<line x1="${holeX}" y1="${firstHoleSvgY}" x2="${holeX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
              svg += `<line x1="${edgeX}" y1="${firstHoleSvgY}" x2="${edgeX}" y2="${dimY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
              
              svg += dimH(holeX, edgeX, dimY, formatVal(hole.x), "#0284c7", "arrow-blue");
          });
      }
      
      svg += `</g>`;
    }
  }

  // ==========================================
  // CZĘŚĆ 4: FRONTY (MOCOWANIA I PODZIAŁY)
  // ==========================================
  svg += `<text x="${frontX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONT (Podział zewnętrzny)</text>`;

  if (mod && mod.elements) {
    const fronts = mod.elements.filter(el => el.typ === 'front').sort((a, b) => a.y - b.y);
    let drawerCount = 0;
    let doorCount = 0;
    
    fronts.forEach(front => {
      let drawY = front.y;
      if (isTopBottomFullWidth) drawY = front.y - th;
      
      const elSvgY = viewH - drawY - front.h; 
      const isDrawer = front.subtype === 'szuflada';
      const isDoor = front.subtype.includes('drzwi');
      
      let fillColor = '#f0fdf4'; 
      let strokeColor = '#22c55e';
      
      if (isDrawer) {
          fillColor = '#eff6ff';
          strokeColor = '#3b82f6';
      }

      const fWidth = front.w || cabWidth;
      const fSvgX = frontX + (front.x || 0);

      svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />`;

      let labelText = `Front`;
      if (isDrawer) {
          drawerCount++;
          labelText = `Szuf. ${drawerCount}`;
      } else if (isDoor) {
          doorCount++;
          labelText = `Drzwi ${doorCount}`;
      }
      
      svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">${labelText}</text>`;
      svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2 + 15}" font-size="10" fill="#1e293b" text-anchor="middle">(H=${front.h.toFixed(1)})</text>`;

      // Wymiar całkowitej wysokości frontu
      svg += `<g class="layer-front-holes">`;
      svg += dimV(fSvgX - 25, elSvgY + front.h, elSvgY, front.h.toFixed(1));
      svg += `</g>`;

      svg += `<g class="layer-front-holes">`;
      if (isDoor) {
        const doorData = mountingData.find(m => m.type === 'door' && m.frontId === front.id);
        if (doorData && doorData.hinges) {
          doorData.hinges.forEach((hinge) => {
             const isLeft = doorData.side === 'left';
             const cupX = isLeft ? fSvgX + hinge.cupXOffset : fSvgX + fWidth - hinge.cupXOffset;
             
             let drawHoleY = front.y + hinge.relY;
             if (isTopBottomFullWidth) drawHoleY -= th;
             const holeSvgY = viewH - drawHoleY;

             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="17.5" fill="#fcfdfd" stroke="#16a34a" stroke-width="1.5" />`;
             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="2.5" fill="#16a34a" />`;

             const yBottom = Number(hinge.relY).toFixed(1);
             svg += `<text x="${cupX + (isLeft ? 22 : -22)}" y="${holeSvgY + 4}" font-size="10" fill="#16a34a" font-weight="bold" text-anchor="${isLeft ? 'start' : 'end'}">Y: ${yBottom}</text>`;
          });
        }
      }
      
      if (isDrawer) {
        const drawerData = mountingData.find(m => m.type === 'drawer' && m.frontId === front.id);
        if (drawerData && drawerData.frontHoles) {
          drawerData.frontHoles.forEach((hole, idx) => {
             const xL = Number(hole.xOffsetLeft ?? hole.xOffset ?? 20.5);
             const xR = Number(hole.xOffsetRight ?? hole.xOffset ?? 20.5);

             const holeX_Left = fSvgX + xL;
             const holeX_Right = fSvgX + fWidth - xR;
             
             let drawHoleY = front.y + hole.y;
             if (isTopBottomFullWidth) drawHoleY -= th;
             const holeSvgY = viewH - drawHoleY;

             svg += `<circle cx="${holeX_Left}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;
             svg += `<circle cx="${holeX_Right}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;

             const frontBottomY = elSvgY + front.h;
             
             // Wymiarowanie pionowe dla KAŻDEGO otworu od dołu (np. jeśli jest reling)
             // Odsuwamy linie w lewo, żeby nie wchodziły na siebie
             let dimXLeft = holeX_Left - 18 - (idx * 22);
             svg += dimV(dimXLeft, frontBottomY, holeSvgY, hole.y.toFixed(1));

             // Wymiarowanie poziome od krawędzi (Zarówno dla lewej jak i prawej strony - Zielony marker)
             if (idx === 0) {
                 svg += dimH(fSvgX, holeX_Left, holeSvgY, xL.toFixed(1));
                 svg += dimH(holeX_Right, fSvgX + fWidth, holeSvgY, xR.toFixed(1));
             }
          });
        }
      }
      svg += `</g>`;
    });
  }

  svg += `</g></svg>`;
  return svg;
}