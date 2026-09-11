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
import { state } from "./state.js";

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
// Węzeł 'split': { type:'split', axis:'v'|'h', divider: <element poziom/pion>, rect, a, b }
//   'v' = podział przegrodą pionową (a = lewa kolumna, b = prawa)
//   'h' = podział półką poziomą (a = dół, b = góra)
// Węzeł 'leaf': { type:'leaf', rect, fronts: [...], boundLeftId, boundRightId, boundBottomId, boundTopId }
export function buildZoneTree(mod) {
  const piony = (mod.elements || []).filter((el) => el.typ === "pion");
  const poziomy = (mod.elements || []).filter((el) => el.typ === "poziom");
  const root = getCabinetInnerRect(mod);

  function partition(rect, boundLeftId, boundRightId, boundBottomId, boundTopId) {
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
      return { type: "split", axis: "v", divider: pion, rect, a, b };
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
      return { type: "split", axis: "h", divider: poziom, rect, a, b };
    }

    return {
      type: "leaf",
      rect,
      boundLeftId,
      boundRightId,
      boundBottomId,
      boundTopId,
      fronts: frontsMatchingZone(mod, rect),
    };
  }

  return partition(root, "cab-left", "cab-right", "cab-bottom", "cab-top");
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function clearLeafFronts(mod, node) {
  if (node.type !== "leaf" || node.fronts.length === 0) return;
  const ids = new Set(node.fronts.map((f) => f.id));
  mod.elements = mod.elements.filter((el) => !ids.has(el.id));
}

// Dzieli pustą wnękę (leaf) na dwie, wstawiając półkę na jej środku wysokości.
// Jeśli wnęka była obsadzona frontem, front zostaje usunięty (dzielimy tylko
// przestrzeń — front trzeba przypisać na nowo do jednej z powstałych wnęk).
export function splitZoneHorizontal(mod, node) {
  if (node.type !== "leaf") return null;
  const th = getBoardThickness();
  const { minX, maxX, minY, maxY } = node.rect;
  const midY = (minY + maxY) / 2;
  clearLeafFronts(mod, node);
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

// Jak wyżej, ale przegrodą pionową na środku szerokości.
export function splitZoneVertical(mod, node) {
  if (node.type !== "leaf") return null;
  const th = getBoardThickness();
  const { minX, maxX, minY, maxY } = node.rect;
  const midX = (minX + maxX) / 2;
  clearLeafFronts(mod, node);
  const divider = {
    id: "pion-" + Date.now() + "-" + randomSuffix(),
    typ: "pion",
    x: midX - th / 2,
    y: minY,
    w: th,
    h: maxY - minY,
  };
  mod.elements.push(divider);
  return divider;
}

function collectSubtreeElementIds(node, into) {
  if (node.type === "leaf") {
    node.fronts.forEach((f) => into.add(f.id));
  } else {
    into.add(node.divider.id);
    collectSubtreeElementIds(node.a, into);
    collectSubtreeElementIds(node.b, into);
  }
}

// Usuwa podział (dzielnik + wszystko, co powstało w obu powstałych z niego
// wnękach — fronty i zagnieżdżone dalsze podziały) i scala z powrotem w
// jedną pustą wnękę.
export function removeSplit(mod, node) {
  if (node.type !== "split") return;
  const toRemove = new Set();
  collectSubtreeElementIds(node, toRemove);
  mod.elements = mod.elements.filter((el) => !toRemove.has(el.id));
}

export function toggleStructural(node) {
  if (node.type === "split" && node.axis === "h") {
    node.divider.isStructural = !node.divider.isStructural;
  }
}

// Obsadza pustą wnękę frontem. subtype: 'drzwi' | 'drzwi-lp' | 'szuflada' | 'szuflada-wewnetrzna'.
// opts: { gap, openingSide, distribution, offsetBottom, offsetTop }
export function assignFront(mod, node, subtype, opts = {}) {
  if (node.type !== "leaf") return;
  clearLeafFronts(mod, node);

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
// x/y/w/h nadal proporcjonalnie wypełniały nowy zakres [newMin, newMax] w
// miejsce starego [oldMin, oldMax]. Fronty (baseZone) same się przeliczą
// przy najbliższym recalculateLayout() dzięki bound-referencjom (boundLeft/
// Right/Top/Bottom) — nie trzeba ich tu ręcznie ruszać.
function rescaleSubtree(node, axis, oldMin, oldMax, newMin, newMax) {
  const oldSpan = oldMax - oldMin;
  if (oldSpan <= 0 || node.type !== "split") return;
  const scale = (newMax - newMin) / oldSpan;
  const remap = (v) => newMin + (v - oldMin) * scale;

  if (axis === "x" && node.axis === "v") {
    node.divider.x = remap(node.divider.x);
  } else if (axis === "y" && node.axis === "h") {
    node.divider.y = remap(node.divider.y);
  } else if (axis === "x" && node.axis === "h") {
    // dzielnik poziomy (półka) wewnątrz kolumny, której szerokość się zmieniła
    node.divider.x = remap(node.divider.x);
    node.divider.w = node.divider.w * scale;
  } else if (axis === "y" && node.axis === "v") {
    // przegroda pionowa wewnątrz rzędu, którego wysokość się zmieniła
    node.divider.y = remap(node.divider.y);
    node.divider.h = node.divider.h * scale;
  }

  rescaleSubtree(node.a, axis, oldMin, oldMax, newMin, newMax);
  rescaleSubtree(node.b, axis, oldMin, oldMax, newMin, newMax);
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
