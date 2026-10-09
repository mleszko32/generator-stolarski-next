// src/engine/slopeDrillings.js
//
// Formatki korpusu szafki pod skos (mod.type === 'slope_cabinet') z otworami - dane do instrukcji
// montażu (ui/cabinetInstructions.js, rysunki render/slopeInstructions2d.js), w tym samym formacie
// co getCabinetPanels zwykłej szafki (engine/cabinetDrillings.js). Czysta logika bez DOM.
//
// Otwory biorą się z tych samych danych co rysunki nawiertów skosu (ui/slopeCutDrawings.js):
// core/slopeCabinet.js: getSlopeDrillings - ściany płyt pionowych (bok wysoki, bok niski, obie
// strony przegród) i rzuty dna i skośnej płyty z łącznikami; rozstaw łączników jak w zwykłej
// szafce (engine/carcaseParts.js: jointSetsFor). Wymiary i cięcia pod kątem z getSlopeBoards /
// getSlopeShelfPieces / getSlopeDividers. Tu otwory są tylko zebrane per formatka i uzupełnione
// o otwory po stronie łączonej formatki (czoła dolne płyt stojących na dnie, czoła górne pod
// wkręty skośnej płyty, czoła półek stałych).
//
// Układ współrzędnych jak w engine/cabinetDrillings.js: płyta pionowa - x od przodu, y od dołu
// płyty; płyta pozioma / skośna - x wzdłuż płyty (dno: od lewej krawędzi szafki, skos: od dolnego
// końca), z od przodu.
import { recalculateLayout } from "../core/layout.js";
import { getSlopeGeometry, getSlopeDrillings, getSlopeBoards, getSlopeDividers, getSlopeShelfPieces, getSlopeCabinetParts, getSlopeFronts } from "../core/slopeCabinet.js";
import { jointSetsFor } from "./carcaseParts.js";
import { cabinetHoleSpecs } from "./cabinetDrillings.js";
import { num, round1 } from "../utils/math.js";

const KIND_OF = { drawer: "prowadnica", shelf: "podporka", screw: "wkret", dowel: "kolek", hinge: "zawias" };
const TO = { prowadnica: "prowadnica szuflady", podporka: "półka ruchoma", wkret: "półka stała", kolek: "półka stała", zawias: "prowadnik zawiasu" };
const fmtDeg = (v) => `${String(round1(v)).replace(".", ",")}°`;
const fmtMm = (v) => String(round1(v)).replace(".", ",");

// Opis cięcia pod kątem (z getSlopeBoards): pochylenie piły i krótsza krawędź.
function cutNote(b) {
  if (!b) return "";
  const tilts = [b.tiltStart, b.tiltEnd].filter((t) => t > 0);
  if (!tilts.length) return "";
  return `cięcie pod kątem: piła ${tilts.map(fmtDeg).join(" i ")}, krótsza krawędź ${fmtMm(b.short)}`;
}

// Formatki: [{ id, kind: 'bok'|'przegroda'|'poziom'|'polka'|'plecy', name, qty, length, width,
// thickness, holes[], frontOnRight?, note?, fromLabel? }] + notes (ostrzeżenia z getSlopeDrillings).
// Dla innej szafki niż skos - puste listy.
export function getSlopePanels(mod, project) {
  if (!mod || mod.type !== "slope_cabinet") return { panels: [], notes: [] };
  recalculateLayout(mod);
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const backThick = num(project.materials && project.materials.backThickness, 3) || 3;
  const g = getSlopeGeometry(mod, th);
  const depth = round1(g.D - backThick);
  const sets = jointSetsFor(mod, project, depth);
  const drill = getSlopeDrillings(mod, project, { jointSets: () => sets });
  const boards = getSlopeBoards(mod, project);
  const board = (name) => boards.find((b) => b.name === name);
  const spec = cabinetHoleSpecs(th);
  const faceSpec = (k) => spec[k].face;
  const edgeSpec = (k) => spec[k].edge;
  const sortHoles = (a, b) => a[0] - b[0];
  const jointKinds = sets.flatMap((s) => [[s.screw, "wkret"], [s.dowel, "kolek"]]).sort(sortHoles);

  // Otwory jednej ściany płyty pionowej (getSlopeDrillings: faces) w formacie instrukcji.
  const faceHoles = (fc, side = null) => fc.holes.flatMap((h) => {
    const kind = KIND_OF[h.type];
    const base = { x: round1(h.x), kind, ...faceSpec(kind), to: TO[kind], ...(side ? { side } : {}) };
    if (kind === "zawias") return [-16, 16].map((dy) => ({ ...base, y: round1(h.y + dy), hingeY: round1(h.y) }));
    return [{ ...base, y: round1(h.y), ...(kind === "podporka" ? { center: !!h.center } : {}) }];
  });
  // Płyta stoi na dnie (łączniki od spodu dna w jej czole dolnym) / sięga skośnej płyty (wkręty
  // od wierzchu skosu w czoło górne, bez kołków - koniec cięty pod kątem).
  const onBottom = (fc) => Math.abs(fc.y0 - th) < 1;
  const reachesSlope = (fc) => fc.y0 + fc.height >= g.under(g.lowSide === "right" ? g.W - fc.x : fc.x) - 1;
  const edgeHoles = (fc, topH) => [
    ...(onBottom(fc) ? jointKinds.map(([z, kind]) => ({ edge: "dolne", x: round1(z), y: 0, kind, ...edgeSpec(kind), to: "dno" })) : []),
    ...(reachesSlope(fc) ? sets.map((s) => ({ edge: "gorne", x: round1(s.screw), y: round1(topH), kind: "wkret", ...edgeSpec("wkret"), to: "skos" })) : []),
  ];

  const panels = [];
  // --- Boki ---
  [["Bok wysoki", "bok-wysoki"], ["Bok niski", "bok-niski"]].forEach(([name, id]) => {
    const fc = drill.faces.find((f) => f.name === name);
    if (!fc) return;
    const b = board(name);
    panels.push({
      id, kind: "bok", name, qty: 1, length: depth, width: round1(fc.height), thickness: th, frontOnRight: fc.frontOnRight,
      holes: [...faceHoles(fc), ...edgeHoles(fc, fc.height)],
      note: [`wysokość strony wewnętrznej; stoi na dnie`, cutNote(b) && `góra: ${cutNote(b)} (zewnętrzna ${fmtMm(name === "Bok wysoki" ? b.b[1] : b.a[1])})`].filter(Boolean).join("; "),
    });
  });

  // --- Przegrody: obie strony (getSlopeDrillings: 'lewa' / 'prawa') na jednej formatce ---
  const dividerInfo = getSlopeDividers(mod, th);
  const shownEls = dividerInfo.map((d) => d.el);
  const dividerEls = (mod.elements || []).filter((el) => el.typ === "pion" && shownEls.includes(el)).sort((a, b) => a.x - b.x);
  dividerEls.forEach((el, i) => {
    const name = `Przegroda ${i + 1}`;
    const l = drill.faces.find((f) => f.name === name && f.side === "lewa");
    const r = drill.faces.find((f) => f.name === name && f.side === "prawa");
    const d = dividerInfo.find((x) => x.el === el);
    const h = Math.max(l ? l.height : 0, r ? r.height : 0);
    const tilt = d && Math.abs(d.hLeft - d.hRight) > 0.05 ? Math.atan(Math.abs(d.hLeft - d.hRight) / th) * 180 / Math.PI : 0;
    panels.push({
      id: `przegroda-${i + 1}`, kind: "przegroda", name, qty: 1, length: depth, width: round1(h), thickness: th,
      holes: [...(l ? faceHoles(l, "lewa") : []), ...(r ? faceHoles(r, "prawa") : []), ...(r || l ? edgeHoles(r || l, h) : [])],
      note: [onBottom(r || l) ? "stoi na dnie" : "stoi na półce - mocowanie dołu ustal na miejscu",
        tilt ? `góra: cięcie pod kątem, piła ${fmtDeg(tilt)} (strona od skosu ${fmtMm(d.hLeft)}, od wysokiego boku ${fmtMm(d.hRight)})` : ""].filter(Boolean).join("; "),
    });
  });

  // --- Dno i skośna płyta: łączniki w licu (rzuty z getSlopeDrillings) ---
  const plan = (prefix) => drill.plans.find((p) => p.name.startsWith(prefix));
  const licoHoles = (p) => p.holes.map((h) => {
    const kind = KIND_OF[h.type];
    return { edge: "lico", x: round1(h.x), z: round1(h.z), kind, ...faceSpec(kind), to: "bok / przegroda" };
  });
  const bottom = plan("Dno");
  panels.push({
    id: "dno", kind: "poziom", name: "Dno (wieniec dolny)", qty: 1, length: round1(bottom.length), width: depth, thickness: th, fromLabel: "od lewej",
    holes: licoHoles(bottom),
    note: ["nakładane na całą szerokość; wkręty od spodu", cutNote(board("Dno (wieniec dolny)")) && `koniec przy skosie: ${cutNote(board("Dno (wieniec dolny)"))}`].filter(Boolean).join("; "),
  });
  const slope = plan("Skos");
  const slopeBoard = board("Skos (wieniec skośny)");
  panels.push({
    id: "skos", kind: "poziom", name: "Skos (wieniec skośny)", qty: 1, length: round1(slope.length), width: depth, thickness: th, fromLabel: "od dolnego końca",
    holes: licoHoles(slope),
    note: [`kąt skosu ${fmtDeg(g.angle)}; wkręty od wierzchu (strona widoczna) w górne końce boków i przegród`, cutNote(slopeBoard) && `końce: ${cutNote(slopeBoard)}`].filter(Boolean).join("; "),
  });

  // --- Półki: stałe - łączniki w czołach przy ścianach (lewa / prawa krawędź w widoku od frontu) ---
  const shelfPieces = getSlopeShelfPieces(mod, th);
  const faceAt = (x, frontOnRight) => drill.faces.find((f) => f.frontOnRight === frontOnRight && Math.abs(f.x - x) < 1);
  const lowLeft = g.lowSide === "left";
  shelfPieces.forEach((p, i) => {
    const el = p.el;
    const x0 = num(el.x), x1 = x0 + num(el.w), y = num(el.y);
    const long = p.x1 - p.x0Bottom, short = p.x1 - p.x0Top;
    const holes = [];
    if (el.isStructural) {
      [["lewe", faceAt(x0, false), 0], ["prawe", faceAt(x1, true), round1(long)]].forEach(([ed, fc, x]) => {
        if (!fc || y + th > fc.y0 + fc.height + 0.5) return;
        jointKinds.forEach(([z, kind]) => holes.push({ edge: ed, x, z: round1(z), kind, ...edgeSpec(kind), to: ed === "lewe" ? "ściana z lewej" : "ściana z prawej" }));
      });
    }
    const tilt = Math.abs(long - short) > 0.05 ? Math.atan(Math.abs(long - short) / th) * 180 / Math.PI : 0;
    panels.push({
      id: `polka-${i + 1}`, kind: "polka", name: el.isStructural ? `Półka stała ${i + 1}` : `Półka ruchoma ${i + 1}`, qty: 1,
      length: round1(long), width: el.isStructural ? depth : round1(depth - 5), thickness: th, structural: !!el.isStructural, holes,
      note: tilt ? `koniec przy skosie (${lowLeft ? "lewy" : "prawy"}): piła ${fmtDeg(tilt)}, krótsza krawędź ${fmtMm(short)}` : "",
    });
  });

  // --- Plecy (obrys pod skos, bez otworów) ---
  const back = getSlopeCabinetParts(mod, project).find((p) => p.category === "Plecy");
  if (back) panels.push({ id: "plecy", kind: "plecy", name: "Plecy (HDF)", qty: 1, length: back.length, width: back.width, thickness: backThick, holes: [],
    note: "nakładane, obrys pod skos (rysunek: „Rysunki cięcia i nawiertów” → Fronty i plecy) - przybić / przykręcić od tyłu po złożeniu korpusu" });

  return { panels, notes: drill.notes };
}

// Opis konstrukcji do nagłówka instrukcji i kolejności montażu.
export function getSlopeConstruction(mod, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const g = getSlopeGeometry(mod, th);
  const fronts = getSlopeFronts(mod, project);
  const els = mod.elements || [];
  return {
    W: g.W, H: g.H, D: g.D, L: g.L, angle: g.angle, isTriangle: g.isTriangle, lowSide: g.lowSide,
    legs: !!(mod.legs && mod.legs.active),
    legsHeight: mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0,
    plinth: !!(mod.legs && mod.legs.active && mod.legs.plinth),
    drawers: fronts.filter((f) => f.type === "szuflada").length,
    doors: fronts.filter((f) => f.type === "drzwi").length,
    blendy: fronts.filter((f) => f.type === "blenda").length,
    dividers: getSlopeDividers(mod, th).length,
    fixedShelves: els.filter((e) => e.typ === "poziom" && e.isStructural).length,
    movableShelves: els.filter((e) => e.typ === "poziom" && !e.isStructural).length,
  };
}
