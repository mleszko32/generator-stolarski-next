// src/render/viewer2d.js
import { calculateShelfHoles } from '../core/shelfMath.js';
import { calculateDrawerHoles } from '../core/drawerMath.js';
import { state, getActiveModule } from '../core/state.js';

export function generateSidePanelSVG(height, depth, mountingData) {
  const mod = getActiveModule();
  const config = state.project;
  const cabWidth = parseFloat(mod?.dimensions?.width) || 600;
  const th = parseFloat(config.materials?.boardThickness) || 18;

  const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;

  // UKŁAD 4 RZUTÓW
  const cabX = 80;                 
  const gapBetween = 250;          
  const bokLewyX = cabX + cabWidth + gapBetween; 
  const bokPrawyX = bokLewyX + depth + gapBetween; 
  
  const gapBetweenFront = Math.max(450, depth * 0.4); 
  const frontX = bokPrawyX + depth + gapBetweenFront;
  
  const marginRight = 350; 
  const marginY = 120;
  
  const svgWidth = frontX + cabWidth + marginRight;
  const svgHeight = sideH + marginY * 2;

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
            if (e.button !== 0) return; // Tylko lewy przycisk myszy
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
  // RZUT 1: KORPUS WNĘTRZE
  // ==========================================
  svg += `<text x="${cabX + cabWidth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS WNĘTRZE</text>`;

  const viewH = sideH;
  svg += `<rect x="${cabX}" y="0" width="${th}" height="${viewH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  svg += `<rect x="${cabX + cabWidth - th}" y="0" width="${th}" height="${viewH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  
  const yBottomTop = isTopBottomFullWidth ? 0 : th;
  svg += `<rect x="${cabX + th}" y="${viewH - yBottomTop - th}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  if (cons.topType === 'pelny') {
    const yTopBottom = isTopBottomFullWidth ? 0 : th;
    svg += `<rect x="${cabX + th}" y="${yTopBottom}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  } else if (cons.topType === 'trawersy_pion') {
    const yTopBottom = isTopBottomFullWidth ? 0 : th;
    svg += `<rect x="${cabX + th}" y="${yTopBottom}" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    svg += `<rect x="${cabX + cabWidth - th * 2}" y="${yTopBottom}" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  } else if (cons.topType === 'trawersy_poziom') {
    const yTopBottom = isTopBottomFullWidth ? 0 : th;
    svg += `<rect x="${cabX + th}" y="${yTopBottom}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
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
  }

  // GLOBALNA LINIA BAZOWA 0 mm
  svg += `<line x1="${cabX - 20}" y1="${sideH}" x2="${frontX + cabWidth + 20}" y2="${sideH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" />`;
  svg += `<text x="${frontX + cabWidth + 30}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold">0 mm (Baza modułu)</text>`;


  // ==========================================
  // RZUT 2: BOK LEWY (Przód po LEWEJ)
  // ==========================================
  svg += `<text x="${bokLewyX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK LEWY (Wewnętrzna strona)</text>`;
  svg += `<rect x="${bokLewyX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  
  // Opisy krawędzi
  svg += `<text x="${bokLewyX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLewyX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
  svg += `<text x="${bokLewyX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLewyX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
  
  // Znacznik 37mm od lewej krawędzi
  const topSetbackY = -10;
  svg += `<line x1="${bokLewyX}" y1="${topSetbackY}" x2="${bokLewyX + 37}" y2="${topSetbackY}" stroke="#dc2626" stroke-width="1" marker-start="url(#arrow-red)" marker-end="url(#arrow-red)" />`;
  svg += `<text x="${bokLewyX + 18.5}" y="${topSetbackY - 6}" font-size="10" fill="#dc2626" text-anchor="middle" font-weight="bold">37</text>`;


  // ==========================================
  // RZUT 3: BOK PRAWY (Przód po PRAWEJ)
  // ==========================================
  svg += `<text x="${bokPrawyX + depth/2}" y="-25" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK PRAWY (Wewnętrzna strona)</text>`;
  svg += `<rect x="${bokPrawyX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  
  // Opisy krawędzi
  svg += `<text x="${bokPrawyX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokPrawyX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">TYŁ BOKU</text>`;
  svg += `<text x="${bokPrawyX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokPrawyX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;

  // Znacznik 37mm od prawej krawędzi
  svg += `<line x1="${bokPrawyX + depth - 37}" y1="${topSetbackY}" x2="${bokPrawyX + depth}" y2="${topSetbackY}" stroke="#dc2626" stroke-width="1" marker-start="url(#arrow-red)" marker-end="url(#arrow-red)" />`;
  svg += `<text x="${bokPrawyX + depth - 18.5}" y="${topSetbackY - 6}" font-size="10" fill="#dc2626" text-anchor="middle" font-weight="bold">37</text>`;


  // ==========================================
  // NAWIERTY PÓŁEK (Oba boki)
  // ==========================================
  const shelfHoles = calculateShelfHoles();
  if (shelfHoles && shelfHoles.length > 0) {
    shelfHoles.forEach(hole => {
      let calcY = hole.y;
      if (isTopBottomFullWidth) calcY -= th;
      const svgY = sideH - calcY;
      const radius = hole.diameter ? (hole.diameter / 2) : (hole.isCenter ? 3 : 2);
      const color = hole.color || (hole.isCenter ? '#d97706' : '#fcd34d');
      
      // Lewy bok: liczymy X od lewej krawędzi (od przodu)
      svg += `<circle cx="${bokLewyX + hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      
      // Prawy bok: liczymy X od prawej krawędzi (od przodu w lewo)
      svg += `<circle cx="${bokPrawyX + depth - hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
    });

    const uniqueYs = [...new Set(shelfHoles.map(h => h.y))].sort((a, b) => b - a);

    uniqueYs.forEach(y => {
      const holeObj = shelfHoles.find(h => h.y === y && h.isCenter);
      if (!holeObj) return; 

      let calcY = y;
      if (isTopBottomFullWidth) calcY -= th;

      const isStructural = (holeObj.isStructural === true);
      const svgY = sideH - calcY;
      const yBottom = formatVal(y);
      const yTop = formatVal(height - y);
      const label = `${yBottom} (${yTop})`;

      const color = isStructural ? '#ea580c' : '#fcd34d';
      const fontSize = isStructural ? 12 : 10;
      const fontWeight = isStructural ? 'bold' : 'normal';

      // Opis osi dla LEWEGO boku
      const lineEndX_L = bokLewyX + depth + (isStructural ? 60 : 40);
      svg += `<line x1="${bokLewyX + depth}" y1="${svgY}" x2="${lineEndX_L}" y2="${svgY}" stroke="${color}" stroke-width="1" stroke-dasharray="2,2" />`;
      svg += `<text x="${lineEndX_L + 8}" y="${svgY + (isStructural ? 4 : 3)}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">${label}</text>`;

      // Opis osi dla PRAWEGO boku
      const lineEndX_R = bokPrawyX + depth + (isStructural ? 60 : 40);
      svg += `<line x1="${bokPrawyX + depth}" y1="${svgY}" x2="${lineEndX_R}" y2="${svgY}" stroke="${color}" stroke-width="1" stroke-dasharray="2,2" />`;
      svg += `<text x="${lineEndX_R + 8}" y="${svgY + (isStructural ? 4 : 3)}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">${label}</text>`;
    });
  }

  // ==========================================
  // NAWIERTY ZAWIASÓW I SZUFLAD
  // ==========================================
  if (mountingData) {
    mountingData.forEach((data) => {
      
      // 1. ZAWIASY NA BOKU
      if (data.type === 'door') {
        data.hinges.forEach(hinge => {
          let calcY = hinge.y;
          if (isTopBottomFullWidth) calcY -= th;
          const svgY = sideH - calcY;
          const yFromTop = formatVal(height - hinge.y);
          
          if (data.side === 'left') {
              // Rysujemy tylko na LEWYM boku (od lewej krawędzi)
              const svgX = bokLewyX + 37;
              svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
              svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
              svg += `<line x1="${svgX}" y1="${svgY}" x2="${bokLewyX + depth + 140}" y2="${svgY}" stroke="#bbf7d0" stroke-width="1" stroke-dasharray="4,4" />`;
              svg += `<text x="${bokLewyX + depth + 148}" y="${svgY + 4}" font-size="12" font-weight="bold" fill="#16a34a">Zawias (L): ${formatVal(hinge.y)} (${yFromTop})</text>`;
          } 
          else if (data.side === 'right') {
              // Rysujemy tylko na PRAWYM boku (od prawej krawędzi)
              const svgX = bokPrawyX + depth - 37;
              svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="#16a34a" />`;
              svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="#16a34a" />`;
              svg += `<line x1="${svgX}" y1="${svgY}" x2="${bokPrawyX + depth + 140}" y2="${svgY}" stroke="#bbf7d0" stroke-width="1" stroke-dasharray="4,4" />`;
              svg += `<text x="${bokPrawyX + depth + 148}" y="${svgY + 4}" font-size="12" font-weight="bold" fill="#16a34a">Zawias (P): ${formatVal(hinge.y)} (${yFromTop})</text>`;
          }
        });
      } 
      
      // 2. PROWADNICE SZUFLAD (Na obu bokach)
      else if (data.type === 'drawer' && data.slideSideHoles && data.slideSideHoles.length > 0) {
        const baseHoleY = data.slideSideHoles[0].y;
        let calcY = baseHoleY;
        if (isTopBottomFullWidth) calcY -= th;

        const axisYFromBottom = formatVal(baseHoleY);
        const svgY = sideH - calcY;
        const yFromTop = formatVal(height - baseHoleY);
        const label = `Prowadnik: ${axisYFromBottom} (${yFromTop})`;

        // Render na LEWYM Boku (od lewej krawędzi)
        const maxHoleX_L = Math.max(...data.slideSideHoles.map(h => h.x));
        const rearHoleSvgX_L = bokLewyX + maxHoleX_L;
        const lineEndX_L = bokLewyX + depth + 140;
        
        svg += `<line x1="${rearHoleSvgX_L}" y1="${svgY}" x2="${lineEndX_L}" y2="${svgY}" stroke="#bae6fd" stroke-width="1" stroke-dasharray="4,4" />`;

        data.slideSideHoles.forEach(hole => {
          const svgX = bokLewyX + hole.x;
          svg += `<circle cx="${svgX}" cy="${svgY}" r="3" fill="#0284c7" />`;
          svg += `<line x1="${svgX}" y1="${svgY + 5}" x2="${svgX}" y2="${svgY + 18}" stroke="#7dd3fc" stroke-width="1" />`;
          svg += `<text x="${svgX}" y="${svgY + 28}" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">${formatVal(hole.x)}</text>`;
        });
        svg += `<text x="${lineEndX_L + 8}" y="${svgY + 4}" font-size="12" font-weight="bold" fill="#0284c7">${label}</text>`;

        // Render na PRAWYM Boku (od prawej krawędzi w lewo)
        const maxHoleX_R = Math.max(...data.slideSideHoles.map(h => h.x));
        const rearHoleSvgX_R = bokPrawyX + depth - maxHoleX_R;
        const lineEndX_R = bokPrawyX + depth + 140;
        
        svg += `<line x1="${rearHoleSvgX_R}" y1="${svgY}" x2="${lineEndX_R}" y2="${svgY}" stroke="#bae6fd" stroke-width="1" stroke-dasharray="4,4" />`;

        data.slideSideHoles.forEach(hole => {
          const svgX = bokPrawyX + depth - hole.x;
          svg += `<circle cx="${svgX}" cy="${svgY}" r="3" fill="#0284c7" />`;
          svg += `<line x1="${svgX}" y1="${svgY + 5}" x2="${svgX}" y2="${svgY + 18}" stroke="#7dd3fc" stroke-width="1" />`;
          svg += `<text x="${svgX}" y="${svgY + 28}" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">${formatVal(hole.x)}</text>`;
        });
        svg += `<text x="${lineEndX_R + 8}" y="${svgY + 4}" font-size="12" font-weight="bold" fill="#0284c7">${label}</text>`;
      }
    });
  }

  // ==========================================
  // RZUT 4: FRONTY (MOCOWANIA I PODZIAŁY)
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

      let labelText = `Front (H=${front.h.toFixed(1)})`;
      if (isDrawer) {
          drawerCount++;
          labelText = `Szuf. ${drawerCount} (H=${front.h.toFixed(1)})`;
      } else if (isDoor) {
          doorCount++;
          labelText = `Drzwi ${doorCount} (H=${front.h.toFixed(1)})`;
      }
      
      svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2 + 4}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">${labelText}</text>`;

      // --- WYMIAROWANIE PUSZEK ZAWIASÓW NA FRONCIE ---
      if (isDoor) {
        const doorData = mountingData.find(m => m.type === 'door' && m.frontId === front.id);
        if (doorData && doorData.hinges) {
          doorData.hinges.forEach((hinge, idx) => {
             const isLeft = doorData.side === 'left';
             const cupX = isLeft ? fSvgX + hinge.cupXOffset : fSvgX + fWidth - hinge.cupXOffset;
             
             let drawHoleY = front.y + hinge.relY;
             if (isTopBottomFullWidth) drawHoleY -= th;
             const holeSvgY = viewH - drawHoleY;

             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="17.5" fill="#fcfdfd" stroke="#16a34a" stroke-width="1.5" />`;
             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="2" fill="#16a34a" />`;

             const yBottom = Number(hinge.relY).toFixed(1);
             const yTop = Number(front.h - hinge.relY).toFixed(1);
             const yLabel = `${yBottom} (${yTop})`;

             svg += `<text x="${cupX + (isLeft ? 22 : -22)}" y="${holeSvgY + 4}" font-size="10" fill="#16a34a" font-weight="bold" text-anchor="${isLeft ? 'start' : 'end'}">${yLabel}</text>`;

             if (idx > 0) {
               let drawPrevHoleY = front.y + doorData.hinges[idx-1].relY;
               if (isTopBottomFullWidth) drawPrevHoleY -= th;
               const prevHoleSvgY = viewH - drawPrevHoleY;
               svg += `<line x1="${cupX}" y1="${prevHoleSvgY - 20}" x2="${cupX}" y2="${holeSvgY + 20}" stroke="#16a34a" stroke-width="0.75" stroke-dasharray="2,2" />`;
             }

             if (idx === 0) {
               const edgeX = isLeft ? fSvgX : fSvgX + fWidth;
               svg += `<line x1="${edgeX}" y1="${holeSvgY}" x2="${cupX + (isLeft ? -20 : 20)}" y2="${holeSvgY}" stroke="#16a34a" stroke-width="0.75" stroke-dasharray="2,2" />`;
               svg += `<text x="${edgeX + (isLeft ? hinge.cupXOffset / 2 : -hinge.cupXOffset / 2)}" y="${holeSvgY - 6}" font-size="10" fill="#16a34a" font-weight="bold" text-anchor="middle">${hinge.cupXOffset}</text>`;
             }
          });
        }
      }
      
      // --- WYMIAROWANIE MOCOWAŃ SZUFLAD NA FRONCIE ---
      if (isDrawer) {
        const drawerData = mountingData.find(m => m.type === 'drawer' && m.frontId === front.id);
        if (drawerData && drawerData.frontHoles) {
          drawerData.frontHoles.forEach((hole, holeIndex) => {
             const xL = Number(hole.xOffsetLeft ?? hole.xOffset ?? 20.5);
             const xR = Number(hole.xOffsetRight ?? hole.xOffset ?? 20.5);

             const holeX_Left = fSvgX + xL;
             const holeX_Right = fSvgX + fWidth - xR;
             
             let drawHoleY = front.y + hole.y;
             if (isTopBottomFullWidth) drawHoleY -= th;
             const holeSvgY = viewH - drawHoleY;

             svg += `<circle cx="${holeX_Left}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;
             svg += `<circle cx="${holeX_Right}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;

             const yLabel = Number(hole.y).toFixed(1);
             const extraText = holeIndex === 2 ? " (Reling)" : "";
             svg += `<text x="${holeX_Left + 6}" y="${holeSvgY + 4}" font-size="10" fill="#dc2626" font-weight="bold">${yLabel}${extraText}</text>`;
             
             if (holeIndex > 0) {
               const baseHoleSvgY = viewH - (isTopBottomFullWidth ? (front.y + drawerData.frontHoles[0].y) - th : (front.y + drawerData.frontHoles[0].y));
               svg += `<line x1="${holeX_Left}" y1="${baseHoleSvgY - 4}" x2="${holeX_Left}" y2="${holeSvgY + 4}" stroke="#dc2626" stroke-width="0.75" stroke-dasharray="2,2" />`;
             }

             if (holeIndex === 0) {
               svg += `<line x1="${fSvgX}" y1="${holeSvgY}" x2="${holeX_Left - 4}" y2="${holeSvgY}" stroke="#dc2626" stroke-width="0.75" stroke-dasharray="2,2" />`;
               svg += `<text x="${fSvgX + xL / 2}" y="${holeSvgY - 4}" font-size="10" fill="#dc2626" font-weight="bold" text-anchor="middle">${xL.toFixed(1)}</text>`;
               svg += `<line x1="${fSvgX + fWidth}" y1="${holeSvgY}" x2="${holeX_Right + 4}" y2="${holeSvgY}" stroke="#dc2626" stroke-width="0.75" stroke-dasharray="2,2" />`;
               svg += `<text x="${fSvgX + fWidth - xR / 2}" y="${holeSvgY - 4}" font-size="10" fill="#dc2626" font-weight="bold" text-anchor="middle">${xR.toFixed(1)}</text>`;
             }
          });
        }
      }
    });
  }

  svg += `</g></svg>`;
  return svg;
}