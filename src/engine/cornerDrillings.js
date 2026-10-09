// src/engine/cornerDrillings.js
//
// Formatki korpusu szafki narożnej (mod.type === 'corner_cabinet') z otworami - dane do
// instrukcji montażu (ui/cabinetInstructions.js, rysunki render/cornerInstructions2d.js),
// w tym samym formacie co getCabinetPanels zwykłej szafki (engine/cabinetDrillings.js).
// Czysta logika bez DOM.
//
// Otwory biorą się z tych samych danych co rysunki 2D narożnika (render/cornerDrawing2d.js):
// engine/cornerParts.js - getCornerShelfHoles (łączniki wieńców na bokach, podpórki półek L
// na bokach i listwie, płytki zawiasów), getCornerWieniecHoles (kołki listwy w wieńcu),
// getCornerPartsGeometry (obrys L wieńca i półki).
//
// Układ współrzędnych:
// - bok / listwa: widok płaszczyzny od wnętrza, x od przodu (listwa: od naroża), y od dołu formatki;
// - formatka L (wieniec, półka): rzut z góry, 0,0 = tylny róg (cofnięty o plecy), x wzdłuż
//   ramienia A, y wzdłuż ramienia B; otwory w czołach na końcach ramion mają edge
//   'koniec-A' / 'koniec-B' i z = odległość od przodu (jak czoła wieńca zwykłej szafki).
import { recalculateLayout, getCornerDepths } from "../core/layout.js";
import { getCornerShelfHoles, getCornerWieniecHoles, getCornerPartsGeometry, getCornerCorpusParts, getCornerDoorHinges } from "./cornerParts.js";
import { cabinetHoleSpecs } from "./cabinetDrillings.js";
import { num, round1 } from "../utils/math.js";

const KIND_OF = { screw: "wkret", dowel: "kolek" };
const BATTEN_W = 100;

// Formatki: [{ id, kind: 'bok'|'listwa'|'poziom-L'|'polka-L'|'polka'|'przegroda'|'plecy', name, qty,
// length, width, thickness, holes[], outline?, note? }]. Dla innej szafki niż narożna - [].
export function getCornerPanels(mod, project) {
  if (!mod || mod.type !== "corner_cabinet") return [];
  recalculateLayout(mod);
  const g = getCornerPartsGeometry(mod, project);
  const { th, backThick } = g;
  const H = num(mod.dimensions.height, 720);
  const spec = cabinetHoleSpecs(th);
  const face = (k) => spec[k].face;
  const edge = (k) => spec[k].edge;
  const [sideA, sideB, batten] = getCornerShelfHoles(mod, project);

  // Otwory boku ramienia: łączniki wieńców, podpórki półek L, prowadniki zawiasów.
  const sideHoles = (s) => [
    ...s.joints.map((j) => {
      const kind = KIND_OF[j.type];
      return { x: round1(j.x), y: round1(j.y), kind, ...face(kind), to: j.y < H / 2 ? "wieniec dolny" : "wieniec górny" };
    }),
    ...s.holes.map((h) => ({ x: round1(h.x), y: round1(h.y - s.bottom), kind: "podporka", ...face("podporka"), to: "półka narożna", center: !!h.isCenter })),
    ...s.hingePlates.flatMap((hp) => [-16, 16].map((dy) => ({
      x: round1(hp.x), y: round1(hp.y + dy), kind: "zawias", ...face("zawias"), to: "prowadnik zawiasu", hingeY: round1(hp.y),
    }))),
  ];

  const panels = [];
  // Bok ramienia A stoi na prawym końcu ramienia A (patrząc na jego front), bok B - na lewym
  // końcu ramienia B, więc widziane od wnętrza: A ma przód po prawej, B po lewej.
  panels.push({ id: "bok-a", kind: "bok", name: "Bok ramienia A", qty: 1, length: round1(sideA.depth), width: round1(H), thickness: th, frontOnRight: true, holes: sideHoles(sideA) });
  panels.push({ id: "bok-b", kind: "bok", name: "Bok ramienia B", qty: 1, length: round1(sideB.depth), width: round1(H), thickness: th, frontOnRight: false, holes: sideHoles(sideB) });

  // Listwa narożna: podpórki półek L w płaszczyźnie, kołki w czołach (w wieńce).
  const battenDowels = getCornerWieniecHoles(mod, project).map((h) => round1(h.x));
  const battenH = round1(H - 2 * th);
  panels.push({
    id: "listwa", kind: "listwa", name: "Listwa narożna", qty: 1, length: BATTEN_W, width: battenH, thickness: th,
    holes: [
      ...batten.holes.map((h) => ({ x: round1(h.x), y: round1(h.y - batten.bottom), kind: "podporka", ...face("podporka"), to: "półka narożna", center: !!h.isCenter })),
      ...battenDowels.flatMap((x) => [
        { edge: "dolne", x, y: 0, kind: "kolek", ...edge("kolek"), to: "wieniec dolny" },
        { edge: "gorne", x, y: battenH, kind: "kolek", ...edge("kolek"), to: "wieniec górny" },
      ]),
    ],
    note: "x od naroża (krawędź przy ramieniu B); przykręcona płasko do pleców ramienia A",
  });

  // Wieńce L: kołki listwy w licu (dolny - od góry, górny - od spodu) i łączniki boków w czołach
  // na końcach ramion - te same pozycje od przodu co na boku.
  const wA = g.wieniec.depthA, wB = g.wieniec.depthB;
  const endJoints = (side, end) => side.joints.filter((j) => j.y < H / 2).map((j) => {
    const kind = KIND_OF[j.type];
    const z = round1(j.x);
    return end === "A"
      ? { edge: "koniec-A", x: round1(g.wieniec.blankA), y: round1(wA - z), z, kind, ...edge(kind), to: "bok ramienia A" }
      : { edge: "koniec-B", x: round1(wB - z), y: round1(g.wieniec.blankB), z, kind, ...edge(kind), to: "bok ramienia B" };
  });
  const outlineW = { blankA: round1(g.wieniec.blankA), blankB: round1(g.wieniec.blankB), depthA: round1(wA), depthB: round1(wB), notch: null };
  [["dolny", "od góry"], ["gorny", "od spodu"]].forEach(([key, faceSide]) => {
    panels.push({
      id: `wieniec-${key}`, kind: "poziom-L", name: key === "dolny" ? "Wieniec dolny (L)" : "Wieniec górny (L)", qty: 1,
      length: outlineW.blankA, width: outlineW.blankB, thickness: th, outline: outlineW, faceSide,
      holes: [
        ...battenDowels.map((x) => ({ edge: "lico", x, y: round1(th / 2), z: null, kind: "kolek", ...face("kolek"), to: "listwa narożna" })),
        ...endJoints(sideA, "A"),
        ...endJoints(sideB, "B"),
      ],
      note: `naroże do wycięcia z formatki ${outlineW.blankA} × ${outlineW.blankB}; kołki listwy ${faceSide}`,
    });
  });

  // Półki narożne L: bez otworów (leżą na podpórkach), wycięcie na listwę w tylnym rogu.
  if (g.shelfCount > 0) {
    const outlineP = { blankA: round1(g.polka.blankA), blankB: round1(g.polka.blankB), depthA: round1(g.polka.depthA), depthB: round1(g.polka.depthB), notch: { w: g.polka.notch.w, h: round1(g.polka.notch.h) } };
    panels.push({
      id: "polka-l", kind: "polka-L", name: "Półka narożna (L)", qty: g.shelfCount, length: outlineP.blankA, width: outlineP.blankB, thickness: th,
      outline: outlineP, holes: [],
      note: `wycięcie ${outlineP.notch.w} × ${fmtNum(outlineP.notch.h)} na listwę, przód cofnięty o 5 mm; leży na podpórkach (boki + listwa)`,
    });
  }

  // Półki i przegrody wewnątrz ramion (poziom/pion z cornerArm) - wymiary jak na liście formatek
  // (engine/cabinet.js: getInteriorParts); otworów pod nie instrukcja jeszcze nie liczy.
  const { depthA, depthB } = getCornerDepths(mod);
  const backP = mod.backPanel || { type: "nakladane", offset: 16 };
  const frontCfg = { ...(project.front || {}), ...(mod.front || {}) };
  const depthFor = (d) => (backP.type === "nut" ? d - num(backP.offset, 16) - backThick : d - backThick) - (frontCfg.type === "wpuszczane" ? th : 0);
  ["A", "B"].forEach((arm) => {
    const armEls = (mod.elements || []).filter((e) => e.cornerArm === arm && (e.typ === "poziom" || e.typ === "pion"));
    const d = depthFor(arm === "A" ? depthA : depthB);
    armEls.filter((e) => e.typ === "poziom" && !e.isStructural).sort((a, b) => a.y - b.y).forEach((e, i) => {
      panels.push({ id: `polka-${arm}-${i + 1}`, kind: "polka", name: `Półka w ramieniu ${arm} (${i + 1})`, qty: 1, length: round1(e.w), width: round1(d - 5), thickness: th, holes: [],
        note: "podpórki ustal na miejscu - instrukcja nie liczy jeszcze otworów półek w ramionach" });
    });
    armEls.filter((e) => e.typ === "pion").sort((a, b) => a.x - b.x).forEach((e, i) => {
      panels.push({ id: `przegroda-${arm}-${i + 1}`, kind: "przegroda", name: `Przegroda w ramieniu ${arm} (${i + 1})`, qty: 1, length: round1(d), width: round1(e.h), thickness: th, holes: [],
        note: "mocowanie ustal na miejscu - instrukcja nie liczy jeszcze otworów przegród w ramionach" });
    });
  });

  // Plecy (2 płyty, bez otworów) - wymiary z listy formatek.
  getCornerCorpusParts(mod, project).filter((p) => p.category === "Plecy").forEach((p) => {
    const arm = p.name.includes("Ramię B") ? "B" : "A";
    panels.push({ id: `plecy-${arm.toLowerCase()}`, kind: "plecy", name: `Plecy ramienia ${arm} (HDF)`, qty: 1, length: p.length, width: p.width, thickness: backThick, holes: [],
      note: backP.type === "nut"
        ? "w nucie boku; krawędź przy narożu nakładana na listwę - wsunąć przed skręceniem korpusu"
        : "nakładane - przybić / przykręcić do boku, wieńców i listwy narożnej po złożeniu korpusu" });
  });

  return panels;
}

const fmtNum = (v) => String(round1(v)).replace(".", ",");

// Opis konstrukcji do nagłówka instrukcji i kolejności montażu.
export function getCornerConstruction(mod, project) {
  const els = mod.elements || [];
  const { depthA, depthB } = getCornerDepths(mod);
  const backP = { type: "nakladane", ...(mod.backPanel || {}) };
  const doors = els.filter((e) => e.typ === "front" && (e.subtype || "").includes("drzwi"));
  return {
    legA: num(mod.dimensions.width, 860),
    legB: num(mod.dimensions.legB, 860),
    depthA, depthB,
    height: num(mod.dimensions.height, 720),
    backType: backP.type,
    legs: !!(mod.legs && mod.legs.active),
    legsHeight: mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0,
    legCount: 5,
    plinth: !!(mod.legs && mod.legs.active && mod.legs.plinth),
    doors: doors.length,
    bifold: mod.cornerFrontMode === "bifold" && doors.length > 0,
    hingesOnSides: doors.length ? getCornerDoorHinges(mod).filter((d) => d.atBok).length : 0,
    drawers: els.filter((e) => e.typ === "front" && (e.subtype || "").includes("szuflada")).length,
    cornerShelves: els.filter((e) => e.typ === "poziom-narozny").length,
    armParts: els.filter((e) => e.cornerArm && (e.typ === "poziom" || e.typ === "pion")).length,
  };
}
