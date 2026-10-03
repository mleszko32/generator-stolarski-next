// src/engine/cornerParts.js
//
// Szafka narożna (mod.type === "corner_cabinet"): formatki korpusu, zawiasy drzwi,
// wiercenia i geometria do rysunków 2D - wydzielone z engine/cabinet.js.
import { state } from "../core/state.js";
import { calculateHinges } from "../core/hingeMath.js";
import { fmtMm } from "../utils/math.js";
import { recalculateLayout, getCornerDepths } from "../core/layout.js";

// Szafka narożna, kąt prosty (mod.type === 'corner_cabinet', core/
// state.js: addCornerModule) - korpus i plecy dla modułu o dwóch
// ramionach zamiast jednego prostokąta. Wieniec dolny/górny NIE liczy
// prawdziwego obrysu L (z wycięciem w rogu) - wystarcza bounding box obu
// ramion (legA×legB) jako rozmiar formatki do wycięcia (realny kawałek
// montujemy z tego blanku, docinając naroże na miejscu).
export function getCornerCorpusParts(mod, config) {
  const parts = [];
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const height = parseFloat(mod.dimensions.height) || 720;
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const battenW = 100;

  // Boki skrócone od tyłu o backThick - plecy "nakładane" (render/viewer3d.js:
  // renderCornerCabinet), tak samo jak sideDepth = depth - backThick w
  // getCorpusParts() dla zwykłego modułu. Każde ramię ma TERAZ własną
  // głębokość (depthA/depthB, core/layout.js: getCornerDepths) - zgłoszona
  // korekta, wcześniej jedna wspólna "depth" dla obu.
  //
  // Nazwa CELOWO taka sama jak "Bok (L/P)" zwykłego modułu (getCorpusParts
  // niżej) - to fizycznie ten sam, płaski prostokątny bok (bez wcięcia,
  // narożnik tnie tylko wieniec/półkę), więc przy takich samych wymiarach ma
  // się zliczyć w Menedżerze Formatek do jednej pozycji zamiast dublować się
  // pod inną nazwą (zgłoszony bug - agregacja w calculateAllProjectParts
  // niżej klucza po category+name+length+width, więc różna nazwa = różny
  // wiersz mimo identycznej formatki do wycięcia).
  parts.push({ name: "Bok (L/P)", length: parseFloat(height.toFixed(1)), width: parseFloat((depthA - backThick).toFixed(1)), qty: 1, category: "Korpus" });
  parts.push({ name: "Bok (L/P)", length: parseFloat(height.toFixed(1)), width: parseFloat((depthB - backThick).toFixed(1)), qty: 1, category: "Korpus" });

  // Wymiar Ramię A/B w konfiguratorze to CAŁY korpus (do zewnętrznej
  // krawędzi boku). Sam wieniec siedzi MIĘDZY bokami (boki przelotowe -
  // patrz getCorpusParts niżej, width - board*2 dla zwykłego modułu), więc
  // formatka wieńca jest pomniejszona o grubość boku (th) na każdym
  // ramieniu - tylko RAZ na ramię, bo drugi koniec wieńca graniczy z
  // listwą narożną/wycięciem, nie z drugim bokiem (zgłoszona korekta).
  // Dodatkowo tył cofnięty o grubość pleców (jak wieniec zwykłej szafki:
  // depth - backThick) - wymiar Ramię/Głębokość liczy się z plecami.
  const wieniecA = legA - th - backThick;
  const wieniecB = legB - th - backThick;
  const wieniecName = `Wieniec narożny ${fmtMm(wieniecA)}x${fmtMm(wieniecB)} (naroże do wycięcia - patrz rysunek 3D)`;
  parts.push({ name: wieniecName, length: parseFloat(wieniecA.toFixed(1)), width: parseFloat(wieniecB.toFixed(1)), qty: 2, category: "Korpus" });

  // Listwa narożna pionowa (render/cornerCabinet3d.js: renderCornerCabinet) - płaska
  // listwa 18(gr.)x100(szer.), do której mocują się obie płyty plecy. Stoi
  // między wieńcami (height - 2*th), nie na pełną wysokość.
  parts.push({ name: "Listwa narożna pionowa", length: parseFloat((height - th * 2).toFixed(1)), width: battenW, qty: 1, category: "Korpus" });

  // Plecy - te same zasady nakładane/nut co getBackPanelParts() zwykłego
  // modułu niżej (zgłoszona korekta, wcześniej narożnik ZAWSZE liczył jak
  // nakładane, ignorując mod.backPanel.type/grooveDepth/clearance/nutBuild).
  // Różnica: KAŻDA płyta plecy narożnika ma tylko JEDNĄ prawdziwą krawędź
  // boku (bok narożny), druga krawędź to zawsze płaska listwa narożna (nie
  // osobny bok) - listwa nie ma z czym się "wpuścić" w rowek, więc zostaje
  // płaska (nakładana) niezależnie od backPanel.type. Rowek (grooveDepth) i
  // pojedynczy luz (clearance, nie clearance*2 jak przy dwóch bokach w
  // zwykłym module) dotyczą więc tylko strony boku, nie strony listwy.
  const backP = mod.backPanel || { type: 'nakladane', grooveDepth: 6, clearance: 2, nutBuild: 'all' };
  const isNutBack = backP.type === 'nut';
  const nutBuild = backP.nutBuild || 'all';
  const grooveDepth = parseFloat(backP.grooveDepth) || 6;
  const clearance = backP.clearance !== undefined ? parseFloat(backP.clearance) : 2;
  const nutSides = isNutBack && (nutBuild === 'all' || nutBuild === 'sides');
  const nutTopBottom = isNutBack && (nutBuild === 'all' || nutBuild === 'top_bottom');

  // Wysokość (krawędzie góra/dół = prawdziwy wieniec z obu stron, tak samo
  // jak w zwykłym module) - identyczna dla obu ramion.
  const plecyLength = nutTopBottom
    ? height - (th * 2) + (grooveDepth * 2) - (clearance * 2)
    : height - 4;

  // Szerokość (jedna krawędź = bok narożny -> rowek gdy nut, druga krawędź
  // = listwa narożna -> zawsze płasko, luz -2mm jak dotąd).
  // Plecy są przybijane do listwy NA ZEWNĄTRZ (listwa stoi za plecami - patrz
  // render/viewer3d.js), więc obie płyty sięgają aż do narożnika (od
  // backThick, żeby się nie nakładały na siebie), a nie kończą przed listwą.
  const plecyWidthA = nutSides
    ? legA - th - backThick - 2 + grooveDepth - clearance
    : legA - th - backThick - 4;
  const plecyWidthB = nutSides
    ? legB - th - backThick - 2 + grooveDepth - clearance
    : legB - th - backThick - 4;

  parts.push({ name: `Plecy narożne ${fmtMm(height)}x${fmtMm(legA)} (Ramię A)`, length: parseFloat(plecyLength.toFixed(1)), width: parseFloat(plecyWidthA.toFixed(1)), qty: 1, category: "Plecy" });
  parts.push({ name: `Plecy narożne ${fmtMm(height)}x${fmtMm(legB)} (Ramię B)`, length: parseFloat(plecyLength.toFixed(1)), width: parseFloat(plecyWidthB.toFixed(1)), qty: 1, category: "Plecy" });

  // Półki narożne (typ:'poziom-narozny', ui/cornerConfigModal.js) - w realnej
  // stolarce półka w szafce narożnej jest w KSZTAŁCIE L (jak wieniec wyżej),
  // NIE dwiema niezależnymi prostymi półkami po jednej na ramię (zgłoszona
  // korekta) - dlatego to osobny typ elementu, wspólny dla obu ramion
  // (bez cornerArm), zamiast zwykłego 'poziom' z core/zoneTree.js. Ten sam
  // bounding box co wieniec (pomniejszony o grubość boku na ramię - siedzi
  // MIĘDZY bokami tak samo jak wieniec, patrz komentarz przy
  // wieniecA/wieniecB wyżej) - realny kawałek docina się z blanku na
  // miejscu, tak samo jak przy wieńcu.
  const cornerShelves = (mod.elements || []).filter(el => el.typ === 'poziom-narozny');
  if (cornerShelves.length > 0) {
    const shelfName = `Półka narożna ${fmtMm(wieniecA)}x${fmtMm(wieniecB)} (naroże do wycięcia + wycięcie ${battenW}x${Math.round(th)} na listwę, przód cofnięty o 5 mm - patrz Wykrój narożny)`;
    parts.push({ name: shelfName, length: parseFloat(wieniecA.toFixed(1)), width: parseFloat(wieniecB.toFixed(1)), qty: cornerShelves.length, category: "Korpus" });
  }

  return parts;
}

// Strona zawiasów drzwi szafki narożnej w układzie LOKALNYM frontu (x rośnie od
// narożnika w stronę zewnętrznego boku ramienia): 'left' = krawędź przy narożniku,
// 'right' = krawędź zewnętrzna (przy boku korpusu). W trybie frontu łamanego
// skrzydło przy korpusie wisi na zewnętrznej krawędzi (na boku), drugie skrzydło
// ma zawiasy 60° od strony narożnika (do pierwszego skrzydła).
export function getCornerDoorHingeSide(mod, front) {
  if (mod.cornerFrontMode === 'bifold' && front.cornerArm) {
    const primary = mod.cornerFrontOverlap?.primaryArm || 'A';
    return front.cornerArm === primary ? 'right' : 'left';
  }
  if (front.subtype === 'drzwi-lp') return front.id.includes('-L-') ? 'left' : 'right';
  return front.openingSide || 'right';
}

// Zawiasy wszystkich drzwi szafki narożnej (pozycje pod puszki i płytki).
// Zakłada aktualny layout (el.x/y/w/h) - wołający robi recalculateLayout. Zawias
// przykręcany do boku korpusu (atBok) tylko gdy leży na zewnętrznej krawędzi.
export function getCornerDoorHinges(mod) {
  recalculateLayout(mod);
  const board = parseFloat(state.project.materials?.boardThickness) || 18;
  const els = mod.elements || [];
  const cornerShelves = els.filter(el => el.typ === 'poziom-narozny');
  return els
    .filter(el => el.typ === 'front' && el.cornerArm && (el.subtype || '').includes('drzwi'))
    .map(front => {
      const side = getCornerDoorHingeSide(mod, front);
      const obstacles = els
        .filter(o => (o.typ === 'poziom' || o.subtype === 'szuflada-wewnetrzna') && o.cornerArm === front.cornerArm)
        .concat(cornerShelves);
      const bifoldSecondary = mod.cornerFrontMode === 'bifold' && side === 'left';
      return {
        front, arm: front.cornerArm, side, atBok: side === 'right',
        bifoldSecondary,
        hinges: calculateHinges(front, board, obstacles, side),
      };
    });
}

// Otwory w wieńcu narożnym w układzie formatki (0,0 = tylny róg, cofnięty o
// plecy): tak jak w zwykłej szafce łączenia z bokami są wiercone w BOKU (patrz
// getCornerShelfHoles: joints), więc w wieńcu zostają tylko dwa kołki pod
// listwę narożną (stoi końcami na wieńcu). Półka nie ma żadnych - opiera się
// na podpórkach i ma wycięcie na listwę.
export function getCornerWieniecHoles(mod, config = state.project) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  return [20, 80].map(x => ({ x, y: th / 2, type: 'dowel', side: 'batten' }));
}

// Wymiary formatek wieńca i półki narożnej w układzie rysunku (0,0 = tylny
// róg): blank pomniejszony o grubość boku, przód półki cofnięty o 5 mm, a
// wycięcie na listwę tylko w półce - te same liczby co w getCornerCorpusParts
// i render/cornerCabinet3d.js: renderCornerCabinet.
export function getCornerPartsGeometry(mod, config = state.project) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const shelfCount = (mod.elements || []).filter(el => el.typ === 'poziom-narozny').length;
  return {
    th, backThick, legA, legB, depthA, depthB, shelfCount,
    wieniec: { blankA: legA - th - backThick, blankB: legB - th - backThick, depthA: depthA - backThick, depthB: depthB - backThick },
    polka: { blankA: legA - th - backThick, blankB: legB - th - backThick, depthA: depthA - backThick - 5, depthB: depthB - backThick - 5, notch: { w: 100, h: th } },
  };
}

// Nawierty pod podpórki półek narożnych (System 32, jak półka ruchoma w
// core/shelfMath.js: calculateShelfHoles) - półka L opiera się na OBU bokach
// (bok ramienia A i bok ramienia B), więc każdy z nich dostaje dwa rzędy
// (37 mm od przodu i od tyłu) po 3 otwory na każdą półkę. Zwraca opis obu
// boków w układzie rysunku: x = odległość od tylnej krawędzi boku, y = od dołu.
export function getCornerShelfHoles(mod, config = state.project) {
  const shelves = (mod.elements || []).filter(el => el.typ === 'poziom-narozny');
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const height = parseFloat(mod.dimensions.height) || 720;
  const { depthA, depthB } = getCornerDepths(mod);
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const battenW = 100;
  const pinR = 2.5;

  // bottom: wysokość dolnej krawędzi elementu nad dołem korpusu (listwa stoi
  // między wieńcami, więc th). Wysokości otworów są zawsze liczone od dołu
  // KORPUSU, dzięki czemu otwory listwy zgrywają się z otworami boków.
  const build = (name, sideDepth, xs, h, bottom, withJoints = false) => {
    const holes = [];
    shelves.forEach(sh => {
      const yBase = (parseFloat(sh.y) || 0) - pinR;
      xs.forEach(x => {
        [-32, 0, 32].forEach(dy => {
          holes.push({ x, y: yBase + dy, isCenter: dy === 0 });
        });
      });
    });
    // Łączenia z wieńcem dolnym i górnym (jak getCorpusHoles zwykłego
    // modułu): wkręt 37 mm od przodu/tyłu, kołek 32 mm dalej, w połowie
    // grubości wieńca. Listwa nie ma ich na płaszczyźnie (idą w jej krawędź).
    const joints = [];
    if (withJoints) {
      [th / 2, height - th / 2].forEach(y => {
        joints.push({ x: 37, y, type: 'screw' }, { x: 37 + 32, y, type: 'dowel' });
        joints.push({ x: sideDepth - 37, y, type: 'screw' }, { x: sideDepth - 37 - 32, y, type: 'dowel' });
      });
    }
    return { name, depth: sideDepth, height: h, bottom, holes, joints, hingePlates: [] };
  };

  const sideA = depthA - backThick;
  const sideB = depthB - backThick;
  const sides = [
    build('Bok ramienia A', sideA, [37, sideA - 37], height, 0, true),
    build('Bok ramienia B', sideB, [37, sideB - 37], height, 0, true),
    // Półka ma wycięcie na listwę, więc opiera się też na podpórkach w
    // listwie (dwa pionowe rzędy 20 mm od jej krawędzi).
    build('Listwa narożna', battenW, [20, battenW - 20], height - th * 2, th),
  ];
  // Płytki zawiasów drzwi wiszących na zewnętrznej krawędzi ramienia: dwa otwory
  // (co 32 mm wokół wysokości zawiasu y, 37 mm od przodu boku), na boku tego ramienia.
  getCornerDoorHinges(mod).filter(d => d.atBok).forEach(d => {
    const side = sides[d.arm === 'A' ? 0 : 1];
    d.hinges.forEach(h => side.hingePlates.push({ x: 37, y: h.y }));
  });
  return sides;
}
