// src/render/viewer2d.js
import { state } from '../core/state.js';
import { escapeHtml } from '../utils/dom.js';
import { getCornerPartsGeometry, getCornerWieniecHoles, getCornerShelfHoles } from '../engine/cabinet.js';

const formatVal = (val) => Number(Number(val).toFixed(1));

// Opis wysokości otworu w stylu rysunku boku zwykłej szafki: bliższa krawędź
// (DÓŁ/GÓRA) wyróżniona, druga w nawiasie.
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

export function generateSidePanelSVG(height, depth, mountingData = []) {
  const mod = state.project.modules.find(m => m.id === state.activeModuleId) || state.project.modules[0];
  if (!mod) return '<svg></svg>';

  const config = state.project;
  const cabWidth = parseFloat(mod.dimensions?.width) || 600;
  const th = parseFloat(config.materials?.boardThickness) || 18;

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const sideH = isTopBottomFullWidth ? height - (th * 2) : height;

  // Nawierty kołek+wkręt przegród pionowych (core/engine/cabinet.js:
  // getPionMountHoles) w wieńcu dolnym/górnym albo w konkretnej półce -
  // słownik po panelKey, żeby dało się szybko sprawdzić "czy TEN wieniec/
  // półka ma nawierty" przy rysowaniu mapy korpusu i dorysować jej osobny,
  // klikalny rzut z góry (analogicznie do detail-left/right dla boków).
  const pionMountByKey = {};
  mountingData.filter(d => d.type === 'wieniec-mount').forEach(m => { pionMountByKey[m.panelKey] = m; });

  const activeModAbsX = parseFloat(mod.position.x) || 0;
  const activeModAbsZ = parseFloat(mod.position.z) || 0;
  const cabDepth = parseFloat(mod.dimensions?.depth) || 513;
  const activeModLegH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 0) : 0;
  const activeModAbsY = (parseFloat(mod.position.y) || 0) + activeModLegH;

  // Grupa szafek stojących pod inną ścianą stoi obrócona (mod.rotation:
  // 0/90/180/270 - patrz core/layout.js), więc jej lokalne "lewo/prawo" NIE
  // zawsze pokrywa się z rosnącym world X/Z. Przy rotation 0/90 lokalne
  // "prawo" leży w stronę rosnącego X (0°) / Z (90°); przy 180/270 - w stronę
  // MALEJĄCEGO X (180°) / Z (270°) - dokładnie ta sama zależność, co przy
  // mapowaniu blendy lewej/prawej na ściany w core/layout.js:
  // clampModuleToRoom (nearIsLeft/onXAxis). Bez tego korekta pozycji
  // "duchów"/frontów grupy w rysunku technicznym była poprawna tylko dla
  // rotation===0 (np. Prawa w Białołęce), a dla rotation===180 (Lewa,
  // przeciwległa ściana) wychodziła lustrzanie odwrócona - zgłoszony bug
  // "3D nie zgadza się z rysunkiem" dla lewej grupy.
  const activeRot = ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;
  const activeAxisIsX = activeRot === 0 || activeRot === 180;
  const activeRightSign = (activeRot === 0 || activeRot === 90) ? 1 : -1;
  const getLocalRelX = (other) => {
      const otherPos = activeAxisIsX ? (parseFloat(other.position.x) || 0) : (parseFloat(other.position.z) || 0);
      const activePos = activeAxisIsX ? activeModAbsX : activeModAbsZ;
      return activeRightSign * (otherPos - activePos);
  };

  // "Duchy" (stackModules) mają pokazywać moduły faktycznie stojące w TYM SAMYM
  // pionowym ciągu co aktywny (np. szafka dolna + wisząca nad nią) - to
  // wymaga pokrywania się ZARÓWNO w X, JAK I W Z. Sam warunek X (bez Z) łapał
  // też zupełnie inne, niepowiązane zestawy meblowe stojące gdzie indziej w
  // pokoju (np. na przeciwległej ścianie, obrócone o 180°), które przypadkiem
  // mają nachodzący zakres X - dawało to fantomowe "duchy" i błędnie dorzucone
  // fronty w rysunku technicznym (zgłoszony bug dla zgrupowanych modułów).
  //
  // Dodatkowo: moduł ze wspólnym groupId (patrz ui/properties.js: "Połącz
  // zaznaczone w grupę") liczy się jako duch ZAWSZE, niezależnie od X/Z -
  // grupa może obejmować też sąsiadów OBOK (nie tylko nad/pod), np. szafa
  // złożona z 4 modułów (2x wąska+szeroka, piętro dolne+górne) - użytkownik
  // sam zdecydował, że to jedna całość, więc cały rysunek techniczny powinien
  // pokazywać ją w komplecie, z zaznaczonymi półkami/przegrodami każdego
  // członka, nawet gdy klika akurat tylko jeden z nich.
  const stackModules = state.project.modules.filter(m => {
      if (mod.groupId && m.groupId === mod.groupId) return true;
      const mX = parseFloat(m.position.x) || 0;
      const mW = parseFloat(m.dimensions.width) || 600;
      const mZ = parseFloat(m.position.z) || 0;
      const mD = parseFloat(m.dimensions.depth) || 513;
      const overlapX = Math.max(0, Math.min(mX + mW, activeModAbsX + cabWidth) - Math.max(mX, activeModAbsX));
      const overlapZ = Math.max(0, Math.min(mZ + mD, activeModAbsZ + cabDepth) - Math.max(mZ, activeModAbsZ));
      return overlapX > 10 && overlapZ > 10;
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

  // Duchy zgrupowanych modułów (stackModules) mogą sięgać dalej w prawo niż
  // sama szerokość aktywnego modułu (np. szeroki moduł obok wąskiego aktywnego)
  // - kolumna z formatkami/nawiertami (detail-left/right/part-N) musi zaczynać
  // się ZA całą narysowaną grupą, inaczej formatka z nawiertami nachodziła na
  // schemat korpusu grupy zamiast stać obok niego.
  let groupRightExtent = cabWidth;
  stackModules.forEach(sm => {
      if (sm.id === mod.id) return;
      const smW = parseFloat(sm.dimensions.width) || 600;
      const relX = getLocalRelX(sm);
      groupRightExtent = Math.max(groupRightExtent, relX + smW);
  });

  const detailStartX = cabX + groupRightExtent + 500;

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
  svg += `<text x="${cabX - 10}" y="${sideH + 4}" font-size="12" fill="#1e293b" font-weight="bold" text-anchor="end">0 mm (Baza modułu)</text>`;

  svg += `<text x="${cabX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">KORPUS (Kliknij element)</text>`;

  const ghostOpacity = "0.35";
  stackModules.forEach(sm => {
      if (sm.id === mod.id) return;
      
      const dy = getDy(sm);
      const smH = parseFloat(sm.dimensions.height) || 720;
      const smW = parseFloat(sm.dimensions.width) || 600;
      
      const relX = getLocalRelX(sm);
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

  // Rysuje płytę wieńca/półki - jeśli ma nawierty od przegrody pionowej
  // (pionMountByKey, patrz engine/cabinet.js: getPionMountHoles), robi ją
  // klikalną i otwierającą osobny rzut z góry tej płyty z zaznaczonymi
  // nawiertami (detail-<detailId>, patrz sekcja niżej) - dokładnie tak samo
  // jak dziś działa klik w bok (detail-left/right).
  const panelRect = (x, y, w, h, mountKey, detailId, fillWhenPlain) => {
    const mount = pionMountByKey[mountKey];
    if (!mount) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillWhenPlain}" stroke="#475569" stroke-width="1.5" />`;
    return `<rect id="map-${detailId}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('${detailId}')" />`;
  };

  if (isTopBottomFullWidth) {
    svg += panelRect(cabX, 0, cabWidth, th, 'wieniec-gorny', 'detail-wieniec-gorny', '#ffffff');
    svg += panelRect(cabX, sideH - th, cabWidth, th, 'wieniec-dolny', 'detail-wieniec-dolny', '#ffffff');
    svg += `<rect id="map-detail-left" x="${cabX}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-left')" />`;
    svg += `<rect id="map-detail-right" x="${cabX + cabWidth - th}" y="${th}" width="${th}" height="${sideH - 2*th}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-right')" />`;
  } else {
    svg += `<rect id="map-detail-left" x="${cabX}" y="0" width="${th}" height="${sideH}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-left')" />`;
    svg += `<rect id="map-detail-right" x="${cabX + cabWidth - th}" y="0" width="${th}" height="${sideH}" fill="${bgFill}" stroke="#475569" stroke-width="1.5" class="clickable-rect" onclick="showDetail('detail-right')" />`;
    svg += panelRect(cabX + th, sideH - th, cabWidth - th*2, th, 'wieniec-dolny', 'detail-wieniec-dolny', '#ffffff');

    if (cons.topType === 'pelny' || cons.topType === 'trawersy_poziom') {
      // Patrząc od przodu (widok szerokość x wysokość), trawersy poziome
      // (przedni + tylny) różnią się od pełnego wieńca tylko głębokością,
      // która nie jest widoczna z tego kąta - dlatego rysujemy identycznie
      // jak pełny wieniec (analogicznie do "duchów" sąsiednich modułów, patrz wyżej).
      svg += panelRect(cabX + th, 0, cabWidth - th*2, th, 'wieniec-gorny', 'detail-wieniec-gorny', '#ffffff');
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
          const polkaMountKey = pionMountByKey[`polka-${el.id}-gora`] ? `polka-${el.id}-gora` : (pionMountByKey[`polka-${el.id}-dol`] ? `polka-${el.id}-dol` : null);
          if (polkaMountKey) {
            svg += panelRect(elSvgX, elSvgY, el.w, el.h, polkaMountKey, `detail-${polkaMountKey}`, fillColor);
          } else {
            svg += `<rect x="${elSvgX}" y="${elSvgY}" width="${el.w}" height="${el.h}" fill="${fillColor}" stroke="#475569" stroke-width="1.5" />`;
          }
      }
    });
  }

  // ==== WYMIAROWANIE PRZESTRZENI KORPUSU (widok KORPUS) ====
  // Wyłącznie wymiary WEWNĄTRZ zarysu AKTYWNEGO MODUŁU. Odtwarzamy tu TO SAMO
  // drzewo BSP co core/zoneTree.js (przegroda pionowa liczy się jako podział
  // TYLKO jeśli w pełni rozpina wysokość swojej wnęki - identyczny warunek
  // jak tam), żeby kolumny nie "przeciekały" na wysokości, na których dana
  // przegroda w ogóle nie istnieje (np. przegroda tylko w dolnej wnęce pod
  // półką nie może dzielić też górnej wnęki nad tą półką na dwie kolumny -
  // to był zgłoszony bug: "przestrzeń nie ma przegrody a wymiaruje się jakby
  // była").
  {
    function partitionMM(rect) {
      const pionCandidates = partitions.filter(p =>
        p.x > rect.minX + 2 && p.x + p.w < rect.maxX - 2 &&
        p.y <= rect.minY + 2 && p.y + p.h >= rect.maxY - 2
      ).sort((a, b) => a.x - b.x);
      if (pionCandidates.length) {
        const p = pionCandidates[0];
        return {
          axis: 'v', divider: p, rect,
          a: partitionMM({ ...rect, maxX: p.x }),
          b: partitionMM({ ...rect, minX: p.x + p.w }),
        };
      }
      const poziomCandidates = (mod.elements || []).filter(el =>
        el.typ === 'poziom' &&
        el.y > rect.minY + 2 && el.y + el.h < rect.maxY - 2 &&
        el.x <= rect.minX + 2 && el.x + el.w >= rect.maxX - 2
      ).sort((a, b) => a.y - b.y);
      if (poziomCandidates.length) {
        const p = poziomCandidates[0];
        return {
          axis: 'h', divider: p, rect,
          a: partitionMM({ ...rect, maxY: p.y }),
          b: partitionMM({ ...rect, minY: p.y + p.h }),
        };
      }
      return { axis: null, rect };
    }

    svg += `<defs><marker id="korpus-dim-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#334155" /></marker></defs>`;
    svg += `<g class="layer-dim-outline">`;

    // Podział pionowy zawęża kolumnę (x) i rekurencyjnie oddaje obie strony
    // do renderColumnChain - każda dostaje WŁASNY, niezależny łańcuch. Podział
    // poziomy NIE zawęża x, więc kolejne piętra "h" zbieramy w JEDEN łańcuch
    // (renderColumnChain -> descend), chyba że jedna ze stron sama okaże się
    // podziałem pionowym - wtedy ta strona jest "nieprzezroczysta": ma swój
    // WŁASNY, węższy łańcuch (osobne wywołanie renderRegion), a bieżący,
    // szerszy łańcuch NIE rysuje przez nią światła (bo to już nie jedna,
    // realna przestrzeń, tylko dwie węższe kolumny obok siebie).
    function renderRegion(node) {
      if (node.axis === 'v') {
        renderRegion(node.a);
        renderRegion(node.b);
        return;
      }
      renderColumnChain(node);
    }

    function renderColumnChain(node) {
      const { minX, maxX, minY, maxY } = node.rect;
      const colWidthMM = maxX - minX;
      if (colWidthMM < 8) return;
      const colDimX = cabX + (minX + maxX) / 2;
      const isNarrow = colWidthMM < 260;

      const isBottomWieniec = Math.abs(minY - th) < 2;
      const isTopWieniec = Math.abs(maxY - (sideH - th)) < 2;
      // mmY = wysokość ŚRODKA płyty/dzielnika od podłogi (nie jej krawędzi) -
      // rect.minY/maxY to WEWNĘTRZNE krawędzie (światło), więc płyta leżąca
      // pod/nad tą krawędzią ma środek o th/2 dalej.
      const dividers = [
        { mmY: minY - th / 2, half: th / 2, kind: isBottomWieniec ? 'wieniec' : 'poziom', openBelow: false, openAbove: true },
        { mmY: maxY + th / 2, half: th / 2, kind: isTopWieniec ? 'wieniec' : 'poziom', openBelow: true, openAbove: false },
      ];

      // Zbiera wewnętrzne dzielniki poziome TEGO łańcucha, rekurencyjnie
      // schodząc przez kolejne "h", ale zatrzymując się (i oddając dalej do
      // renderRegion) na każdej stronie, która okaże się podziałem "v".
      function descend(n) {
        if (!n || n.axis !== 'h') return;
        const aOpaque = n.a.axis === 'v';
        if (aOpaque) renderRegion(n.a); else descend(n.a);
        const bOpaque = n.b.axis === 'v';
        dividers.push({
          mmY: n.divider.y + n.divider.h / 2, half: n.divider.h / 2, kind: 'poziom',
          openBelow: !aOpaque, openAbove: !bOpaque,
        });
        if (bOpaque) renderRegion(n.b); else descend(n.b);
      }
      descend(node);
      // Malejąco po mmY = rosnąco po współrzędnej SVG (góra rysunku -> dół),
      // tak samo jak poprzednio sortowano bezpośrednio po współrzędnej SVG.
      dividers.sort((a, b) => b.mmY - a.mmY);

      const leaderLen = isNarrow ? Math.min(30, colWidthMM * 0.28) : Math.min(78, colWidthMM * 0.42);
      const leaderStartX = colDimX - leaderLen;
      const axisFontSize = isNarrow ? 8 : 10;
      let bestGapTop = 0, bestGapBot = 0, bestGap = -1;

      dividers.forEach((d, i) => {
        const axisY = sideH - d.mmY;
        const isW = d.kind === 'wieniec';
        const label = formatVal(d.mmY);
        const axisLabel = isNarrow ? `${label}` : `${isW ? 'Oś wieńca' : 'Oś'}: ${label}`;
        svg += `<line x1="${leaderStartX}" y1="${axisY}" x2="${colDimX - 3}" y2="${axisY}" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="3,2" />`;
        svg += `<text x="${leaderStartX - 4}" y="${axisY + 3}" font-size="${axisFontSize}" fill="#1e3a8a" text-anchor="end" font-family="sans-serif" font-weight="${isW ? 'bold' : 'normal'}">${axisLabel}</text>`;

        if (i < dividers.length - 1) {
          const next = dividers[i + 1];
          // d jest FIZYCZNIE WYŻEJ (większe mmY) niż next - światło między
          // nimi jest realne tylko, gdy d ma otwartą stronę OD SPODU i next
          // ma otwartą stronę OD GÓRY (żadne z nich nie jest "zaślepione"
          // przez zagnieżdżony podział pionowy, patrz descend() wyżej).
          if (!(d.openBelow && next.openAbove)) return;
          const yTop = axisY + d.half;
          const yBot = (sideH - next.mmY) - next.half;
          const gap = yBot - yTop;
          if (gap < 8) return;
          const midY = (yTop + yBot) / 2;
          if (gap > bestGap) { bestGap = gap; bestGapTop = yTop; bestGapBot = yBot; }
          svg += `<line x1="${colDimX}" y1="${yTop}" x2="${colDimX}" y2="${yBot}" stroke="#334155" stroke-width="1" marker-start="url(#korpus-dim-arrow)" marker-end="url(#korpus-dim-arrow)" />`;
          svg += `<rect x="${colDimX - 19}" y="${midY - 8}" width="38" height="15" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.5" />`;
          svg += `<text x="${colDimX}" y="${midY + 3}" font-size="11" font-weight="bold" fill="#0f766e" text-anchor="middle" font-family="sans-serif">${formatVal(gap)}</text>`;
        }
      });

      // Poziome światło (wewnętrzna szerokość) TEJ kolumny - tylko jeśli ma
      // choć jeden realny (nie "zaślepiony" przez zagnieżdżony podział "v")
      // prześwit do pokazania; w jej własnym największym takim prześwicie,
      // żeby nie wylądować na półce. Celowo NIE na środku tego prześwitu (tam
      // pionowy łańcuch już rysuje swój box z wartością prześwitu -
      // nałożyłyby się dokładnie na siebie), tylko przesunięte w górną część.
      if (bestGap < 0) return;
      const gapSize = Math.max(bestGapBot - bestGapTop, 1);
      const widthDimY = bestGapTop + Math.max(4, Math.min(gapSize * 0.3, gapSize - 16));
      const xL = cabX + minX, xR = cabX + maxX;
      const w = formatVal(colWidthMM);
      svg += `<line x1="${xL}" y1="${widthDimY}" x2="${xR}" y2="${widthDimY}" stroke="#334155" stroke-width="1" marker-start="url(#korpus-dim-arrow)" marker-end="url(#korpus-dim-arrow)" />`;
      svg += `<rect x="${colDimX - 24}" y="${widthDimY - 8}" width="48" height="15" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.5" />`;
      svg += `<text x="${colDimX}" y="${widthDimY + 4}" font-size="11" font-weight="bold" fill="#0f766e" text-anchor="middle" font-family="sans-serif">${w}</text>`;
    }

    renderRegion(partitionMM({ minX: th, maxX: cabWidth - th, minY: th, maxY: sideH - th }));

    svg += `</g>`;
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

              // Wymiar oś-w-oś między środkowymi otworami sąsiednich półek
              // ruchomych (rozstaw półek). Rysowany tuż przy krawędzi panelu,
              // w osobnym pionowym łańcuszku, żeby nie kolidował z opisami
              // pojedynczych otworów.
              if (sortedShelfYs.length > 1) {
                  const shelfEdgeX = isReversed ? panel.svgX + depth : panel.svgX;
                  const pitchX = shelfEdgeX + (isReversed ? 26 : -26);
                  for (let i = 0; i < sortedShelfYs.length - 1; i++) {
                      const yA = sideH - sortedShelfYs[i];
                      const yB = sideH - sortedShelfYs[i + 1];
                      const gap = formatVal(Math.abs(sortedShelfYs[i + 1] - sortedShelfYs[i]));
                      svg += `<line x1="${pitchX}" y1="${yA}" x2="${pitchX}" y2="${yB}" stroke="#c2410c" stroke-width="1" />`;
                      svg += `<line x1="${pitchX - 4}" y1="${yA}" x2="${pitchX + 4}" y2="${yA}" stroke="#c2410c" stroke-width="1.4" />`;
                      svg += `<line x1="${pitchX - 4}" y1="${yB}" x2="${pitchX + 4}" y2="${yB}" stroke="#c2410c" stroke-width="1.4" />`;
                      svg += `<text x="${pitchX + (isReversed ? 7 : -7)}" y="${(yA + yB) / 2 + 4}" font-size="12" font-weight="bold" fill="#c2410c" text-anchor="${textAnchor}" font-family="sans-serif">${gap}<tspan font-size="9" font-weight="normal" fill="#9a3412"> oś-oś</tspan></text>`;
                  }
              }

              currentDimX += stepDir;
              svg += `</g>`;
          }
      });
      svg += `</g>`;
  });

  svg += `<g id="detail-front" style="display:none;">`;
  svg += `<text x="${frontX + cabWidth/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">FRONT (Podział zewnętrzny)</text>`;

  const allOuterFronts = [];
  stackModules.forEach(sm => {
      const smDy = getDy(sm);
      const smRelX = getLocalRelX(sm);
      const smCons = { joinType: 'boki_przelotowe', topType: 'pelny', ...config.construction, ...(sm.construction || {}) };
      const smIsTBF = smCons.joinType === 'wience_przelotowe';
      if (sm.elements) {
          sm.elements.filter(el => el.typ === 'front' && el.subtype !== 'szuflada-wewnetrzna').forEach(f => {
              allOuterFronts.push({ ...f, dy: smDy, relX: smRelX, sourceModId: sm.id, sourceModName: sm.name, isTBF: smIsTBF });
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
      const fSvgX = frontX + front.relX + (front.x || 0);

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

             const tspanHtml = getDimText(hole.y, front.h, '#dc2626');
             svg += `<text x="${holeX_Left - 8}" y="${holeSvgY + 4}" text-anchor="end" font-family="sans-serif">${tspanHtml}</text>`;
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

  // Rzuty z góry wieńca/półki z nawiertami kołek+wkręt od przegrody pionowej
  // (isStructural, patrz core/zoneTree.js: toggleStructural) - jeden osobny,
  // klikalny widok PER PANEL (engine/cabinet.js: getPionMountHoles), otwierany
  // z mapy korpusu wyżej (panelRect). Kolor/rozmiar otworów - taki sam jak
  // istniejące nawierty kołek+wkręt półki konstrukcyjnej w bok (patrz
  // drawShelfHoles wyżej), bo to dokładnie to samo połączenie. Rysowane w tym
  // samym miejscu co boki/przegrody (detailStartX) - tylko jeden widok jest
  // naraz widoczny (showDetail), więc nie potrzeba dla nich osobnej kolumny
  // z boku rysunku.
  const wieniecPanels = mountingData.filter(d => d.type === 'wieniec-mount');
  const wieniecX = detailStartX;
  wieniecPanels.forEach(panel => {
    const w = panel.panelWidth;
    const d = panel.panelDepth;
    const detailId = `detail-${panel.panelKey}`;
    const color = '#9333ea';
    // Dolna krawędź płyty wyrównana do sideH - dokładnie tam, gdzie domyślny
    // viewBox (wyliczony z boków/frontów, patrz vBoxY/vBoxH wyżej) jest
    // wycentrowany - inaczej ten widok, rysowany w lokalnym układzie 0..d
    // niepowiązanym z wysokością szafki, wypadał poza domyślnie widocznym
    // oknem i po kliknięciu "nic się nie działo" (trzeba było ręcznie
    // odnaleźć go, przeciągając daleko w górę).
    const topY = sideH - d;

    svg += `<g id="${detailId}" class="detail-view" style="display:none;">`;
    svg += `<text x="${wieniecX + w/2}" y="${svgTopY - 25}" font-size="16" fill="#1e3a8a" font-weight="bold" text-anchor="middle">${escapeHtml(panel.panelLabel.toUpperCase())} (WIDOK Z GÓRY)</text>`;
    svg += `<rect x="${wieniecX}" y="${topY}" width="${w}" height="${d}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    svg += `<text x="${wieniecX + w/2}" y="${topY - 10}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">PRZÓD</text>`;
    svg += `<text x="${wieniecX + w/2}" y="${topY + d + 20}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">TYŁ</text>`;

    const xPositions = new Set();
    panel.holes.forEach(h => {
      const r = h.holeType === 'dowel' ? 4.0 : 1.5;
      svg += `<circle cx="${wieniecX + h.x}" cy="${topY + h.zFromFront}" r="${r}" fill="${color}" />`;
      if (h.holeType === 'screw') xPositions.add(Math.round(h.x));
    });

    // Wymiar X (od lewej krawędzi płyty do środka przegrody) - Z (odległość
    // od przodu) widać wprost z rysunku w skali, tak jak przy innych widokach.
    Array.from(xPositions).sort((a, b) => a - b).forEach(x => {
      const lineX = wieniecX + x;
      svg += `<line x1="${lineX}" y1="${topY + d}" x2="${lineX}" y2="${topY + d + 32}" stroke="${color}" stroke-width="0.75" stroke-dasharray="2,2" />`;
      svg += `<line x1="${wieniecX}" y1="${topY + d + 32}" x2="${lineX}" y2="${topY + d + 32}" stroke="${color}" stroke-width="0.5" />`;
      svg += `<circle cx="${wieniecX}" cy="${topY + d + 32}" r="2" fill="${color}" />`;
      svg += `<text x="${lineX + 4}" y="${topY + d + 46}" font-size="10" fill="${color}" font-weight="bold">${Math.round(x)} mm od lewej</text>`;
    });

    svg += `</g>`;
  });

  svg += `</g></svg>`;
  return svg;
}

// Rysunki formatek szafki narożnej (boki + listwa) w stylu rysunku boku
// zwykłej szafki (generateSidePanelSVG): biały panel, fioletowe otwory łączeń
// (wkręt r=1.5, kołek r=4), pomarańczowe podpórki półek z linią pomocniczą i
// opisem DÓŁ/GÓRA. Każdy element ma PRZÓD po lewej, TYŁ po prawej.
// side = { name, depth, height, bottom, holes (podpórki), joints (łączenia) }
// - wysokości otworów liczone od dołu KORPUSU (bottom = dół elementu), żeby
// otwory boków i listwy się zgrywały.
export function generateCornerSidesHolesSVG(sides) {
  const gap = 40, pad = 40, textW = 200;
  const maxH = Math.max(...sides.map(s => (s.bottom || 0) + s.height));
  const totalW = sides.reduce((sum, s) => sum + s.depth + textW + gap, 0) + pad * 2 - gap;
  const totalH = maxH + pad * 2 + 50;
  const PURPLE = '#9333ea', ORANGE = '#ea580c';
  let svg = `<svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc" font-family="'Segoe UI', sans-serif">`;
  let ox = pad;
  const top = pad + 30;
  const yOf = (y) => top + maxH - y;
  sides.forEach(s => {
    const bottom = s.bottom || 0;
    svg += `<text x="${ox + s.depth / 2}" y="${pad + 10}" font-size="16" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${escapeHtml(s.name.toUpperCase())}</text>`;
    svg += `<text x="${ox + s.depth / 2}" y="${pad + 26}" font-size="11" fill="#64748b" text-anchor="middle">${Math.round(s.height)} × ${Math.round(s.depth)} mm</text>`;
    svg += `<rect x="${ox}" y="${yOf(bottom + s.height)}" width="${s.depth}" height="${s.height}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    svg += `<text x="${ox}" y="${yOf(bottom + s.height) - 6}" font-size="10" fill="#94a3b8" font-weight="bold">PRZÓD</text>`;
    svg += `<text x="${ox + s.depth}" y="${yOf(bottom + s.height) - 6}" font-size="10" fill="#94a3b8" font-weight="bold" text-anchor="end">TYŁ</text>`;

    (s.joints || []).forEach(j => {
      svg += `<circle cx="${ox + j.x}" cy="${yOf(j.y)}" r="${j.type === 'dowel' ? 4 : 1.5}" fill="${PURPLE}" />`;
    });

    const rightX = ox + s.depth;
    const maxX = Math.max(...(s.holes.length ? s.holes.map(h => h.x) : [0]));
    s.holes.forEach(h => {
      svg += `<circle cx="${ox + h.x}" cy="${yOf(h.y)}" r="2.5" fill="${ORANGE}" opacity="${h.isCenter ? 1 : 0.6}" />`;
      if (h.x === maxX) {
        svg += `<line x1="${rightX}" y1="${yOf(h.y)}" x2="${rightX + 30}" y2="${yOf(h.y)}" stroke="${ORANGE}" stroke-width="0.5" stroke-dasharray="2,2" />`;
        svg += `<text x="${rightX + 36}" y="${yOf(h.y) + 4}" font-family="sans-serif" opacity="${h.isCenter ? 1 : 0.6}">${getDimText(h.y - bottom, s.height, ORANGE, true)}</text>`;
      }
    });
    ox += s.depth + textW + gap;
  });
  svg += `</svg>`;
  return svg;
}

// Rysunek formatki L szafki narożnej (wieniec albo półka) w stylu rysunków
// zwykłych szafek: biały obrys, fioletowe otwory (wkręt r=1.5, kołek r=4) z
// liniami pomocniczymi i opisami, wymiary całkowite i wycięcia. Układ
// formatki: 0,0 = tylny róg, X wzdłuż ramienia A, Y wzdłuż ramienia B, przód
// to krawędzie wycięcia w rogu (depthA/depthB).
// notch = {w, h} - wycięcie na listwę w tylnym rogu (tylko półka).
export function generateCornerPartSVG({ blankA, blankB, depthA, depthB, notch = null, holes = [], title, subtitle }) {
  const M = 130;
  const ox = M, oy = M;
  const vbW = blankA + M * 2, vbH = blankB + M * 2;
  const PURPLE = '#9333ea', NAVY = '#1e3a8a', RED = '#dc2626';
  const outline = notch
    ? [[0, notch.h], [notch.w, notch.h], [notch.w, 0], [blankA, 0], [blankA, depthA], [depthB, depthA], [depthB, blankB], [0, blankB]]
    : [[0, 0], [blankA, 0], [blankA, depthA], [depthB, depthA], [depthB, blankB], [0, blankB]];
  const pts = outline.map(([x, y]) => `${ox + x},${oy + y}`).join(' ');

  let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc" font-family="'Segoe UI', sans-serif">`;
  svg += `<text x="${ox + blankA / 2}" y="34" font-size="20" font-weight="bold" fill="${NAVY}" text-anchor="middle">${escapeHtml(title)} (WIDOK Z GÓRY)</text>`;
  svg += `<text x="${ox + blankA / 2}" y="56" font-size="14" fill="#64748b" text-anchor="middle">${escapeHtml(subtitle)}</text>`;
  svg += `<polygon points="${pts}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  if (notch) {
    svg += `<rect x="${ox}" y="${oy}" width="${notch.w}" height="${notch.h}" fill="#fee2e2" stroke="${RED}" stroke-width="1" stroke-dasharray="4,3" />`;
    svg += `<text x="${ox + notch.w + 8}" y="${oy + notch.h + 14}" font-size="12" font-weight="bold" fill="${RED}">wycięcie na listwę ${Math.round(notch.w)}×${Math.round(notch.h)} mm</text>`;
  }

  // PRZÓD = krawędzie wycięcia w rogu, TYŁ = ściany.
  svg += `<text x="${ox + (depthB + blankA) / 2}" y="${oy + depthA + 16}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">PRZÓD</text>`;
  svg += `<text x="${ox + depthB + 16}" y="${oy + (depthA + blankB) / 2}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1" transform="rotate(-90 ${ox + depthB + 16} ${oy + (depthA + blankB) / 2})">PRZÓD</text>`;
  svg += `<text x="${ox + blankA / 2}" y="${oy - 8}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">TYŁ</text>`;

  holes.forEach(h => {
    svg += `<circle cx="${ox + h.x}" cy="${oy + h.y}" r="${h.type === 'dowel' ? 4 : 1.5}" fill="${PURPLE}" />`;
  });

  // Linie pomocnicze i opisy pozycji wkrętów (jak w widoku wieńca zwykłej
  // szafki): przy boku ramienia A - odległość od tyłu, przy boku B - od lewej.
  const seen = new Set();
  holes.filter(h => h.type === 'screw').forEach(h => {
    if (h.side === 'A') {
      const key = 'A' + Math.round(h.y);
      if (seen.has(key)) return; seen.add(key);
      svg += `<line x1="${ox + h.x}" y1="${oy + h.y}" x2="${ox + blankA + 40}" y2="${oy + h.y}" stroke="${PURPLE}" stroke-width="0.75" stroke-dasharray="2,2" />`;
      svg += `<text x="${ox + blankA + 46}" y="${oy + h.y + 4}" font-size="11" font-weight="bold" fill="${PURPLE}">${formatVal(h.y)} <tspan font-size="9" font-weight="normal">od tyłu</tspan></text>`;
    } else if (h.side === 'B') {
      const key = 'B' + Math.round(h.x);
      if (seen.has(key)) return; seen.add(key);
      svg += `<line x1="${ox + h.x}" y1="${oy + h.y}" x2="${ox + h.x}" y2="${oy + blankB + 40}" stroke="${PURPLE}" stroke-width="0.75" stroke-dasharray="2,2" />`;
      svg += `<text x="${ox + h.x}" y="${oy + blankB + 54}" font-size="11" font-weight="bold" fill="${PURPLE}" text-anchor="middle">${formatVal(h.x)} <tspan font-size="9" font-weight="normal">od lewej</tspan></text>`;
    }
  });
  holes.filter(h => h.type === 'dowel' && h.side === 'batten').forEach(h => {
    svg += `<text x="${ox + h.x}" y="${oy + h.y + 22}" font-size="10" font-weight="bold" fill="${PURPLE}" text-anchor="middle">${formatVal(h.x)}</text>`;
  });

  // Wymiary całkowite, głębokości i wycięcie w rogu (kolory jak w rzucie z góry:
  // głębokość - granat, wycięcie A - pomarańczowy, wycięcie B - zielony).
  const dimH = (x1, x2, y, label, c = NAVY) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${c}" stroke-width="1" />` +
    `<text x="${(x1 + x2) / 2}" y="${y - 7}" font-size="13" font-weight="bold" fill="${c}" text-anchor="middle">${label}</text>`;
  const dimV = (y1, y2, x, label, c = NAVY) =>
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="${c}" stroke-width="1" />` +
    `<text x="${x - 7}" y="${(y1 + y2) / 2}" font-size="13" font-weight="bold" fill="${c}" text-anchor="middle" transform="rotate(-90 ${x - 7} ${(y1 + y2) / 2})">${label}</text>`;
  svg += dimH(ox, ox + blankA, oy - 32, `${Math.round(blankA)} mm`);
  svg += dimV(oy, oy + blankB, ox - 36, `${Math.round(blankB)} mm`);
  svg += dimV(oy, oy + depthA, ox + blankA + 110, `${Math.round(depthA)} mm`);
  svg += dimH(ox, ox + depthB, oy + blankB + 84, `${Math.round(depthB)} mm`);
  const cutW = blankA - depthB, cutH = blankB - depthA;
  if (cutH > 0) svg += dimV(oy + depthA, oy + blankB, ox + blankA + 110, `wycięcie ${Math.round(cutH)} mm`, '#16a34a');
  if (cutW > 0) svg += dimH(ox + depthB, ox + blankA, oy + blankB + 84, `wycięcie ${Math.round(cutW)} mm`, '#d97706');
  if (notch) {
    svg += dimH(ox, ox + notch.w, oy + notch.h + 34, `${Math.round(notch.w)}`, RED);
    svg += dimV(oy, oy + notch.h, ox + notch.w + 44, `${Math.round(notch.h)}`, RED);
  }

  svg += `</svg>`;
  return svg;
}

// Komplet rysunków formatek szafki narożnej pod rzutem z góry: wieniec (z
// otworami łączeń), półka (z wycięciem na listwę, tylko gdy są półki) oraz
// boki i listwa (łączenia + podpórki półek). Zwraca HTML z nagłówkami.
export function generateCornerPartsDrawings(mod) {
  const g = getCornerPartsGeometry(mod);
  const h2 = (t) => `<h3 style="font-size:14px; color:#1e3a8a; margin:18px 0 6px;">${t}</h3>`;
  let html = h2('Wieniec narożny (dolny + górny)');
  html += generateCornerPartSVG({
    ...g.wieniec, holes: getCornerWieniecHoles(mod),
    title: 'WIENIEC', subtitle: `2 szt. (dolny + górny) · ${Math.round(g.wieniec.blankA)} × ${Math.round(g.wieniec.blankB)} mm`,
  });
  if (g.shelfCount > 0) {
    html += h2('Półka narożna');
    html += generateCornerPartSVG({
      ...g.polka,
      title: 'PÓŁKA', subtitle: `${g.shelfCount} szt. · ${Math.round(g.polka.blankA)} × ${Math.round(g.polka.blankB)} mm · przód cofnięty o 5 mm`,
    });
  }
  html += h2('Boki i listwa narożna');
  html += generateCornerSidesHolesSVG(getCornerShelfHoles(mod));
  return html;
}

// Wykrój formatki narożnej w kształcie L (Wieniec narożny / Półka narożna,
// engine/cabinet.js: getCornerCorpusParts) - do tej pory ich cut-listowy
// opis "naroże do wycięcia - patrz rysunek 3D" nie odsyłał do żadnego
// realnego, drukowalnego rysunku (tylko do interaktywnej sceny 3D) -
// zgłoszony brak. Pokazuje pełny prostokątny blank legA×legB (linia
// przerywana) i faktyczny obrys L po docięciu (linia ciągła, wypełniona) -
// różnica między nimi to prostokąt (legA-depthB)×(legB-depthA) do odcięcia
// z jednego rogu. Ramiona mają NIEZALEŻNE głębokości (zgłoszona korekta,
// core/layout.js: getCornerDepths) - narożny prostokąt ma rogi (depthB,
// depthA), nie (depth,depth) jak przy wspólnej głębokości.
//
// Główne wymiary (Ramię A/B, Głęb. A/B, Wycięcie A/B) celowo liczone od
// PEŁNEGO korpusu (legA/legB), 1:1 z polami w konfiguratorze - inna baza
// (np. pomniejszona formatka) dawała inną liczbę niż użytkownik właśnie
// wpisał, co wyglądało jak błąd (zgłoszona korekta - "wpisałem 500 a na
// rysunku jest 482"). Sam wieniec/półka siedzi MIĘDZY bokami (boki
// przelotowe), więc realna formatka jest mniejsza o grubość boku (th) na
// dalszej krawędzi każdego ramienia (patrz engine/cabinet.js:
// getCornerCorpusParts, render/viewer3d.js: renderCornerCabinet `shape`) -
// pokazana tu jako DODATKOWY, cieńszy obrys wewnątrz + boki narysowane na
// swoim realnym miejscu, żeby było widać skąd bierze się różnica, bez
// zmiany głównych wymiarów.
// extra = { title, subtitle, holes }: podpis na środku rysunku (co to za
// część) i otwory łączeń (kołek/wkręt) w układzie formatki - wieniec dostaje
// otwory, półka wycięcie (notch) zamiast nich.
export function generateCornerBlankSVG(legA, legB, depthA, depthB, th = 18, notch = null, extra = null) {
  const blankA = legA - th;
  const blankB = legB - th;
  // Rozmiary w SVG są w "mm" viewBoxa, skalowanym przez CSS do szerokości
  // kontenera (ui/cornerConfigModal.js, ui/properties.js: print) - stały
  // rozmiar czcionki/linii w mm (np. 13) wychodził nieczytelnie mały przy
  // typowych wymiarach szafki (800-1200mm zmieszczone w np. 500px szerokości
  // ekranu = kilka pikseli). Liczymy je więc jako UŁAMEK najmniejszego boku,
  // żeby tekst/linie zostały czytelne niezależnie od wymiarów szafki i
  // rozmiaru kontenera.
  const unit = Math.max(1, Math.min(legA, legB, depthA || legA, depthB || legB));
  const fs = Math.round(unit * 0.075); // font-size bazowy
  const fsSmall = Math.round(unit * 0.062);
  const fsTiny = Math.round(unit * 0.052);
  const strokeThick = Math.max(2, Math.round(unit * 0.01));
  const strokeThin = Math.max(1, Math.round(unit * 0.005));
  // Wszystkie wymiary (Ramię A/B, Głęb. A/B, Wycięcie A/B) leżą NA ZEWNĄTRZ
  // konturu, żadna linia/etykieta nie przecina wypełnienia ani obrysu
  // (zgłoszony bug: wcześniej głębokości rysowały się W ŚRODKU kształtu).
  // Prawy i dolny bok mieszczą PO DWA wymiary naraz (głębokość + wycięcie) w
  // osobnych, odizolowanych pasach - margines musi być na tyle duży, żeby
  // oba pasy plus ich tekst zmieściły się bez zachodzenia na siebie
  // (zgłoszony bug: przy zbyt ciasnym marginesie linie/kreski pomocnicze
  // zasłaniały tekst sąsiedniego wymiaru).
  const margin = Math.round(unit * 0.55);

  const vbW = legA + margin * 2;
  const vbH = legB + margin * 2;
  const ox = margin, oy = margin;

  const cutW = legA - depthB; // szerokość odcinanego rogu (wyznaczona przez głębokość ramienia B)
  const cutH = legB - depthA; // wysokość odcinanego rogu (wyznaczona przez głębokość ramienia A)

  // notch = {w, h}: wycięcie w tylnym rogu (0,0) na listwę narożną - tylko
  // półka (wieniec nie ma go, bo listwa stoi MIĘDZY wieńcami).
  const outline = (a, b) => (notch
    ? [[0, notch.h], [notch.w, notch.h], [notch.w, 0], [a, 0], [a, depthA], [depthB, depthA], [depthB, b], [0, b]]
    : [[0, 0], [a, 0], [a, depthA], [depthB, depthA], [depthB, b], [0, b]]
  ).map(([x, y]) => `${ox + x},${oy + y}`).join(' ');
  const pts = outline(legA, legB);

  let svg =`<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">`;

  // Pełny prostokątny blank (przerywany) - to jest to, co realnie zamawia
  // się/tnie z płyty jako pierwszy krok (patrz Lista formatek: legA×legB).
  svg += `<rect x="${ox}" y="${oy}" width="${legA}" height="${legB}" fill="none" stroke="#94a3b8" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 4},${strokeThick * 3}" />`;

  // Róg do odcięcia - zakreskowany, czerwona ramka, żeby jednoznacznie
  // pokazać co znika. Sam wymiar wycięcia (Wycięcie A/B) rysuje się NA
  // ZEWNĄTRZ konturu niżej (dół/prawo, jako ciąg dalszy Głęb. B/A) - tu w
  // środku zostaje tylko krótka etykieta "ODCIĄĆ", i to wyłącznie gdy się
  // realnie mieści (zgłoszony bug: przy wąskim wycięciu dłuższy tekst z
  // wymiarami "WxH mm" wychodził poza czerwony prostokąt i nakładał się na
  // czarny obrys bryły, wyglądając jak przekreślenie).
  if (cutW > 0 && cutH > 0) {
    svg += `<rect x="${ox + depthB}" y="${oy + depthA}" width="${cutW}" height="${cutH}" fill="#fee2e2" stroke="#dc2626" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 2.5},${strokeThick * 2}" />`;
    if (cutW > fs * 3 && cutH > fs * 1.5) {
      svg += `<text x="${ox + depthB + cutW / 2}" y="${oy + depthA + cutH / 2}" font-size="${fs}" fill="#b91c1c" font-weight="bold" text-anchor="middle" dominant-baseline="middle">ODCIĄĆ</text>`;
    }
  }

  // Realny obrys L po docięciu - wypełniony, na wierzchu.
  svg += `<polygon points="${pts}" fill="#fef3c7" stroke="#334155" stroke-width="${strokeThick * 1.3}" />`;
  if (notch) {
    svg += `<rect x="${ox}" y="${oy}" width="${notch.w}" height="${notch.h}" fill="#fee2e2" stroke="#dc2626" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 2.5},${strokeThick * 2}" />`;
    svg += `<text x="${ox + notch.w + fsTiny * 0.6}" y="${oy + notch.h + fsTiny * 3.4}" font-size="${fsTiny}" fill="#b91c1c" font-weight="bold">wycięcie na listwę ${Math.round(notch.w)}×${Math.round(notch.h)} mm</text>`;
  }

  // Boki (płyty boczne, ui/właściwe formatki "Bok (L/P)" w Liście formatek) -
  // narysowane na swoim realnym miejscu (dalsza krawędź każdego ramienia),
  // żeby było widać, DLACZEGO formatka wieńca (linia przerywana fioletowa
  // niżej) jest węższa niż cały korpus - to właśnie w to miejsce wchodzi
  // (boki przelotowe, wieniec między nimi), a nie osobny, niezależny
  // "ubytek". Tylko wizualny kontekst, nie osobna formatka do zamawiania tu.
  const COLOR_BOK = '#78716c';
  svg += `<rect x="${ox + legA - th}" y="${oy}" width="${th}" height="${depthA}" fill="#e7e5e4" stroke="${COLOR_BOK}" stroke-width="${strokeThin}" />`;
  svg += `<rect x="${ox}" y="${oy + legB - th}" width="${depthB}" height="${th}" fill="#e7e5e4" stroke="${COLOR_BOK}" stroke-width="${strokeThin}" />`;
  if (th > fsTiny * 2) {
    svg += `<text x="${ox + legA - th / 2}" y="${oy + depthA / 2}" font-size="${fsTiny}" fill="${COLOR_BOK}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${ox + legA - th / 2} ${oy + depthA / 2})">bok</text>`;
    svg += `<text x="${ox + depthB / 2}" y="${oy + legB - th / 2}" font-size="${fsTiny}" fill="${COLOR_BOK}" text-anchor="middle" dominant-baseline="middle">bok</text>`;
  }

  // Formatka wieńca/półki (linia przerywana fioletowa) - obrys L wsunięty o
  // grubość boku (th) od dalszej krawędzi każdego ramienia (siedzi MIĘDZY
  // bokami, patrz komentarz nad funkcją). To realny rozmiar do zamówienia -
  // patrz Lista formatek: "Wieniec narożny {blankA}x{blankB}". Rysowany jako
  // DODATKOWY kontur na wierzchu głównego obrysu, nie zamiast niego, żeby
  // główne wymiary (Ramię/Głęb./Wycięcie) zostały 1:1 z konfiguratorem.
  if (!extra?.plain && blankA > depthB && blankB > depthA) {
    const blankPts = outline(blankA, blankB);
    svg += `<polygon points="${blankPts}" fill="none" stroke="#7c3aed" stroke-width="${strokeThin * 1.5}" stroke-dasharray="${strokeThin * 3},${strokeThin * 2}" />`;
    svg += `<text x="${ox + blankA - fsTiny * 0.6}" y="${oy + fsTiny * 1.4}" font-size="${fsTiny}" fill="#7c3aed" font-weight="bold" text-anchor="end">${notch ? 'Formatka półki' : 'Formatka wieńca'}:${Math.round(blankA)}×${Math.round(blankB)} mm (-${Math.round(th)} mm bok)</text>`;
  }

  if (extra?.holes?.length) {
    const rScrew = Math.max(3, unit * 0.011);
    const rDowel = Math.max(4, unit * 0.016);
    extra.holes.forEach(h => {
      const isDowel = h.type === 'dowel';
      svg += `<circle cx="${ox + h.x}" cy="${oy + h.y}" r="${isDowel ? rDowel : rScrew}" fill="${isDowel ? '#bbf7d0' : '#94a3b8'}" stroke="${isDowel ? '#16a34a' : '#475569'}" stroke-width="${strokeThin}" />`;
    });
    const lx = ox + depthB / 2, lyy = oy + depthA / 2 + fs * 3.2;
    svg += `<circle cx="${lx - fs * 3}" cy="${lyy - fsTiny * 0.3}" r="${rScrew}" fill="#94a3b8" stroke="#475569" stroke-width="${strokeThin}" /><text x="${lx - fs * 2.4}" y="${lyy}" font-size="${fsTiny}" fill="#475569">wkręt</text>`;
    svg += `<circle cx="${lx + fs * 0.6}" cy="${lyy - fsTiny * 0.3}" r="${rDowel}" fill="#bbf7d0" stroke="#16a34a" stroke-width="${strokeThin}" /><text x="${lx + fs * 1.4}" y="${lyy}" font-size="${fsTiny}" fill="#475569">kołek</text>`;
  }
  if (extra?.title) {
    const cx = extra.plain ? ox + legA / 2 : ox + depthB / 2, cy = oy + depthA / 2;
    svg += `<text x="${cx}" y="${cy - fs * 0.2}" font-size="${extra.plain ? fs * 1.05 : fs * 1.5}" fill="#0f172a" font-weight="bold" text-anchor="middle">${escapeHtml(extra.title)}</text>`;
    if (extra.subtitle) svg += `<text x="${cx}" y="${cy + fs * 1.2}" font-size="${fs}" fill="#334155" text-anchor="middle">${escapeHtml(extra.subtitle)}</text>`;
  }

  // Wymiary - proste kolorowe linie TUŻ PRZY odpowiadającym im fragmencie
  // obrysu (nie przez środek, ale też bez kresek pomocniczych/łańcuchowania -
  // zgłoszony bug: przy dwóch wymiarach na tym samym boku linie/kreski
  // pomocnicze zaczęły zasłaniać tekst). Każdy wymiar dostaje WŁASNY,
  // odizolowany "pas" na zewnątrz konturu - głębokości bliżej bryły,
  // wycięcia dalej - i własny kolor (jak na szkicu): głębokość A/B na
  // czerwono, wycięcie A na pomarańczowo, wycięcie B na zielono, Ramię A/B
  // (wynikowe) w neutralnym granacie.
  const laneGap = margin * 0.16; // odległość linii pierwszego pasa od obrysu
  const laneStep = margin * 0.42; // odległość między pasami (gdy są 2 na tym samym boku)
  // Odstęp TEKSTU od jego własnej linii - musi być wyraźnie większy niż
  // sama wysokość czcionki, bo polskie litery z ogonkami (ę, ą) mają
  // description sięgający niżej niż zwykłe descendery, a przy zbyt małym
  // odstępie linia zdawała się "przekreślać" tekst (zgłoszony bug, drugi
  // raz - poprzedni odstęp 0.35-0.9×fsSmall wciąż był za mały).
  const textGap = fsSmall * 1.3;

  const dimH = (x1, x2, y, label, color, textSide) => {
    let s = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="${strokeThick}" />`;
    const ty = y + (textSide === 'below' ? textGap : -textGap);
    s += `<text x="${(x1 + x2) / 2}" y="${ty}" font-size="${fsSmall}" fill="${color}" font-weight="bold" text-anchor="middle">${label}</text>`;
    return s;
  };
  const dimV = (y1, y2, x, label, color, textSide) => {
    let s = `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="${strokeThick}" />`;
    const ty = (y1 + y2) / 2;
    const tx = x + (textSide === 'left' ? -textGap : textGap);
    s += `<text x="${tx}" y="${ty}" font-size="${fsSmall}" fill="${color}" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${tx} ${ty})">${label}</text>`;
    return s;
  };

  const COLOR_LEG = '#1e3a8a';
  const COLOR_DEPTH = '#dc2626';
  const COLOR_CUT_A = '#d97706';
  const COLOR_CUT_B = '#16a34a';

  // Góra: Ramię A (cały korpus, 1:1 z konfiguratorem)
  svg += dimH(ox, ox + legA, oy - laneGap, `Ramię A: ${Math.round(legA)} mm`, COLOR_LEG);
  // Lewo: Ramię B (cały korpus, 1:1 z konfiguratorem)
  svg += dimV(oy, oy + legB, ox - laneGap, `Ramię B: ${Math.round(legB)} mm`, COLOR_LEG, 'left');

  // Prawo, dwa oddzielne pasy (bliższy = głębokość A, dalszy = wycięcie B) -
  // NIE łańcuchowo/stykająco się, każdy ma własny odstęp od obrysu, żeby ich
  // linie/etykiety się nie stykały.
  svg += dimV(oy, oy + depthA, ox + legA + laneGap, `Głęb. A: ${Math.round(depthA)} mm`, COLOR_DEPTH, 'right');
  if (cutH > 0) {
    svg += dimV(oy + depthA, oy + legB, ox + legA + laneGap + laneStep, `Wycięcie B: ${Math.round(cutH)} mm`, COLOR_CUT_B, 'right');
  }

  // Dół, tak samo dwa oddzielne pasy (bliższy = głębokość B, dalszy = wycięcie A).
  svg += dimH(ox, ox + depthB, oy + legB + laneGap, `Głęb. B: ${Math.round(depthB)} mm`, COLOR_DEPTH, 'below');
  if (cutW > 0) {
    svg += dimH(ox + depthB, ox + legA, oy + legB + laneGap + laneStep, `Wycięcie A: ${Math.round(cutW)} mm`, COLOR_CUT_A, 'below');
  }

  svg += `</svg>`;
  return svg;
}