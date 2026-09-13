// src/core/zoneTree.js
//
// Rekonstruuje wnętrze modułu (mod.elements: poziom/pion/front) jako drzewo
// binarnego podziału przestrzeni (BSP) i daje operacje na tym drzewie:
// podziel wnękę poziomo/pionowo, obsadź frontem, usuń podział, przesuń
// dzielnik. To rdzeń wizualnego edytora wnętrza (src/ui/interiorEditor.js) —
// zastępuje "kliknij dokładnie w plecy szafki w 3D" klikalnym, rekurencyjnym
// podziałem wnęk (ten sam model co Cabinet Designer / Blum Configurator).
//
// KLUCZOWE ZAŁOŻENIE: każdy poziom/pion w tym projekcie jest ZAWSZE tworzony
// tak, by w pełni rozpinać swoją wnękę (patrz dotychczasowy kod w
// viewer3d.js — "Zabuduj wybraną wnękę" zawsze ustawia w:currentW /
// h:currentH). Dzięki temu rekonstrukcja drzewa przez szukanie dzielnika w
// pełni rozpinającego bieżący prostokąt jest deterministyczna i działa na
// każdych danych wygenerowanych tym generatorem.
//
// FRONT NA WĘŹLE 'split': front (baseZone) może pasować do prostokąta węzła
// 'split', nie tylko 'leaf' - dzięki temu jeden front (np. drzwi) może wizualnie
// obejmować CAŁĄ wnękę, mimo że w środku są już realne, zagnieżdżone półki/
// przegrody (każda z nich to osobny węzeł 'split' w tym samym poddrzewie).
// Dodanie takiej półki NIE usuwa frontu - baseZone frontu się nie zmienia,
// więc nadal pasuje do rect węzła 'split', który go teraz reprezentuje.
import { state } from "./state.js";
import { autoDistributeShelves } from "./shelfMath.js";

const EPS = 2; // mm tolerancji przy porównaniach geometrycznych (zaokrąglenia)

function getBoardThickness() {
  return parseFloat(state.project.materials?.boardThickness) || 18;
}

function getConsForModule(mod) {
  return {
    joinType: "boki_przelotowe",
    topType: "pelny",
    traverseWidth: 100,
    ...(state.project.construction || {}),
    ...(mod.construction || {}),
  };
}

// Wewnętrzny prostokąt korpusu (światło między bokami/wieńcami), w mm,
// liczony od dołu modułu (0,0 = lewy dolny róg wnętrza korpusu).
export function getCabinetInnerRect(mod) {
  const th = getBoardThickness();
  const W = parseFloat(mod.dimensions.width) || 600;
  const H = parseFloat(mod.dimensions.height) || 720;
  const cons = getConsForModule(mod);
  const hasTraverses = cons.topType.includes("trawersy");
  const isVerticalTraverse = cons.topType === "trawersy_pion";
  const topY = hasTraverses && isVerticalTraverse ? H - (parseFloat(cons.traverseWidth) || 100) : H - th;
  return { minX: th, maxX: W - th, minY: th, maxY: topY };
}

function frontsMatchingZone(mod, rect) {
  return (mod.elements || []).filter(
    (el) =>
      el.typ === "front" &&
      el.baseZone &&
      Math.abs(parseFloat(el.baseZone.minX) - rect.minX) < EPS &&
      Math.abs(parseFloat(el.baseZone.maxX) - rect.maxX) < EPS &&
      Math.abs(parseFloat(el.baseZone.minY) - rect.minY) < EPS &&
      Math.abs(parseFloat(el.baseZone.maxY) - rect.maxY) < EPS
  );
}

// Buduje drzewo BSP wnętrza aktywnego modułu.
// Węzeł 'split': { type:'split', axis:'v'|'h', divider: <element poziom/pion>, rect, a, b, fronts, bound*Id }
//   'v' = podział przegrodą pionową (a = lewa kolumna, b = prawa)
//   'h' = podział półką poziomą (a = dół, b = góra)
//   fronts: front(y), których baseZone pasuje do CAŁEGO rect tego węzła (patrz
//     komentarz na górze pliku - pozwala jednemu frontowi obejmować całe
//     poddrzewo z zagnieżdżonymi półkami/przegrodami).
// Węzeł 'leaf': { type:'leaf', rect, fronts: [...], boundLeftId, boundRightId, boundBottomId, boundTopId }
export function buildZoneTree(mod) {
  const piony = (mod.elements || []).filter((el) => el.typ === "pion");
  const poziomy = (mod.elements || []).filter((el) => el.typ === "poziom");
  const root = getCabinetInnerRect(mod);

  function partition(rect, boundLeftId, boundRightId, boundBottomId, boundTopId) {
    const fronts = frontsMatchingZone(mod, rect);

    const pionCandidates = piony
      .filter(
        (p) =>
          p.x > rect.minX + EPS &&
          p.x + p.w < rect.maxX - EPS &&
          p.y <= rect.minY + EPS &&
          p.y + p.h >= rect.maxY - EPS
      )
      .sort((a, b) => a.x - b.x);

    if (pionCandidates.length > 0) {
      const pion = pionCandidates[0];
      const a = partition({ ...rect, maxX: pion.x }, boundLeftId, pion.id, boundBottomId, boundTopId);
      const b = partition({ ...rect, minX: pion.x + pion.w }, pion.id, boundRightId, boundBottomId, boundTopId);
      return { type: "split", axis: "v", divider: pion, rect, a, b, fronts, boundLeftId, boundRightId, boundBottomId, boundTopId };
    }

    const poziomCandidates = poziomy
      .filter(
        (p) =>
          p.y > rect.minY + EPS &&
          p.y + p.h < rect.maxY - EPS &&
          p.x <= rect.minX + EPS &&
          p.x + p.w >= rect.maxX - EPS
      )
      .sort((a, b) => a.y - b.y);

    if (poziomCandidates.length > 0) {
      const poziom = poziomCandidates[0];
      const a = partition({ ...rect, maxY: poziom.y }, boundLeftId, boundRightId, boundBottomId, poziom.id);
      const b = partition({ ...rect, minY: poziom.y + poziom.h }, boundLeftId, boundRightId, poziom.id, boundTopId);
      return { type: "split", axis: "h", divider: poziom, rect, a, b, fronts, boundLeftId, boundRightId, boundBottomId, boundTopId };
    }

    return { type: "leaf", rect, boundLeftId, boundRightId, boundBottomId, boundTopId, fronts };
  }

  return partition(root, "cab-left", "cab-right", "cab-bottom", "cab-top");
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

// Usuwa fronty przypisane BEZPOŚREDNIO do tego węzła (dowolnego typu - patrz
// komentarz na górze pliku o frontach na węzłach 'split'). Nie rusza frontów
// ani dzielników zagnieżdżonych głębiej w poddrzewie.
// Usuwa fronty przypisane do TEGO węzła i - jeśli to 'split' - rekurencyjnie
// wszystkie fronty zagnieżdżone głębiej w jego poddrzewie. Bez rekursji
// przypisanie jednego frontu na CAŁOŚĆ (np. drzwi na cały korpus) zostawiałoby
// "osierocone" fronty wcześniej przypisane do pojedynczych, węższych wnęk w
// środku tego samego obszaru - w rezultacie dwa nachodzące na siebie fronty
// naraz (widoczne np. w liście formatek jako dwa razy "Drzwi").
function clearNodeFronts(mod, node) {
  const ids = new Set();
  collectFrontIds(node, ids);
  if (ids.size === 0) return;
  mod.elements = mod.elements.filter((el) => !ids.has(el.id));
}

function collectFrontIds(node, into) {
  node.fronts.forEach((f) => into.add(f.id));
  if (node.type === "split") {
    collectFrontIds(node.a, into);
    collectFrontIds(node.b, into);
  }
}

// Dzieli wnękę (leaf) na dwie, wstawiając półkę na jej środku wysokości.
// Front przypisany do tej wnęki (jeśli był) NIE jest usuwany - jego baseZone
// się nie zmienia, więc po podziale nadal pasuje do rect nowego węzła 'split'
// obejmującego obie powstałe pod-wnęki (patrz partition() wyżej), czyli
// wizualnie nadal obejmuje całość, a nowa półka jest już za nim.
export function splitZoneHorizontal(mod, node) {
  if (node.type !== "leaf") return null;
  const th = getBoardThickness();
  const { minX, maxX, minY, maxY } = node.rect;
  const midY = (minY + maxY) / 2;
  const shelf = {
    id: "poziom-" + Date.now() + "-" + randomSuffix(),
    typ: "poziom",
    x: minX,
    y: midY - th / 2,
    w: maxX - minX,
    h: th,
    isStructural: false,
  };
  mod.elements.push(shelf);
  return shelf;
}

// Jak wyżej, ale przegrodą pionową na środku szerokości. W przeciwieństwie do
// półki (poziom) przegroda nie ma sensownego odpowiednika "na podpórkach" -
// domyślnie od razu isStructural: true, więc od razu dostaje mocowanie na
// kołek+wkręt do wieńca/półki nad i pod nią (patrz toggleStructural niżej i
// nawierty w rysunku technicznym, engine/cabinet.js: getPionMountHoles).
export function splitZoneVertical(mod, node) {
  if (node.type !== "leaf") return null;
  const th = getBoardThickness();
  const { minX, maxX, minY, maxY } = node.rect;
  const midX = (minX + maxX) / 2;
  const divider = {
    id: "pion-" + Date.now() + "-" + randomSuffix(),
    typ: "pion",
    x: midX - th / 2,
    y: minY,
    w: th,
    h: maxY - minY,
    isStructural: true,
  };
  mod.elements.push(divider);
  return divider;
}

// Rozmieszcza N półek równomiernie w danej wnęce (odstępy liczone przez
// core/shelfMath.js) - front przypisany do tej wnęki (jeśli był) przetrwa,
// z tych samych powodów co przy splitZoneHorizontal.
export function addEvenShelves(mod, node, count) {
  if (node.type !== "leaf" || count < 1) return [];
  const th = getBoardThickness();
  const { minX, maxX, minY, maxY } = node.rect;
  const offsets = autoDistributeShelves(maxY - minY, th, count);
  const ts = Date.now();
  const shelves = offsets.map((o, idx) => ({
    id: "poziom-auto-" + ts + "-" + idx + "-" + randomSuffix(),
    typ: "poziom",
    x: minX,
    y: minY + o.y,
    w: maxX - minX,
    h: th,
    isStructural: false,
  }));
  shelves.forEach((s) => mod.elements.push(s));
  return shelves;
}

// Zbiera id wszystkich elementów (fronty, dzielnik, zagnieżdżone dalej fronty
// i dzielniki) należących do CAŁEGO poddrzewa danego węzła - używane tylko w
// removeSplit() niżej, w tym jednym przypadku, gdy obie strony usuwanego
// podziału mają WŁASNE, dalsze podziały (patrz komentarz tam) i nie da się
// ich bezkolizyjnie scalić.
function collectSubtreeElementIds(node, into) {
  node.fronts.forEach((f) => into.add(f.id));
  if (node.type === "split") {
    into.add(node.divider.id);
    collectSubtreeElementIds(node.a, into);
    collectSubtreeElementIds(node.b, into);
  }
}

// Usuwa TYLKO ten jeden dzielnik, scalając node.a i node.b z powrotem w jedną
// wnękę. Trzy przypadki:
// 1) Żadna ze stron nie ma własnego, dalszego podziału - po prostu usuwamy
//    dzielnik i fronty bezpośrednio na obu stronach (ich baseZone == znikająca
//    wnęka, inaczej zostałyby osierocone - niewidoczne w edytorze, ale nadal
//    wliczane do listy formatek).
// 2) TYLKO JEDNA strona ma dalszy podział - to nadal prawdziwe, osobne
//    elementy poziom/pion, więc zostają; ale skoro wcześniej rozpinały tylko
//    węższą wnękę tej jednej strony, trzeba je "rozciągnąć" (rescaleSubtree)
//    na cały scalony obszar - inaczej przestałyby w pełni rozpinać swoją
//    wnękę (patrz "KLUCZOWE ZAŁOŻENIE" na górze pliku) i same zostałyby
//    osierocone przy najbliższym buildZoneTree(). Fronty w tej zachowanej
//    gałęzi, których baseZone.bound* wskazywało na WŁAŚNIE usuwany dzielnik
//    (core/layout.js liczy z tego realną geometrię, nie tylko zoneTree.js),
//    trzeba przepiąć na to, co ograniczało cały ten węzeł od tej samej strony
//    PRZED podziałem.
// 3) OBIE strony mają własne, dalsze podziały - dwie niezależne struktury
//    rządzące tym samym, teraz wspólnym obszarem, nie da się ich bezkolizyjnie
//    scalić w jedno proste drzewo - usuwamy całą zawartość obu stron (jak
//    poprzednio).
// Front przypisany do SAMEGO usuwanego węzła `node` (obejmujący już całe to
// poddrzewo, patrz komentarz na górze pliku) zawsze zostaje nietknięty - jego
// baseZone i tak pasuje do scalonej wnęki.
export function removeSplit(mod, node) {
  if (node.type !== "split") return;
  const isH = node.axis === "h";
  const dividerId = node.divider.id;
  const aHasSplit = node.a.type === "split";
  const bHasSplit = node.b.type === "split";
  const toRemove = new Set([dividerId]);

  if (aHasSplit && bHasSplit) {
    collectSubtreeElementIds(node.a, toRemove);
    collectSubtreeElementIds(node.b, toRemove);
  } else {
    node.a.fronts.forEach((f) => toRemove.add(f.id));
    node.b.fronts.forEach((f) => toRemove.add(f.id));
  }
  mod.elements = mod.elements.filter((el) => !toRemove.has(el.id));

  if (aHasSplit === bHasSplit) return; // przypadek 1 albo 3 - nic więcej do zrobienia

  mod.elements.forEach((el) => {
    if (el.typ !== "front" || !el.baseZone) return;
    if (isH) {
      if (el.baseZone.boundBottom === dividerId) el.baseZone.boundBottom = node.boundBottomId;
      if (el.baseZone.boundTop === dividerId) el.baseZone.boundTop = node.boundTopId;
    } else {
      if (el.baseZone.boundLeft === dividerId) el.baseZone.boundLeft = node.boundLeftId;
      if (el.baseZone.boundRight === dividerId) el.baseZone.boundRight = node.boundRightId;
    }
  });

  const axisKey = isH ? "y" : "x";
  const mergedMin = isH ? node.rect.minY : node.rect.minX;
  const mergedMax = isH ? node.rect.maxY : node.rect.maxX;
  const survivor = aHasSplit ? node.a : node.b;
  const oldMin = isH ? survivor.rect.minY : survivor.rect.minX;
  const oldMax = isH ? survivor.rect.maxY : survivor.rect.maxX;
  rescaleSubtree(survivor, axisKey, oldMin, oldMax, mergedMin, mergedMax);
}

// Działa na obu osiach: dla poziomu (półka) przełącza "konstrukcyjna" (na
// stałe wkręcona w boki, kołek+wkręt) / "ruchoma" (na podpórkach); dla pionu
// (przegroda) przełącza mocowanie na kołek+wkręt do wieńca/półki nad i pod
// nią (patrz render/viewer3d.js - nawierty tylko gdy isStructural) / brak
// mocowania (przegroda tylko wstawiona, bez wiercenia).
export function toggleStructural(node) {
  if (node.type === "split") {
    node.divider.isStructural = !node.divider.isStructural;
  }
}

// Obsadza wnękę frontem - node może być 'leaf' ALBO 'split' (patrz komentarz
// na górze pliku: front na węźle 'split' obejmuje wizualnie całe poddrzewo,
// z zagnieżdżonymi półkami/przegrodami w środku). subtype: 'drzwi' |
// 'drzwi-lp' | 'szuflada' | 'szuflada-wewnetrzna'.
// opts: { gap, openingSide, distribution, offsetBottom, offsetTop }
export function assignFront(mod, node, subtype, opts = {}) {
  clearNodeFronts(mod, node);

  const { minX, maxX, minY, maxY } = node.rect;
  const baseZone = {
    minX,
    maxX,
    minY,
    maxY,
    boundLeft: node.boundLeftId,
    boundRight: node.boundRightId,
    boundBottom: node.boundBottomId,
    boundTop: node.boundTopId,
    offsetBottom: 0,
    offsetTop: 0,
  };
  const gap = opts.gap ?? (parseFloat(state.project.front?.gap) || 3);
  const ts = Date.now();

  if (subtype === "drzwi") {
    mod.elements.push({
      id: "front-" + ts + "-" + randomSuffix(),
      typ: "front",
      subtype: "drzwi",
      baseZone,
      openingSide: opts.openingSide || "left",
      frontCount: 1,
      frontIndex: 0,
      gap,
    });
  } else if (subtype === "drzwi-lp") {
    mod.elements.push({ id: "front-L-" + ts + "-" + randomSuffix(), typ: "front", subtype: "drzwi-lp", baseZone, frontCount: 2, frontIndex: 0, gap });
    mod.elements.push({ id: "front-P-" + ts + "-" + randomSuffix(), typ: "front", subtype: "drzwi-lp", baseZone, frontCount: 2, frontIndex: 1, gap });
  } else if (subtype === "szuflada" || subtype === "szuflada-wewnetrzna") {
    const distStr = String(opts.distribution ?? "1").trim() || "1";
    let count;
    if (!distStr.includes(":") && !distStr.includes(",") && !isNaN(distStr)) {
      count = parseInt(distStr, 10) || 1;
    } else {
      count = distStr.split(distStr.includes(":") ? ":" : ",").length;
    }
    const isInner = subtype === "szuflada-wewnetrzna";
    for (let i = 0; i < count; i++) {
      mod.elements.push({
        id: "front-" + ts + "-" + i + "-" + randomSuffix(),
        typ: "front",
        subtype,
        baseZone: isInner ? { ...baseZone, offsetBottom: opts.offsetBottom || 0, offsetTop: opts.offsetTop || 0 } : baseZone,
        frontCount: count,
        distribution: distStr,
        frontIndex: i,
        gap,
        intGapX: isInner ? 15 : 0,
        intGapY: isInner ? 5 : 0,
        forceVariant: "auto",
        forceNL: null,
      });
    }
  }
}

// Przeskalowuje WSZYSTKIE poziomy/piony zagnieżdżone w poddrzewie tak, by ich
// x/y/w/h nadal wypełniały nowy zakres [newMin, newMax] w miejsce starego
// [oldMin, oldMax]. Fronty (baseZone) same się przeliczą przy najbliższym
// recalculateLayout() dzięki bound-referencjom (boundLeft/Right/Top/Bottom)
// — nie trzeba ich tu ręcznie ruszać.
//
// ZABLOKOWANY WYMIAR (divider.lockA / divider.lockB, patrz ui/interiorEditor.js
// - kłódka przy edytowalnym wymiarze wnęki): domyślnie (bez blokady) dzielnik
// przesuwa się PROPORCJONALNIE (`remap`) - obie strony rosną/kurczą się razem.
// Gdy jedna strona jest zablokowana, ta strona ma zachować DOKŁADNIE ten sam
// rozmiar co przed przeskalowaniem, a cała zmiana zakresu idzie na drugą
// (odblokowaną) stronę. Dlatego w głąb NIE przekazujemy już ślepo tego samego
// globalnego zakresu do obu dzieci (jak w czysto proporcjonalnym przypadku,
// gdzie to i tak wychodzi na to samo) - liczymy WŁASNY, faktyczny stary/nowy
// zakres każdej strony z osobna, bo przy blokadzie te zakresy przestają być
// jedną wspólną transformacją afiniczną.
function rescaleSubtree(node, axis, oldMin, oldMax, newMin, newMax) {
  const oldSpan = oldMax - oldMin;
  if (oldSpan <= 0 || node.type !== "split") return;
  const scale = (newMax - newMin) / oldSpan;
  const remap = (v) => newMin + (v - oldMin) * scale;

  const isPrimary = (axis === "x" && node.axis === "v") || (axis === "y" && node.axis === "h");

  if (!isPrimary) {
    // Dzielnik PROSTOPADŁY do przeskalowywanej osi - jego pozycja na tej osi
    // się nie zmienia (to nie jego oś podziału), zmienia się tylko jego
    // rozciągnięcie, żeby nadal w pełni rozpinał nową szerokość/wysokość.
    if (axis === "x" && node.axis === "h") {
      node.divider.x = remap(node.divider.x);
      node.divider.w = node.divider.w * scale;
    } else if (axis === "y" && node.axis === "v") {
      node.divider.y = remap(node.divider.y);
      node.divider.h = node.divider.h * scale;
    }
    rescaleSubtree(node.a, axis, oldMin, oldMax, newMin, newMax);
    rescaleSubtree(node.b, axis, oldMin, oldMax, newMin, newMax);
    return;
  }

  const th = node.axis === "h" ? node.divider.h : node.divider.w;
  const oldPos = node.axis === "h" ? node.divider.y : node.divider.x;
  const oldSizeA = oldPos - oldMin;
  const oldSizeB = oldMax - (oldPos + th);

  let newPos;
  if (node.divider.lockA) {
    newPos = newMin + oldSizeA; // strona 'a' zachowuje dokładny rozmiar
  } else if (node.divider.lockB) {
    newPos = newMax - th - oldSizeB; // strona 'b' zachowuje dokładny rozmiar
  } else {
    newPos = remap(oldPos);
  }

  if (node.axis === "h") node.divider.y = newPos; else node.divider.x = newPos;

  rescaleSubtree(node.a, axis, oldMin, oldPos, newMin, newPos);
  rescaleSubtree(node.b, axis, oldPos + th, oldMax, newPos + th, newMax);
}

const MIN_GAP = 30; // najmniejszy dopuszczalny prześwit po obu stronach przesuwanego dzielnika (mm)

// Przesuwa dzielnik węzła 'split' na nową pozycję (y dla poziomej półki, x
// dla pionowej przegrody), dociskając do [rect.min + MIN_GAP, rect.max - grubość - MIN_GAP]
// i proporcjonalnie przeskalowując wszystko zagnieżdżone po obu stronach.
export function moveSplit(mod, node, newPos) {
  if (node.type !== "split") return;
  const th = getBoardThickness();

  if (node.axis === "h") {
    const min = node.rect.minY + MIN_GAP;
    const max = node.rect.maxY - th - MIN_GAP;
    if (max < min) return;
    const oldY = node.divider.y;
    const clamped = Math.min(Math.max(newPos, min), max);
    rescaleSubtree(node.a, "y", node.rect.minY, oldY, node.rect.minY, clamped);
    rescaleSubtree(node.b, "y", oldY + th, node.rect.maxY, clamped + th, node.rect.maxY);
    node.divider.y = clamped;
  } else {
    const min = node.rect.minX + MIN_GAP;
    const max = node.rect.maxX - th - MIN_GAP;
    if (max < min) return;
    const oldX = node.divider.x;
    const clamped = Math.min(Math.max(newPos, min), max);
    rescaleSubtree(node.a, "x", node.rect.minX, oldX, node.rect.minX, clamped);
    rescaleSubtree(node.b, "x", oldX + th, node.rect.maxX, clamped + th, node.rect.maxX);
    node.divider.x = clamped;
  }
}
