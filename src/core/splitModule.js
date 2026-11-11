// src/core/splitModule.js
//
// Podział jednej szafki na dwa osobne korpusy w miejscu dzielnika na całą szerokość / wysokość
// wnętrza: półki (cięcie poziome — dolny i górny korpus) albo przegrody (cięcie pionowe — lewy
// i prawy). Wnętrze (półki, przegrody, szuflady, fronty) przechodzi na właściwą stronę, a nie
// jest składane od nowa, więc nic się nie miesza. Dzielnik znika — każdy korpus ma własny
// wieniec / bok. Łączny wymiar szafki zostaje (drugi korpus jest o grubość płyty niższy /
// węższy w świetle, wnętrze dopasowuje `refitInterior`).
//
// Fronty obejmujące miejsce cięcia (drzwi na całą szafę): do wyboru dla każdego —
//   'both'   = każdy korpus dostaje własny front (w swojej części),
//   'first'  = front zostaje w dolnym / lewym korpusie i dalej zasłania oba,
//   'second' = front zostaje w górnym / prawym korpusie i dalej zasłania oba.
// Zasłanianie drugiego korpusu robi ujemny offset wnęki frontu (baseZone.offset*).
import { state } from "./state.js";
import { cloneModuleWithNewIds } from "./state.js";
import { moduleBoardThickness } from "./boardThickness.js";
import { getCabinetInnerRect } from "./zoneTree.js";
import { refitInterior } from "./korpusDecorChange.js";
import { recalculateLayout } from "./layout.js";

const EPS = 2;
const num = (v) => parseFloat(v) || 0;

const AXES = {
  // cięcie poziome: półka, korpusy jeden nad drugim
  h: { pos: "y", size: "h", min: "minY", max: "maxY", bLo: "boundBottom", bHi: "boundTop", tLo: "cab-bottom", tHi: "cab-top", oLo: "offsetBottom", oHi: "offsetTop", dim: "height", names: ["dół", "góra"] },
  // cięcie pionowe: przegroda, korpusy obok siebie
  v: { pos: "x", size: "w", min: "minX", max: "maxX", bLo: "boundLeft", bHi: "boundRight", tLo: "cab-left", tHi: "cab-right", oLo: "offsetLeft", oHi: "offsetRight", dim: "width", names: ["lewa", "prawa"] },
};
const BOUND_KEYS = ["boundLeft", "boundRight", "boundBottom", "boundTop"];
const isToken = (id) => /^(cab-|corner-)/.test(String(id));

function splittable(mod) {
  return mod && mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet" && Array.isArray(mod.elements);
}

// Dzielnik rozpina całe wnętrze po drugiej osi i żaden inny dzielnik nie przecina miejsca cięcia.
function dividerProblem(mod, d, A, inner) {
  const spans = A.pos === "y"
    ? d.x <= inner.minX + EPS && d.x + d.w >= inner.maxX - EPS
    : d.y <= inner.minY + EPS && d.y + d.h >= inner.maxY - EPS;
  if (!spans) return "dzielnik nie rozpina całego wnętrza";
  const lo = d[A.pos];
  const hi = lo + d[A.size];
  const cross = mod.elements.find((e) => e !== d && (e.typ === "poziom" || e.typ === "pion")
    && e[A.pos] < hi - EPS && e[A.pos] + e[A.size] > lo + EPS);
  return cross ? "w tym miejscu przecina go inny dzielnik" : null;
}

function frontExtent(e, A) {
  return [num(e.baseZone[A.min]), num(e.baseZone[A.max])];
}

// Fronty obejmujące miejsce cięcia (tablica elementów szafki).
function straddlers(mod, d, A) {
  const lo = d[A.pos];
  const hi = lo + d[A.size];
  return mod.elements.filter((e) => {
    if (e.typ !== "front" || !e.baseZone || e.cornerArm) return false;
    const [a, b] = frontExtent(e, A);
    return !(b <= lo + EPS || a >= hi - EPS);
  });
}

const FRONT_NAMES = { drzwi: "Drzwi", "drzwi-lp": "Drzwi", szuflada: "Szuflada", "szuflada-wewnetrzna": "Szuflada wewn." };

function frontLabel(e) {
  const n = FRONT_NAMES[e.subtype] || e.subtype;
  return e.frontCount > 1 ? `${n} ${(e.frontIndex || 0) + 1} z ${e.frontCount}` : n;
}

// Miejsca, w których da się podzielić szafkę, z frontami zahaczającymi o cięcie.
export function listSplitPoints(mod) {
  if (!splittable(mod)) return [];
  recalculateLayout(mod);
  const inner = getCabinetInnerRect(mod);
  const out = [];
  mod.elements.forEach((d) => {
    if (d.typ !== "poziom" && d.typ !== "pion") return;
    if (d.cornerArm) return;
    const axis = d.typ === "poziom" ? "h" : "v";
    const A = AXES[axis];
    if (dividerProblem(mod, d, A, inner)) return;
    const at = Math.round(d[A.pos] * 10) / 10;
    out.push({
      id: d.id,
      axis,
      pos: at,
      structural: !!d.isStructural,
      label: axis === "h"
        ? `${d.isStructural ? "Półka stała" : "Półka"} na ${at} mm — dolny i górny korpus`
        : `${d.isStructural ? "Przegroda" : "Przegroda luźna"} na ${at} mm — lewy i prawy korpus`,
      fronts: straddlers(mod, d, A).map((e) => ({ id: e.id, subtype: e.subtype, label: frontLabel(e) })),
    });
  });
  return out.sort((a, b) => (a.axis === b.axis ? a.pos - b.pos : a.axis === "h" ? -1 : 1));
}

// Zmienia wymiar korpusu tak, by wnętrze się dopasowało (półki, przegrody), a wnęki frontów
// niepowiązane z krawędziami korpusu poszły za wnętrzem (jak przy zmianie dekoru).
function refitTo(mod, dim, value) {
  const old = getCabinetInnerRect(mod);
  refitInterior(mod, () => { mod.dimensions[dim] = value; });
  const nw = getCabinetInnerRect(mod);
  const remap = (v, o0, o1, n0, n1) => (o1 === o0 ? v : n0 + ((v - o0) / (o1 - o0)) * (n1 - n0));
  mod.elements.forEach((e) => {
    const z = e.typ === "front" && e.baseZone;
    if (!z) return;
    if (!z.boundLeft && z.minX != null) z.minX = remap(num(z.minX), old.minX, old.maxX, nw.minX, nw.maxX);
    if (!z.boundRight && z.maxX != null) z.maxX = remap(num(z.maxX), old.minX, old.maxX, nw.minX, nw.maxX);
    if (!z.boundBottom && z.minY != null) z.minY = remap(num(z.minY), old.minY, old.maxY, nw.minY, nw.maxY);
    if (!z.boundTop && z.maxY != null) z.maxY = remap(num(z.maxY), old.minY, old.maxY, nw.minY, nw.maxY);
  });
}

// Powiązania frontów z elementami, których w tej części nie ma (dzielnik, front drugiej strony):
// przy krawędzi korpusu → krawędź korpusu, inaczej zostaje sama liczba.
function fixDanglingBounds(mod, A) {
  const ids = new Set(mod.elements.map((e) => e.id));
  const inner = getCabinetInnerRect(mod);
  mod.elements.forEach((e) => {
    const z = e.typ === "front" && e.baseZone;
    if (!z) return;
    BOUND_KEYS.forEach((k) => {
      if (!z[k] || isToken(z[k]) || ids.has(z[k])) return;
      const side = { boundLeft: ["minX", "cab-left"], boundRight: ["maxX", "cab-right"], boundBottom: ["minY", "cab-bottom"], boundTop: ["maxY", "cab-top"] }[k];
      z[k] = Math.abs(num(z[side[0]]) - inner[side[0]]) < EPS ? side[1] : null;
    });
  });
  return A;
}

// Czysta funkcja: zwraca { first, second } (nowe obiekty szafek, bez wstawiania do projektu).
// opts: { dividerId, fronts?: { [idFrontu]: 'both'|'first'|'second' }, straddle?: 'both'|'first'|'second' }
export function splitModule(mod, project, opts = {}) {
  if (!splittable(mod)) throw new Error("Tego rodzaju szafki (narożna, pod skos) nie da się podzielić na korpusy.");
  const src = JSON.parse(JSON.stringify(mod));
  recalculateLayout(src);
  const d = src.elements.find((e) => e.id === opts.dividerId);
  if (!d || (d.typ !== "poziom" && d.typ !== "pion")) throw new Error("Wskaż półkę albo przegrodę, na której dzielimy (listSplitPoints).");
  const axis = d.typ === "poziom" ? "h" : "v";
  const A = AXES[axis];
  if (axis === "v" && (src.rotation || 0) % 360 !== 0) throw new Error("Podział pionowy działa tylko dla szafki ustawionej tyłem do ściany z=0 (obrót 0°) — obróć szafkę albo podziel poziomo.");
  const th = moduleBoardThickness(src, project);
  const inner = getCabinetInnerRect(src);
  const problem = dividerProblem(src, d, A, inner);
  if (problem) throw new Error(`Nie można podzielić na tym dzielniku: ${problem}.`);

  const dLo = d[A.pos];
  const dHi = dLo + d[A.size];
  const dimOld = num(src.dimensions[A.dim]);
  const cLen = dimOld - inner[A.max]; // o ile wymiar szafki przekracza światło (grubość wieńca)
  const shift = th - dHi; // przesunięcie wnętrza drugiej części
  const dim1 = axis === "h" ? dLo + cLen : Math.round(dLo + d[A.size] / 2);
  const dim2 = dimOld - dim1;

  const first = JSON.parse(JSON.stringify(src));
  const second = cloneModuleWithNewIds(src);
  const mode = (e) => (opts.fronts && opts.fronts[e.id]) || opts.straddle || "both";
  const keep1 = [];
  const keep2 = [];
  const stay = []; // fronty zostające w jednym korpusie, a sięgające drugiego
  const copy = (arr, i) => arr[i];
  const move2 = (e) => {
    e[A.pos] += shift;
    if (e.baseZone) {
      e.baseZone[A.min] = num(e.baseZone[A.min]) + shift;
      e.baseZone[A.max] = num(e.baseZone[A.max]) + shift;
    }
    return e;
  };

  src.elements.forEach((e, i) => {
    if (e === d) return;
    if (e.typ === "poziom" || e.typ === "pion") {
      if (e[A.pos] + e[A.size] <= dLo + EPS) keep1.push(copy(first.elements, i));
      else keep2.push(move2(copy(second.elements, i)));
      return;
    }
    if (e.typ !== "front" || !e.baseZone || e.cornerArm) {
      keep1.push(copy(first.elements, i)); // element spoza modelu wnętrza - zostaje przy pierwszym
      return;
    }
    const [zl, zh] = frontExtent(e, A);
    if (zh <= dLo + EPS) { keep1.push(copy(first.elements, i)); return; }
    if (zl >= dHi - EPS) { keep2.push(move2(copy(second.elements, i))); return; }
    const m = mode(e);
    const clip1 = (f) => { f.baseZone[A.max] = dLo; f.baseZone[A.bHi] = A.tHi; };
    const clip2 = (f) => { f.baseZone[A.min] = inner[A.min]; f.baseZone[A.bLo] = A.tLo; };
    if (m === "first" || m === "both") {
      const f = copy(first.elements, i);
      clip1(f);
      if (m === "first") stay.push({ el: f, side: 1, edge: zh });
      else delete f.hingeOverrides;
      keep1.push(f);
    }
    if (m === "second" || m === "both") {
      const f = move2(copy(second.elements, i));
      const lowEdge = num(f.baseZone[A.min]); // po przesunięciu, przed przycięciem
      clip2(f);
      if (m === "second") stay.push({ el: f, side: 2, edge: lowEdge });
      else delete f.hingeOverrides;
      keep2.push(f);
    }
  });

  // pierwsza część: ten sam układ współrzędnych, wymiar tymczasowo taki, by wnętrze kończyło się na dzielniku
  first.elements = keep1;
  first.dimensions[A.dim] = dLo + cLen;
  fixDanglingBounds(first, A);
  if (num(first.dimensions[A.dim]) !== dim1) refitTo(first, A.dim, dim1);

  // druga część: wnętrze przesunięte tak, by zaczynało się od wieńca / boku
  second.elements = keep2;
  second.dimensions[A.dim] = dimOld + shift;
  fixDanglingBounds(second, A);
  refitTo(second, A.dim, dim2);

  // fronty zasłaniające oba korpusy: wnęka wychodzi poza korpus o ujemny offset
  const nw1 = getCabinetInnerRect(first);
  const nw2 = getCabinetInnerRect(second);
  stay.forEach(({ el, side, edge }) => {
    const z = el.baseZone;
    if (side === 1) z[A.oHi] = nw1[A.max] - edge;
    else z[A.oLo] = edge - nw2[A.min];
  });

  first.dimensions[A.dim] = dim1;
  second.dimensions[A.dim] = dim2;
  if (axis === "h") {
    const legH = first.legs && first.legs.active ? num(first.legs.height) || 100 : 0;
    second.position = { ...second.position, y: num(first.position?.y) + legH + dim1 };
    second.legs = { ...(second.legs || {}), active: false, plinth: false };
  } else {
    second.position = { ...second.position, x: num(first.position?.x) + dim1 };
  }
  const base = String(src.name || "Szafa");
  first.name = `${base} ${A.names[0]}`;
  second.name = `${base} ${A.names[1]}`;
  recalculateLayout(first);
  recalculateLayout(second);
  return { first, second, axis };
}

// Dzieli szafkę w projekcie: oryginał staje się pierwszą częścią, druga trafia zaraz za nim.
export function applySplit(mod, opts = {}, project = state.project) {
  const { first, second, axis } = splitModule(mod, project, opts);
  Object.keys(mod).forEach((k) => { delete mod[k]; });
  Object.assign(mod, first);
  const i = project.modules.indexOf(mod);
  project.modules.splice(i + 1, 0, second);
  return { first: mod, second, axis };
}
