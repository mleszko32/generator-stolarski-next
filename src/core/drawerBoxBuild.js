// src/core/drawerBoxBuild.js
//
// Skrzynki szuflad drewnianych (Blum MOVENTO, woodenBox) do rysunków warsztatowych:
// zbiera wszystkie skrzynki projektu (zwykłe szafki i szafka pod skos, też skrzynka B),
// scala identyczne w jedną pozycję z liczbą sztuk i dla każdej formatki (boki, dno,
// tył, czoło wewnętrzne) liczy otwory: łączniki skrzynki wg wybranego sposobu i otwory
// pod zaczep tylny prowadnicy. Czysta logika bez DOM - rysuje render/drawerBoxDrawing2d.js.
//
// Konstrukcja jak w core/drawerMath.js (getDrawerComponents, wariant Blum "bez wycięcia
// w tyle"): boki na całą długość SKL, dno MIĘDZY bokami na całą długość, podniesione
// o wcięcie (bottomRecess), tył i czoło wewnętrzne między bokami, stoją na dnie, górą
// równo z bokami. Grubość dna, tyłu i czoła = grubość boku.
//
// ŹRÓDŁA:
// - Zaczep tylny prowadnicy: Blum TD-132/1 EN 06.22 (MOVENTO 760H/766H) str. 5 "Drawer
//   assembly" i Blum Inc. LIT.MOV1000.10.19 str. 7 "Drawer Preparation": otwór Ø6, gł. 10,
//   7 mm od wewnętrznej powierzchni boku, 11 mm nad spodem elementu, w który się wierci
//   (przy wariancie z wycięciem - nad dnem wycięcia w tyle). W wariancie bez wycięcia
//   (krótszy tył na dnie, dno do końca) zaczep trafia w tylną krawędź dna - ta adaptacja
//   to wniosek z rysunku, Blum jej nie wymiaruje.
// - Sprzęgła T51.7601: wkręty pod kątem 75°, otwory Ø2,5 × 10, położenie z szablonu
//   T65.1000.02 - Blum nie podaje współrzędnych, więc tu tylko uwaga, bez otworów.
// - Łączniki (kołek 8×30, wkręt 4×50, konfirmat 7×50): poradniki stolarskie (woodweb,
//   kabus.pl, phu-gral.eu), nie katalog - dlatego odstępy są ustawieniami projektu.
import { getDrawerBoxInfo } from "./drawerBoxes.js";
import { getSlopeFronts } from "./slopeCabinet.js";
import { recalculateLayout } from "./layout.js";
import { drawerSystems } from "./drawerSystems.js";
import { num, round1 } from "../utils/math.js";

export const JOIN_METHODS = {
  kolek_wkret: "Kołek + wkręt",
  konfirmat: "Konfirmat",
  kolki: "Kołki + klej",
  wkrety: "Wkręty + klej",
};

const DEFAULTS = {
  join: "kolek_wkret",
  edge: 25,          // oś skrajnego łącznika tyłu/czoła od górnej i dolnej krawędzi [mm]
  bottomEdge: 50,    // oś skrajnego łącznika dna od przodu i tyłu [mm]
  bottomSpacing: 150, // maks. rozstaw łączników dna [mm]
  screwLength: 50,   // wkręt / konfirmat [mm]
  dowelLength: 30,   // kołek Ø8 [mm]
};

export function getDrawerBoxSettings(project) {
  const s = { ...DEFAULTS, ...((project && project.drawerBox) || {}) };
  if (!JOIN_METHODS[s.join]) s.join = DEFAULTS.join;
  return s;
}

// Rodzaje otworów: d - średnica, depth - głębokość (null = przelotowy), face - gdzie
// ('plaszczyzna' boku albo 'czolo' = krawędź formatki).
export function holeSpecs(settings, t) {
  const sl = num(settings.screwLength, 50), dl = num(settings.dowelLength, 30);
  const sideDowel = Math.min(12, Math.max(8, t - 5));     // kołek w płaszczyźnie boku, nie przewierca
  return {
    wkret: { side: { d: 4.5, depth: null, note: "przelot + pogłębienie" }, edge: { d: 3, depth: round1(sl - t + 2) }, label: `wkręt 4×${sl}` },
    konfirmat: { side: { d: 7, depth: null, note: "przelot, pogłębienie Ø10" }, edge: { d: 5, depth: round1(sl - t + 2) }, label: `konfirmat 7×${sl}` },
    kolek: { side: { d: 8, depth: sideDowel }, edge: { d: 8, depth: round1(dl - sideDowel + 1) }, label: `kołek 8×${dl}` },
    zaczep: { edge: { d: 6, depth: 10 }, label: "zaczep tylny prowadnicy (Blum)" },
  };
}

// Liczba łączników na wysokości h (propozycja, bez źródła - patrz nagłówek).
export function jointCount(h) {
  if (h <= 80) return 1;
  if (h <= 160) return 2;
  if (h <= 250) return 3;
  return 3 + Math.ceil((h - 250) / 100);
}

// Rodzaj kolejnego łącznika: kołek + wkręt na przemian (zaczyna wkręt), reszta jednolicie.
function kindsFor(join, n) {
  const one = { konfirmat: "konfirmat", kolki: "kolek", wkrety: "wkret" }[join];
  if (one) return Array(n).fill(one);
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "wkret" : "kolek"));
}

// Pozycje łączników na odcinku 0..h: jeden na środku albo równo od edge do h - edge.
export function jointPositions(h, edge, n) {
  if (n <= 1) return [round1(h / 2)];
  const e = Math.min(edge, h / (2 * n));
  return Array.from({ length: n }, (_, i) => round1(e + (h - 2 * e) * i / (n - 1)));
}

function jointsOn(h, settings) {
  const n = settings.join === "kolek_wkret" ? Math.max(2, jointCount(h)) : jointCount(h);
  const kinds = kindsFor(settings.join, n);
  return jointPositions(h, settings.edge, n).map((p, i) => ({ p, kind: kinds[i] }));
}

function bottomJoints(L, settings) {
  const e = Math.min(settings.bottomEdge, L / 4);
  const n = Math.max(2, Math.ceil((L - 2 * e) / Math.max(50, settings.bottomSpacing)) + 1);
  const kinds = kindsFor(settings.join, n);
  return Array.from({ length: n }, (_, i) => ({ p: round1(e + (L - 2 * e) * i / (n - 1)), kind: kinds[i] }));
}

// Jedna skrzynka z jej formatkami i otworami.
// raw = { comps, system, isB, box? (skrzynka B z core/slopeCabinet.js) }.
export function buildDrawerBox(raw, settings) {
  const { comps: c, system } = raw;
  const t = num(system.sideThickness, 16);
  const r = num(system.bottomRecess, 13);
  const L = num(c.sides.length);
  const w = num(c.bottom.width);
  const spec = holeSpecs(settings, t);
  const B = raw.isB ? raw.box : null;

  // Tył i czoło: obrys (prostokąt albo kształt skrzynki B) i wysokości przy obu bokach.
  const backPts = B ? B.backPoints.map(([x, y]) => [round1(x), round1(y)]) : [[0, 0], [w, 0], [w, num(c.back.height)], [0, num(c.back.height)]];
  const hLeft = B ? round1(B.backLow) : num(c.back.height);
  const hRight = B ? round1(backPts[2][1]) : num(c.back.height);
  const sideLeftH = B ? B.sideLow : c.sideHeight;     // lewy = niski w skrzynce B
  const sideRightH = B ? B.sideHigh : c.sideHeight;

  const jLeft = jointsOn(hLeft, settings), jRight = jointsOn(hRight, settings);
  const jBottom = bottomJoints(L, settings);
  const yOnSide = (p) => round1(r + t + p);          // wys. łącznika tyłu/czoła na boku

  // Bok widziany od wewnątrz skrzynki, x od przodu (0) do tyłu (L), y od dołu boku.
  const sideHoles = (joints) => [
    ...joints.map((j) => ({ x: round1(t / 2), y: yOnSide(j.p), kind: j.kind, ...spec[j.kind].side, to: "czoło wewn." })),
    ...joints.map((j) => ({ x: round1(L - t / 2), y: yOnSide(j.p), kind: j.kind, ...spec[j.kind].side, to: "tył" })),
    ...jBottom.map((j) => ({ x: j.p, y: round1(r + t / 2), kind: j.kind, ...spec[j.kind].side, to: "dno" })),
  ];
  // Tył/czoło: otwory w czołach (lewe x = 0, prawe x = w), y od spodu formatki.
  const endHoles = (joinsL, joinsR) => [
    ...joinsL.map((j) => ({ edge: "lewe", x: 0, y: j.p, kind: j.kind, ...spec[j.kind].edge })),
    ...joinsR.map((j) => ({ edge: "prawe", x: w, y: j.p, kind: j.kind, ...spec[j.kind].edge })),
  ];
  // Dno (rzut z góry): x w poprzek (0 = lewy bok), z od przodu (0) do tyłu (L).
  const bottomHoles = [
    ...jBottom.map((j) => ({ edge: "lewe", x: 0, z: j.p, y: round1(t / 2), kind: j.kind, ...spec[j.kind].edge })),
    ...jBottom.map((j) => ({ edge: "prawe", x: w, z: j.p, y: round1(t / 2), kind: j.kind, ...spec[j.kind].edge })),
    ...[7, round1(w - 7)].map((x) => ({ edge: "tylne", x, z: L, y: 11, kind: "zaczep", ...spec.zaczep.edge })),
  ];

  const sides = B
    ? [
        { id: "bok-niski", name: "Bok niski", qty: 1, length: L, width: sideLeftH, holes: sideHoles(jLeft) },
        { id: "bok-wysoki", name: "Bok wysoki", qty: 1, length: L, width: sideRightH, holes: sideHoles(jRight) },
      ]
    : [{ id: "bok", name: "Bok (lewy i prawy, lustrzanie)", qty: 2, length: L, width: sideLeftH, holes: sideHoles(jLeft) }];
  const panels = [
    ...sides.map((p) => ({ ...p, kind: "bok", thickness: t })),
    { id: "dno", kind: "dno", name: "Dno", qty: 1, length: L, width: w, thickness: t, holes: bottomHoles },
    { id: "tyl", kind: "plyta", name: "Tył", qty: 1, length: w, width: Math.max(hLeft, hRight, ...backPts.map((q) => q[1])), thickness: t, points: backPts, holes: endHoles(jLeft, jRight) },
    { id: "czolo", kind: "plyta", name: "Czoło wewnętrzne", qty: 1, length: w, width: Math.max(hLeft, hRight, ...backPts.map((q) => q[1])), thickness: t, points: backPts, holes: endHoles(jLeft, jRight) },
  ];

  const tag = B
    ? `NL${c.nominalLength} H${B.sideLow}-${B.sideHigh}`
    : `NL${c.nominalLength} H${c.sideHeight}`;
  return {
    name: `Skrzynka ${tag} (SKW ${round1(w)})${B ? ", ścięta pod skos" : ""}`,
    system: c.systemName, nl: c.nominalLength,
    lw: round1(w + num(system.innerWidthDeduct, 42)), skw: round1(w), skl: round1(L),
    t, recess: r, isB: !!B, join: settings.join, panels,
  };
}

// Klucz tożsamości skrzynki - identyczne formatki i otwory = ta sama skrzynka.
function boxKey(box) {
  return JSON.stringify(box.panels.map((p) => [p.id, p.length, p.width, p.points || null, p.holes.map((h) => [h.x, h.y, h.z ?? null, h.kind])]));
}

// Surowe skrzynki drewniane modułu: [{ comps, system, isB, box }].
function rawBoxesOf(mod, project) {
  if (mod.type === "corner_cabinet") return [];
  if (mod.type === "slope_cabinet") {
    recalculateLayout(mod);
    const f = { ...(project.front || {}), ...(mod.front || {}) };
    const system = drawerSystems[String(f.drawerSystem || "merivobox").toLowerCase()];
    if (!system || !system.woodenBox) return [];
    return getSlopeFronts(mod, project)
      .filter((fr) => fr.type === "szuflada" && fr.drawer && fr.drawer.comps && fr.drawer.comps.woodenBox && fr.drawer.fits !== false)
      .map((fr) => ({ comps: fr.drawer.comps, system, isB: fr.drawer.boxType === "B", box: fr.drawer.box }));
  }
  recalculateLayout(mod);
  return (mod.elements || [])
    .filter((el) => el.typ === "front" && (el.subtype || "").includes("szuflada"))
    .map((el) => getDrawerBoxInfo(mod, el, project))
    .filter((info) => info && info.comps.woodenBox && info.comps.fits !== false)
    .map((info) => ({ comps: info.comps, system: drawerSystems[info.system], isB: false }));
}

// Wszystkie skrzynki drewniane projektu, identyczne scalone: [{ ...box, qty, modules[] }].
export function collectDrawerBoxes(project) {
  const settings = getDrawerBoxSettings(project);
  const map = new Map();
  (project.modules || []).forEach((mod) => {
    rawBoxesOf(mod, project).forEach((raw) => {
      const box = buildDrawerBox(raw, settings);
      const key = boxKey(box);
      if (!map.has(key)) map.set(key, { ...box, qty: 0, modules: [] });
      const e = map.get(key);
      e.qty += 1;
      if (!e.modules.includes(mod.name)) e.modules.push(mod.name);
    });
  });
  return [...map.values()];
}
