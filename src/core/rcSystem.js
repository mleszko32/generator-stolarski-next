// src/core/rcSystem.js
//
// Stół do wiercenia RC System II (rcsystem.pl): ustawienia stołu w projekcie, położenie
// tylnego otworu łączników i karta wiercenia (jak ustawić stół dla każdej formatki).
// Czysta logika bez DOM.
//
// Jak pracuje stół (przewodnik producenta "Przewodnik po bazach pozycjonujących", zdjęcia
// listwy, filmy producenta i opis użytkownika):
// - odległość otworu od krawędzi dosuniętej do pinów ustawia się otworem bazowym w blacie
//   (RC_BASES, mm od osi wiertła) + pinem neutralnym albo +0,5 / +1 / +1,5 / +2 mm;
// - położenie wzdłuż krawędzi: przednia wiertarka - formatka przodem do zderzaka przy
//   wiertarce (pierwsze wiertło 37 mm od przodu); wiertarka dwuwrzecionowa wierci dwa
//   otwory co 32 mm jednym ruchem (wiertło pod wkręt zawsze od strony krawędzi);
// - obie wiertarki (przednia i tylna) mają własny zderzak, który jedzie razem z wiertarką;
//   formatka opiera się krawędzią o zderzak, więc pierwszy otwór wypada zawsze 37 mm od tej
//   krawędzi - przód od przedniego zderzaka, tył od tylnego. Pin w szynie (otwory co 16 mm,
//   numerowane od obu końców, sprawdzone pomiarem w warsztacie) tylko blokuje wiertarkę w
//   miejscu i nie zmienia odległości otworu od krawędzi. Wcześniejszy model zakładał, że
//   tylny otwór zależy od siatki szyny (37…52 mm od tyłu) i wymaga kalibracji - nieprawda.
import { num, round1 } from "../utils/math.js";

// Otwory bazowe w blacie (mm od osi wiertła do krawędzi formatki) i ich zastosowanie wg producenta.
export const RC_BASES = [
  { base: 6.5, use: "podpórki pod flippery" },
  { base: 8, use: "złączka PK2" },
  { base: 9, use: "" },
  { base: 9.5, use: "boki korpusu" },
  { base: 15, use: "" },
  { base: 17, use: "złącze mimośrodowe Blum Ø25" },
  { base: 20, use: "Target J10, prowadnik prosty" },
  { base: 22, use: "" },
  { base: 23, use: "puszki zawiasów Ø35" },
  { base: 24, use: "" },
  { base: 28, use: "mocowanie do frontów (Aventos)" },
  { base: 31, use: "mocowanie frontów szuflad Blum" },
  { base: 32, use: "" },
  { base: 34, use: "mimośrody" },
  { base: 37, use: "System 32 - pierwszy otwór od krawędzi" },
];
export const RC_PINS = [0, 0.5, 1, 1.5, 2];
export const RC_RAIL_STEP = 16;          // rozstaw numerowanych otworów w szynie (pomiar w warsztacie)
export const RC_FRONT_STOP = 37;         // zderzak wiertarki: pierwszy otwór od krawędzi opartej o zderzak
export const RC_SPINDLE = 32;            // rozstaw wrzecion wiertarki

// Stare projekty mogą mieć jeszcze rearMode / calibDepth / calibRear z poprzedniego modelu -
// są ignorowane.
const DEFAULTS = { enabled: false };

export function getRcSettings(project) {
  return { ...DEFAULTS, ...((project && project.rcSystem) || {}) };
}

// Ustawienie odległości od krawędzi: otwór bazowy + pin. Najpierw pin neutralny, potem
// najmniejszy dodatni. null, gdy żadna kombinacja nie daje tej odległości (np. 69 mm).
export function baseAndPin(dist) {
  const d = round1(num(dist));
  for (const pin of RC_PINS) {
    const b = RC_BASES.find((x) => Math.abs(x.base + pin - d) < 0.05);
    if (b) return { base: b.base, pin, use: b.use };
  }
  return null;
}
export const baseText = (bp) => (bp ? `otwór ${String(bp.base).replace(".", ",")}${bp.pin ? ` + pin +${String(bp.pin).replace(".", ",")}` : " + pin neutralny"}` : null);

// Położenie tylnego wkrętu łączników (mm od przodu formatki o głębokości `depth`): tylna
// wiertarka ze zderzakiem do tylnej krawędzi -> zawsze 37 mm od tyłu.
export function rcRearScrew(depth) {
  return { x: round1(num(depth) - RC_FRONT_STOP), exact: true };
}

// Tylny otwór łączników przy pracy na stole (mm od przodu) albo null, gdy stół wyłączony.
// To samo położenie co domyślny rozstaw (jointSetPositions: 37 od tyłu) - zostaje jako
// jedno miejsce, gdyby stół kiedyś wymagał innego.
export function rcRearOverride(depth, project) {
  return getRcSettings(project).enabled ? rcRearScrew(depth).x : null;
}

// ---------------------------------------------------------------------------
// Karta wiercenia: dla formatki pionowej (bok, przegroda) grupy otworów wierconych przy
// jednym ustawieniu stołu. Otwór przy krawędzi (do 39 mm) bazuje się od tej krawędzi
// (dół / góra / przód / tył do pinów), pozycje wzdłuż krawędzi podaje się od przodu (dla
// dołu/góry - zderzak przedniej wiertarki) albo od dołu (dla przodu/tyłu - listwa). Pary
// otworów co 32 mm = jedno wiercenie wiertarką dwuwrzecionową.
// ---------------------------------------------------------------------------
const EDGE_ZONE = RC_FRONT_STOP + 2 + 0.01;
const REF_LABEL = { dol: "dół", gora: "góra", przod: "przód", tyl: "tył" };

export function rcPanelSetups(panel) {
  const L = num(panel.length), H = num(panel.width);
  const groups = new Map();
  panel.holes.filter((h) => !h.edge || h.edge === "lico").forEach((h) => {
    const x = num(h.x), y = num(h.y);
    const cand = [["dol", y, x], ["gora", H - y, x], ["przod", x, y], ["tyl", L - x, y]].filter(([, d]) => d <= EDGE_ZONE);
    const [ref, dist, along] = cand.sort((a, b) => a[1] - b[1])[0] || ["przod", x, y];
    const key = `${ref}|${round1(dist)}`;
    if (!groups.has(key)) groups.set(key, { ref, dist: round1(dist), holes: [] });
    groups.get(key).holes.push({ along: round1(along), kind: h.kind, d: h.d });
  });
  return [...groups.values()].map((g) => {
    const positions = [...new Set(g.holes.map((h) => h.along))].sort((a, b) => a - b);
    // Pary co 32 mm (jedno wiercenie): od najmniejszej pozycji, zachłannie.
    const shots = [];
    for (let i = 0; i < positions.length; i++) {
      if (i + 1 < positions.length && Math.abs(positions[i + 1] - positions[i] - RC_SPINDLE) < 0.05) {
        shots.push([positions[i], positions[i + 1]]);
        i++;
      } else shots.push([positions[i]]);
    }
    const kinds = [...new Set(g.holes.map((h) => h.kind))];
    const bp = baseAndPin(g.dist);
    return {
      ref: g.ref, refLabel: REF_LABEL[g.ref], dist: g.dist, base: bp, baseText: baseText(bp),
      alongFrom: g.ref === "dol" || g.ref === "gora" ? "przód" : "dół", shots, kinds,
    };
  }).sort((a, b) => a.dist - b.dist || a.ref.localeCompare(b.ref));
}
