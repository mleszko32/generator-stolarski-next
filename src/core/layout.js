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
  // Szafka narożna (mod.type === 'corner_cabinet') ma DWA ramiona - dla
  // kolizji/przyciągania w v1 traktujemy ją jak prostokąt legA×legB
  // (bounding box obu ramion), a nie legA×depth jak zwykły moduł, bo
  // depth to głębokość KAŻDEGO ramienia, nie odcisk całej bryły na
  // podłodze. Uproszczenie świadome - patrz core/state.js: addCornerModule.
  const D = mod.type === 'corner_cabinet'
      ? (parseFloat(mod.dimensions.legB) || W)
      : (parseFloat(mod.dimensions.depth) || 513);
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
  // Blendy L-kształtne (mod.fillers.left/right, patrz render/viewer3d.js)
  // dostawiają się PO BOKACH modułu, poszerzając jego realny odcisk w
  // pokoju - bez tego przy szafce dosuniętej do ściany sama blenda
  // przenikała przez tę ścianę (zgłoszony bug), mimo że sam korpus mieścił
  // się w środku.
  //
  // Kierunek "lewa/prawa" jest zdefiniowany w LOKALNYM układzie modułu, a
  // obrót co 90° (modGroup.rotation.y w render/viewer3d.js) obraca ten
  // lokalny układ względem pokoju - "lewa" blenda nie zawsze poszerza odcisk
  // w stronę -X świata. Zweryfikowane wprost z transformacji modGroup
  // (innerGroup.position = -W/2,.., -D/2, potem obrót o mod.rotation):
  //   rotation   0°: lewa -> -X (bliższa ściana X=0),   prawa -> +X (daleka)
  //   rotation 180°: lewa -> +X (daleka),                prawa -> -X (bliższa)
  //   rotation  90°: lewa -> -Z (bliższa ściana Z=0),   prawa -> +Z (daleka)
  //   rotation 270°: lewa -> +Z (daleka),                prawa -> -Z (bliższa)
  // Bez tego (poprzednia wersja zakładała zawsze "lewa = -X, prawa = +X",
  // czyli tylko przypadek rotation=0) blenda modułu obróconego o 180°/90°/270°
  // nadal przenikała przez ścianę, mimo że ta funkcja "wiedziała" już
  // ogólnie o blendach - zgłoszony bug w konkretnym zapisanym projekcie.
  const leftW = (mod.fillers && mod.fillers.left && mod.fillers.left.active) ? (parseFloat(mod.fillers.left.width) || 50) : 0;
  const rightW = (mod.fillers && mod.fillers.right && mod.fillers.right.active) ? (parseFloat(mod.fillers.right.width) || 50) : 0;
  const rot = ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;
  const nearIsLeft = rot === 0 || rot === 90;
  const nearW = nearIsLeft ? leftW : rightW;
  const farW = nearIsLeft ? rightW : leftW;
  const onXAxis = rot === 0 || rot === 180;

  const nearFillerX = onXAxis ? nearW : 0;
  const farFillerX = onXAxis ? farW : 0;
  const nearFillerZ = onXAxis ? 0 : nearW;
  const farFillerZ = onXAxis ? 0 : farW;

  const maxX = Math.max(nearFillerX, room.width - worldW - farFillerX);
  const maxZ = Math.max(nearFillerZ, room.depth - worldD - farFillerZ);
  mod.position.x = Math.min(Math.max(parseFloat(mod.position.x) || 0, nearFillerX), maxX);
  mod.position.z = Math.min(Math.max(parseFloat(mod.position.z) || 0, nearFillerZ), maxZ);
}

// Prostokątny odcisk modułu w przestrzeni pokoju (X/Y/Z), z uwzględnieniem
// obrotu (getWorldFootprint) i wysokości nóżek. Używane przez
// restModuleOnNeighbors() niżej oraz przez pushOverlappingModules()
// w render/viewer3d.js (ta sama definicja - stąd eksport, żeby nie liczyć
// tego samego dwa razy w dwóch miejscach).
export function getModuleBox(mod) {
  const { worldW, worldD } = getWorldFootprint(mod);
  const H = parseFloat(mod.dimensions.height) || 720;
  const baseY = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 100) : 0;
  const x0 = parseFloat(mod.position.x) || 0;
  const y0 = (parseFloat(mod.position.y) || 0) + baseY;
  const z0 = parseFloat(mod.position.z) || 0;
  return { x0, x1: x0 + worldW, y0, y1: y0 + H, z0, z1: z0 + worldD };
}

// Stawianie szafy z dwóch modułów jeden NA DRUGIM (np. dolny + górny, ten
// sam odcisk X/Z) - ustawienie wysokości (position.y) ręcznie w polu "Wysokość
// od podłogi" (ui/properties.js) samo w sobie nie sprawdzało kolizji z niczym,
// więc niedokładna wartość (np. o kilka mm za mało) zostawiała moduł
// "zatopiony" w tym pod/nad nim spodem - zgłoszony bug ("wnika w głąb").
// Dosuwa PRZESUNIĘTY właśnie moduł (mod) do oparcia się dokładnie o sąsiada,
// z którym akurat nachodzi w pionie, zamiast ruszać sąsiada - w przeciwieństwie
// do kolizji bok-w-bok (pushOverlappingModules w render/viewer3d.js), gdzie to
// sąsiad jest odsuwany, bo tu nie ma odpowiednika "łańcucha" - dwa moduły w tym
// samym miejscu w planie mogą się stykać tylko piętrowo. Działa tylko gdy X I Z
// faktycznie się nakładają (inaczej to zwykłe sąsiedztwo w rzędzie, nie
// piętrowanie) ORAZ nakładanie w Y jest MNIEJSZE niż w X/Z (ten sam warunek
// "minimum translation vector" co przy przeciąganiu w 3D).
export function restModuleOnNeighbors(mod) {
  const EPS = 0.5;
  const boxM = getModuleBox(mod);
  (state.project.modules || []).forEach((other) => {
    if (other.id === mod.id) return;
    const boxO = getModuleBox(other);
    const overlapX = Math.min(boxM.x1, boxO.x1) - Math.max(boxM.x0, boxO.x0);
    const overlapY = Math.min(boxM.y1, boxO.y1) - Math.max(boxM.y0, boxO.y0);
    const overlapZ = Math.min(boxM.z1, boxO.z1) - Math.max(boxM.z0, boxO.z0);
    if (overlapX <= EPS || overlapY <= EPS || overlapZ <= EPS) return;
    if (!(overlapY <= overlapX && overlapY <= overlapZ)) return;

    const dir = boxM.y0 + boxM.y1 >= boxO.y0 + boxO.y1 ? 1 : -1;
    mod.position.y = Math.round((parseFloat(mod.position.y) || 0) + dir * overlapY);
    boxM.y0 += dir * overlapY;
    boxM.y1 += dir * overlapY;
  });
}

// Projekty zapisane PRZED dodaniem realnego pokoju miały w danych martwe,
// nigdy nierenderowane pole room = {width:3500, height:2600, depth:600} (patrz
// komentarz przy DEFAULT_ROOM w state.js - to było jak korytarz, nie mieściłby
// się w nim nawet jeden rząd szafek). ensureRoomDefaults() samo w sobie tego
// nie łapie, bo to poprawne, parsowalne liczby - więc stare projekty po prostu
// wczytywały się z tym samym za małym, fikcyjnym pokojem, a realna zabudowa
// (dziś faktycznie renderowana w 4 ścianach) wystawała poza niego / "przebijała"
// ściany już przy samym otwarciu projektu, bez żadnego przeciągania. Wołaj to
// razem z ensureRoomDefaults() przy każdej podmianie state.project (main.js,
// storage.js, history.js) - jednorazowo "podciąga" pokój pod istniejący układ.
const LEGACY_DEAD_ROOM = { width: 3500, height: 2600, depth: 600 };
const ROOM_FIT_MARGIN = 200; // mm zapasu wokół istniejącej zabudowy

export function migrateLegacyRoom(project) {
  const r = project.room;
  if (!r) return;
  const isLegacyPlaceholder =
    parseFloat(r.width) === LEGACY_DEAD_ROOM.width &&
    parseFloat(r.height) === LEGACY_DEAD_ROOM.height &&
    parseFloat(r.depth) === LEGACY_DEAD_ROOM.depth;
  if (!isLegacyPlaceholder) return;

  const modules = project.modules || [];
  if (modules.length === 0) {
    project.room = { ...DEFAULT_ROOM };
    return;
  }

  let maxX = 0, maxZ = 0, maxY = 0;
  modules.forEach(mod => {
    const { worldW, worldD } = getWorldFootprint(mod);
    const x = parseFloat(mod.position.x) || 0;
    const z = parseFloat(mod.position.z) || 0;
    const y = parseFloat(mod.position.y) || 0;
    const h = parseFloat(mod.dimensions.height) || 0;
    const legH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 100) : 0;
    maxX = Math.max(maxX, x + worldW);
    maxZ = Math.max(maxZ, z + worldD);
    maxY = Math.max(maxY, y + legH + h);
  });

  const roundUp10 = (v) => Math.ceil(v / 10) * 10;
  project.room = {
    width: Math.max(DEFAULT_ROOM.width, roundUp10(maxX + ROOM_FIT_MARGIN)),
    depth: Math.max(DEFAULT_ROOM.depth, roundUp10(maxZ + ROOM_FIT_MARGIN)),
    height: Math.max(DEFAULT_ROOM.height, roundUp10(maxY + ROOM_FIT_MARGIN)),
  };
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

              // Szafka narożna (core/state.js: addCornerModule) ma DWA
              // niezależne ramiona zamiast jednego wspólnego dimensions.width,
              // więc porównanie minX/maxX do współdzielonego `width` nie ma
              // sensu dla jej frontów - baseZone.forceOuterLeft/Right pozwala
              // wprost zadeklarować "ta krawędź to prawdziwa zewnętrzna
              // krawędź korpusu" bez zgadywania z geometrii. Domyślnie (pole
              // nieustawione) zachowanie jest identyczne jak dotąd.
              const isLeftOuter = el.baseZone.forceOuterLeft !== undefined ? el.baseZone.forceOuterLeft : minX <= th + 1;
              const isRightOuter = el.baseZone.forceOuterRight !== undefined ? el.baseZone.forceOuterRight : maxX >= width - th - 1;
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

// Szafka narożna, kąt prosty bez ścięcia (mod.type === 'corner_cabinet',
// core/state.js: addCornerModule) - liczy baseZone dwóch zwykłych,
// prostych frontów (po jednym na ramię) z bieżących wymiarów modułu.
// Wołaj raz przy tworzeniu modułu (ui/sidebar.js) i przy każdej zmianie
// legA/legB/depth w panelu (ui/properties.js) - PRZED recalculateLayout
// (mod), bo ten czyta już gotowe baseZone. Zapisuje wprost LICZBOWE
// minX/maxX/minY/maxY (bez boundLeft/boundRight) i forceOuterLeft/
// Right=true na obu frontach - stykają się ze sobą w ostrym, prostym
// narożniku (nie sąsiadują wzdłuż wspólnej krawędzi jak fronty w module
// prostokątnym), więc obie krawędzie każdego z nich traktujemy jak
// zewnętrzne krawędzie korpusu (pełny luz cLeft/cRight).
export function getCornerFrontZones(mod) {
  const th = parseFloat(state.project.materials?.boardThickness) || 18;
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const depth = parseFloat(mod.dimensions.depth) || 540;
  const height = parseFloat(mod.dimensions.height) || 720;

  // Reszta danego ramienia poza strefą wspólnego narożnika (depth), pomniejszona
  // dodatkowo o grubość frontu SĄSIEDNIEGO ramienia (cornerGap) - oba fronty mają
  // swój płat grubości `th` sięgający dokładnie do linii `depth` w OSI DRUGIEGO
  // ramienia (patrz render/viewer3d.js: renderCornerCabinet), więc bez tego
  // odsunięcia ich bliższe naroża fizycznie by się przenikały w rogu (zgłoszone
  // jako "fronty jakoś wystają"). minX/maxX są przesunięte o cornerGap, żeby
  // dalsza (zewnętrzna, przy boku) krawędź frontu została DOKŁADNIE tam, gdzie
  // była wcześniej - zmienia się tylko krawędź bliżej narożnika.
  const cornerGap = th;
  const widthA = Math.max(50, legA - depth - th - cornerGap);
  const widthB = Math.max(50, legB - depth - th - cornerGap);

  // Zgłoszona korekta "fronty wystają poza szafkę": recalculateLayout() dokłada
  // na krawędzi forceOuterRight standardowy zakład "nakładane" (th - cRight,
  // ok. 16.5mm) - dla zwykłego modułu to normalne (front nakłada się na bok od
  // zewnątrz), ale przy szafce narożnej ten zakład wystawał POZA legA/legB, za
  // zewnętrzne lico boku. Odejmujemy go tu z góry z maxX, żeby po dodaniu
  // zakładu przez recalculateLayout front kończył się DOKŁADNIE na krawędzi
  // bryły (legA/legB), a nie poza nią. Bliższa narożnika krawędź (cornerGap
  // wyżej) ma zostać bez zmian.
  const fc = { ...(state.project.front?.clearance || {}), ...(mod.front?.clearance || {}) };
  const cRight = parseFloat(fc.right ?? fc.sides ?? 1.5) || 0;
  const overlayReach = th - cRight;

  const zoneFor = (w) => ({
      minX: th + cornerGap, maxX: th + cornerGap + w - overlayReach, minY: th, maxY: height - th,
      forceOuterLeft: true, forceOuterRight: true
  });

  const frontA = (mod.elements || []).find(el => el.typ === 'front' && el.cornerArm === 'A');
  const frontB = (mod.elements || []).find(el => el.typ === 'front' && el.cornerArm === 'B');

  if (frontA) frontA.baseZone = zoneFor(widthA);
  if (frontB) frontB.baseZone = zoneFor(widthB);
}
