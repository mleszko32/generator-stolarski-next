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

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  
  // sideH to fizyczna wysokość boku aktywnego modułu, traktowana jako baza wymiarowania
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;

  // --- NOWOŚĆ: SKANOWANIE W PIONIE (KONTEKST SĄSIADÓW) ---
  const activeModAbsX = parseFloat(mod.position.x) || 0;
  const activeModLegH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 0) : 0;
  const activeModAbsY = (parseFloat(mod.position.y) || 0) + activeModLegH;

  // Filtrujemy wszystkie szafki, które stoją w tym samym pionie (margines 10mm)
  const stackModules = state.project.modules.filter(m => Math.abs((parseFloat(m.position.x) || 0) - activeModAbsX) < 10);
  
  // Funkcja obliczająca przesunięcie (dy) dowolnej szafki względem bazy aktywnej szafki
  const getDy = (m) => {
      const mLegH = (m.legs && m.legs.active) ? (parseFloat(m.legs.height) || 0) : 0;
      return ((parseFloat(m.position.y) || 0) + mLegH) - activeModAbsY;
  };

  let maxDy = 0; 
  let minDy = 0; 
  stackModules.forEach(m => {
      const dy = getDy(m);
      const mH = parseFloat(m.dimensions.height) || 720;
      maxDy = Math.max(maxDy, dy + mH);
      minDy = Math.min(minDy, dy);
  });
  
  // Obliczamy dynamiczne granice rysunku, by zmieścić całą wieżę szafek
  const svgTopY = sideH - maxDy; 
  const svgBottomY = sideH - minDy;
  const totalSvgHeight = svgBottomY - svgTopY;
  // ---------------------------------------------------------

  let currentX = 80;
  const gapBetween = 400; 
  
  let cabX = -9999, bokLX = -9999, bokRX = -9999, frontX = -9999, innerFrontX = -9999;

  if (viewMode === 'all' || viewMode === 'korpus') { cabX = currentX; currentX += cabWidth + gapBetween; }
  if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') { bokLX = currentX; currentX += depth + gapBetween; }
  if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') { bokRX = currentX; currentX += depth + gapBetween; }
  if (viewMode === 'all' || viewMode === 'front') { frontX = currentX; currentX += cabWidth + gapBetween; }
  if (viewMode === 'all' || viewMode === 'frontInner') { innerFrontX = currentX; currentX += cabWidth + gapBetween; }

  const marginRight = 400; 
  const marginY = 180; 
  const svgWidth = Math.max(800, currentX - gapBetween + marginRight);
  
  // Dynamiczny ViewBox rozciągający się na całą wysokość wieży
  const vBoxY = svgTopY - marginY;
  const vBoxH = totalSvgHeight + (marginY * 2);

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

  let svg = `<svg id="side-panel-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 ${vBoxY} ${svgWidth} ${vBoxH}" width="100%" height="100%" style="background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; cursor: grab;">`;

  svg += `
    <defs>
      <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="#dc2626" /></marker>
      <marker id="arrow-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="#475569" /></marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="#0284c7" /></marker>
      <marker id="arrow-purple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="#9333ea" /></marker>
      <marker id="arrow-amber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 10 5 L 0 8 z" fill="#ea580c" /></marker>
    </defs>
    <g transform="translate(0, 0)">
  `;

  // Legenda przesuwa się na samą górę powiększonego widoku
  svg += `
    <g transform="translate(80, ${svgTopY - 100})">
        <text x="0" y="0" font-size="14" fill="#1e293b" font-weight="bold">LEGENDA NAWIERTÓW I WYMIARÓW:</text>
        <circle cx="0" cy="20" r="4" fill="#9333ea"/><circle cx="12" cy="20" r="1.5" fill="#9333ea"/>
        <text x="22" y="24" font-size="12" fill="#9333ea">Konstrukcja: Wieńce / Półki stałe (Kołki + Wkręty)</text>
        <circle cx="0" cy="45" r="2.5" fill="#fcd34d"/><circle cx="0" cy="45" r="1.5" fill="#ea580c"/>
        <text x="22" y="49" font-size="12" fill="#ea580c">Podpórki półek ruchomych (System 32)</text>
        <circle cx="340" cy="20" r="2.5" fill="#0284c7"/>
        <text x="352" y="24" font-size="12" fill="#0284c7">Prowadnice szuflad (5mm)</text>
        <circle cx="340" cy="45" r="2.5" fill="#dc2626"/>
        <text x="352" y="49" font-size="12" fill="#dc2626">Mocowania frontu szuflady</text>
        <circle cx="560" cy="20" r="2.5" fill="#16a34a"/>
        <text x="572" y="24" font-size="12" fill="#16a34a">Zawiasy i prowadniki zawiasów</text>
        <circle cx="560" cy="45" r="2.5" fill="#ea580c"/>
        <text x="572" y="49" font-size="12" font-weight="bold" fill="#ea580c">Zawias skorygowany (Ominął przeszkodę)</text>
    </g>
  `;

  // Oś bazy (Zero)
  svg += `<line x1="60" y1="${sideH}" x2="${svgWidth - 100}" y2="${sideH}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />`;
  svg += `<text x="${svgWidth - 90}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold">0 mm (Baza modułu)</text>`;

  // --- RYSOWANIE "DUCHÓW" SĄSIEDNICH SZAFEK ---
  stackModules.forEach(sm => {
      if (sm.id === mod.id) return; // Pomijamy aktywną, narysujemy ją dokładnie za chwilę
      
      const dy = getDy(sm);
      const smH = parseFloat(sm.dimensions.height) || 720;
      const gY = sideH - (dy + smH); // Współrzędna Y dla góry sąsiada
      
      const smCons = { joinType: 'boki_przelotowe', topType: 'pelny', ...config.construction, ...(sm.construction || {}) };
      const smIsTBF = smCons.joinType === 'wience_przelotowe';
      
      const ghostOpacity = "0.35"; // Poziom wyszarzenia dla modułów tła

      if (viewMode === 'all' || viewMode === 'korpus') {
          svg += `<g opacity="${ghostOpacity}">`;
          
          // Rysujemy zewnętrzną ramę (korpus) sąsiada
          if (smIsTBF) {
            svg += `<rect x="${cabX}" y="${gY}" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
            svg += `<rect x="${cabX}" y="${gY + smH - th}" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
            svg += `<rect x="${cabX}" y="${gY + th}" width="${th}" height="${smH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
            svg += `<rect x="${cabX + cabWidth - th}" y="${gY + th}" width="${th}" height="${smH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
          } else {
            svg += `<rect x="${cabX}" y="${gY}" width="${th}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
            svg += `<rect x="${cabX + cabWidth - th}" y="${gY}" width="${th}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
            svg += `<rect x="${cabX + th}" y="${gY + smH - th}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
            
            if (smCons.topType === 'pelny' || smCons.topType === 'trawersy_poziom') {
              svg += `<rect x="${cabX + th}" y="${gY}" width="${cabWidth - th*2}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
            } else if (smCons.topType === 'trawersy_pion') {
              svg += `<rect x="${cabX + th}" y="${gY}" width="${th}" height="${smCons.traverseWidth || 100}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
              svg += `<rect x="${cabX + cabWidth - th * 2}" y="${gY}" width="${th}" height="${smCons.traverseWidth || 100}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
            }
          }

          // Rysujemy wewnętrzne półki sąsiada
          if (sm.elements) {
            sm.elements.forEach(el => {
              if (el.typ === 'front') return;
              const elSvgX = cabX + el.x;
              let drawY = smIsTBF ? el.y - th : el.y;
              const elSvgY = (gY + smH) - drawY - el.h; 
              let fillColor = (el.typ === 'poziom' && el.isStructural) ? '#a7f3d0' : '#cbd5e1'; 
              svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
            });
          }
          
          svg += `<text x="${cabX + cabWidth/2}" y="${gY + smH/2}" font-size="20" fill="#475569" text-anchor="middle" font-weight="bold">${sm.name}</text>`;
          svg += `</g>`;
      }
      
      if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
          svg += `<g opacity="${ghostOpacity}">`;
          svg += `<rect x="${bokLX}" y="${gY}" width="${depth}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
          svg += `</g>`;
      }
      
      if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
          svg += `<g opacity="${ghostOpacity}">`;
          svg += `<rect x="${bokRX}" y="${gY}" width="${depth}" height="${smH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
          svg += `</g>`;
      }
      
      if (viewMode === 'all' || viewMode === 'frontInner') {
          svg += `<g opacity="${ghostOpacity}">`;
          svg += `<rect x="${innerFrontX}" y="${gY}" width="${cabWidth}" height="${smH}" fill="none" stroke="#94a3b8" stroke-dasharray="4,4" stroke-width="1" />`;
          
          if (sm.elements) {
            const innerFronts = sm.elements.filter(el => el.typ === 'front' && el.subtype === 'szuflada-wewnetrzna');
            innerFronts.forEach(front => {
              let drawY = smIsTBF ? front.y - th : front.y;
              const elSvgY = (gY + smH) - drawY - front.h; 
              let fillColor = '#fff7ed'; 
              let strokeColor = '#ea580c';
              const fWidth = front.w || cabWidth;
              const fSvgX = innerFrontX + (front.x || 0);
              svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />`;
              svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">Szuflada Wewn.</text>`;
            });
          }
          svg += `</g>`;
      }
  });
  // ---------------------------------------------
  // ---------------------------------------------

  // --- RYSOWANIE AKTYWNEGO MODUŁU ---
  if (viewMode === 'all' || viewMode === 'korpus') {
      svg += `<text x="${cabX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS WNĘTRZE</text>`;
      
      if (isTopBottomFullWidth) {
        svg += `<rect x="${cabX}" y="0" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX}" y="${sideH - th}" width="${cabWidth}" height="${th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
        svg += `<rect x="${cabX + cabWidth - th}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`; 
      } else {
        svg += `<rect x="${cabX}" y="0" width="${th}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
        svg += `<rect x="${cabX + cabWidth - th}" y="0" width="${th}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
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
          let fillColor = (el.typ === 'poziom' && el.isStructural) ? '#a7f3d0' : '#cbd5e1'; 
          svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
        });
      }
  }

  if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
      svg += `<text x="${bokLX + depth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK LEWY</text>`;
      svg += `<rect x="${bokLX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
      svg += `<text x="${bokLX + 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokLX + 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
  }

  if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
      svg += `<text x="${bokRX + depth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">BOK PRAWY</text>`;
      svg += `<rect x="${bokRX}" y="0" width="${depth}" height="${sideH}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
      svg += `<text x="${bokRX + depth - 15}" y="${sideH / 2}" font-size="11" fill="#94a3b8" font-weight="bold" transform="rotate(-90, ${bokRX + depth - 15}, ${sideH / 2})" text-anchor="middle" letter-spacing="1">PRZÓD BOKU</text>`;
  }

  let drawerYs = new Set();
  let corpusYs = new Set(); 
  let shelfYs = new Set(); 

  const shelfHoles = calculateShelfHoles();
  if (shelfHoles && shelfHoles.length > 0) {
    shelfHoles.forEach(hole => {
      let calcY = isTopBottomFullWidth ? hole.y - th : hole.y;
      const isStruct = hole.isStructural === true || hole.type === 'konstrukcyjna';
      const color = hole.color || (isStruct ? '#9333ea' : '#f59e0b');
      const radius = hole.diameter ? (hole.diameter / 2) : 2.5; 
      const layerClass = isStruct ? 'layer-holes-corpus' : 'layer-holes-shelf';
      const svgY = sideH - calcY;
      
      svg += `<g class="${layerClass}">`;
      if (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki') {
          svg += `<circle cx="${bokLX + hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      }
      if (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki') {
          svg += `<circle cx="${bokRX + depth - hole.x}" cy="${svgY}" r="${radius}" fill="${color}" />`;
      }
      svg += `</g>`;

      if (isStruct && hole.isCenter) corpusYs.add(calcY);
      else if (!isStruct && hole.isCenter && hole.x === 37) shelfYs.add(calcY); 
    });
  }

  if (mountingData) {
    mountingData.forEach((data) => {
      if (data.type === 'door') {
        data.hinges.forEach(hinge => {
          
          if (hinge.isLocal === false) return; // Pomijamy prowadniki należące fizycznie do sąsiadów
          
          let calcY = isTopBottomFullWidth ? hinge.y - th : hinge.y;
          const svgY = sideH - calcY;
          
          let distBottom = calcY;
          let distTop = sideH - calcY;
          let isBottomCloser = distBottom <= distTop;
          let primary = isBottomCloser ? distBottom : distTop;
          let secondary = isBottomCloser ? distTop : distBottom;
          
          let mainColor = hinge.isAdjusted ? "#ea580c" : "#16a34a";
          let darkColor = hinge.isAdjusted ? "#c2410c" : "#15803d";
          let warnMsg = hinge.isAdjusted ? ` <tspan fill="${mainColor}" font-size="9" font-weight="bold">⚠️ AUTO-KOREKTA</tspan>` : "";
          
          let tspanHtml = `<tspan fill="${mainColor}" font-weight="bold" font-size="11">${formatVal(primary)}</tspan> ` +
                          `<tspan fill="${darkColor}" font-size="9" font-weight="bold">${isBottomCloser ? 'DÓŁ' : 'GÓRA'}</tspan> ` +
                          `<tspan fill="#94a3b8" font-size="9" font-weight="normal">(${formatVal(secondary)} ${isBottomCloser ? 'GÓRA' : 'DÓŁ'})</tspan>` + warnMsg;
          
          svg += `<g class="layer-holes-hinge">`;
          if (data.side === 'left' && (viewMode === 'all' || viewMode === 'bokL' || viewMode === 'boki')) {
            const svgX = bokLX + 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="${mainColor}" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="${mainColor}" />`;
            svg += `<text x="${svgX + 8}" y="${svgY + 4}" font-family="sans-serif">${tspanHtml}</text>`;
          } else if (data.side === 'right' && (viewMode === 'all' || viewMode === 'bokR' || viewMode === 'boki')) {
            const svgX = bokRX + depth - 37;
            svg += `<circle cx="${svgX}" cy="${svgY - 16}" r="2.5" fill="${mainColor}" />`;
            svg += `<circle cx="${svgX}" cy="${svgY + 16}" r="2.5" fill="${mainColor}" />`;
            svg += `<text x="${svgX - 8}" y="${svgY + 4}" text-anchor="end" font-family="sans-serif">${tspanHtml}</text>`;
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
    });
  }

  // Wymiarowanie pionowe otworów
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
        const highestCenterY = sortedShelfYs[sortedShelfYs.length - 1];
        const highestSvgY = sideH - (highestCenterY + 32); 
        svg += `<line x1="${currentDimX_L}" y1="${sideH}" x2="${currentDimX_L}" y2="${highestSvgY}" stroke="#ea580c" stroke-width="1.5" marker-start="url(#arrow-amber)" />`;
        sortedShelfYs.forEach(calcY => {
          [32, 0, -32].forEach(dy => {
             let holeY = calcY + dy;
             let holeSvgY = sideH - holeY;
             let isCenter = dy === 0;
             svg += `<line x1="${bokLX}" y1="${holeSvgY}" x2="${currentDimX_L}" y2="${holeSvgY}" stroke="#ea580c" stroke-width="0.5" stroke-dasharray="2,2" />`;
             svg += `<text x="${currentDimX_L - 6}" y="${holeSvgY + 4}" font-size="${isCenter ? '12' : '10'}" font-weight="${isCenter ? 'bold' : 'normal'}" text-anchor="end" opacity="${isCenter ? '1' : '0.7'}">
                       <tspan fill="#ea580c">${formatVal(holeY)}</tspan> <tspan fill="#059669">[Rc: ${formatVal(holeY - 32)}]</tspan> <tspan fill="#64748b">(${formatVal(sideH - holeY)})</tspan>
                     </text>`;
          });
        });
        currentDimX_L -= 110; 
        svg += `</g>`;
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
        const highestCenterY = sortedShelfYs[sortedShelfYs.length - 1];
        const highestSvgY = sideH - (highestCenterY + 32); 
        svg += `<line x1="${currentDimX_R}" y1="${sideH}" x2="${currentDimX_R}" y2="${highestSvgY}" stroke="#ea580c" stroke-width="1.5" marker-start="url(#arrow-amber)" />`;
        sortedShelfYs.forEach(calcY => {
          [32, 0, -32].forEach(dy => {
             let holeY = calcY + dy;
             let holeSvgY = sideH - holeY;
             let isCenter = dy === 0;
             svg += `<line x1="${bokRX + depth}" y1="${holeSvgY}" x2="${currentDimX_R}" y2="${holeSvgY}" stroke="#ea580c" stroke-width="0.5" stroke-dasharray="2,2" />`;
             svg += `<text x="${currentDimX_R + 6}" y="${holeSvgY + 4}" font-size="${isCenter ? '12' : '10'}" font-weight="${isCenter ? 'bold' : 'normal'}" text-anchor="start" opacity="${isCenter ? '1' : '0.7'}">
                       <tspan fill="#ea580c">${formatVal(holeY)}</tspan> <tspan fill="#059669">[Rc: ${formatVal(holeY - 32)}]</tspan> <tspan fill="#64748b">(${formatVal(sideH - holeY)})</tspan>
                     </text>`;
          });
        });
        currentDimX_R += 110;
        svg += `</g>`;
      }
  }

  // ==========================================
  // CZĘŚĆ 4: FRONTY ZEWNĘTRZNE I DRZWI
  // ==========================================
  if (viewMode === 'all' || viewMode === 'front') {
      svg += `<text x="${frontX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONT (Podział zewnętrzny)</text>`;

      // GROMADZIMY WSZYSTKIE FRONTY Z CAŁEGO PIONU
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

          // Rysujemy puszki tylko wtedy, jeśli są zawarte w danych aktywnego modułu
          // Dzięki globalnemu skanerowi, nadstawka wie o swoich puszkach!
          // Rysujemy WSZYSTKIE puszki na froncie, ale odpowiednio je kolorujemy
          if (isDoor && mountingData) {
            svg += `<g class="layer-holes-hinge">`;
            const doorData = mountingData.find(m => m.type === 'door' && m.frontId === front.id);
            if (doorData && doorData.hinges) {
              doorData.hinges.forEach((hinge) => {
                 
                 // USUNIĘTO: if (hinge.isLocal === false) return; 
                 // Na rysunku frontu chcemy widzieć wszystkie nawierty!
                 
                 const isLeft = doorData.side === 'left';
                 const cupX = isLeft ? fSvgX + hinge.cupXOffset : fSvgX + fWidth - hinge.cupXOffset;
                 
                 // Wyliczamy absolutną pozycję puszki na froncie
                 let drawHoleY = front.isTBF ? front.y + hinge.relY - th : front.y + hinge.relY;
                 const holeSvgY = sideH - (front.dy + drawHoleY);

                 // --- LOGIKA WIZUALNA (Lokalne vs Zewnętrzne) ---
                 let mainColor = hinge.isLocal ? (hinge.isAdjusted ? "#ea580c" : "#16a34a") : "#94a3b8";
                 let darkColor = hinge.isLocal ? (hinge.isAdjusted ? "#c2410c" : "#15803d") : "#64748b";
                 let opacity = hinge.isLocal ? "1" : "0.5"; // Wyszarzamy zawiasy z innych modułów
                 
                 let warnMsg = "";
                 if (hinge.isLocal && hinge.isAdjusted) {
                     warnMsg = ` <tspan fill="${mainColor}" font-size="9" font-weight="bold">⚠️ AUTO-KOREKTA</tspan>`;
                 } else if (!hinge.isLocal) {
                     warnMsg = ` <tspan fill="${mainColor}" font-size="9" font-weight="normal">(Inny moduł)</tspan>`;
                 }
                 // ----------------------------------------------

                 svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="17.5" fill="#fcfdfd" stroke="${mainColor}" stroke-width="1.5" opacity="${opacity}" />`;
                 svg += `<circle cx="${cupX}" cy="${holeSvgY}" r="2.5" fill="${mainColor}" opacity="${opacity}" />`;

                 let distBottom = hinge.relY;
                 let distTop = front.h - hinge.relY;
                 let isBottomCloser = distBottom <= distTop;
                 let primary = isBottomCloser ? distBottom : distTop;
                 let secondary = isBottomCloser ? distTop : distBottom;
                 
                 let tspanHtml = `<tspan fill="${mainColor}" font-weight="bold" font-size="11">${formatVal(primary)}</tspan> ` +
                                 `<tspan fill="${darkColor}" font-size="9" font-weight="bold">${isBottomCloser ? 'DÓŁ' : 'GÓRA'}</tspan> ` +
                                 `<tspan fill="#94a3b8" font-size="9" font-weight="normal">(${formatVal(secondary)} ${isBottomCloser ? 'GÓRA' : 'DÓŁ'})</tspan>` + warnMsg;

                 svg += `<text x="${cupX + (isLeft ? 22 : -22)}" y="${holeSvgY + 4}" text-anchor="${isLeft ? 'start' : 'end'}" font-family="sans-serif" opacity="${opacity}">${tspanHtml}</text>`;
              });
            }
            svg += `</g>`;
          }
      });
    }

  if (viewMode === 'all' || viewMode === 'frontInner') {
      svg += `<text x="${innerFrontX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONTY (Szuflady wewn.)</text>`;

      if (mod && mod.elements) {
        const innerFronts = mod.elements.filter(el => el.typ === 'front' && el.subtype === 'szuflada-wewnetrzna').sort((a, b) => a.y - b.y);
        
        svg += `<rect x="${innerFrontX}" y="0" width="${cabWidth}" height="${sideH}" fill="none" stroke="#94a3b8" stroke-dasharray="4,4" stroke-width="1" />`;

        innerFronts.forEach(front => {
          let drawY = isTopBottomFullWidth ? front.y - th : front.y;
          const elSvgY = sideH - drawY - front.h; 
          
          let fillColor = '#fff7ed'; 
          let strokeColor = '#ea580c';
          
          const fWidth = front.w || cabWidth;
          const fSvgX = innerFrontX + (front.x || 0);

          svg += `<rect x="${fSvgX}" y="${elSvgY}" width="${fWidth}" height="${front.h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />`;
          svg += `<text x="${fSvgX + fWidth/2}" y="${elSvgY + front.h/2}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="middle">Szuflada Wewn.</text>`;
        });
      }
  }

  svg += `</g></svg>`;
  return svg;
}