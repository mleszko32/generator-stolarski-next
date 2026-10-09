// src/core/wallFill.js
//
// Rozmieszczanie szafek na ścianie: wolne odcinki ściany (z pominięciem szafek,
// boków dokładanych, blend, okien i drzwi), podział odcinka na szerokości szafek
// (cztery tryby), reszta na blendę albo rozciągnięcie szafek, kontrola kolizji
// planu i wstawienie szafek do projektu. Czysta logika bez DOM - okno jest w
// ui/wallFillModal.js.
//
// Współrzędne ściany jak w core/walls.js: `u` wzdłuż ściany od jej lewego końca
// (patrząc od środka pokoju), `d` = odległość od lica ściany w głąb pokoju.
// Lokalna oś X szafki o obrocie danej ściany zawsze rośnie razem z `u`, więc
// "lewa"/"prawa" w szafce i blendzie to lewa/prawa na rzucie ściany.
import { state, createModuleObject, cloneModuleWithNewIds, ensureSidePanelsDefaults } from "./state.js";
import { getRoom, wallLength } from "./walls.js";
import { getOpenings, OPENING_KINDS } from "./openings.js";
import { getWorldFootprint } from "./layout.js";
import { getSidePanelBox } from "./moduleDrag.js";
import { num } from "../utils/math.js";

export const WALL_ROTATION = { tyl: 0, prawa: 90, przednia: 180, lewa: 270 };

export const ROW_TYPES = [
  { type: "base_cabinet", label: "Dolne" },
  { type: "upper_cabinet", label: "Wiszące" },
  { type: "tall_cabinet", label: "Słupki" },
];

export const STANDARD_WIDTHS = [300, 400, 450, 500, 600, 800, 900];

// Front nakładany wystaje przed korpus (płyta frontu + szczelina) - pas zajęty
// przy ścianie jest o tyle głębszy niż sam korpus.
export const FRONT_ALLOWANCE = 20;
// Reszta mniejsza od tego to zwykły luz montażowy, a nie blenda.
export const MIN_FILLER = 3;
export const MIN_CABINET_WIDTH = 150;
const PREFERRED_WIDTH = 600;
const BLENDA_DEPTH = 80;
const EPS = 0.5;
const MAX_SEARCH_NODES = 400000;

const overlap1d = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const floorTo = (v, step) => (step > 0 ? Math.floor(v / step + 1e-9) * step : v);

// Prostokąt w pasie przy ścianie (u0..u0+width wzdłuż ściany, d0..d0+depth w głąb)
// -> prostokąt w pokoju { x0, x1, z0, z1 } + obrót szafki stojącej tyłem do tej
// ściany. Odwrotność worldToWall.
export function wallToWorld(wallId, room, u0, width, d0, depth) {
  const W = num(room.width), D = num(room.depth);
  switch (wallId) {
    case "prawa": return { x0: W - d0 - depth, x1: W - d0, z0: u0, z1: u0 + width, rotation: 90 };
    case "przednia": return { x0: W - u0 - width, x1: W - u0, z0: D - d0 - depth, z1: D - d0, rotation: 180 };
    case "lewa": return { x0: d0, x1: d0 + depth, z0: D - u0 - width, z1: D - u0, rotation: 270 };
    default: return { x0: u0, x1: u0 + width, z0: d0, z1: d0 + depth, rotation: 0 };
  }
}

// Prostokąt w pokoju { x0, x1, z0, z1 } -> przedziały { u0, u1, d0, d1 } względem ściany.
export function worldToWall(wallId, room, box) {
  const W = num(room.width), D = num(room.depth);
  switch (wallId) {
    case "prawa": return { u0: box.z0, u1: box.z1, d0: W - box.x1, d1: W - box.x0 };
    case "przednia": return { u0: W - box.x1, u1: W - box.x0, d0: D - box.z1, d1: D - box.z0 };
    case "lewa": return { u0: D - box.z1, u1: D - box.z0, d0: box.x0, d1: box.x1 };
    default: return { u0: box.x0, u1: box.x1, d0: box.z0, d1: box.z1 };
  }
}

// Wymiary rzędu szafek: z szafki-wzoru albo domyślne dla typu (createModuleObject).
// y0..y1 = pas zajęty w pionie (od spodu nóżek do góry korpusu).
export function rowProfile(type, template = null) {
  const src = template || createModuleObject(type);
  const legsH = src.legs && src.legs.active ? num(src.legs.height) : 0;
  const height = num(src.dimensions && src.dimensions.height, 720);
  const depth = num(src.dimensions && src.dimensions.depth, 513);
  const posY = num(src.position && src.position.y);
  return { type: src.type || type, height, depth, posY, legsH, y0: posY, y1: posY + legsH + height };
}

function moduleWorldBox(mod) {
  const { worldW, worldD } = getWorldFootprint(mod);
  const x0 = num(mod.position && mod.position.x);
  const z0 = num(mod.position && mod.position.z);
  const y0 = num(mod.position && mod.position.y);
  const legs = mod.legs && mod.legs.active ? num(mod.legs.height) : 0;
  return { x0, x1: x0 + worldW, z0, z1: z0 + worldD, y0, y1: y0 + legs + num(mod.dimensions && mod.dimensions.height) };
}

// Wszystko, co zajmuje pas rzędu przy ścianie: [{ u0, u1, kind, label, id }].
// kind: 'module' | 'panel' | 'okno' | 'drzwi' | 'inne'.
// Szafki, boki i blendy blokują, gdy nachodzą na pas (głębokość rzędu + front)
// i na wysokość rzędu - więc szafka na sąsiedniej ścianie w narożniku też.
// Otwory blokują na swojej ścianie (z odstępem `openingMargin` po bokach), a drzwi
// dodatkowo strefą przejścia głęboką na `doorPassage` - dzięki temu drzwi na
// sąsiedniej ścianie tuż przy narożniku odcinają koniec tej ściany.
export function findBlocked(project, wallId, row, { openingMargin = 0, doorPassage = 600 } = {}) {
  const room = getRoom(project);
  const L = wallLength(room, wallId);
  const stripD = row.depth + FRONT_ALLOWANCE;
  const blocked = [];
  const push = (box, y0, y1, kind, label, id) => {
    const loc = worldToWall(wallId, room, box);
    if (overlap1d(loc.d0, loc.d1, 0, stripD) <= EPS) return;
    if (overlap1d(y0, y1, row.y0, row.y1) <= EPS) return;
    if (overlap1d(loc.u0, loc.u1, 0, L) <= EPS) return;
    blocked.push({ u0: Math.max(0, loc.u0), u1: Math.min(L, loc.u1), kind, label, id });
  };

  (project.modules || []).forEach((m) => {
    const b = moduleWorldBox(m);
    push(b, b.y0, b.y1, "module", m.name || "Szafka", m.id);
  });
  (project.sidePanels || []).forEach((p) => {
    const b = getSidePanelBox(p);
    push(b, b.y0, b.y1, "panel", p.name || (p.kind === "blenda" ? "Blenda" : "Bok dokładany"), p.id);
  });
  getOpenings(project).forEach((op) => {
    const zone = op.kind === "drzwi" ? Math.max(1, num(doorPassage)) : 1;
    const b = wallToWorld(op.wall, room, op.u - openingMargin, op.width + 2 * openingMargin, 0, zone);
    push(b, op.sill, op.sill + op.height, op.kind, OPENING_KINDS[op.kind].label, op.id);
  });

  return blocked.sort((a, b) => a.u0 - b.u0);
}

// Wolne odcinki ściany [{ u0, u1 }] (dłuższe niż minWidth) + to, co je ogranicza.
export function findFreeSegments(project, wallId, row, opts = {}) {
  const { minWidth = 100 } = opts;
  const room = getRoom(project);
  const length = wallLength(room, wallId);
  const blocked = findBlocked(project, wallId, row, opts);
  const segments = [];
  let cur = 0;
  blocked.forEach((b) => {
    if (b.u0 > cur) segments.push({ u0: cur, u1: b.u0 });
    cur = Math.max(cur, b.u1);
  });
  if (cur < length) segments.push({ u0: cur, u1: length });
  return { length, blocked, segments: segments.filter((s) => s.u1 - s.u0 >= minWidth) };
}

// "600, 800, *, *" albo "1:2:1" albo "3fr:100" -> [{ type: 'fixed'|'fr', value }].
// Ta sama zasada co przy frontach (core/layout.js): liczba do 10 to proporcja,
// większa to milimetry; "*" i "fr" to proporcja. Zwraca null przy błędzie.
export function parseSplit(str) {
  const tokens = String(str || "").trim().split(/[:;,\s]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const parts = [];
  for (const t of tokens) {
    if (t === "*") { parts.push({ type: "fr", value: 1 }); continue; }
    const fr = /^(\d+(?:[.,]\d+)?)?fr$/i.exec(t);
    if (fr) { parts.push({ type: "fr", value: fr[1] ? parseFloat(fr[1].replace(",", ".")) : 1 }); continue; }
    const v = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return null;
    parts.push(v <= 10 ? { type: "fr", value: v } : { type: "fixed", value: v });
  }
  return parts;
}

// Szerokości "surowe" -> wariant: reszta na blendę (restMode 'blenda') albo
// rozdzielona po 1 mm na szafki z maski `stretchable` (restMode 'stretch').
function finishVariant(widths, length, opts, stretchable = null) {
  const { restMode = "blenda", fillerSide = "right", maxFiller = 150 } = opts;
  const w = widths.slice();
  const warnings = [];
  let rest = Math.floor(length) - w.reduce((s, x) => s + x, 0);

  if (restMode === "stretch" && rest > 0 && w.length > 0) {
    const idx = w.map((_, i) => i).filter((i) => !stretchable || stretchable[i]);
    const targets = idx.length ? idx : w.map((_, i) => i);
    const base = Math.floor(rest / targets.length);
    const extra = rest - base * targets.length;
    targets.forEach((i, k) => { w[i] += base + (k < extra ? 1 : 0); });
    rest = 0;
  }
  rest += length - Math.floor(length);
  rest = Math.round(rest * 10) / 10;

  const fillers = [];
  if (restMode === "blenda" && rest >= MIN_FILLER) {
    if (fillerSide === "both") {
      const left = Math.floor(rest / 2);
      fillers.push({ side: "left", width: left }, { side: "right", width: Math.round((rest - left) * 10) / 10 });
    } else {
      fillers.push({ side: fillerSide === "left" ? "left" : "right", width: rest });
    }
    if (fillers.some((f) => f.width > maxFiller)) warnings.push(`Blenda szersza niż ${maxFiller} mm.`);
  }
  if (w.some((x) => x < MIN_CABINET_WIDTH)) warnings.push(`Szafka węższa niż ${MIN_CABINET_WIDTH} mm.`);
  return { widths: w, rest, fillers, warnings };
}

// Kombinacje szerokości katalogowych z sumą w [length - maxRest, length].
function enumerateStandard(length, catalog, maxRest, maxCount) {
  const ws = [...new Set(catalog.filter((x) => x > 0))].sort((a, b) => b - a);
  const out = [];
  if (!ws.length) return out;
  const low = length - maxRest;
  const counts = new Array(ws.length).fill(0);
  let nodes = 0;
  const dfs = (i, sum, n) => {
    if (++nodes > MAX_SEARCH_NODES) return;
    if (i === ws.length - 1) {
      const k = Math.min(Math.floor((length - sum) / ws[i]), maxCount - n);
      const total = sum + k * ws[i];
      if (total >= low && total > 0) {
        counts[i] = k;
        out.push({ counts: counts.slice(), sum: total, n: n + k });
        counts[i] = 0;
      }
      return;
    }
    const maxK = Math.min(Math.floor((length - sum) / ws[i]), maxCount - n);
    for (let k = maxK; k >= 0; k--) {
      counts[i] = k;
      dfs(i + 1, sum + k * ws[i], n + k);
    }
    counts[i] = 0;
  };
  dfs(0, 0, 0);
  return out.map((c) => ({
    widths: c.counts.flatMap((k, i) => new Array(k).fill(ws[i])),
    sum: c.sum,
    distinct: c.counts.filter((k) => k > 0).length,
  }));
}

// Opis wariantu do listy: "3 × 600 + 500".
export function describeWidths(widths) {
  const groups = [];
  widths.forEach((w) => {
    const last = groups[groups.length - 1];
    if (last && last.w === w) last.n++;
    else groups.push({ w, n: 1 });
  });
  return groups.map((g) => (g.n > 1 ? `${g.n} × ${fmt(g.w)}` : fmt(g.w))).join(" + ");
}
const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

// Warianty podziału odcinka o długości `length`. opts.mode:
//   'standard' - kombinacje z katalogu szerokości (opts.catalog), najmniejsza reszta,
//   'equal'    - N równych szafek (opts.count; puste = kilka propozycji N),
//   'fixed'    - stałe szerokości + "*" na resztę (opts.split, np. "600, 800, *, *"),
//   'ratio'    - proporcje jak przy frontach (opts.split, np. "1:2:1").
// Wspólne: restMode 'blenda'|'stretch', fillerSide 'left'|'right'|'both', maxFiller,
// roundTo (zaokrąglenie szerokości w dół, mm), maxVariants.
// Zwraca [{ widths, rest, fillers, warnings, label }] albo [{ error }].
export function divideSegment(length, opts = {}) {
  const { mode = "standard", roundTo = 1, maxFiller = 150, maxVariants = 6 } = opts;
  const L = Math.max(0, num(length));
  if (L < MIN_CABINET_WIDTH) return [{ error: `Odcinek ma tylko ${fmt(L)} mm - za mało na szafkę.` }];

  if (mode === "equal") {
    const n = Math.round(num(opts.count));
    const counts = n > 0 ? [n] : equalCountCandidates(L).slice(0, maxVariants);
    if (!counts.length) return [{ error: "Nie da się podzielić odcinka na szafki 300–900 mm - podaj liczbę szafek." }];
    return counts.map((k) => {
      const w = opts.restMode === "stretch" ? Math.floor(L / k) : floorTo(L / k, roundTo);
      const v = finishVariant(new Array(k).fill(w), L, opts);
      return { ...v, label: `${k} × ${fmt(v.widths[0])}${v.widths.some((x) => x !== v.widths[0]) ? " (±1)" : ""}` };
    });
  }

  if (mode === "fixed" || mode === "ratio") {
    const parts = parseSplit(opts.split);
    if (!parts) return [{ error: "Niepoprawny podział - wpisz np. 600, 800, *, * albo 1:2:1." }];
    const fixedTotal = parts.reduce((s, p) => s + (p.type === "fixed" ? p.value : 0), 0);
    const frTotal = parts.reduce((s, p) => s + (p.type === "fr" ? p.value : 0), 0);
    const avail = L - fixedTotal;
    if (avail < 0) return [{ error: `Stałe szerokości (${fmt(fixedTotal)} mm) nie mieszczą się w odcinku (${fmt(L)} mm).` }];
    const raw = parts.map((p) => (p.type === "fixed" ? p.value : floorTo((avail * p.value) / frTotal, opts.restMode === "stretch" ? 1 : roundTo)));
    const v = finishVariant(raw, L, opts, parts.map((p) => p.type === "fr"));
    return [{ ...v, label: describeWidths(v.widths) }];
  }

  // 'standard'
  const catalog = (opts.catalog && opts.catalog.length ? opts.catalog : STANDARD_WIDTHS).map(num).filter((x) => x >= MIN_CABINET_WIDTH);
  if (!catalog.length) return [{ error: `Katalog szerokości jest pusty (szafki od ${MIN_CABINET_WIDTH} mm).` }];
  const maxCount = Math.max(1, Math.ceil(L / Math.min(...catalog)));
  let found = [];
  for (let maxRest = Math.max(1, maxFiller); found.length === 0; maxRest *= 2) {
    found = enumerateStandard(L, catalog, maxRest, maxCount);
    if (maxRest >= L) break;
  }
  if (!found.length) return [{ error: "Żadna kombinacja szerokości z katalogu nie mieści się w odcinku." }];
  // Najmniejsza reszta, potem ocena: średnie odchylenie od 600 mm (typowa szafka,
  // jedne drzwi - inaczej wygrywały same szerokie 800/900) + kara za każdą kolejną
  // inną szerokość, na końcu mniej szafek.
  const score = (c) => c.widths.reduce((s, x) => s + Math.abs(x - PREFERRED_WIDTH), 0) / c.widths.length + 60 * (c.distinct - 1);
  found.sort((a, b) => (b.sum - a.sum) || (score(a) - score(b)) || (a.widths.length - b.widths.length));
  return found.slice(0, maxVariants).map((c) => {
    const v = finishVariant(c.widths, L, opts);
    if (opts.restMode === "stretch" && L - c.sum > maxFiller) v.warnings.push(`Szafki rozciągnięte łącznie o ${fmt(L - c.sum)} mm (więcej niż ${maxFiller} mm).`);
    return { ...v, label: describeWidths(v.widths) };
  });
}

// Liczby szafek dające szerokości 300–900 mm, od najbliższej 600 mm.
function equalCountCandidates(L) {
  const out = [];
  for (let k = Math.max(1, Math.ceil(L / 900)); k <= Math.floor(L / 300); k++) out.push(k);
  return out.sort((a, b) => Math.abs(L / a - PREFERRED_WIDTH) - Math.abs(L / b - PREFERRED_WIDTH));
}

// Wariant -> elementy na ścianie w kolejności od lewej:
// [{ kind: 'cabinet'|'blenda', u0, width, flange? }]. Blenda ma kołnierz od strony szafki.
export function buildFillItems(segment, variant) {
  const items = [];
  let u = num(segment.u0);
  const left = variant.fillers.find((f) => f.side === "left");
  const right = variant.fillers.find((f) => f.side === "right");
  if (left) { items.push({ kind: "blenda", u0: u, width: left.width, flange: "prawa" }); u += left.width; }
  variant.widths.forEach((w) => { items.push({ kind: "cabinet", u0: u, width: w }); u += w; });
  if (right) items.push({ kind: "blenda", u0: u, width: right.width, flange: "lewa" });
  return items;
}

// Kolizje elementów planu z tym, co już stoi przy ścianie (findBlocked), i z końcami ściany.
// Zwraca listę komunikatów (pusta = plan się mieści).
export function findPlanConflicts(items, blocked, wallLen) {
  const out = [];
  let n = 0;
  items.forEach((it) => {
    const name = it.kind === "cabinet" ? `Szafka ${++n} (${fmt(it.width)} mm)` : `Blenda (${fmt(it.width)} mm)`;
    const u1 = it.u0 + it.width;
    if (it.u0 < -EPS || u1 > wallLen + EPS) out.push(`${name} wystaje poza ścianę.`);
    blocked.forEach((b) => {
      const o = overlap1d(it.u0, u1, b.u0, b.u1);
      if (o > 1) out.push(`${name} nachodzi na: ${b.label} (${fmt(o)} mm).`);
    });
  });
  return out;
}

// Wstawia plan do state.project: szafki (kopie wzoru albo nowe domyślne) i blendy
// przy ścianie wallId. Zwraca { modules, panels }. Wołający odświeża widoki.
export function applyFillPlan({ wallId, items, type, template = null }) {
  const project = state.project;
  const room = getRoom(project);
  const row = rowProfile(type, template);
  const rotation = WALL_ROTATION[wallId] ?? 0;
  const modules = [];
  const panels = [];

  items.filter((it) => it.kind === "cabinet").forEach((it) => {
    const fresh = createModuleObject(row.type);
    const mod = template ? cloneModuleWithNewIds(template) : fresh;
    if (template) { delete mod.groupId; mod.name = fresh.name; }
    const box = wallToWorld(wallId, room, it.u0, it.width, 0, row.depth);
    mod.dimensions = { ...mod.dimensions, width: it.width };
    mod.rotation = rotation;
    mod.position = { x: round2(box.x0), y: row.posY, z: round2(box.z0) };
    project.modules.push(mod);
    modules.push(mod);
  });

  const blendas = items.filter((it) => it.kind === "blenda");
  if (blendas.length) {
    if (!Array.isArray(project.sidePanels)) project.sidePanels = [];
    const th = num(project.materials && project.materials.boardThickness, 18) || 18;
    const frontType = { ...(project.front || {}), ...((template && template.front) || {}) }.type || "nakladane";
    // Lico blendy równo z licem frontów (jak w migrateLegacyFillers, core/state.js).
    const zF = frontType === "wpuszczane" ? row.depth - th : row.depth + 2;
    const d0 = zF - (BLENDA_DEPTH - th);
    blendas.forEach((it) => {
      const count = project.sidePanels.filter((p) => p.kind === "blenda").length;
      const box = wallToWorld(wallId, room, it.u0, it.width, d0, BLENDA_DEPTH);
      const panel = {
        id: "blenda-" + Date.now() + Math.random().toString(36).slice(2, 7),
        kind: "blenda",
        name: "Blenda " + (count + 1),
        decor: "",
        flange: it.flange,
        position: { x: round2(box.x0), y: row.posY + row.legsH, z: round2(box.z0) },
        rotation,
        dimensions: { width: it.width, height: row.height, depth: BLENDA_DEPTH },
      };
      project.sidePanels.push(panel);
      panels.push(panel);
    });
  }

  // Wzór mógł pochodzić ze starego projektu z mod.fillers - ta sama droga co przy
  // wstawianiu szablonu z biblioteki.
  ensureSidePanelsDefaults(project);
  if (modules.length) {
    state.activeModuleId = modules[0].id;
    state.activeSidePanelId = null;
  }
  return { modules, panels };
}

const round2 = (v) => Math.round(v * 100) / 100;
