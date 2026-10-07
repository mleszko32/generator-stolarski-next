// src/engine/carcaseParts.js
//
// Formatki i wiercenia korpusu prostokątnej szafki (boki, wieńce, trawersy, plecy) -
// wydzielone z engine/cabinet.js. Używane też przez engine/cornerParts.js.
import { getTraverseConfig } from "../core/layout.js";

// Zestawy łączników korpusu (wkręt + kołek) na połączeniu o długości `depth` (wieniec / półka
// stała / przegroda z bokiem): skrajne - wkręt 37 mm od przodu i od tyłu, kołek 32 mm dalej w
// głąb (System 32); gdy odstęp między skrajnymi wkrętami przekracza maks. rozstaw (domyślnie
// 250 mm, construction.jointSpacing), dochodzą zestawy środkowe - rozłożone równo i dociągnięte
// do rastra 32 mm liczonego od przedniego wkrętu (siatka wiertarki wielowrzecionowej).
// Bardzo płytki element - jeden zestaw. Zwraca [{ screw, dowel }] (mm od przodu), od przodu.
export const DEFAULT_JOINT_SPACING = 250;
export function jointSetPositions(depth, maxSpacing = DEFAULT_JOINT_SPACING) {
  const D = parseFloat(depth) || 0;
  const max = Math.max(64, parseFloat(maxSpacing) || DEFAULT_JOINT_SPACING);
  const front = 37, rear = D - 37;
  if (rear - front < 64) return [{ screw: front, dowel: front + 32 }];
  const sets = [{ screw: front, dowel: front + 32 }];
  const mid = Math.max(0, Math.ceil((rear - front) / max) - 1);
  for (let i = 1; i <= mid; i++) {
    const ideal = front + ((rear - front) * i) / (mid + 1);
    const screw = front + Math.round((ideal - front) / 32) * 32;
    sets.push({ screw, dowel: screw + 32 });
  }
  sets.push({ screw: rear, dowel: rear - 32 });
  return sets;
}
export const jointSpacingOf = (mod, config) => {
  const cons = { ...((config && config.construction) || {}), ...((mod && mod.construction) || {}) };
  return parseFloat(cons.jointSpacing) || DEFAULT_JOINT_SPACING;
};

export function getCorpusHoles(mod, config) {
  const { height, depth } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const trav = getTraverseConfig(cons);

  const holes = [];
  const sets = jointSetPositions(depth, jointSpacingOf(mod, config));
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
          holes.push({ y: height - 37, xFromFront: depth - th / 2, holeType: 'screw' });
          holes.push({ y: height - 69, xFromFront: depth - th / 2, holeType: 'dowel' });
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
  const backThick = config.materials.backThickness || 3;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
  const topBottomDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;

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
    jointSetPositions(topBottomDepth, jointSpacingOf(mod, config)).forEach((set) => {
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
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };

  const construction = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = construction.joinType === 'wience_przelotowe';

  const sideDepth = backP.type === 'nut' ? depth : depth - backThick;
  const sideHeight = isTopBottomFullWidth ? height - (board * 2) : height;
  parts.push({ name: "Bok (L/P)", length: parseFloat(sideHeight.toFixed(1)), width: sideDepth, qty: 2, category: "Korpus" });

  const tbDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;
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

  const structuralShelvesCount = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' && el.isStructural).length : 0;
  if (structuralShelvesCount > 0) {
    const shelfWidth = width - (board * 2);
    parts.push({ name: `W${width}`, length: parseFloat(shelfWidth.toFixed(1)), width: tbDepth, qty: structuralShelvesCount, category: "Korpus" });
  }

  return parts;
}

export function getBackPanelParts(mod, config) {
  const { width, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backP = mod.backPanel || { type: 'nakladane', grooveDepth: 6, clearance: 2, nutBuild: 'all' };

  let hdfWidth, hdfHeight;
  const totalClearance = backP.clearance !== undefined ? backP.clearance * 2 : 4;
  const currentNutBuild = backP.nutBuild || 'all';

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
