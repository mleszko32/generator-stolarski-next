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
// - tylna wiertarka: albo zderzakiem do tylnej krawędzi (otwór 37 mm od tyłu), albo zablokowana
//   pinem w szynie (otwory co 16 mm, numerowane od obu końców) - model listwy niżej (rcRailLength).
// Potwierdzone w warsztacie: formatka zawsze bazuje przodem o zderzak przedniej wiertarki
// (37 mm od przodu); stół przyjmuje formatki do 650 mm.
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
export const RC_RAIL_STEP = 16;          // rozstaw otworów w szynie - potwierdzony w warsztacie (numeracja od obu końców)
export const RC_FRONT_STOP = 37;         // zderzak przy przedniej wiertarce
export const RC_SPINDLE = 32;            // rozstaw wrzecion wiertarki
export const RC_MAX_DEPTH = 650;         // najgłębsza formatka, jaką przyjmuje stół (warsztat)

// Kalibracja domyślna = pomiar stołu z warsztatu: przednia wiertarka na pinie 3, formatka 510 mm,
// tylna na pinie 7 (od tylnego końca) -> tylny otwór 470 mm od przodu formatki. Z niego odległość
// między zerami listew L = 470 + 16·(7 + 3) + 37 = 667 mm (połowa 333,5 = środkowa dziura, zgodnie
// ze zdjęciem szyny). frontPin - pin przedniej wiertarki, na którym się zwykle pracuje.
export const RC_DEFAULT_CALIB = { calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 };
// Strona stołu (patrząc na szynę), po której stoi przednia wiertarka - szyna jest numerowana
// od obu końców, więc karta wiercenia mówi, po której stronie liczyć pin (warsztat: lewa).
export const RC_DEFAULT_FRONT_SIDE = "lewa";

// Opis pinu z jego końcem szyny: from 'przód' = strona przedniej wiertarki, 'tył' = tylnej.
export function rcPinSideText(pin, from, settings) {
  const frontSide = (settings && settings.frontSide) === "prawa" ? "prawa" : "lewa";
  const side = from === "przód" ? frontSide : (frontSide === "lewa" ? "prawa" : "lewa");
  const where = side === "lewa" ? "lewej" : "prawej";
  // Pin 0 = wiertarka dosunięta do zera listwy, bez pinu.
  if (Number(pin) === 0) return `od zera ${where} listwy, bez pinu (strona ${from === "przód" ? "przedniej" : "tylnej"} wiertarki)`;
  return `pin ${pin} po ${where} (strona ${from === "przód" ? "przedniej" : "tylnej"} wiertarki)`;
}
export const RC_RAIL_PINS = 21;          // otwory 1…20 od każdego końca + nienumerowany środkowy (21)
export const RC_PIN_TO_BIT = 37;         // od styku z pinem do najbliższego wiertła (z obu stron wiertarki)
export const RC_PIN_DIAMETER = 5;        // średnica pinu (warsztat)
const DEFAULTS = { enabled: false, rearMode: "pin", frontSide: RC_DEFAULT_FRONT_SIDE, ...RC_DEFAULT_CALIB };
// Zakres, w którym może wypaść tylny otwór na pinie (najbliższy otwór szyny co 16 mm).
export const RC_PIN_RANGE = [RC_FRONT_STOP - RC_RAIL_STEP / 2, RC_FRONT_STOP + RC_RAIL_STEP / 2];

export function getRcSettings(project) {
  const own = (project && project.rcSystem) || {};
  const s = { ...DEFAULTS };
  // Puste pola (null / "") nie kasują domyślnej kalibracji.
  Object.keys(own).forEach((k) => { if (own[k] !== null && own[k] !== undefined && own[k] !== "") s[k] = own[k]; });
  if (s.rearMode !== "stop") s.rearMode = "pin";
  return s;
}
const isCalibrated = (s) => num(s.calibDepth, 0) > 0 && num(s.calibRear, 0) > 0
  && num(s.calibPin, 0) > 0 && num(s.calibFrontPin, num(s.frontPin, 0)) > 0;

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

// ---------------------------------------------------------------------------
// Model listwy (warsztat): każda listwa ma zero na swoim końcu; pin w otworze n opiera wiertarkę
// 16·n mm od zera (bok pinu od strony wiertarki stojącej dalej od zera), pin ma Ø5 mm, a od styku
// z pinem do najbliższego wiertła jest 37 mm - którąkolwiek stroną wiertarka go dotyka.
// Współrzędna u = mm od zera PRZEDNIEJ listwy:
// - przednia wiertarka na pinie f: jej zderzak = przód formatki w u = 16f (pierwsze wiertło +37);
// - pin k liczony od przodu: styk z wiertarką stojącą za nim u = 16k, przed nim 16k − 5;
// - pin n liczony od tyłu: styk z wiertarką przed nim u = L − 16n, za nim L − 16n + 5;
// - „pin 0” = wiertarka dosunięta do zera listwy bez pinu (warsztat): styk w u = 0 albo u = L.
// Sprawdzone pomiarami: 510 / pin 7 -> 470 (z tego L), środek na pinie 16 od przodu -> 245/277
// (16·16 + 37 − 48 = 245), największa formatka przy przedniej na pinie 1: L − 16 = 651 (stół: 650).
// ---------------------------------------------------------------------------
export function rcRailLength(s) {
  return num(s.calibDepth) - num(s.calibRear)
    + RC_RAIL_STEP * (num(s.calibPin) + num(s.calibFrontPin, num(s.frontPin))) + RC_PIN_TO_BIT;
}

// Pin przedniej wiertarki dla formatki o głębokości `depth`: ten, na którym się pracuje, a gdy
// formatka nie zmieści się między nim a końcem tylnej listwy - niższy (bliżej przodu).
// 0 = przednia dosunięta do zera listwy bez pinu. null = formatka za głęboka na stół (> 650 mm).
export function rcFrontPinFor(depth, s) {
  if (num(depth) > RC_MAX_DEPTH) return null;
  const p = Math.round(num(s.frontPin, num(s.calibFrontPin, 3)));
  const pref = Number.isFinite(p) && p >= 0 ? p : 3;
  const maxF = Math.floor((rcRailLength(s) - num(depth)) / RC_RAIL_STEP);
  const f = Math.min(pref, maxF);
  return f >= 0 ? f : null;
}

// Wszystkie ustawienia tylnej wiertarki na pinach dla formatki `depth` przy przedniej na pinie f.
// contact 'back' - pin ZA wiertarką (tylny zestaw), 'front' - pin PRZED nią (środkowe zestawy).
// [{ pin, from, xa, xb }] - wiertła xa < xb (xb - tylne, pod wkręt), mm od przodu formatki.
function pinSetups(depth, f, s, contact) {
  const L = rcRailLength(s);
  const edge = RC_RAIL_STEP * f;
  const D = num(depth, Infinity);
  const out = [];
  const push = (pin, from, c) => {
    const xb = contact === "back" ? c - RC_PIN_TO_BIT - edge : c + RC_PIN_TO_BIT + RC_SPINDLE - edge;
    if (xb - RC_SPINDLE > 0 && xb < D) out.push({ pin, from, xa: round1(xb - RC_SPINDLE), xb: round1(xb) });
  };
  // k / n = 0: wiertarka do zera listwy bez pinu (przy przednim zerze tylko wiertarka za nim, przy tylnym - przed nim).
  for (let k = contact === "front" ? 0 : 1; k < RC_RAIL_PINS; k++) push(k, "przód", contact === "back" ? RC_RAIL_STEP * k - RC_PIN_DIAMETER : RC_RAIL_STEP * k);
  for (let n = contact === "back" ? 0 : 1; n <= RC_RAIL_PINS; n++) push(n, "tył", contact === "back" ? L - RC_RAIL_STEP * n : L - RC_RAIL_STEP * n + RC_PIN_DIAMETER);
  return out;
}

// Położenie tylnego wkrętu łączników (mm od przodu formatki o głębokości `depth`) przy pracy
// na stole. { x, exact, range?, pin?, from?, frontPin?, stopFallback?, tooDeep? }:
// - zderzak do krawędzi: depth - 37, dokładnie;
// - pin z kalibracją: ustawienie z pinem ZA wiertarką najbliższe 37 mm od tyłu (przy remisie
//   dalej od tyłu); gdy żadne nie pasuje (koniec szyny) - zderzak, 37 od tyłu;
// - pin bez kalibracji: depth - 37 jako położenie robocze + zakres 29…45 mm od tyłu.
export function rcRearScrew(depth, settings) {
  const D = num(depth);
  const s = settings || DEFAULTS;
  if (s.rearMode === "stop") return { x: round1(D - RC_FRONT_STOP), exact: true };
  if (!isCalibrated(s)) return { x: round1(D - RC_FRONT_STOP), exact: false, range: RC_PIN_RANGE };
  const stop = { x: round1(D - RC_FRONT_STOP), exact: true, pin: null, from: null, stopFallback: true };
  const f = rcFrontPinFor(D, s);
  if (f === null) return { ...stop, frontPin: null, tooDeep: true };
  const target = D - RC_FRONT_STOP;
  const best = pinSetups(D, f, s, "back")
    .filter((c) => c.xb <= D - 20 && c.xa > RC_FRONT_STOP + RC_SPINDLE)
    .sort((a, b) => Math.abs(a.xb - target) - Math.abs(b.xb - target) || a.xb - b.xb)[0];
  if (!best || Math.abs(best.xb - target) > RC_RAIL_STEP / 2 + 0.01) return { ...stop, frontPin: f };
  return { x: best.xb, exact: true, pin: best.pin, from: best.from, frontPin: f };
}

const frontOrDefault = (depth, s) => {
  const f = depth !== null ? rcFrontPinFor(depth, s) : null;
  if (f !== null) return f;
  const p = Math.round(num(s.frontPin, 3));
  return Number.isFinite(p) && p >= 0 ? p : 3;
};

// Siatka środkowych zestawów łączników (wkręt na tylnym wiertle) dla formatki `depth`:
// { origin, step } albo null (stół wyłączony / bez kalibracji). Środkowe zestawy wierci tylna
// wiertarka przesunięta do przodu, przednią stroną do pinu: xb = 16k + 37 + 32 − 16f.
export function rcMidGrid(project, depth = null) {
  const s = getRcSettings(project);
  if (!s.enabled || !isCalibrated(s)) return null;
  const f = frontOrDefault(depth, s);
  return { origin: RC_PIN_TO_BIT + RC_SPINDLE - RC_RAIL_STEP * f, step: RC_RAIL_STEP };
}

// Pin dla środkowego zestawu, którego tylne wiertło (wkręt) jest x mm od przodu formatki
// `depth`: { pin, from } albo null, gdy takiego ustawienia nie ma na szynie.
export function rcMidPinForX(x, settings, depth = null) {
  const s = settings || DEFAULTS;
  if (!isCalibrated(s)) return null;
  const f = frontOrDefault(depth, s);
  const hit = pinSetups(depth, f, s, "front").find((c) => Math.abs(c.xb - num(x)) < 0.01);
  return hit ? { pin: hit.pin, from: hit.from } : null;
}

// Krótki opis pinu na rysunki formatek: "pin 3 L", "pin 7 P", "zero P" (L / P = lewa / prawa strona
// szyny, wg ustawienia frontSide). Dla otworu pod wkręt x mm od przodu formatki o głębokości
// panelDepth: przedni zestaw (37) - pin przedniej wiertarki, tylny / środkowy - tylnej (pin za nią
// albo przed nią), tylna zderzakiem - "zderzak". null: stół wyłączony, bez kalibracji albo x poza siatką.
export function rcPinLabel(x, panelDepth, project) {
  const s = getRcSettings(project);
  if (!s.enabled || !isCalibrated(s)) return null;
  const f = rcFrontPinFor(panelDepth, s);
  if (f === null) return null;
  const frontSide = s.frontSide === "prawa" ? "P" : "L";
  const backSide = frontSide === "L" ? "P" : "L";
  const short = (pin, from) => (Number(pin) === 0 ? "zero " : "pin " + pin + " ") + (from === "przód" ? frontSide : backSide);
  const X = num(x);
  if (Math.abs(X - RC_FRONT_STOP) < 0.05) return short(f, "przód");
  const rear = rcRearScrew(panelDepth, s);
  if (Math.abs(X - rear.x) < 0.05) return rear.pin !== null && rear.pin !== undefined ? short(rear.pin, rear.from) : "zderzak";
  const hit = pinSetups(panelDepth, f, s, "back").find((c) => Math.abs(c.xb - X) < 0.05)
    || pinSetups(panelDepth, f, s, "front").find((c) => Math.abs(c.xb - X) < 0.05);
  return hit ? short(hit.pin, hit.from) : null;
}

// Czy stół zmienia położenie tylnego otworu (tylko gdy włączony i wynik jest pewny).
export function rcRearOverride(depth, project) {
  const s = getRcSettings(project);
  if (!s.enabled) return null;
  const r = rcRearScrew(depth, s);
  return r.exact ? r.x : null;
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
