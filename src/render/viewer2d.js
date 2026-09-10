// src/render/viewer2d.js
import { state } from '../core/state.js';
import { escapeHtml } from '../utils/dom.js';

export function generateSidePanelSVG(height, depth, mountingData = []) {
  const mod = state.project.modules.find(m => m.id === state.activeModuleId) || state.project.modules[0];
  if (!mod) return '<svg></svg>';

  const config = state.project;
  const cabWidth = parseFloat(mod.dimensions?.width) || 600;
  const th = parseFloat(config.materials?.boardThickness) || 18;

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;

  const activeModAbsX = parseFloat(mod.position.x) || 0;
  const activeModLegH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 0) : 0;
  const activeModAbsY = (parseFloat(mod.position.y) || 0) + activeModLegH;

  const stackModules = state.project.modules.filter(m => {
      const mX = parseFloat(m.position.x) || 0;
      const mW = parseFloat(m.dimensions.width) || 600;
      const overlap = Math.max(0, Math.min(mX + mW, activeModAbsX + cabWidth) - Math.max(mX, activeModAbsX));
      return overlap > 10;
  });
  
  const getDy = (m) => {
      const mLegH = (m.legs && m.legs.active) ? (parseFloat(m.legs.height) || 0) : 0;
      return ((parseFloat(m.position.y) || 0) + mLegH) - activeModAbsY;
  };

  let maxDy = 0; let minDy = 0; 
  stackModules.forEach(m => {
      const dy = getDy(m);
      const mH = parseFloat(m.dimensions.height) || 720;
      maxDy = Math.max(maxDy, dy + mH);
      minDy = Math.min(minDy, dy);
  });
  
  const svgTopY = sideH - maxDy; 
  const svgBottomY = sideH - minDy;
  const totalSvgHeight = svgBottomY - svgTopY;

  const partitions = (mod.elements || []).filter(el => el.typ === 'pion').sort((a, b) => a.x - b.x);
  const panels = [];
  
  panels.push({
      id: 'left', title: 'BOK LEWY', x: 0, w: th, y: 0, h: sideH,
      isOuterLeft: true, isOuterRight: false, faceRightX: th, faceLeftX: -999,
      isReversedView: false, detailGroupId: 'detail-left'
  });

  partitions.forEach((p, i) => {
      panels.push({
          id: `part-${i}-L`, title: `PRZEGRODA ${i+1} (LEWA STRONA)`, x: p.x, w: p.w, y: p.y, h: p.h,
          isOuterLeft: false, isOuterRight: false, faceRightX: -999, faceLeftX: p.x,
          isReversedView: true, detailGroupId: `detail-part-${i}`
      });
      panels.push({
          id: `part-${i}-R`, title: `PRZEGRODA ${i+1} (PRAWA STRONA)`, x: p.x, w: p.w, y: p.y, h: p.h,
          isOuterLeft: false, isOuterRight: false, faceRightX: p.x + p.w, faceLeftX: -999,
          isReversedView: false, detailGroupId: `detail-part-${i}`
      });
  });

  panels.push({
      id: 'right', title: 'BOK PRAWY', x: cabWidth - th, w: th, y: 0, h: sideH,
      isOuterLeft: false, isOuterRight: true, faceRightX: 9999, faceLeftX: cabWidth - th,
      isReversedView: true, detailGroupId: 'detail-right'
  });

  const cabX = 80;
  const detailStartX = cabX + cabWidth + 500; 

  panels.forEach(p => {
      if (p.id.endsWith('-R')) p.svgX = detailStartX + depth + 350;
      else p.svgX = detailStartX;
  });

  // NAPRAWA: Kolumny frontu (zewnętrzny i wewnętrzny) muszą stać OBOK paneli
  // z nawiertami (detail-left/right/part-N), a nie na tej samej współrzędnej X.
  // Wcześniej frontX/innerFrontX = detailStartX pokrywały się dokładnie
  // z panelem boków/przegród, więc włączenie widoczności frontu (toggleFront)
  // zasłaniało aktualnie wybrany panel zamiast wyświetlić się obok niego.
  const panelsRightEdge = detailStartX + depth + 350 + depth; 
  const frontX = panelsRightEdge + 350; 
  const innerFrontX = frontX + cabWidth + 350; 

  const marginY = 180; 
  const svgWidth = innerFrontX + cabWidth + 400; 
  
  const vBoxY = svgTopY - marginY;
  const vBoxH = totalSvgHeight + (marginY * 2);

  const formatVal = (val) => Number(Number(val).toFixed(1));

  function getDimText(localY, panelH, color, addRc = false) {
      let primary = Math.min(localY, panelH - localY);
      let secondary = Math.max(localY, panelH - localY);
      let isBottomCloser = localY <= (panelH / 2);
      
      let rcText = addRc ? `<tspan fill="#059669" font-size="9" font-weight="bold"> [Rc: ${formatVal(localY - 32)}]</tspan> ` : ` `;

      return `<tspan fill="${color}" font-weight="bold" font-size="11">${formatVal(primary)}</tspan> ` +
             `<tspan fill="${color}" font-size="9" font-weight="bold">${isBottomCloser ? 'DÓŁ' : 'GÓRA'}</tspan>` +
             rcText +
             `<tspan fill="#94a3b8" font-size="9" font-weight="normal">(${formatVal(secondary)} ${isBottomCloser ? 'GÓRA' : 'DÓŁ'})</tspan>`;
  }

  // Wymiarowanie łańcuchowe dla pionowego panelu (bok / przegroda).
  //   features: [{ y, color, layer }] — y w mm liczone od DOŁU panelu (0..panelH)
  // Rysuje jedną pionową linię wymiarową: dół (0) -> każdy otwór po kolei -> góra
  // (panelH). W prześwitach różnice między sąsiednimi otworami (m.in. rozstaw
  // środkowych otworów pod półki), z boku suma całkowita. Zastępuje wcześniejsze
  // trzy osobne kolumny gęstych opisów.
  function chainDimension(features, panelH, toSvgY, edgeX, dimLineX, isReversed) {
    if (!features.length) return "";

    // scal otwory pokrywające się w pionie (< 1.5 mm) — jeden węzeł łańcucha
    const pts = features
      .slice()
      .sort((a, b) => a.y - b.y)
      .filter((f, i, arr) => i === 0 || Math.abs(f.y - arr[i - 1].y) >= 1.5);

    const nodes = [{ y: 0, datum: true }, ...pts, { y: panelH, datum: true }];
    const dir = isReversed ? 1 : -1;
    const anchor = isReversed ? "start" : "end";
    const tick = 5;
    const deltaX = dimLineX + dir * 10;
    const totX = dimLineX + dir * 52;

    let s = `<g class="dim-chain">`;

    // spina wymiarowa + linia sumy całkowitej z ćwiekami na dole i górze
    s += `<line x1="${dimLineX}" y1="${toSvgY(0)}" x2="${dimLineX}" y2="${toSvgY(panelH)}" stroke="#475569" stroke-width="1" />`;
    s += `<line x1="${totX}" y1="${toSvgY(0)}" x2="${totX}" y2="${toSvgY(panelH)}" stroke="#cbd5e1" stroke-width="1" />`;
    [0, panelH].forEach(v => {
      s += `<line x1="${dimLineX - tick}" y1="${toSvgY(v)}" x2="${dimLineX + tick}" y2="${toSvgY(v)}" stroke="#475569" stroke-width="1.4" />`;
      s += `<line x1="${totX - tick}" y1="${toSvgY(v)}" x2="${totX + tick}" y2="${toSvgY(v)}" stroke="#cbd5e1" stroke-width="1.4" />`;
    });
    const midAll = (toSvgY(0) + toSvgY(panelH)) / 2;
    const totLabelX = totX + dir * 9;
    s += `<text x="${totLabelX}" y="${midAll}" font-size="10" font-weight="bold" fill="#64748b" text-anchor="middle" font-family="sans-serif" transform="rotate(-90 ${totLabelX} ${midAll})">&#931; ${formatVal(panelH)}</text>`;

    // odnośnik + ćwiek dla każdego otworu, pogrupowane wg warstwy filtra (checkboxy)
    const byLayer = {};
    pts.forEach(f => { (byLayer[f.layer] = byLayer[f.layer] || []).push(f); });
    Object.entries(byLayer).forEach(([layer, arr]) => {
      s += `<g class="${layer}">`;
      arr.forEach(f => {
        const y = toSvgY(f.y);
        s += `<line x1="${edgeX}" y1="${y}" x2="${dimLineX}" y2="${y}" stroke="${f.color}" stroke-width="0.6" stroke-dasharray="3,2" />`;
        s += `<line x1="${dimLineX - tick}" y1="${y}" x2="${dimLineX + tick}" y2="${y}" stroke="${f.color}" stroke-width="1.8" />`;
      });
      s += `</g>`;
    });

    // różnice w prześwitach — segmenty między dwoma otworami pogrubione,
    // odcinki do krawędzi panelu (datum) drobne i szare
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const d = b.y - a.y;
      if (d < 0.5) continue;
      const midY = (toSvgY(a.y) + toSvgY(b.y)) / 2;
      const edge = a.datum || b.datum;
      s += `<text x="${deltaX}" y="${midY + 3.5}" font-size="${edge ? 9 : 12}" font-weight="${edge ? "normal" : "bold"}" fill="${edge ? "#94a3b8" : "#0f172a"}" text-anchor="${anchor}" font-family="sans-serif">${formatVal(d)}</text>`;
    }

    s += `</g>`;
    return s;
  }

  let svg = `<svg id="side-panel-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 ${vBoxY} ${svgWidth} ${vBoxH}" width="100%" height="100%" style="background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; cursor: grab;">`;

  svg += `
    <style>
      .clickable-rect { cursor: pointer; transition: all 0.2s; }
      .clickable-rect:hover { fill: #e0f2fe !important; stroke: #3b82f6; stroke-width: 2px; }
      .active-part { fill: #bae6fd !important; stroke: #0284c7 !important; stroke-width: 2.5px !important; }
    </style>
    <g transform="translate(0, 0)">
  `;

  svg += `
    <g transform="translate(80, ${svgTopY - 140})">
        <text x="0" y="0" font-size="16" fill="#1e3a8a" font-weight="bold">INSTRUKCJA:</text>
        <text x="0" y="20" font-size="12" fill="#64748b">Kliknij na lewy/prawy bok lub wybraną przegrodę na rysunku korpusu,</text>
        <text x="0" y="38" font-size="12" fill="#64748b">aby wyświetlić jej szczegółowy plan nawiertów obok.</text>
        
        <g transform="translate(0, 70)">
            <circle cx="0" cy="0" r="4" fill="#9333ea"/><circle cx="12" cy="0" r="1.5" fill="#9333ea"/>
            <text x="22" y="4" font-size="12" fill="#9333ea">Kołek (fi 8) + Wkręt (fi 3) - Konstrukcja</text>
            
            <circle cx="0" cy="25" r="2.5" fill="#ea580c"/>
            <text x="22" y="29" font-size="12" fill="#ea580c">Podpórki półek ruchomych (fi 5)</text>
            
            <circle cx="280" cy="0" r="2.5" fill="#0284c7"/>
            <text x="292" y="4" font-size="12" fill="#0284c7">Prowadnice szuflad (fi 5)</text>
            
            <circle cx="280" cy="25" r="2.5" fill="#16a34a"/>
            <text x="292" y="29" font-size="12" fill="#16a34a">Prowadniki zawiasów (fi 5)</text>
        </g>
    </g>
  `;

  svg += `<line x1="60" y1="${sideH}" x2="${svgWidth - 100}" y2="${sideH}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />`;
  svg += `<text x="${cabX - 10}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="end">0 mm</text>`;

  svg += `<text x="${cabX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS (Kliknij element)</text>`;

  const ghostOpacity = "0.35";
  stackModules.forEach(sm => {
      if (sm.id === mod.id) return;
      
      const dy = getDy(sm);
      const smH = parseFloat(sm.dimensions.height) || 720;
      const smW = parseFloat(sm.dimensions.width) || 600;
      
      const relX = (parseFloat(sm.position.x) || 0) - activeModAbsX;
      const gX = cabX + relX;
      const gY = sideH - (dy + smH); 
      
      const smCons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(sm.construction || {}) };
      const smIsTBF = smCons.joinType === 'wience_przelotowe';
      
      svg += `<g opacity="${ghostOpacity}">`;
      if (smIsTBF) {
        svg += `<rect x="${gX}" y="${gY}" width="${smW}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${gX}" y="${gY + smH - th}" width="${smW}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${gX}" y="${gY + th}" width="${th}" height="${smH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${gX + smW - th}" y="${gY + th}" width="${th}" height="${smH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
      } else {
        svg += `<rect x="${gX}" y="${gY}" width="${th}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        svg += `<rect x="${gX + smW - th}" y="${gY}" width="${th}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        svg += `<rect x="${gX + th}" y="${gY + smH - th}" width="${smW - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        if (smCons.topType === 'pelny' || smCons.topType === 'trawersy_poziom') {
          svg += `<rect x="${gX + th}" y="${gY}" width="${smW - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        } else if (smCons.topType === 'trawersy_pion') {
          svg += `<rect x="${gX + th}" y="${gY}" width="${th}" height="${smCons.traverseWidth || 100}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
          svg += `<rect x="${gX + smW - th * 2}" y="${gY}" width="${th}" height="${smCons.traverseWidth || 100}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        }
      }

      if (sm.elements) {
        sm.elements.forEach(el => {
          if (el.typ === 'front') return;
          const elSvgX = gX + el.x;
          let drawY = smIsTBF ? el.y - th : el.y;
          const elSvgY = (gY + smH) - drawY - el.h; 
          let fillColor = (el.typ === 'poziom' && el.isStructural) ? '#a7f3d0' : '#cbd5e1'; 
          svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
        });
      }
      svg += `<text x="${gX + smW/2}" y="${gY + smH/2}" font-size="20" fill="#475569" text-anchor="middle" font-weight="bold">${escapeHtml(sm.name)}</text></g>`;
  });
  
  const bgFill = "#f1f5f9"; 
  if (isTopBottomFullWidth) {
    svg += `<rect x="${cabX}" y="0" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
    svg += `<rect x="${cabX}" y="${sideH - th}" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
    svg += `<rect id="map-detail-left" x="${cabX}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-left')" />`; 
    svg += `<rect id="map-detail-right" x="${cabX + cabWidth - th}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-right')" />`; 
  } else {
    svg += `<rect id="map-detail-left" x="${cabX}" y="0" width="${th}" height="${sideH}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-left')" />`;
    svg += `<rect id="map-detail-right" x="${cabX + cabWidth - th}" y="0" width="${th}" height="${sideH}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-right')" />`;
    svg += `<rect x="${cabX + th}" y="${sideH - th}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    
    if (cons.topType === 'pelny' || cons.topType === 'trawersy_poziom') {
      // Patrząc od przodu (widok szerokość x wysokość), trawersy poziome
      // (przedni + tylny) różnią się od pełnego wieńca tylko głębokością,
      // która nie jest widoczna z tego kąta - dlatego rysujemy identycznie
      // jak pełny wieniec (analogicznie do "duchów" sąsiednich modułów, patrz wyżej).
      svg += `<rect x="${cabX + th}" y="0" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    } else if (cons.topType === 'trawersy_pion') {
      svg += `<rect x="${cabX + th}" y="0" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
      svg += `<rect x="${cabX + cabWidth - th * 2}" y="0" width="${th}" height="${cons.traverseWidth}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    }
  }

  if (mod && mod.elements) {
    mod.elements.forEach(el => {
      if (el.typ === 'front') return;
      const elSvgX = cabX + el.x;
      let drawY = isTopBottomFullWidth ? el.y - th : el.y;
      const elSvgY = sideH - drawY - el.h; 
      
      if (el.typ === 'pion') {
          let pIndex = partitions.findIndex(p => p.id === el.id);
          svg += `<rect id="map-detail-part-${pIndex}" x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-part-${pIndex}')" />`;
      } else {
          let fillColor = (el.typ === 'poziom' && el.isStructural) ? '#a7f3d0' : '#cbd5e1'; 
          svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
      }
    });
  }

  function getShelvesForFace(faceX, isRightFace) {
      return (mod.elements || []).filter(el => {
          if (el.typ !== 'poziom') return false;
          if (isRightFace) return Math.abs(el.x - faceX) < 2;
          else return Math.abs((el.x + el.w) - faceX) < 2;
      });
  }

  function getDrawersForFace(faceX, isRightFace) {
      return (mountingData || []).filter(d => {
          if (d.type !== 'drawer') return false;
          if (!d.slideSideHoles || d.slideSideHoles.length === 0) return false;
          
          let front = null;
          state.project.modules.forEach(m => {
              if (m.elements) { const f = m.elements.find(e => e.id === d.frontId); if (f) front = f; }
          });
          if (!front) return false;

          const fMinX = front.baseZone ? parseFloat(front.baseZone.minX) : th;
          const fMaxX = front.baseZone ? parseFloat(front.baseZone.maxX) : (cabWidth - th);
          if (isRightFace) return Math.abs(fMinX - faceX) < 2;
          else return Math.abs(fMaxX - faceX) < 2;
      });
  }

  function getHingesForFace(faceX, isRightFace) {
      return (mountingData || []).filter(d => {
          if (d.type !== 'door') return false;
          
          let front = null;
          state.project.modules.forEach(m => {
              if (m.elements) {
                  const f = m.elements.find(e => e.id === d.frontId);
                  if (f) front = f;
              }
          });
          if (!front) return false;

          const fMinX = front.baseZone ? parseFloat(front.baseZone.minX) : th;
          const fMaxX = front.baseZone ? parseFloat(front.baseZone.maxX) : (cabWidth - th);
          if (isRightFace && d.side === 'left') return Math.abs(fMinX - faceX) < 2;
          if (!isRightFace && d.side === 'right') return Math.abs(fMaxX - faceX) < 2;
          return false;
      });
  }

  const detailGroups = ['detail-left', 'detail-right'];
  partitions.forEach((p, i) => detailGroups.push(`detail-part-${i}`));

  detailGroups.forEach(groupId => {
      svg += `<g id="${groupId}" class="detail-view" style="display:none;">`;
      const groupPanels = panels.filter(p => p.detailGroupId === groupId);
      
      groupPanels.forEach(panel => {
          let panelH = sideH;
          let panelCalcY = 0; 

          if (!panel.isOuterLeft && !panel.isOuterRight) {
              panelH = panel.h;
              panelCalcY = isTopBottomFullWidth ? panel.y - th : panel.y;
          }
          
          const panelDrawY = sideH - panelCalcY - panelH;

          svg += `<text x="${panel.svgX + depth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">${panel.title}</text>`;
          svg += `<rect x="${panel.svgX}" y="${panelDrawY}" width="${depth}" height="${panelH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

          const isReversed = panel.isReversedView; 
          const frontTextX = isReversed ? panel.svgX + depth - 15 : panel.svgX + 15;
          const backTextX = isReversed ? panel.svgX + 15 : panel.svgX + depth - 15;
          const textMidY = panelDrawY + (panelH / 2);

          svg += `<text x="${frontTextX}" y="${textMidY}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${frontTextX}, ${textMidY})" text-anchor="middle" letter-spacing="1">PRZÓD</text>`;
          svg += `<text x="${backTextX}" y="${textMidY}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${backTextX}, ${textMidY})" text-anchor="middle" letter-spacing="1">TYŁ</text>`;

          const getSvgX = (distFromFront) => isReversed ? panel.svgX + depth - distFromFront : panel.svgX + distFromFront;

          let shelfYs = new Set();
          let corpusYs = new Set();
          let drawerYs = new Set();
          let hingeYs = new Set();
          let adjustedHingeYs = new Set();

          const drawShelfHoles = (shelves) => {
              shelves.forEach(el => {
                  let calcY = isTopBottomFullWidth ? el.y - th : el.y;
                  if (calcY < panelCalcY - 5 || calcY > panelCalcY + panelH + 5) return;

                  const isStruct = el.isStructural;
                  const baseColor = isStruct ? '#9333ea' : '#ea580c';
                  const svgY = sideH - calcY;

                  if (isStruct) {
                      let rScrew = 1.5; 
                      let rDowel = 4.0; 
                      [37, depth - 37].forEach(hx => {
                          svg += `<circle cx="${getSvgX(hx)}" cy="${svgY - el.h/2}" r="${rScrew}" fill="${baseColor}" />`;
                          let dowelX = hx === 37 ? hx + 32 : hx - 32;
                          svg += `<circle cx="${getSvgX(dowelX)}" cy="${svgY - el.h/2}" r="${rDowel}" fill="${baseColor}" />`;
                          if (hx === 37) corpusYs.add(calcY + el.h/2);
                      });
                  } else {
                      let rPin = 2.5; 
                      [0, 32, -32].forEach(dy => {
                          [37, depth - 37].forEach(hx => {
                              svg += `<circle cx="${getSvgX(hx)}" cy="${svgY - dy}" r="${rPin}" fill="${baseColor}" />`;
                              if (dy === 0 && hx === 37) shelfYs.add(calcY);
                          });
                      });
                  }
              });
          };
          drawShelfHoles(getShelvesForFace(panel.faceLeftX, false));
          drawShelfHoles(getShelvesForFace(panel.faceRightX, true));

          const drawDrawerHoles = (drawers) => {
              drawers.forEach(d => {
                  if (d.slideSideHoles && d.slideSideHoles.length > 0) {
                      let calcY = isTopBottomFullWidth ? d.slideSideHoles[0].y - th : d.slideSideHoles[0].y;
                      if (calcY < panelCalcY - 5 || calcY > panelCalcY + panelH + 5) return;

                      drawerYs.add(calcY);
                      const svgY = sideH - calcY;
                      let rDrawer = 2.5; 

                      d.slideSideHoles.forEach(hole => {
                          svg += `<circle cx="${getSvgX(hole.x)}" cy="${svgY}" r="${rDrawer}" fill="#0284c7" />`;
                      });
                  }
              });
          };
          drawDrawerHoles(getDrawersForFace(panel.faceLeftX, false));
          drawDrawerHoles(getDrawersForFace(panel.faceRightX, true));

          const drawHingeHoles = (hingeData) => {
              hingeData.forEach(d => {
                  d.hinges.forEach(hinge => {
                      if (hinge.isLocal === false) return;
                      let calcY = isTopBottomFullWidth ? hinge.y - th : hinge.y;
                      if (calcY < panelCalcY - 5 || calcY > panelCalcY + panelH + 5) return;

                      const svgY = sideH - calcY;
                      let baseColor = hinge.isAdjusted ? "#ea580c" : "#16a34a";
                      let rHinge = 2.5;

                      svg += `<g class="layer-holes-hinge">`;
                      svg += `<circle cx="${getSvgX(37)}" cy="${svgY - 16}" r="${rHinge}" fill="${baseColor}" />`;
                      svg += `<circle cx="${getSvgX(37)}" cy="${svgY + 16}" r="${rHinge}" fill="${baseColor}" />`;
                      svg += `</g>`;

                      // środek zawiasu wchodzi do wspólnego łańcucha wymiarowego
                      hingeYs.add(calcY);
                      if (hinge.isAdjusted) adjustedHingeYs.add(calcY);
                  });
              });
          };
          drawHingeHoles(getHingesForFace(panel.faceLeftX, false));
          drawHingeHoles(getHingesForFace(panel.faceRightX, true));

          if (panel.isOuterLeft || panel.isOuterRight) {
               const corpusHolesData = mountingData.find(d => d.type === 'corpus');
               if (corpusHolesData && corpusHolesData.holes) {
                   corpusHolesData.holes.forEach(h => {
                       let calcY = isTopBottomFullWidth ? h.y - th : h.y;
                       if (calcY < panelCalcY - 5 || calcY > panelCalcY + panelH + 5) return;

                       if (h.holeType === 'screw') corpusYs.add(calcY);
                       
                       let r = h.holeType === 'screw' ? 1.5 : 4.0; 
                       let holeX = panel.isOuterRight ? (depth - h.xFromFront) : h.xFromFront;
                       
                       svg += `<circle cx="${panel.svgX + holeX}" cy="${sideH - calcY}" r="${r}" fill="#9333ea" />`;
                   });
               }
          }

          // --- WYMIAROWANIE ŁAŃCUCHOWE ---
          // Wszystkie rzędy nawiertów (prowadnice, konfirmaty/półki stałe,
          // zawiasy, podpórki półek ruchomych) trafiają do jednego pionowego
          // łańcucha: dół panelu -> kolejno każdy otwór -> góra panelu.
          const toSvgY = (localY) => sideH - panelCalcY - localY;
          const edgeX = isReversed ? panel.svgX + depth : panel.svgX;
          const dimLineX = isReversed ? panel.svgX + depth + 82 : panel.svgX - 82;

          const chainFeatures = [
              ...Array.from(drawerYs).map(cy => ({ y: cy - panelCalcY, color: "#0284c7", layer: "layer-holes-drawer" })),
              ...Array.from(corpusYs).map(cy => ({ y: cy - panelCalcY, color: "#9333ea", layer: "layer-holes-corpus" })),
              ...Array.from(hingeYs).map(cy => ({ y: cy - panelCalcY, color: adjustedHingeYs.has(cy) ? "#ea580c" : "#16a34a", layer: "layer-holes-hinge" })),
              ...Array.from(shelfYs).map(cy => ({ y: cy - panelCalcY, color: "#ea580c", layer: "layer-holes-shelf" })),
          ].filter(f => f.y > -2 && f.y < panelH + 2);

          svg += chainDimension(chainFeatures, panelH, toSvgY, edgeX, dimLineX, isReversed);
      });
      svg += `</g>`;
  });

  svg += `<g id="detail-front" style="display:none;">`;
  svg += `<text x="${frontX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONT (Podział zewnętrzny)</text>`;

  const allOuterFronts = [];
  stackModules.forEach(sm => {
      const smDy = getDy(sm);
      const smCons = { joinType: 'boki_przelotowe', topType: 'pelny', ...config.construction, ...(sm.construction || {}) };
      const smIsTBF = smCons.joinType === 'wience_przelotowe';
      if (sm.elements) {
          sm.elements.filter(el => el.typ === 'front' && el.subtype !== 'szuflada-wewnetrzna').forEach(f => {
              allOuterFronts.push({ ...f, dy: smDy, sourceModId: sm.id, sourceModName: sm.name, isTBF: smIsTBF });
          });
      }
  });
  
  allOuterFronts.forEach(front => {
      let drawY = front.isTBF ? front.y - th : front.y;
      const elSvgY = sideH - (front.dy + drawY + front.h); 
      const isDrawer = front.subtype === 'szuflada';
      const isDoor = front.subtype.includes('drzwi');
      const isForeign = front.sourceModId !== mod.id;
      let fillColor = isForeign ? '#f8fafc' : (isDrawer ? '#eff6ff' : '#f0fdf4'); 
      let strokeColor = isForeign ? '#cbd5e1' : (isDrawer ? '#3b82f6' : '#22c55e');
      let strokeDash = isForeign ? 'stroke-dasharray="4,4"' : '';
      
      const fWidth = front.w || cabWidth;
      const fSvgX = frontX + (front.x || 0);

      svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" ${strokeDash} />`;

      let labelText = isDrawer ? `Szuflada` : `Drzwi`;
      if (isForeign) labelText += ` (z: ${escapeHtml(front.sourceModName)})`;
      svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="${isForeign ? '#94a3b8' : '#1e293b'}" font-weight="bold" text-anchor="middle">${labelText}</text>`;

      if (isDoor && mountingData) {
        svg += `<g class="layer-holes-hinge">`;
        const doorData = mountingData.find(m => m.type === 'door' && m.frontId === front.id);
        if (doorData && doorData.hinges) {
          doorData.hinges.forEach((hinge) => {
             const isLeft = doorData.side === 'left';
             const cupX = isLeft ? fSvgX + hinge.cupXOffset : fSvgX + fWidth - hinge.cupXOffset;
             let drawHoleY = front.isTBF ? front.y + hinge.relY - th : front.y + hinge.relY;
             const holeSvgY = sideH - (front.dy + drawHoleY);

             let mainColor = hinge.isLocal ? (hinge.isAdjusted ? "#ea580c" : "#16a34a") : "#94a3b8";
             let opacity = hinge.isLocal ? "1" : "0.5"; 

             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="17.5" fill="#fcfdfd" stroke="${mainColor}" stroke-width="1.5" opacity="${opacity}" />`;
             svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="2.5" fill="${mainColor}" opacity="${opacity}" />`;

             let tspanHtml = getDimText(hinge.relY, front.h, mainColor);
             let textX = isLeft ? cupX + 22 : cupX - 22;
             let anchor = isLeft ? 'start' : 'end';
             svg += `<text x="${textX}" y="${holeSvgY + 4}" text-anchor="${anchor}" font-family="sans-serif" opacity="${opacity}">${tspanHtml}</text>`;
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
             
             let drawHoleY = front.isTBF ? front.y + hole.y - th : front.y + hole.y;
             const holeSvgY = sideH - (front.dy + drawHoleY);

             svg += `<circle cx="${holeX_Left}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;
             svg += `<circle cx="${holeX_Right}" cy="${holeSvgY}" r="2.5" fill="#dc2626" />`;
          });
        }
        svg += `</g>`;
      }
  });
  svg += `</g>`;

  svg += `<g id="detail-front-inner" style="display:none;">`;
  svg += `<text x="${innerFrontX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONTY (Szuflady wewn.)</text>`;

  if (mod && mod.elements) {
    const innerFronts = mod.elements.filter(el => el.typ === 'front' && el.subtype === 'szuflada-wewnetrzna').sort((a, b) => a.y - b.y);
    svg += `<rect x="${innerFrontX}" y="0" width="${cabWidth}" height="${sideH}" fill="none" stroke="#94a3b8" stroke-dasharray="4,4" stroke-width="1" />`;

    innerFronts.forEach(front => {
      let drawY = isTopBottomFullWidth ? front.y - th : front.y;
      const elSvgY = sideH - drawY - front.h; 
      const fWidth = front.w || cabWidth;
      const fSvgX = innerFrontX + (front.x || 0);

      svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="#fff7ed" stroke="#ea580c" stroke-width="1.5" />`;
      svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">Szuflada Wewn.</text>`;
    });
  }
  svg += `</g>`;

  svg += `</g></svg>`;
  return svg;
}