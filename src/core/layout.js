// src/core/layout.js
//
// Solver geometrii frontów. Zamienia deklaratywny opis frontu (baseZone +
// distribution + luzy/szczeliny + typ nakładania) na konkretne el.x/el.y/el.w/el.h.
//
// To jest JEDYNE źródło prawdy o pozycjach frontów. Silnik formatek
// (src/engine/cabinet.js) czyta wyliczone el.h/el.w i sam ich nie liczy,
// dlatego recalculateLayout() MUSI pobiec dla modułu zanim policzymy jego
// formatki. Wcześniej ta funkcja mieszkała w src/render/viewer3d.js, przez co
// lista formatek bywała liczona ze stanu sprzed przeliczenia layoutu (np. tuż
// po wczytaniu projektu z chmury, gdy initPropertiesPanel() biegło przed
// update3D()). Nie ma tu żadnej zależności od Three.js — czysta matematyka na
// obiekcie state.
import { state, DEFAULT_ROOM } from "./state.js";

// Przelicza layout wszystkich modułów projektu. Wołaj przed każdym liczeniem
// formatek/okuć całego projektu — fronty z sąsiednich modułów też muszą mieć
// aktualne el.y (patrz zawiasy międzymodułowe w src/engine/cabinet.js).
export function recalculateAllLayouts() {
  (state.project.modules || []).forEach(recalculateLayout);
}

// Odcisk modułu na podłodze pomieszczenia, z uwzględnieniem obrotu co 90°
// (mod.rotation). Przy 90/270 stopni szerokość i głębokość zamieniają się
// miejscami w przestrzeni pokoju — lokalna geometria szafki (rysowanie,
// formatki) się nie zmienia, zmienia się tylko to, ile miejsca zajmuje ona
// "z zewnątrz". Jedyne miejsce prawdy dla tej zamiany — używane przy
// przeciąganiu/przyciąganiu w 3D (render/viewer3d.js) i przy łączeniu
// cokołów sąsiednich szafek (engine/cabinet.js), żeby oba liczyły to samo.
export function getWorldFootprint(mod) {
  const W = parseFloat(mod.dimensions.width) || 600;
  const D = parseFloat(mod.dimensions.depth) || 513;
  const rot = ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  return { worldW: swapped ? D : W, worldD: swapped ? W : D, rotation: rot };
}

// Twarde ograniczenie pozycji modułu do wnętrza pokoju (na podstawie odcisku
// z getWorldFootprint, więc uwzględnia obrót). Bez tego przeciągnięcie za daleko
// (poza próg przyciągania SNAP_DIST w render/viewer3d.js) albo obrót szafki
// stojącej tuż przy ścianie potrafił zostawić ją "przebijającą" ścianę - ściany
// same w sobie stoją na zewnątrz odcisku pokoju (patrz WALL_THICKNESS w
// viewer3d.js), więc to jedyne miejsce, które faktycznie trzyma szafkę w środku.
// Wołane po każdej zmianie position.x/z lub rotation (drag, obrót, ręczne pola).
export function clampModuleToRoom(mod) {
  const room = state.project.room || DEFAULT_ROOM;
  const { worldW, worldD } = getWorldFootprint(mod);
  const maxX = Math.max(0, room.width - worldW);
  const maxZ = Math.max(0, room.depth - worldD);
  mod.position.x = Math.min(Math.max(parseFloat(mod.position.x) || 0, 0), maxX);
  mod.position.z = Math.min(Math.max(parseFloat(mod.position.z) || 0, 0), maxZ);
}

// Rozwiązuje konfigurację dwóch górnych trawersów (przedni/tylny) z opcjonalnym
// nadpisaniem aktywności/szerokości pojedynczego trawersu (patrz ui/properties.js,
// zakładka Konstrukcja — "Trawersy: wysokości/aktywność ręczne") na wspólną
// szerokość cons.traverseWidth, gdy nadpisania nie ma. Współdzielone przez
// render/viewer3d.js i engine/cabinet.js, żeby oba liczyły dokładnie to samo —
// inaczej podgląd 3D i lista formatek/nawiertów mogłyby się rozjechać.
export function getTraverseConfig(cons) {
  const t = cons.traverses || {};
  const sharedWidth = parseFloat(cons.traverseWidth) || 100;
  const resolve = (side) => {
    const active = side.active !== false;
    const hasOverride = side.width !== undefined && side.width !== null && side.width !== "";
    const width = hasOverride ? (parseFloat(side.width) || sharedWidth) : sharedWidth;
    return { active, width };
  };
  const result = { front: resolve(t.front || {}), rear: resolve(t.rear || {}) };
  // Zabezpieczenie: szafka nie może zostać bez żadnego trawersu (otwarty korpus od góry).
  if (!result.front.active && !result.rear.active) result.front.active = true;
  return result;
}

export function recalculateLayout(mod) {
  if (!mod || !mod.elements) return;
  const config = state.project;
  const th = parseFloat(config.materials.boardThickness) || 18;
  const width = parseFloat(mod.dimensions.width) || 600;
  const height = parseFloat(mod.dimensions.height) || 720;

  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const fc = { ...(config.front?.clearance || {}), ...(mod.front?.clearance || {}) };
  const isInset = f.type === 'wpuszczane';

  const cLeft = parseFloat(fc.left ?? fc.sides ?? 1.5) || 0;
  const cRight = parseFloat(fc.right ?? fc.sides ?? 1.5) || 0;
  const cTop = parseFloat(fc.top ?? fc.gora ?? 2) || 0;
  const cBottom = parseFloat(fc.bottom ?? fc.dol ?? 2) || 0;

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const hasTraverses = cons.topType.includes('trawersy');
  const isVerticalTraverse = cons.topType === 'trawersy_pion';
  const traverseWidth = cons.traverseWidth || 100;

  mod.elements.forEach(el => {
      if (el.typ === 'front' && el.baseZone) {
          if (el.baseZone.boundBottom) {
              const getBound = (id, type, fallback) => {
                  if (id === 'cab-left') return th;
                  if (id === 'cab-right') return width - th;
                  if (id === 'cab-bottom') return th;
                  if (id === 'cab-top') {
                      if (hasTraverses) return isVerticalTraverse ? height - traverseWidth : height - th;
                      return height - th;
                  }
                  const found = mod.elements.find(e => e.id === id);
                  if (found) {
                      if (type === 'minX') return found.x + found.w;
                      if (type === 'maxX') return found.x;
                      if (type === 'minY') return found.y + found.h;
                      if (type === 'maxY') return found.y;
                  }
                  return parseFloat(fallback) || 0;
              };
              el.baseZone.minX = getBound(el.baseZone.boundLeft, 'minX', el.baseZone.minX);
              el.baseZone.maxX = getBound(el.baseZone.boundRight, 'maxX', el.baseZone.maxX);
              el.baseZone.minY = getBound(el.baseZone.boundBottom, 'minY', el.baseZone.minY);
              el.baseZone.maxY = getBound(el.baseZone.boundTop, 'maxY', el.baseZone.maxY);
          }

          const minX = parseFloat(el.baseZone.minX) || 0;
          const maxX = parseFloat(el.baseZone.maxX) || width;
          const minY = (parseFloat(el.baseZone.minY) || 0) + (parseFloat(el.baseZone.offsetBottom) || 0);
          const maxY = (parseFloat(el.baseZone.maxY) || height) - (parseFloat(el.baseZone.offsetTop) || 0);

          const gapVal = parseFloat(el.gap ?? f.gap ?? 3) || 0;

          let startX, totalW, startY, totalH;

          if (el.subtype === 'szuflada-wewnetrzna') {
              const gX = el.intGapX !== undefined ? parseFloat(el.intGapX) : 15;
              const gY = el.intGapY !== undefined ? parseFloat(el.intGapY) : 5;
              startX = minX + gX;
              totalW = (maxX - minX) - (gX * 2);
              startY = minY + gY;
              totalH = (maxY - minY) - (gY * 2);
          } else {
              const isBoundLeftFront = el.baseZone.boundLeft && el.baseZone.boundLeft.startsWith('front');
              const isBoundRightFront = el.baseZone.boundRight && el.baseZone.boundRight.startsWith('front');
              const isBoundBottomFront = el.baseZone.boundBottom && el.baseZone.boundBottom.startsWith('front');
              const isBoundTopFront = el.baseZone.boundTop && el.baseZone.boundTop.startsWith('front');

              const isLeftOuter = minX <= th + 1;
              const isRightOuter = maxX >= width - th - 1;
              const isBottomOuter = minY <= th + 1;
              const isTopOuter = maxY >= (hasTraverses && isVerticalTraverse ? height - traverseWidth - 1 : height - th - 1);

              const overLeft = isLeftOuter ? (isInset ? -cLeft : th - cLeft) : (isBoundLeftFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overRight = isRightOuter ? (isInset ? -cRight : th - cRight) : (isBoundRightFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overBottom = isBottomOuter ? (isInset ? -cBottom : th - cBottom) : (isBoundBottomFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overTop = isTopOuter ? (isInset ? -cTop : th - cTop) : (isBoundTopFront ? -gapVal : ((th / 2) - (gapVal / 2)));

              startX = minX - overLeft;
              totalW = (maxX - minX) + overLeft + overRight;
              startY = minY - overBottom;
              totalH = (maxY - minY) + overBottom + overTop;
          }

          if (el.subtype === 'szuflada' || el.subtype === 'szuflada-wewnetrzna') {
              const distributionStr = String(el.distribution || el.frontCount || "1").trim();
              let parsedZones = [];
              if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
                  const count = parseInt(distributionStr, 10) || 1;
                  for (let i = 0; i < count; i++) parsedZones.push({ type: 'fr', value: 1 });
              } else {
                  const separator = distributionStr.includes(':') ? ':' : ',';
                  parsedZones = distributionStr.split(separator).map(s => {
                      let zone = s.trim();
                      if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
                      const val = parseFloat(zone) || 1;
                      return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
                  });
              }

              const count = parsedZones.length;
              const totalGaps = gapVal * (count - 1);
              let availableHeight = totalH - totalGaps;

              let fixedTotal = 0; let frTotal = 0;
              parsedZones.forEach(z => { if (z.type === 'fixed') fixedTotal += z.value; if (z.type === 'fr') frTotal += z.value; });
              availableHeight -= fixedTotal;
              const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

              let currentY = startY;
              for (let i = 0; i < el.frontIndex; i++) {
                  const z = parsedZones[i] || { type: 'fr', value: 1 };
                  const h = z.type === 'fixed' ? z.value : z.value * singleFrValue;
                  currentY += h + gapVal;
              }

              const myZone = parsedZones[el.frontIndex] || { type: 'fr', value: 1 };
              const myHeight = myZone.type === 'fixed' ? myZone.value : myZone.value * singleFrValue;

              el.x = isNaN(startX) ? 0 : startX;
              el.w = isNaN(totalW) ? 100 : totalW;
              el.y = isNaN(currentY) ? 0 : currentY;
              el.h = isNaN(myHeight) ? 100 : myHeight;

          } else if (el.subtype === 'drzwi') {
              el.x = isNaN(startX) ? 0 : startX; el.w = isNaN(totalW) ? 100 : totalW;
              el.y = isNaN(startY) ? 0 : startY; el.h = isNaN(totalH) ? 100 : totalH;
          } else if (el.subtype === 'drzwi-lp') {
              const singleW = (totalW - gapVal) / 2;
              el.w = isNaN(singleW) ? 50 : singleW; el.h = isNaN(totalH) ? 100 : totalH; el.y = isNaN(startY) ? 0 : startY;
              let myX = el.frontIndex === 0 ? startX : startX + singleW + gapVal;
              el.x = isNaN(myX) ? 0 : myX;
          }

          if (el.forceH !== undefined && el.forceH !== null && !isNaN(el.forceH)) el.h = el.forceH;
          if (el.forceW !== undefined && el.forceW !== null && !isNaN(el.forceW)) el.w = el.forceW;
          if (el.forceOffsetX) el.x += el.forceOffsetX;
          if (el.forceOffsetY) el.y += el.forceOffsetY;
      }
  });
}
