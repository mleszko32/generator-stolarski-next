// src/render/viewer2d.js
import { state } from '../core/state.js';

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

  const stackModules = state.project.modules.filter(m => Math.abs((parseFloat(m.position.x) || 0) - activeModAbsX) < 10);
  
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
  const frontX = detailStartX; 
  const innerFrontX = detailStartX;

  panels.forEach(p => {
      if (p.id.endsWith('-R')) p.svgX = detailStartX + depth + 350;
      else p.svgX = detailStartX;
  });

  const marginY = 180; 
  const svgWidth = detailStartX + (depth * 2) + 800; 
  
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
    
    if (cons.topType === 'pelny') {
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

  function getShelvesForFace(faceX, isRightFace, pCalcY, pH) {
      return (mod.elements || []).filter(el => {
          if (el.typ !== 'poziom') return false;
          let calcY = isTopBottomFullWidth ? el.y - th : el.y;
          if (calcY < pCalcY - 5 || calcY > pCalcY + pH + 5) return false;
          if (isRightFace) return Math.abs(el.x - faceX) < 2;
          else return Math.abs((el.x + el.w) - faceX) < 2;
      });
  }

  function getDrawersForFace(faceX, isRightFace, pCalcY, pH) {
      return (mountingData || []).filter(d => {
          if (d.type !== 'drawer') return false;
          if (!d.slideSideHoles || d.slideSideHoles.length === 0) return false;
          let calcY = isTopBottomFullWidth ? d.slideSideHoles[0].y - th : d.slideSideHoles[0].y;
          if (calcY < pCalcY - 5 || calcY > pCalcY + pH + 5) return false;
          const front = mod.elements.find(e => e.id === d.frontId);
          if (!front) return false;
          const fMinX = front.baseZone ? parseFloat(front.baseZone.minX) : th;
          const fMaxX = front.baseZone ? parseFloat(front.baseZone.maxX) : (cabWidth - th);
          if (isRightFace) return Math.abs(fMinX - faceX) < 2;
          else return Math.abs(fMaxX - faceX) < 2;
      });
  }

  function getHingesForFace(faceX, isRightFace, pCalcY, pH) {
      return (mountingData || []).filter(d => {
          if (d.type !== 'door') return false;
          if (d.hinges.length > 0) {
             let calcY = isTopBottomFullWidth ? d.hinges[0].y - th : d.hinges[0].y;
             if (calcY < pCalcY - 5 || calcY > pCalcY + pH + 5) return false;
          }
          const front = mod.elements.find(e => e.id === d.frontId);
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

          const drawShelfHoles = (shelves) => {
              shelves.forEach(el => {
                  let calcY = isTopBottomFullWidth ? el.y - th : el.y;
                  const isStruct = el.isStructural;
                  const baseColor = isStruct ? '#9333ea' : '#ea580c';
                  const svgY = sideH - calcY;

                  if (isStruct) {
                      let rScrew = 1.5; // fi 3
                      let rDowel = 4.0; // fi 8
                      [37, depth - 37].forEach(hx => {
                          // Wkręt
                          svg += `<circle cx="${getSvgX(hx)}" cy="${svgY - el.h/2}" r="${rScrew}" fill="${baseColor}" />`;
                          // Kołek
                          let dowelX = hx === 37 ? hx + 32 : hx - 32;
                          svg += `<circle cx="${getSvgX(dowelX)}" cy="${svgY - el.h/2}" r="${rDowel}" fill="${baseColor}" />`;
                          
                          if (hx === 37) corpusYs.add(calcY + el.h/2);
                      });
                  } else {
                      let rPin = 2.5; // fi 5
                      [0, 32, -32].forEach(dy => {
                          [37, depth - 37].forEach(hx => {
                              svg += `<circle cx="${getSvgX(hx)}" cy="${svgY - dy}" r="${rPin}" fill="${baseColor}" />`;
                              if (dy === 0 && hx === 37) shelfYs.add(calcY);
                          });
                      });
                  }
              });
          };
          drawShelfHoles(getShelvesForFace(panel.faceLeftX, false, panelCalcY, panelH));
          drawShelfHoles(getShelvesForFace(panel.faceRightX, true, panelCalcY, panelH));

          const drawDrawerHoles = (drawers) => {
              drawers.forEach(d => {
                  if (d.slideSideHoles && d.slideSideHoles.length > 0) {
                      let calcY = isTopBottomFullWidth ? d.slideSideHoles[0].y - th : d.slideSideHoles[0].y;
                      drawerYs.add(calcY);
                      const svgY = sideH - calcY;
                      let rDrawer = 2.5; // fi 5

                      d.slideSideHoles.forEach(hole => {
                          svg += `<circle cx="${getSvgX(hole.x)}" cy="${svgY}" r="${rDrawer}" fill="#0284c7" />`;
                      });
                  }
              });
          };
          drawDrawerHoles(getDrawersForFace(panel.faceLeftX, false, panelCalcY, panelH));
          drawDrawerHoles(getDrawersForFace(panel.faceRightX, true, panelCalcY, panelH));

          const drawHingeHoles = (hingeData) => {
              hingeData.forEach(d => {
                  d.hinges.forEach(hinge => {
                      if (hinge.isLocal === false) return;
                      let calcY = isTopBottomFullWidth ? hinge.y - th : hinge.y;
                      const svgY = sideH - calcY;
                      
                      let baseColor = hinge.isAdjusted ? "#ea580c" : "#16a34a";
                      let rHinge = 2.5; // fi 5

                      svg += `<circle cx="${getSvgX(37)}" cy="${svgY - 16}" r="${rHinge}" fill="${baseColor}" />`;
                      svg += `<circle cx="${getSvgX(37)}" cy="${svgY + 16}" r="${rHinge}" fill="${baseColor}" />`;

                      let localHoleY = calcY - panelCalcY;
                      let tspanHtml = getDimText(localHoleY, panelH, baseColor);

                      let textX = isReversed ? getSvgX(37) - 8 : getSvgX(37) + 8;
                      let anchor = isReversed ? 'end' : 'start';
                      svg += `<text x="${textX}" y="${svgY + 4}" text-anchor="${anchor}" font-family="sans-serif">${tspanHtml}</text>`;
                  });
              });
          };
          drawHingeHoles(getHingesForFace(panel.faceLeftX, false, panelCalcY, panelH));
          drawHingeHoles(getHingesForFace(panel.faceRightX, true, panelCalcY, panelH));

          if (panel.isOuterLeft || panel.isOuterRight) {
               const corpusHolesData = mountingData.find(d => d.type === 'corpus');
               if (corpusHolesData && corpusHolesData.holes) {
                   corpusHolesData.holes.forEach(h => {
                       let calcY = isTopBottomFullWidth ? h.y - th : h.y;
                       if (h.holeType === 'screw') corpusYs.add(calcY);
                       
                       let r = h.holeType === 'screw' ? 1.5 : 4.0; // fi 3 wkręt, fi 8 kołek
                       let holeX = panel.isOuterRight ? (depth - h.xFromFront) : h.xFromFront;
                       
                       svg += `<circle cx="${panel.svgX + holeX}" cy="${sideH - calcY}" r="${r}" fill="#9333ea" />`;
                   });
               }
          }

          const sortedDrawerYs = Array.from(drawerYs).sort((a,b) => a - b);
          const sortedCorpusYs = Array.from(corpusYs).sort((a,b) => a - b);
          const sortedShelfYs = Array.from(shelfYs).sort((a,b) => a - b);

          let currentDimX = isReversed ? panel.svgX + depth + 40 : panel.svgX - 40;
          const stepDir = isReversed ? 120 : -120;
          const textAnchor = isReversed ? 'start' : 'end';
          const textOffset = isReversed ? 8 : -8;

          if (sortedDrawerYs.length > 0) {
              svg += `<g class="layer-holes-drawer">`;
              sortedDrawerYs.forEach(calcY => {
                  let holeSvgY = sideH - calcY;
                  let edgeX = isReversed ? panel.svgX + depth : panel.svgX;
                  svg += `<line x1="${edgeX}" y1="${holeSvgY}" x2="${currentDimX}" y2="${holeSvgY}" stroke="#0284c7" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  
                  let localHoleY = calcY - panelCalcY;
                  let tspanHtml = getDimText(localHoleY, panelH, "#0284c7");

                  svg += `<text x="${currentDimX + textOffset}" y="${holeSvgY + 4}" font-size="12" font-family="sans-serif" text-anchor="${textAnchor}">
                            ${tspanHtml}
                          </text>`;
              });
              currentDimX += stepDir;
              svg += `</g>`;
          }

          if (sortedCorpusYs.length > 0) {
              svg += `<g class="layer-holes-corpus">`;
              sortedCorpusYs.forEach(calcY => {
                  let holeSvgY = sideH - calcY;
                  let edgeX = isReversed ? panel.svgX + depth : panel.svgX;
                  svg += `<line x1="${edgeX}" y1="${holeSvgY}" x2="${currentDimX}" y2="${holeSvgY}" stroke="#9333ea" stroke-width="0.5" stroke-dasharray="2,2" />`;
                  
                  let localHoleY = calcY - panelCalcY;
                  let tspanHtml = getDimText(localHoleY, panelH, "#9333ea", true);

                  svg += `<text x="${currentDimX + textOffset}" y="${holeSvgY + 4}" font-size="12" font-family="sans-serif" text-anchor="${textAnchor}">
                            ${tspanHtml}
                          </text>`;
              });
              currentDimX += stepDir;
              svg += `</g>`;
          }

          if (sortedShelfYs.length > 0) {
              svg += `<g class="layer-holes-shelf">`;
              sortedShelfYs.forEach(calcY => {
                  [32, 0, -32].forEach(dy => {
                      let holeY = calcY + dy;
                      let holeSvgY = sideH - holeY;
                      let isCenter = dy === 0;
                      let edgeX = isReversed ? panel.svgX + depth : panel.svgX;
                      svg += `<line x1="${edgeX}" y1="${holeSvgY}" x2="${currentDimX}" y2="${holeSvgY}" stroke="#ea580c" stroke-width="0.5" stroke-dasharray="2,2" />`;
                      
                      let localHoleY = holeY - panelCalcY;
                      let tspanHtml = getDimText(localHoleY, panelH, "#ea580c", true);

                      svg += `<text x="${currentDimX + textOffset}" y="${holeSvgY + 4}" font-family="sans-serif" text-anchor="${textAnchor}" opacity="${isCenter ? '1' : '0.6'}">
                                ${tspanHtml}
                              </text>`;
                  });
              });
              currentDimX += stepDir;
              svg += `</g>`;
          }
      });
      svg += `</g>`;
  });

  svg += `<g id="detail-front" class="detail-view" style="display:none;">`;
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
      if (isForeign) labelText += ` (z: ${front.sourceModName})`;
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

  svg += `<g id="detail-front-inner" class="detail-view" style="display:none;">`;
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