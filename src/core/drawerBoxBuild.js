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
// - Lamello P-System (frezarka Zeta P2): rowek frezem Ø100,4 × 7 mm, głębokość 10 (P-10)
//   albo 14 (P-14) w obu łączonych formatkach, oś rowka w połowie grubości płyty; długość
//   rowka na powierzchni wg pomiarów z warsztatu ≈75 mm (P-14) / ≈60 mm (P-10), patrz lamelloGrooveLen;
//   rozstaw maks. 300 mm, oś min. 32 (P-10) / 37 (P-14) mm od końca formatki (warsztatowo
//   60 mm - ustawienie lamelloEdge); Clamex:
//   otwór Ø6 na klucz od lica formatki z rowkiem w czole, oś 5,5 (P-10) / 7,5 (P-14) mm od
//   krawędzi. Min. grubości (płaszczyzna / krawędź). Źródła: Lamello - karta Clamex P-14
//   (Bedienungsanleitung_Clamex_P14.pdf), broszura P-System EN, opis makra Biesse P-System;
//   grubości z kart produktów dystrybutorów (dane Lamello).
import { getDrawerBoxInfo } from "./drawerBoxes.js";
import { getSlopeFronts, getSlopeGeometry } from "./slopeCabinet.js";
import { recalculateLayout } from "./layout.js";
import { drawerSystems } from "./drawerSystems.js";
import { num, round1 } from "../utils/math.js";

export const JOIN_METHODS = {
  kolek_wkret: "Kołek + wkręt",
  konfirmat: "Konfirmat",
  kolki: "Kołki + klej",
  wkrety: "Wkręty + klej",
  tenso_p10: "Lamello Tenso P-10 (na klej, niewidoczne)",
  tenso_p14: "Lamello Tenso P-14 (na klej, niewidoczne)",
  clamex_p10: "Lamello Clamex P-10 (rozbieralne)",
  clamex_p14: "Lamello Clamex P-14 (rozbieralne)",
};

// Łączniki Lamello P (patrz ŹRÓDŁA wyżej). minFace / minEdge - min. grubość płyty z rowkiem
// w płaszczyźnie / w krawędzi.
export const LAMELLO = {
  tenso_p10: { name: "Tenso P-10", depth: 10, groove: 60, endMin: 32, minFace: 9, minEdge: 12, clamex: false },
  tenso_p14: { name: "Tenso P-14", depth: 14, groove: 75, endMin: 37, minFace: 11, minEdge: 12, clamex: false },
  clamex_p10: { name: "Clamex P-10", depth: 10, groove: 60, endMin: 32, minFace: 11, minEdge: 12, clamex: true, keyFromEdge: 5.5 },
  clamex_p14: { name: "Clamex P-14", depth: 14, groove: 75, endMin: 37, minFace: 15, minEdge: 12, clamex: true, keyFromEdge: 7.5 },
};
const LAMELLO_CUTTER_R = 50.2;      // promień freza Zeta P2 (Ø100,4)
const LAMELLO_MAX_SPACING = 300;
// Długość rowka P na powierzchni płyty. Teoretycznie to cięciwa koła freza na głębokości g
// (lamelloGrooveLength: ≈70 dla 14, ≈60 dla 10), ale rowek z Zeta P2 zmierzony w warsztacie
// ma ≈75 mm przy P-14 i ≈60 mm przy P-10. Dlatego LAMELLO[].groove: P-14 75, P-10 60
// (pomiary z warsztatu). Ustawienie
// lamelloGroove > 0 nadpisuje obie.
export const lamelloGrooveLen = (lam, settings) => (num(settings && settings.lamelloGroove, 0) > 0 ? num(settings.lamelloGroove) : lam.groove);
export const lamelloGrooveLength = (g) => round1(2 * Math.sqrt(LAMELLO_CUTTER_R ** 2 - (LAMELLO_CUTTER_R - g) ** 2));

// Pozycje łączników Lamello na odcinku 0..h: oś `edge` mm od końców formatki (warsztatowo
// 60 mm - ustawienie lamelloEdge; nigdy mniej niż minimum producenta endMin), rozstaw maks.
// 300; gdy dwa rowki by się nie zmieściły - jeden na środku.
export function lamelloPositions(h, lam, edge = DEFAULTS.lamelloEdge, len = lam.groove) {
  const e = Math.max(lam.endMin, num(edge, DEFAULTS.lamelloEdge));
  if (h - 2 * e < len + 10) return [round1(h / 2)];
  const n = Math.ceil((h - 2 * e) / LAMELLO_MAX_SPACING) + 1;
  return Array.from({ length: n }, (_, i) => round1(e + (h - 2 * e) * i / (n - 1)));
}

const DEFAULTS = {
  join: "kolek_wkret",
  edge: 25,          // oś skrajnego łącznika tyłu/czoła od górnej i dolnej krawędzi [mm]
  bottomEdge: 80,    // oś skrajnego łącznika dna od przodu i tyłu [mm] (min. 80 - strefa sprzęgieł/zaczepów MOVENTO)
  bottomSpacing: 150, // maks. rozstaw łączników dna [mm]
  screwLength: 50,   // wkręt / konfirmat [mm]
  dowelLength: 30,   // kołek Ø8 [mm]
  lamelloEdge: 60,   // Lamello: oś łącznika od końca formatki [mm] (min. producenta 32/37)
  lamelloGroove: 0,  // Lamello: długość rowka na powierzchni [mm]; 0 = wg łącznika (75 / 60)
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
    ...(LAMELLO[settings.join] ? (() => {
      const lam = LAMELLO[settings.join], g = { d: 7, depth: lam.depth, groove: lamelloGrooveLen(lam, settings) };
      return {
        lamello: { side: g, edge: g, label: `Lamello ${lam.name}` },
        klucz: { face: { d: 6, depth: null, note: "do rowka" }, label: "otwór na klucz Clamex" },
      };
    })() : {}),
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
  if (LAMELLO[settings.join]) return lamelloPositions(h, LAMELLO[settings.join], settings.lamelloEdge, lamelloGrooveLen(LAMELLO[settings.join], settings)).map((p) => ({ p, kind: "lamello" }));
  const n = settings.join === "kolek_wkret" ? Math.max(2, jointCount(h)) : jointCount(h);
  const kinds = kindsFor(settings.join, n);
  return jointPositions(h, settings.edge, n).map((p, i) => ({ p, kind: kinds[i] }));
}

// Łączniki dna z bokami wzdłuż długości L - z dala od strefy sprzęgieł (przód) i zaczepów
// (tył) MOVENTO: patrz movingZoneEdge niżej.
function bottomJoints(L, settings) {
  const lam = LAMELLO[settings.join];
  if (lam) {
    const len = lamelloGrooveLen(lam, settings);
    return lamelloPositions(L, lam, lamelloZoneEdge(lam, settings, len), len).map((p) => ({ p, kind: "lamello" }));
  }
  const e = Math.min(Math.max(FRONT_BACK_SIDE_CLEAR, num(settings.bottomEdge, 50)), L / 4);
  const n = Math.max(2, Math.ceil((L - 2 * e) / Math.max(50, settings.bottomSpacing)) + 1);
  const kinds = kindsFor(settings.join, n);
  return Array.from({ length: n }, (_, i) => ({ p: round1(e + (L - 2 * e) * i / (n - 1)), kind: kinds[i] }));
}

// Strefa sprzęgieł (przód) i zaczepów (tył) MOVENTO pod dnem przy bokach: 75 mm (Blum TD-132/1).
// Kołki/wkręty dna: oś min. 80 mm od boku / od przodu i tyłu. Lamello: cały rowek poza strefą,
// czyli oś 75 mm + połowa długości rowka (P-14: 112,5, P-10: 105) - rowek ma 14 mm w dnie 16 mm,
// wkręty sprzęgła by w niego trafiły.
export const MOVENTO_ZONE = 75;
export const FRONT_BACK_SIDE_CLEAR = 80;
const lamelloZoneEdge = (lam, settings, len) => Math.max(num(settings.lamelloEdge, DEFAULTS.lamelloEdge), MOVENTO_ZONE + len / 2);

// Łączniki dna z tyłem i przodem (stoją na dnie), w poprzek szerokości w; rozstaw jak dno-bok.
function frontBackJoints(w, settings) {
  const lam = LAMELLO[settings.join];
  if (lam) {
    const len = lamelloGrooveLen(lam, settings);
    return lamelloPositions(w, lam, lamelloZoneEdge(lam, settings, len), len).map((p) => ({ p, kind: "lamello" }));
  }
  const e = Math.min(Math.max(FRONT_BACK_SIDE_CLEAR, num(settings.bottomEdge, 50)), w / 2);
  const n = w - 2 * e < 40 ? 1 : Math.max(2, Math.ceil((w - 2 * e) / Math.max(50, settings.bottomSpacing)) + 1);
  const kinds = kindsFor(settings.join, n);
  const ps = n === 1 ? [round1(w / 2)] : Array.from({ length: n }, (_, i) => round1(e + (w - 2 * e) * i / (n - 1)));
  return ps.map((p, i) => ({ p, kind: kinds[i] }));
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
  const jFB = frontBackJoints(w, settings);
  const yOnSide = (p) => round1(r + t + p);          // wys. łącznika tyłu/czoła na boku

  // Bok widziany od wewnątrz skrzynki, x od przodu (0) do tyłu (L), y od dołu boku.
  const sideHoles = (joints) => [
    ...joints.map((j) => ({ x: round1(t / 2), y: yOnSide(j.p), kind: j.kind, ...spec[j.kind].side, to: "czoło wewn.", orient: "v" })),
    ...joints.map((j) => ({ x: round1(L - t / 2), y: yOnSide(j.p), kind: j.kind, ...spec[j.kind].side, to: "tył", orient: "v" })),
    ...jBottom.map((j) => ({ x: j.p, y: round1(r + t / 2), kind: j.kind, ...spec[j.kind].side, to: "dno", orient: "h" })),
  ];
  // Tył/czoło: otwory w czołach (lewe x = 0, prawe x = w), y od spodu formatki.
  const lam = LAMELLO[settings.join];
  const key = lam && lam.clamex ? lam.keyFromEdge : null;
  const endHoles = (joinsL, joinsR) => [
    ...joinsL.map((j) => ({ edge: "lewe", x: 0, y: j.p, kind: j.kind, ...spec[j.kind].edge })),
    ...joinsR.map((j) => ({ edge: "prawe", x: w, y: j.p, kind: j.kind, ...spec[j.kind].edge })),
    ...jFB.map((j) => ({ edge: "dolne", x: j.p, y: 0, kind: j.kind, ...spec[j.kind].edge, to: "dno" })),
    ...(key ? [
      ...jFB.map((j) => ({ edge: "lico", x: j.p, y: key, kind: "klucz", ...spec.klucz.face, to: "dno" })),
      ...joinsL.map((j) => ({ edge: "lico", x: key, y: j.p, kind: "klucz", ...spec.klucz.face })),
      ...joinsR.map((j) => ({ edge: "lico", x: round1(w - key), y: j.p, kind: "klucz", ...spec.klucz.face })),
    ] : []),
  ];
  // Dno (rzut z góry): x w poprzek (0 = lewy bok), z od przodu (0) do tyłu (L).
  const bottomHoles = [
    ...jBottom.map((j) => ({ edge: "lewe", x: 0, z: j.p, y: round1(t / 2), kind: j.kind, ...spec[j.kind].edge })),
    ...jBottom.map((j) => ({ edge: "prawe", x: w, z: j.p, y: round1(t / 2), kind: j.kind, ...spec[j.kind].edge })),
    ...[7, round1(w - 7)].map((x) => ({ edge: "tylne", x, z: L, y: 11, kind: "zaczep", ...spec.zaczep.edge })),
    ...[[round1(t / 2), "przód"], [round1(L - t / 2), "tył"]].flatMap(([z, to]) => jFB.map((j) => ({
      edge: "lico", face: (j.kind === "wkret" || j.kind === "konfirmat") ? "spod" : "gora",
      x: j.p, z, kind: j.kind, ...spec[j.kind].side, to, orient: "v",
    }))),
    // Clamex w dnie: klucz od góry (od spodu dna przy bokach leżą prowadnice MOVENTO).
    ...(key ? jBottom.flatMap((j) => [
      { edge: "lico", x: key, z: j.p, kind: "klucz", ...spec.klucz.face },
      { edge: "lico", x: round1(w - key), z: j.p, kind: "klucz", ...spec.klucz.face },
    ]) : []),
  ];

  // Ostrzeżenia Lamello: za cienka płyta albo za krótka formatka na rowek.
  const warnings = [];
  if (lam) {
    if (t < lam.minFace) warnings.push(`${lam.name}: rowek w płaszczyźnie boku wymaga płyty min. ${lam.minFace} mm (jest ${t} mm).`);
    if (t < lam.minEdge) warnings.push(`${lam.name}: rowek w krawędzi wymaga płyty min. ${lam.minEdge} mm (jest ${t} mm).`);
    const minH = Math.min(hLeft, hRight);
    if (minH < 2 * lam.endMin) warnings.push(`${lam.name}: tył/czoło ma ${round1(minH)} mm wysokości - za mało na rowek (oś min. ${lam.endMin} mm od końca, czyli min. ${2 * lam.endMin} mm).`);
  }

  const sides = B
    ? [
        { id: "bok-niski", name: "Bok niski", qty: 1, length: L, width: sideLeftH, holes: sideHoles(jLeft) },
        { id: "bok-wysoki", name: "Bok wysoki", qty: 1, length: L, width: sideRightH, holes: sideHoles(jRight) },
      ]
    : [{ id: "bok", name: "Bok (lewy i prawy, lustrzanie)", qty: 2, length: L, width: sideLeftH, holes: sideHoles(jLeft) }];
  const panels = [
    ...sides.map((p) => ({ ...p, kind: "bok", thickness: t })),
    { id: "dno", kind: "dno", name: "Dno", qty: 1, length: L, width: w, thickness: t, holes: bottomHoles },
    // Tył i przód (czoło wewnętrzne) - ta sama formatka z tymi samymi otworami.
    { id: "tyl-przod", kind: "plyta", name: "Tył/Przód", qty: 2, length: w, width: Math.max(hLeft, hRight, ...backPts.map((q) => q[1])), thickness: t, points: backPts, holes: endHoles(jLeft, jRight) },
  ];

  const tag = B
    ? `NL${c.nominalLength} H${B.sideLow}-${B.sideHigh}`
    : `NL${c.nominalLength} H${c.sideHeight}`;
  return {
    name: `Skrzynka ${tag} (SKW ${round1(w)})${B ? ", ścięta pod skos" : ""}`,
    system: c.systemName, nl: c.nominalLength,
    lw: round1(w + num(system.innerWidthDeduct, 42)), skw: round1(w), skl: round1(L),
    t, recess: r, isB: !!B, join: settings.join, lamello: lam || null, warnings, panels,
  };
}

// Klucz tożsamości skrzynki - identyczne formatki i otwory = ta sama skrzynka.
function boxKey(box) {
  return JSON.stringify(box.panels.map((p) => [p.id, p.length, p.width, p.points || null, p.holes.map((h) => [h.x, h.y, h.z ?? null, h.kind, h.edge ?? null])]));
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
      .map((fr) => ({ comps: fr.drawer.comps, system, isB: fr.drawer.boxType === "B", box: fr.drawer.box, frontId: fr.el.id }));
  }
  recalculateLayout(mod);
  return (mod.elements || [])
    .filter((el) => el.typ === "front" && (el.subtype || "").includes("szuflada"))
    .map((el) => ({ el, info: getDrawerBoxInfo(mod, el, project) }))
    .filter(({ info }) => info && info.comps.woodenBox && info.comps.fits !== false)
    .map(({ el, info }) => ({ comps: info.comps, system: drawerSystems[info.system], isB: false, frontId: el.id }));
}

// Wszystkie skrzynki drewniane projektu, identyczne scalone: [{ ...box, qty, modules[],
// locations: [{ modId, modName, frontIds[] }] }] - locations mówi, które szuflady w których
// szafkach mają tę skrzynkę (rysunek "gdzie w szafce" przy instrukcji).
export function collectDrawerBoxes(project) {
  const settings = getDrawerBoxSettings(project);
  const map = new Map();
  (project.modules || []).forEach((mod) => {
    rawBoxesOf(mod, project).forEach((raw) => {
      const box = buildDrawerBox(raw, settings);
      const key = boxKey(box);
      if (!map.has(key)) map.set(key, { ...box, qty: 0, modules: [], locations: [] });
      const e = map.get(key);
      e.qty += 1;
      if (!e.modules.includes(mod.name)) e.modules.push(mod.name);
      let loc = e.locations.find((l) => l.modId === mod.id);
      if (!loc) e.locations.push(loc = { modId: mod.id, modName: mod.name, frontIds: [] });
      if (raw.frontId) loc.frontIds.push(raw.frontId);
    });
  });
  return [...map.values()];
}

// Widok szafki od frontu do rysunku "gdzie w szafce": obrys korpusu i fronty w mm, x od lewej
// krawędzi korpusu, y od jego spodu (bez nóżek). { W, H, outline: [[x,y]...], fronts: [{ id,
// subtype, inner, points }] }. Zwykła szafka - prostokąty z recalculateLayout (el.x/y/w/h); szafka
// pod skos - obrys trapezu/trójkąta i fronty docięte skosem (getSlopeFronts), w prawdziwej
// orientacji (niska strona po prawej = odbicie). Szuflady wewnętrzne oznaczone inner (za frontem).
export function cabinetFrontView(mod, project) {
  recalculateLayout(mod);
  const W = num(mod.dimensions.width), H = num(mod.dimensions.height);
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  if (mod.type === "slope_cabinet") {
    const th = num(project.materials && project.materials.boardThickness, 18) || 18;
    const g = getSlopeGeometry(mod, th);
    const real = (pts) => (g.lowSide === "right" ? pts.map(([x, y]) => [round1(g.W - x), round1(y)]) : pts.map(([x, y]) => [round1(x), round1(y)]));
    const outline = real(g.isTriangle ? [[0, 0], [g.W, 0], [g.W, g.H]] : [[0, 0], [g.W, 0], [g.W, g.H], [0, g.L]]);
    const fronts = getSlopeFronts(mod, project)
      .filter((fr) => fr.type !== "brak")
      .map((fr) => ({ id: fr.el.id, subtype: fr.subtype, inner: fr.subtype === "szuflada-wewnetrzna", points: real(fr.shape.points) }));
    return { W: g.W, H: g.H, outline, fronts };
  }
  const fronts = (mod.elements || [])
    .filter((el) => el.typ === "front" && num(el.w) > 0 && num(el.h) > 0)
    .map((el) => ({ id: el.id, subtype: el.subtype, inner: el.subtype === "szuflada-wewnetrzna", points: rect(round1(num(el.x)), round1(num(el.y)), round1(num(el.w)), round1(num(el.h))) }));
  return { W, H, outline: rect(0, 0, W, H), fronts };
}
