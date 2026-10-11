// src/engine/carcaseParts.js
//
// Formatki i wiercenia korpusu prostokątnej szafki (boki, wieńce, trawersy, plecy) -
// wydzielone z engine/cabinet.js. Używane też przez engine/cornerParts.js.
import { getTraverseConfig } from "../core/layout.js";
import { resolveBackPanel, corpusInnerDepth } from "../core/backPanel.js";
import { rcRearOverride, rcMidGrid } from "../core/rcSystem.js";

// Zestawy łączników korpusu (wkręt + kołek) na połączeniu o długości `depth` (wieniec / półka
// stała / przegroda z bokiem): skrajne - wkręt 37 mm od przodu i od tyłu, kołek 32 mm dalej w
// głąb (System 32); gdy odstęp między skrajnymi wkrętami przekracza maks. rozstaw (domyślnie
// 250 mm, construction.jointSpacing), dochodzą zestawy środkowe - rozłożone równo i dociągnięte
// do rastra 32 mm liczonego od przedniego wkrętu (siatka wiertarki wielowrzecionowej).
// Bardzo płytki element - jeden zestaw. Zwraca [{ screw, dowel }] (mm od przodu), od przodu.
export const DEFAULT_JOINT_SPACING = 250;
// rearScrew - położenie tylnego wkrętu narzucone przez stół RC System (core/rcSystem.js:
// tylna wiertarka na pinie szyny co 16 mm); bez niego tylny wkręt 37 mm od tyłu.
// midGrid - { origin, step }: środkowe zestawy wiercone tylną wiertarką przesuniętą do przodu i
// zablokowaną pinem (warsztat) - wkręt na siatce origin + k·step, kołek 32 mm bliżej przodu
// (to samo ułożenie wrzecion co w tylnym zestawie). Bez niego raster 32 mm od przedniego wkrętu.
export function jointSetPositions(depth, maxSpacing = DEFAULT_JOINT_SPACING, rearScrew = null, midGrid = null) {
  const D = parseFloat(depth) || 0;
  const max = Math.max(64, parseFloat(maxSpacing) || DEFAULT_JOINT_SPACING);
  const front = 37;
  const rr = parseFloat(rearScrew);
  // Na pinie szyny tylny otwór może wypaść bliżej tyłu niż 37 mm (29…45, core/rcSystem.js).
  const rear = Number.isFinite(rr) && rr > front + 32 && rr <= D - 20 ? rr : D - 37;
  if (rear - front < 64) return [{ screw: front, dowel: front + 32 }];
  const sets = [{ screw: front, dowel: front + 32 }];
  const mid = Math.max(0, Math.ceil((rear - front) / max) - 1);
  const step = midGrid && parseFloat(midGrid.step);
  const origin = midGrid && parseFloat(midGrid.origin);
  for (let i = 1; i <= mid; i++) {
    const ideal = front + ((rear - front) * i) / (mid + 1);
    if (step > 0 && Number.isFinite(origin)) {
      // Środek pary w miejscu idealnym: wkręt (tylne wrzeciono) ok. ideal + 16.
      let screw = origin + Math.round((ideal + 16 - origin) / step) * step;
      // Nie nachodzić na przedni (kołek 69) ani tylny zestaw (kołek rear - 32).
      while (screw - 32 < front + 32 + step && screw + step <= rear - 32) screw += step;
      while (screw > rear - 32 - step && screw - step - 32 >= front + 32) screw -= step;
      sets.push({ screw, dowel: screw - 32 });
    } else {
      const screw = front + Math.round((ideal - front) / 32) * 32;
      sets.push({ screw, dowel: screw + 32 });
    }
  }
  sets.push({ screw: rear, dowel: rear - 32 });
  return sets;
}
// Zestawy dla formatki o głębokości depth w danej szafce (rozstaw z konstrukcji, tylny
// otwór wg stołu RC System, jeśli włączony i skalibrowany / na zderzaku).
export const jointSetsFor = (mod, config, depth) => jointSetPositions(depth, jointSpacingOf(mod, config), rcRearOverride(depth, config), rcMidGrid(config));
// Głębokość połączenia wieniec / półka stała z bokiem = głębokość wieńca (bez pleców, przy
// plecach w nucie także bez odsunięcia nutu). Od niej liczą się zestawy łączników - tylny
// zestaw 37 mm od tyłu WIEŃCA, a nie od tyłu szafki (wcześniej od głębokości szafki: przy
// plecach nakładanych wypadał 34 mm od tyłu boku, przy nucie 14 mm od końca wieńca).
export function jointDepthOf(mod, config) {
  return corpusInnerDepth(mod, config, parseFloat(mod.dimensions.depth) || 0);
}

export const jointSpacingOf = (mod, config) => {
  const cons = { ...((config && config.construction) || {}), ...((mod && mod.construction) || {}) };
  return parseFloat(cons.jointSpacing) || DEFAULT_JOINT_SPACING;
};

export function getCorpusHoles(mod, config) {
  const { height } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const trav = getTraverseConfig(cons);

  const holes = [];
  const jointDepth = jointDepthOf(mod, config);
  const sets = jointSetsFor(mod, config, jointDepth);
  const frontSet = sets[0], rearSet = sets[sets.length - 1];

  const addSet = (y, set) => {
     holes.push({ y: y, xFromFront: set.screw, holeType: 'screw' });
     holes.push({ y: y, xFromFront: set.dowel, holeType: 'dowel' });
  };
  // Pełny wieniec: wszystkie zestawy; trawers poziomy: tylko jego skrajny zestaw.
  const addJoint = (y) => sets.forEach((set) => addSet(y, set));

  if (cons.joinType === 'boki_przelotowe') {
     const bottomY = th / 2;
     addJoint(bottomY);

     const topY = height - th / 2;
     if (cons.topType === 'pelny') {
        addJoint(topY);
     } else if (cons.topType === 'trawersy_poziom') {
        if (trav.front.active) addSet(topY, frontSet);
        if (trav.rear.active) addSet(topY, rearSet);
     } else if (cons.topType === 'trawersy_pion') {
        if (trav.front.active) {
          holes.push({ y: height - 37, xFromFront: th / 2, holeType: 'screw' });
          holes.push({ y: height - 69, xFromFront: th / 2, holeType: 'dowel' });
        }
        if (trav.rear.active) {
          holes.push({ y: height - 37, xFromFront: jointDepth - th / 2, holeType: 'screw' });
          holes.push({ y: height - 69, xFromFront: jointDepth - th / 2, holeType: 'dowel' });
        }
     }
  } else {
     const bottomY = 0;
     const topY = height;
     addJoint(bottomY);

     if (cons.topType === 'pelny') {
        addJoint(topY);
     } else if (cons.topType === 'trawersy_poziom') {
        if (trav.front.active) addSet(topY, frontSet);
        if (trav.rear.active) addSet(topY, rearSet);
     }
  }

  return holes.length > 0 ? [{ type: 'corpus', holes: holes }] : [];
}

// Nawierty kołek+wkręt mocujące przegrodę pionową (isStructural, patrz
// core/zoneTree.js: toggleStructural) do wieńca albo półki NAD i POD nią -
// jeden wpis mountingData PER PANEL (wieniec dolny/górny albo konkretna
// półka), żeby render/viewer2d.js mógł narysować osobny rzut z góry tej
// płyty z zaznaczonymi nawiertami (analogicznie do getCorpusHoles wyżej,
// tylko że tam otwory są na BOKU, tu na WIEŃCU/PÓŁCE - stąd inna płaszczyzna:
// X wzdłuż szerokości korpusu, Z wzdłuż głębokości).
export function getPionMountHoles(mod, config) {
  const { width, height, depth } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const topBottomDepth = corpusInnerDepth(mod, config, parseFloat(depth) || 0);

  const piony = (mod.elements || []).filter(el => el.typ === 'pion' && el.isStructural);
  if (piony.length === 0) return [];

  const poziomy = (mod.elements || []).filter(el => el.typ === 'poziom');
  const EPS = 2;

  // Ta sama formuła co core/zoneTree.js: getCabinetInnerRect (topY światła
  // korpusu) - zduplikowana tu specjalnie, żeby nie wiązać silnika formatek
  // z modułem edytora wnętrza (zoneTree.js) tylko dla jednej stałej.
  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const hasTraverses = cons.topType.includes('trawersy');
  const isVerticalTraverse = cons.topType === 'trawersy_pion';
  const topInnerY = hasTraverses && isVerticalTraverse ? height - (parseFloat(cons.traverseWidth) || 100) : height - th;

  const cons2 = { joinType: 'boki_przelotowe', ...(config.construction || {}), ...(mod.construction || {}) };
  const wieniecWidth = cons2.joinType === 'wience_przelotowe' ? width : width - th * 2;
  // Wieniec pełen (wience_przelotowe) zaczyna się od X=0 korpusu, wieniec
  // "wpuszczony" między boki - dopiero od X=th - potrzebne, żeby przeliczyć
  // bezwzględny X pionu (mod.elements, 0 = lewy bok) na X WZGLĘDEM lewej
  // krawędzi TEGO KONKRETNEGO panelu (tak, jak go narysujemy w viewer2d.js).
  const wieniecOffsetX = cons2.joinType === 'wience_przelotowe' ? 0 : th;

  const byPanel = {};
  const addHoles = (panelKey, panelLabel, panelWidth, panelOffsetX, pionCenterX) => {
    if (!byPanel[panelKey]) byPanel[panelKey] = { type: 'wieniec-mount', panelKey, panelLabel, panelWidth, panelDepth: topBottomDepth, holes: [] };
    const x = pionCenterX - panelOffsetX;
    jointSetsFor(mod, config, topBottomDepth).forEach((set) => {
      byPanel[panelKey].holes.push(
        { x, zFromFront: topBottomDepth - set.screw, holeType: 'screw' },
        { x, zFromFront: topBottomDepth - set.dowel, holeType: 'dowel' }
      );
    });
  };

  piony.forEach(p => {
    const centerX = p.x + p.w / 2;

    if (Math.abs(p.y - th) < EPS) {
      addHoles('wieniec-dolny', 'Wieniec dolny', wieniecWidth, wieniecOffsetX, centerX);
    } else {
      const below = poziomy.find(s => Math.abs((s.y + s.h) - p.y) < EPS);
      if (below) addHoles(`polka-${below.id}-gora`, 'Półka (spód przegrody)', below.w, below.x, centerX);
    }

    if (Math.abs((p.y + p.h) - topInnerY) < EPS) {
      addHoles('wieniec-gorny', 'Wieniec górny', wieniecWidth, wieniecOffsetX, centerX);
    } else {
      const above = poziomy.find(s => Math.abs(s.y - (p.y + p.h)) < EPS);
      if (above) addHoles(`polka-${above.id}-dol`, 'Półka (wierzch przegrody)', above.w, above.x, centerX);
    }
  });

  return Object.values(byPanel);
}

export function getCorpusParts(mod, config) {
  const parts = [];
  const { width, height, depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const backP = resolveBackPanel(mod, config);

  const construction = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = construction.joinType === 'wience_przelotowe';

  const sideDepth = backP.type === 'nut' ? depth : depth - backThick;
  const sideHeight = isTopBottomFullWidth ? height - (board * 2) : height;
  parts.push({ name: "Bok (L/P)", length: parseFloat(sideHeight.toFixed(1)), width: sideDepth, qty: 2, category: "Korpus" });

  const tbDepth = corpusInnerDepth(mod, config, parseFloat(depth) || 0);
  const tbWidth = isTopBottomFullWidth ? width : width - (board * 2);

  parts.push({ name: `W${width}`, length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1, category: "Korpus" });

  if (construction.topType === 'pelny') {
    parts.push({ name: `W${width}`, length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1, category: "Korpus" });
  } else if (construction.topType.includes('trawersy')) {
    const isVertical = construction.topType === 'trawersy_pion';
    const trav = getTraverseConfig(construction);
    const trName = `Trawers górny (${isVertical ? 'pionowy' : 'poziomy'})`;
    // Osobne wpisy dla przedniego/tylnego (patrz ui/properties.js, zakładka Konstrukcja) —
    // gdy oba aktywne i tej samej szerokości, agregacja w calculateParts() i tak scali je
    // w jedną pozycję qty:2, tak jak dotychczas.
    if (trav.front.active) parts.push({ name: trName, length: parseFloat(tbWidth.toFixed(1)), width: trav.front.width, qty: 1, category: "Korpus" });
    if (trav.rear.active) parts.push({ name: trName, length: parseFloat(tbWidth.toFixed(1)), width: trav.rear.width, qty: 1, category: "Korpus" });
  }

  // Półka stała ma długość swojej wnęki (el.w) - w kolumnie za przegrodą jest węższa niż
  // korpus (tak samo instrukcje montażu, engine/cabinetDrillings.js). Jednakowe półki - jedna pozycja.
  const shelfQty = new Map();
  (mod.elements || []).filter(el => el.typ === 'poziom' && el.isStructural).forEach(el => {
    const len = parseFloat((parseFloat(el.w) || (width - (board * 2))).toFixed(1));
    shelfQty.set(len, (shelfQty.get(len) || 0) + 1);
  });
  shelfQty.forEach((qty, len) => parts.push({ name: `W${width}`, length: len, width: tbDepth, qty, category: "Korpus" }));

  return parts;
}

export function getBackPanelParts(mod, config) {
  const { width, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backP = resolveBackPanel(mod, config);

  let hdfWidth, hdfHeight;
  const totalClearance = backP.clearance * 2;
  const currentNutBuild = backP.nutBuild;

  if (backP.type === 'nut') {
    hdfWidth = (currentNutBuild === 'all' || currentNutBuild === 'sides')
      ? width - (board * 2) + (backP.grooveDepth * 2) - totalClearance : width - 4;
    hdfHeight = (currentNutBuild === 'all' || currentNutBuild === 'top_bottom')
      ? height - (board * 2) + (backP.grooveDepth * 2) - totalClearance : height - 4;
  } else {
    hdfWidth = width - 4; hdfHeight = height - 4;
  }

  return [{ name: `Plecy ${height}x${width}`, length: parseFloat(hdfHeight.toFixed(1)), width: parseFloat(hdfWidth.toFixed(1)), qty: 1, category: "Plecy" }];
}
