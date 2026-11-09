// src/core/autoClearance.js
//
// Luzy frontów "Auto": zamiast wpisywać cztery luzy w każdej szafce, liczą się one z tego,
// co sąsiaduje z daną krawędzią korpusu. Zasady z warsztatu (szczelina = "Przerwa między
// frontami", domyślnie 3 mm):
//   boki:  front sąsiedniej szafki / ściana / pusto -> połowa szczeliny (1,5),
//          blenda albo bok dokładany -> cała szczelina (3),
//          zmywarka w zabudowie -> szczelina minus luz frontu zmywarki (3 - 2,5 = 0,5);
//   góra:  szafka postawiona wyżej albo blenda górna -> 3, blat albo sufit -> 5, pusto -> 1,5;
//   dół:   cokół zlicowany z frontami -> 3, panel pod szafką -> front schodzi poniżej korpusu
//          o grubość panelu + 12 (luz ujemny), cokół cofnięty / szafka niżej / nic -> 0.
// Szafka otwarta stojąca w licu frontów (korpus wysunięty przed sąsiadów o grubość frontu)
// liczy się jak blenda: cała szczelina po stronie frontu - z boku, u góry i na dole.
// Sąsiedztwo jest geometryczne (co faktycznie przylega), nie po grupach. Czysta logika:
// dostaje szafkę i projekt, niczego nie zmienia.
import { getModuleBox } from "./layout.js";

export const AUTO_CLEARANCE_DEFAULTS = {
  free: null,          // wolna krawędź boczna / górna; null = połowa szczeliny
  worktop: 5,          // góra frontu pod blatem
  ceiling: 5,          // góra frontu szafki przy suficie
  ceilingReach: 50,    // szafka jest "przy suficie", gdy do sufitu zostaje najwyżej tyle
  dishwasherSide: 2.5, // luz boczny frontu zmywarki (front węższy o 2 × tyle)
  panelDrop: 12,       // o ile front schodzi poniżej panelu pod szafką wiszącą
};

const TOUCH = 2;        // mm - elementy bliżej niż tyle "przylegają"
const MIN_OVERLAP = 10; // mm wspólnego odcinka, żeby uznać sąsiedztwo
const FRONT_REACH = 25; // blenda stoi w licu frontów, czyli przed korpusem
const PROUD_MIN = 10;   // sąsiednia szafka wysunięta przed korpus o tyle stoi w licu frontów

const AUTO_TYPES = ["base_cabinet", "upper_cabinet", "tall_cabinet"];

export function autoClearanceSettings(project) {
  return { ...AUTO_CLEARANCE_DEFAULTS, ...((project && project.front && project.front.autoClearance) || {}) };
}

// Luz boczny frontu zmywarki - wspólny dla zmywarki (core/dishwasher.js) i szafek obok niej.
export function dishwasherSideClearance(project) {
  const v = parseFloat(autoClearanceSettings(project).dishwasherSide);
  return Number.isFinite(v) ? v : AUTO_CLEARANCE_DEFAULTS.dishwasherSide;
}

const mergedFront = (mod, project) => ({ ...((project && project.front) || {}), ...((mod && mod.front) || {}) });

// Czy ta szafka liczy luzy sama: włączone w szafce, zwykła szafka, fronty nakładane
// (przy wpuszczanych luz to szczelina we wnęce - sąsiedzi nie mają na nią wpływu).
export function isAutoClearance(mod, project) {
  if (!mod || !mod.front || mod.front.clearanceAuto !== true) return false;
  if (!AUTO_TYPES.includes(mod.type)) return false;
  return mergedFront(mod, project).type !== "wpuszczane";
}

const rotOf = (o) => (((parseFloat(o && o.rotation) || 0) % 360) + 360) % 360;

// Bryła w układzie szafki o obrocie `rot`: u rośnie jak lokalna oś X szafki (lewy bok = u0),
// d to oś w głąb, fr = położenie przodu (większe = bardziej do przodu). Patrz wallToWorld w core/wallFill.js (oś X szafki rośnie z u ściany).
function toFrame(box, rot) {
  const y = { y0: box.y0, y1: box.y1 };
  if (rot === 90) return { u0: box.z0, u1: box.z1, d0: box.x0, d1: box.x1, fr: -box.x0, ...y };
  if (rot === 180) return { u0: -box.x1, u1: -box.x0, d0: box.z0, d1: box.z1, fr: -box.z0, ...y };
  if (rot === 270) return { u0: -box.z1, u1: -box.z0, d0: box.x0, d1: box.x1, fr: box.x1, ...y };
  return { u0: box.x0, u1: box.x1, d0: box.z0, d1: box.z1, fr: box.z1, ...y };
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const near = (a, b) => Math.abs(a - b) <= TOUCH;

// Wynik: { left, right, top, bottom }, każde { value, reason } - reason to krótki opis po polsku.
// `zone` = wnęka frontu { minX, maxX, minY, maxY } w mm od lewego dolnego narożnika korpusu:
// sąsiedzi są wtedy sprawdzani tylko na odcinku tego frontu (słupek obok otwartej szafki i
// szafek z frontami: każdy jego front dostaje luz boczny wg tego, co stoi obok NIEGO).
// Bez `zone` - cała szafka.
export function computeAutoClearance(mod, project, zone = null) {
  const s = autoClearanceSettings(project);
  const f = mergedFront(mod, project);
  const gapRaw = parseFloat(f.gap ?? 3);
  const gap = Number.isFinite(gapRaw) ? gapRaw : 3;
  const freeRaw = parseFloat(s.free);
  const free = Number.isFinite(freeRaw) ? freeRaw : gap / 2;

  const rot = rotOf(mod);
  const me = toFrame(getModuleBox(mod), rot);
  const others = (project.modules || []).filter((m) => m && m.id !== mod.id && m.dimensions && m.position)
    .map((m) => ({ kind: "szafka", b: toFrame(getModuleBox(m), rot) }));
  const panels = (project.sidePanels || []).filter((p) => p && p.dimensions && p.position)
    .map((p) => ({ kind: p.kind || "bok", th: parseFloat(p.dimensions.height) || 0, b: toFrame(getModuleBox(p), rot) }));

  const zn = (v, fb) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fb);
  const yR = zone ? [me.y0 + zn(zone.minY, 0), me.y0 + zn(zone.maxY, me.y1 - me.y0)] : [me.y0, me.y1];
  const uR = zone ? [me.u0 + zn(zone.minX, 0), me.u0 + zn(zone.maxX, me.u1 - me.u0)] : [me.u0, me.u1];
  const overY = (b) => overlap(yR[0], yR[1], b.y0, b.y1) > MIN_OVERLAP;
  const overU = (b) => overlap(uR[0], uR[1], b.u0, b.u1) > MIN_OVERLAP;
  const proud = (b) => b.fr - me.fr >= PROUD_MIN; // sąsiad w licu frontów (szafka otwarta)
  const overD = (b, min = MIN_OVERLAP) => overlap(me.d0 - FRONT_REACH, me.d1 + FRONT_REACH, b.d0, b.d1) > min;

  const side = (isLeft) => {
    const touches = (b) => (isLeft ? near(b.u1, me.u0) : near(b.u0, me.u1)) && overY(b) && overD(b, 1);
    const hit = panels.filter((p) => p.kind !== "poziomy" && touches(p.b));
    if (hit.some((p) => p.kind === "zmywarka")) return { value: gap - dishwasherSideClearance(project), reason: "zmywarka obok" };
    if (hit.some((p) => p.kind === "blenda")) return { value: gap, reason: "blenda obok" };
    if (hit.length) return { value: gap, reason: "bok dokładany obok" };
    if (others.some((o) => touches(o.b) && proud(o.b))) return { value: gap, reason: "otwarta szafka obok" };
    if (others.some((o) => touches(o.b))) return { value: free, reason: "szafka obok" };
    return { value: free, reason: "wolna krawędź" };
  };

  const top = () => {
    const above = (b) => near(b.y0, me.y1) && overU(b) && overD(b);
    if (others.some((o) => above(o.b))) return { value: gap, reason: "szafka wyżej" };
    if (panels.some((p) => p.kind === "blenda" && above(p.b))) return { value: gap, reason: "blenda górna" };
    const y0 = parseFloat(mod.position && mod.position.y) || 0;
    // szafka dolna stoi pod blatem także wtedy, gdy blatów nie liczy się w aplikacji
    // (wyłącza to dopiero „bez blatu” na szafce: mod.worktop === false)
    if (mod.type === "base_cabinet" && mod.worktop !== false && y0 < 600) {
      return { value: s.worktop, reason: "blat" };
    }
    const roomH = parseFloat(project.room && project.room.height);
    if (Number.isFinite(roomH) && roomH > 0 && roomH - me.y1 <= s.ceilingReach) return { value: s.ceiling, reason: "sufit" };
    return { value: free, reason: "wolna krawędź" };
  };

  const bottom = () => {
    const below = (b) => near(b.y1, me.y0) && overU(b) && overD(b);
    const panel = panels.find((p) => p.kind === "poziomy" && below(p.b));
    if (panel) return { value: -(panel.th + s.panelDrop), reason: "panel pod szafką" };
    if (others.some((o) => below(o.b) && proud(o.b))) return { value: gap, reason: "otwarta szafka niżej" };
    if (others.some((o) => below(o.b))) return { value: 0, reason: "szafka niżej" };
    const legs = mod.legs || {};
    if (legs.active && legs.plinth) {
      const off = parseFloat(legs.plinthOffset);
      // cokół wysunięty przed korpus = w licu frontów; cofnięty chowa się pod frontem
      if (Number.isFinite(off) && off < 0) return { value: gap, reason: "cokół w licu frontów" };
      return { value: 0, reason: "cokół cofnięty" };
    }
    return { value: 0, reason: "wolna krawędź" };
  };

  return { left: side(true), right: side(false), top: top(), bottom: bottom() };
}

const isSet = (v) => v !== undefined && v !== null && v !== "" && Number.isFinite(parseFloat(v));

// Luzy frontów szafki do obliczeń: JEDYNE miejsce scalania. Tryb ręczny - ustawienia projektu
// nadpisane ustawieniami szafki (jak dotąd). Tryb Auto - luzy z sąsiadów, a luz wpisany
// ręcznie w szafce (mod.front.clearance) ma pierwszeństwo.
export function frontClearance(mod, project, zone = null) {
  const local = (mod && mod.front && mod.front.clearance) || {};
  if (!isAutoClearance(mod, project)) {
    return { ...((project && project.front && project.front.clearance) || {}), ...local };
  }
  const auto = computeAutoClearance(mod, project, zone);
  const out = {};
  ["left", "right", "top", "bottom"].forEach((k) => {
    out[k] = isSet(local[k]) ? parseFloat(local[k]) : auto[k].value;
  });
  return out;
}

// Dane do panelu: wartość obowiązująca, wartość Auto, powód i czy nadpisana ręcznie.
export function describeClearance(mod, project) {
  const local = (mod && mod.front && mod.front.clearance) || {};
  const auto = computeAutoClearance(mod, project);
  const out = {};
  ["left", "right", "top", "bottom"].forEach((k) => {
    const manual = isSet(local[k]);
    out[k] = { value: manual ? parseFloat(local[k]) : auto[k].value, auto: auto[k].value, reason: auto[k].reason, manual };
  });
  return out;
}
