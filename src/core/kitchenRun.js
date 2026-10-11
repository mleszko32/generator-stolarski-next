// src/core/kitchenRun.js
//
// Zabudowa w kształcie L i U: kilka sąsiednich ścian naraz, zaczynając od narożników.
// Każdy narożnik ma swoje rozwiązanie:
//   'L'     - szafka narożna L (corner_cabinet) S×S, opcjonalnie z karuzelą,
//   'blind' - szafka ślepa (core/blindCorner.js) na jednej ze ścian, odsunięta od
//             narożnika tak, żeby drzwi minęły fronty sąsiedniej ściany + blenda
//             narożna na drugiej ścianie,
//   'dead'  - narożnik martwy: pusty kwadrat zakryty zaślepką na jednej ścianie +
//             blenda narożna na drugiej.
// Potem każda ściana jest wypełniana jak w core/wallFill.js (wolne odcinki, podział,
// reszta). Reszta szerokości idzie na koniec ściany z dala od narożnika.
//
// Plan liczony jest na KOPII projektu (state.project podmieniane na czas liczenia,
// jak w core/validate.js), więc podgląd niczego nie zmienia; applyKitchenRun dokłada
// gotowe obiekty do prawdziwego projektu.
import { state, addCornerModule, createModuleObject, cloneModuleWithNewIds, ensureSidePanelsDefaults } from "./state.js";
import { getRoom, wallLength, WALLS } from "./walls.js";
import { ensureCornerDefaults, getWorldFootprint } from "./layout.js";
import { getSidePanelBox } from "./moduleDrag.js";
import { buildZoneTree, assignFront } from "./zoneTree.js";
import { blindGeometry, blindHingeSide, innerDims } from "./blindCorner.js";
import { checkCornerFitting, getCornerFitting } from "./cornerFittings.js";
import {
  MIN_CABINET_WIDTH, WALL_ROTATION, ROW_TYPES, rowProfile, wallToWorld, worldToWall,
  findFreeSegments, divideSegment, buildFillItems, applyFillPlan,
} from "./wallFill.js";
import { num } from "../utils/math.js";

// Ściany w kolejności zgodnej z ruchem wskazówek zegara (widok z góry): koniec
// ściany (u = długość) styka się z początkiem następnej (u = 0) - patrz core/walls.js.
const CLOCKWISE = ["tyl", "prawa", "przednia", "lewa"];
const WALL_LABEL = Object.fromEntries(WALLS.map((w) => [w.id, w.label.replace("Ściana ", "")]));

// Obrót szafki narożnej L, której ramiona leżą na ścianach prev -> next
// (odwrotność CORNER_MAP z core/walls.js).
const CORNER_ROTATION = { "lewa>tyl": 0, "tyl>prawa": 90, "prawa>przednia": 180, "przednia>lewa": 270 };

export const CORNER_KINDS = [
  { id: "L", label: "Szafka narożna L" },
  { id: "blind", label: "Szafka ślepa" },
  { id: "dead", label: "Narożnik martwy" },
];

export const MIN_PASSAGE = 1200;   // przejście między frontami w kuchni U (praktyka PL)
export const MIN_PASSAGE_HARD = 1067; // 42" wg NKBA - poniżej się nie mieści

// Wszystkie układy L (2 ściany) i U (3 ściany) z sąsiednich ścian.
export function runPresets() {
  const out = [];
  [2, 3].forEach((n) => {
    for (let i = 0; i < 4; i++) {
      const walls = Array.from({ length: n }, (_, k) => CLOCKWISE[(i + k) % 4]);
      out.push({ id: walls.join("+"), shape: n === 2 ? "L" : "U", walls, label: `${n === 2 ? "L" : "U"}: ${walls.map((w) => WALL_LABEL[w]).join(" + ")}` });
    }
  });
  return out;
}

// Domyślne ustawienia narożnika dla rzędu (dolne: L 900, ślepa 1000 z frontem 500;
// wiszące: L 600, ślepa 800 z frontem 400).
export function defaultCorner(row) {
  const upper = row.depth < 400;
  return {
    kind: "L",
    size: upper ? 600 : 900,
    cornerFitting: "",
    blindOn: "next",
    width: upper ? 800 : 1000,
    frontWidth: upper ? 400 : 500,
    fitting: "",
    filler: 50,
  };
}

const uid = () => "mod-" + Date.now() + Math.random().toString(36).substring(2, 8);
const round2 = (v) => Math.round(v * 100) / 100;

function newCabinet(type, template) {
  const fresh = createModuleObject(type);
  if (!template) return fresh;
  const mod = cloneModuleWithNewIds(template);
  delete mod.groupId;
  mod.name = fresh.name;
  return mod;
}

function placeOnWall(mod, wallId, room, u0, width, depth, row) {
  const box = wallToWorld(wallId, room, u0, width, row.gap, depth);
  mod.rotation = WALL_ROTATION[wallId];
  mod.position = { x: round2(box.x0), y: row.posY, z: round2(box.z0) };
}

// Wstawia element narożny do (kopii) projektu. Zwraca { reserved: {wallId: [[a,b]]}, ends: {wallId: u} }
// - reserved: odcinki, których nie wypełniamy szafkami, ends: gdzie zaczyna się wolny ciąg przy narożniku.
function placeCorner(project, prev, next, c, ctx) {
  const { room, row, type, template, warnings } = ctx;
  const wallGap = row.gap;
  const Lp = wallLength(room, prev);
  const reserved = { [prev]: [], [next]: [] };
  const F = Math.max(0, num(c.filler));
  const depth = row.depth;
  const jointLabel = `${WALL_LABEL[prev]} / ${WALL_LABEL[next]}`;

  if (c.kind === "L") {
    const S = Math.max(depth + 200, num(c.size, 900));
    const mod = addCornerModule();
    mod.id = uid();
    mod.dimensions = { ...mod.dimensions, width: S, legB: S, depth, height: row.height };
    delete mod.dimensions.depthB;
    const legs = (template && template.legs) || createModuleObject(type).legs;
    mod.legs = JSON.parse(JSON.stringify(legs));
    if (getCornerFitting(c.cornerFitting)) mod.cornerFitting = c.cornerFitting;
    // Odsunięta o szczelinę od obu ścian: zajmuje na każdej ścianie odsunięcie + S.
    const box = wallToWorld(prev, room, Lp - row.gap - S, S, row.gap, S);
    mod.rotation = CORNER_ROTATION[`${prev}>${next}`] ?? 0;
    mod.position = { x: round2(box.x0), y: row.posY, z: round2(box.z0) };
    ensureCornerDefaults(mod);
    if (mod.cornerFitting) {
      checkCornerFitting(mod.cornerFitting, { width: [S, S], innerHeight: row.height - 36 })
        .forEach((m) => warnings.push(`Narożnik ${jointLabel}: ${m}`));
    }
    return { reserved, modules: [mod], panels: [] };
  }

  const onPrev = c.blindOn === "prev";
  const X = onPrev ? prev : next;  // ściana z szafką ślepą / zaślepką
  const Y = onPrev ? next : prev;  // ściana z blendą narożną
  const Lx = wallLength(room, X), Ly = wallLength(room, Y);
  // Na ścianie X narożnik jest na końcu (u = Lx), gdy X to ściana poprzednia.
  const atX = (from, width) => (onPrev ? Lx - from - width : from);
  const atY = (from, width) => (onPrev ? from : Ly - from - width);
  const modules = [], panels = [];

  // Blenda narożna na ścianie Y, tuż za licem frontów ściany X (odsunięcie + korpus + front).
  const fillerStart = row.frontPlane;
  if (F > 0) {
    const r = applyFillPlan({ wallId: Y, items: [{ kind: "blenda", u0: atY(fillerStart, F), width: F, flange: onPrev ? "prawa" : "lewa" }], type, template, wallGap });
    panels.push(...r.panels);
  }
  // Na Y nic nie stawiamy przed blendą (pas zajęty przez szafkę / pusty narożnik).
  reserved[Y].push(onPrev ? [0, fillerStart] : [Ly - fillerStart, Ly]);

  if (c.kind === "blind") {
    const Wb = Math.max(MIN_CABINET_WIDTH * 2, num(c.width, 1000));
    const mod = newCabinet(type, template);
    mod.id = uid();
    mod.dimensions = { ...mod.dimensions, width: Wb };
    // Część ślepa od strony narożnika: na ścianie poprzedniej narożnik jest z prawej.
    const side = onPrev ? "right" : "left";
    const fit = getCornerFitting(c.fitting);
    // Mocowanie drzwi: listwa (zawias równoległy od strony narożnika), chyba że okucie
    // wymaga innego (Magic Corner - zwykły zawias na boku z dala od narożnika).
    const mount = fit && fit.mounts && !fit.mounts.includes("listwa") ? fit.mounts[0] : "listwa";
    mod.blindCorner = { active: true, side, frontWidth: num(c.frontWidth, 500), fitting: fit ? c.fitting : "", mount };
    mod.elements = mod.elements || [];
    const hingeSide = blindHingeSide(mod);
    if (!mod.elements.some((el) => el.typ === "front")) assignFront(mod, buildZoneTree(mod), "drzwi", { openingSide: hingeSide });
    mod.elements.forEach((el) => { if (el.typ === "front" && el.subtype === "drzwi") el.openingSide = hingeSide; });

    // Odsunięcie od ściany Y: drzwi muszą zacząć się za licem frontów Y + blendą.
    const reach = blindGeometry(mod, project).blindReach;
    const need = row.frontPlane + F;
    const pull = Math.max(0, Math.ceil(need - reach));
    placeOnWall(mod, X, room, atX(pull, Wb), Wb, depth, row);
    project.modules.push(mod);
    modules.push(mod);
    if (pull > 0) warnings.push(`Narożnik ${jointLabel}: szafka ślepa odsunięta od ściany o ${pull} mm (część ślepa za krótka na blendę ${F} mm) - wolne miejsce w narożniku zakrywa ciąg z sąsiedniej ściany.`);
    if (pull > 0) reserved[X].push(onPrev ? [Lx - pull, Lx] : [0, pull]);
    if (c.fitting) {
      const g = blindGeometry(mod, project);
      checkCornerFitting(c.fitting, { width: Wb, frontWidth: g.frontWidth, clearOpening: g.clearOpening, mount: g.mount, ...innerDims(mod, project) })
        .forEach((m) => warnings.push(`Narożnik ${jointLabel}: ${m}`));
    }
    return { reserved, modules, panels };
  }

  // 'dead': zaślepka na ścianie X od narożnika do lica frontów Y + blendy.
  const coverW = row.frontPlane + F;
  const r = applyFillPlan({ wallId: X, items: [{ kind: "blenda", u0: atX(0, coverW), width: coverW, flange: onPrev ? "lewa" : "prawa" }], type, template, wallGap });
  r.panels.forEach((p) => { p.name = "Zaślepka narożnika " + p.name.replace(/^Blenda /, ""); });
  panels.push(...r.panels);
  return { reserved, modules, panels };
}

function subtract(segments, cuts) {
  let out = segments.map((s) => ({ ...s }));
  cuts.forEach(([a, b]) => {
    out = out.flatMap((s) => {
      if (b <= s.u0 || a >= s.u1) return [s];
      const parts = [];
      if (a > s.u0) parts.push({ u0: s.u0, u1: a });
      if (b < s.u1) parts.push({ u0: b, u1: s.u1 });
      return parts;
    });
  });
  return out;
}

// opts: { walls: [ściany w kolejności zgodnej z zegarem], type, template,
//   corners: [ustawienia narożnika dla każdej pary sąsiednich ścian],
//   armLength: { wallId: mm } - długość ciągu na skrajnych ścianach liczona od narożnika (puste = cała ściana),
//   fill: opcje divideSegment (mode, catalog, count, split, restMode, maxFiller, roundTo, fillerSide),
//   choice: { 'wallId:i': indeks wariantu },
//   custom: { 'wallId:i': własne szerokości jak w trybie 'fixed', np. "600, 800, *, *" },
//   openingMargin, doorPassage,
//   wallGap - odsunięcie tyłu szafek od ściany (mm, domyślnie 0; okno podaje getWallGap),
//   ignoreIds - szafki/blendy zmienianej kuchni (findKitchenRunAround): liczone tak, jakby ich nie było }
// Zwraca { walls: [{ wallId, length, segments: [{ key, u0, u1, variants, chosen, items }] }],
//          modules, panels, warnings } - modules/panels to gotowe obiekty do wstawienia.
export function planKitchenRun(project, opts) {
  const { walls, type = "base_cabinet", template = null, corners = [], armLength = {}, fill = {}, choice = {}, custom = {} } = opts;
  const sim = JSON.parse(JSON.stringify(project));
  sim.modules = sim.modules || [];
  sim.sidePanels = sim.sidePanels || [];
  if (opts.ignoreIds && opts.ignoreIds.length) {
    const ignore = new Set(opts.ignoreIds);
    sim.modules = sim.modules.filter((m) => !ignore.has(m.id));
    sim.sidePanels = sim.sidePanels.filter((p) => !ignore.has(p.id));
  }
  const saved ={ project: state.project, active: state.activeModuleId, side: state.activeSidePanelId };
  state.project = sim;
  try {
    const room = getRoom(sim);
    const row = rowProfile(type, template, { wallGap: opts.wallGap });
    const warnings = [];
    const modules = [], panels = [];
    const reserved = Object.fromEntries(walls.map((w) => [w, []]));
    const ctx = { room, row, type, template, warnings };

    for (let i = 0; i < walls.length - 1; i++) {
      const c = { ...defaultCorner(row), ...(corners[i] || {}) };
      const r = placeCorner(sim, walls[i], walls[i + 1], c, ctx);
      Object.entries(r.reserved).forEach(([w, cuts]) => reserved[w].push(...cuts));
      modules.push(...r.modules);
      panels.push(...r.panels);
    }

    const out = walls.map((wallId, wi) => {
      const length = wallLength(room, wallId);
      const free = findFreeSegments(sim, wallId, row, { openingMargin: opts.openingMargin ?? 50, doorPassage: opts.doorPassage ?? 600 });
      const cuts = reserved[wallId].slice();
      // Długość ramienia na skrajnych ścianach (od narożnika).
      const arm = num(armLength[wallId]);
      if (arm > 0 && walls.length > 1) {
        if (wi === 0) cuts.push([0, Math.max(0, length - arm)]);
        if (wi === walls.length - 1) cuts.push([Math.min(length, arm), length]);
      }
      const startCorner = wi > 0, endCorner = wi < walls.length - 1;
      const segs = subtract(free.segments, cuts).filter((s) => s.u1 - s.u0 >= MIN_CABINET_WIDTH);
      // Narożnikowa strona odcinka = ta, przy której jest narożnik; reszta na drugi koniec.
      const nearStart = startCorner ? Math.min(...segs.map((s) => s.u0)) : null;
      const nearEnd = endCorner ? Math.max(...segs.map((s) => s.u1)) : null;
      return {
        wallId, length,
        segments: segs.map((s, si) => {
          const touchesStart = startCorner && s.u0 === nearStart;
          const touchesEnd = endCorner && s.u1 === nearEnd;
          const fillerSide = touchesStart && touchesEnd ? (fill.fillerSide || "right")
            : touchesStart ? "right" : touchesEnd ? "left" : (fill.fillerSide || "right");
          const key = `${wallId}:${si}`;
          // Własne szerokości wpisane dla tego odcinka mają pierwszeństwo przed podziałem ogólnym.
          const own = String(custom[key] || "").trim();
          const variants = divideSegment(s.u1 - s.u0, own ? { ...fill, fillerSide, mode: "fixed", split: own } : { ...fill, fillerSide });
          const chosen = Math.min(num(choice[key]), variants.length - 1);
          const v = variants[chosen];
          const items = v && !v.error ? buildFillItems(s, v) : [];
          return { key, u0: s.u0, u1: s.u1, variants, chosen, items, custom: own };
        }),
      };
    });

    out.forEach((w) => w.segments.forEach((s) => {
      if (!s.items.length) return;
      const r = applyFillPlan({ wallId: w.wallId, items: s.items, type, template, wallGap: row.gap });
      modules.push(...r.modules);
      panels.push(...r.panels);
    }));

    if (walls.length === 3 && type !== "upper_cabinet") {
      const span = (walls[0] === "lewa" || walls[0] === "prawa") ? room.width : room.depth;
      const passage = span - 2 * row.frontPlane;
      if (passage < MIN_PASSAGE_HARD) warnings.push(`Przejście między ramionami U ma tylko ${Math.round(passage)} mm - za mało (minimum ok. ${MIN_PASSAGE_HARD} mm).`);
      else if (passage < MIN_PASSAGE) warnings.push(`Przejście między ramionami U ma ${Math.round(passage)} mm - ciasno (zalecane co najmniej ${MIN_PASSAGE} mm).`);
    }
    return { walls: out, modules, panels, warnings, room };
  } finally {
    state.project = saved.project;
    state.activeModuleId = saved.active;
    state.activeSidePanelId = saved.side;
  }
}

// Dokłada wynik planKitchenRun do bieżącego projektu.
export function applyKitchenRun(plan) {
  const project = state.project;
  if (!Array.isArray(project.sidePanels)) project.sidePanels = [];
  project.modules.push(...plan.modules);
  project.sidePanels.push(...plan.panels);
  ensureSidePanelsDefaults(project);
  if (plan.modules.length) {
    state.activeModuleId = plan.modules[0].id;
    state.activeSidePanelId = null;
  }
  return { modules: plan.modules.length, panels: plan.panels.length };
}

// --- Zmiana podziału istniejącej kuchni L/U ---

const TOL = 2;
const ROW_TYPE_IDS = ROW_TYPES.map((r) => r.type);
const norm = (r) => ((num(r) % 360) + 360) % 360;
const wallOfRotation = (r) => Object.keys(WALL_ROTATION).find((w) => WALL_ROTATION[w] === norm(r));
const nextWall = (w) => CLOCKWISE[(CLOCKWISE.indexOf(w) + 1) % 4];
const prevWall = (w) => CLOCKWISE[(CLOCKWISE.indexOf(w) + 3) % 4];
const isBlind = (m) => !!(m.blindCorner && m.blindCorner.active);
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

function modWallLoc(room, wallId, m) {
  const { worldW, worldD } = getWorldFootprint(m);
  const x0 = num(m.position && m.position.x), z0 = num(m.position && m.position.z);
  return worldToWall(wallId, room, { x0, x1: x0 + worldW, z0, z1: z0 + worldD });
}

// Kuchnia L/U, do której należy szafka moduleId (zwykła szafka rzędu, szafka ślepa
// albo szafka narożna L): ściany połączone narożnikami (szafka L, szafka ślepa,
// zaślepka martwego narożnika) z szafkami i blendami tego samego rzędu (typ, wysokość
// posadowienia, odsunięcie od ściany). Rozpoznawana geometrycznie, więc działa tak
// samo dla kuchni wstawionej oknem i ułożonej ręcznie.
// Zwraca { walls, presetId, type, gap, corners (ustawienia jak w planKitchenRun),
//   armLength (obecny zasięg skrajnych ścian), cabinets: { wallId: [{ u0, u1, width }] },
//   moduleIds, panelIds, templateId } albo null, gdy szafka nie stoi w L/U.
export function findKitchenRunAround(project, moduleId) {
  const mods = project.modules || [];
  const sel = mods.find((m) => m.id === moduleId);
  if (!sel) return null;
  const room = getRoom(project);
  const posY = num(sel.position && sel.position.y);
  const sameY = (m) => Math.abs(num(m.position && m.position.y) - posY) <= TOL;

  let seedWalls, type;
  if (sel.type === "corner_cabinet") {
    const key = Object.keys(CORNER_ROTATION).find((k) => CORNER_ROTATION[k] === norm(sel.rotation));
    if (!key) return null;
    seedWalls = key.split(">");
    const nb = mods.find((m) => ROW_TYPE_IDS.includes(m.type) && sameY(m) && seedWalls.includes(wallOfRotation(m.rotation)));
    type = nb ? nb.type : num(sel.dimensions && sel.dimensions.depth) < 400 ? "upper_cabinet" : "base_cabinet";
  } else {
    const w = wallOfRotation(sel.rotation);
    if (!ROW_TYPE_IDS.includes(sel.type) || !w) return null;
    seedWalls = [w];
    type = sel.type;
  }
  const gap = Math.max(0, round2(modWallLoc(room, seedWalls[0], sel).d0));
  const rowMods = mods.filter((m) => m.type === type && sameY(m));
  const template = sel.type === type && !isBlind(sel) ? sel : rowMods.find((m) => !isBlind(m)) || null;
  const row = rowProfile(type, template, { wallGap: gap });
  const cornerMods = mods.filter((m) => m.type === "corner_cabinet" && sameY(m));
  const blendas = (project.sidePanels || []).filter((p) => p.kind === "blenda");

  const itemsCache = {};
  const wallItems = (wallId) => {
    if (itemsCache[wallId]) return itemsCache[wallId];
    const rot = WALL_ROTATION[wallId];
    const ms = rowMods.filter((m) => norm(m.rotation) === rot)
      .map((m) => ({ m, ...modWallLoc(room, wallId, m) }))
      .filter((c) => Math.abs(c.d0 - gap) <= TOL);
    const ps = blendas.filter((p) => norm(p.rotation) === rot).map((p) => {
      const b = getSidePanelBox(p);
      return { p, b, ...worldToWall(wallId, room, b) };
    }).filter((c) => overlap(c.b.y0, c.b.y1, row.y0, row.y1) > 1 && overlap(c.d0, c.d1, gap, row.frontPlane + 1) > 1);
    return (itemsCache[wallId] = { ms, ps });
  };

  // Narożnik między ścianami prev -> next (prev kończy się w narożniku, next w nim zaczyna).
  const cornerAt = (prev, next) => {
    const Lp = wallLength(room, prev);
    const L = cornerMods.find((m) => norm(m.rotation) === CORNER_ROTATION[`${prev}>${next}`]);
    if (L) return { kind: "L", size: num(L.dimensions.width), cornerFitting: L.cornerFitting || "" };
    const P = wallItems(prev), N = wallItems(next);
    const near = row.frontPlane + 200;
    // Blenda narożna na drugiej ścianie, tuż za licem frontów ściany z szafką ślepą / zaślepką.
    const fillerFor = (onPrev) => {
      const f = onPrev
        ? N.ps.find((c) => Math.abs(c.u0 - row.frontPlane) <= 5)
        : P.ps.find((c) => Math.abs(c.u1 - (Lp - row.frontPlane)) <= 5);
      return f ? round2(f.u1 - f.u0) : 0;
    };
    const blind = [
      { onPrev: true, c: P.ms.find((c) => isBlind(c.m) && c.m.blindCorner.side === "right" && Lp - c.u1 <= near) },
      { onPrev: false, c: N.ms.find((c) => isBlind(c.m) && c.m.blindCorner.side === "left" && c.u0 <= near) },
    ].find((x) => x.c);
    if (blind) {
      const bc = blind.c.m.blindCorner;
      return {
        kind: "blind", blindOn: blind.onPrev ? "prev" : "next", width: num(blind.c.m.dimensions.width),
        frontWidth: num(bc.frontWidth, 500), fitting: bc.fitting || "", filler: fillerFor(blind.onPrev),
      };
    }
    const dead = [
      { onPrev: true, c: P.ps.find((c) => Math.abs(c.u1 - Lp) <= TOL && c.u1 - c.u0 >= row.depth) },
      { onPrev: false, c: N.ps.find((c) => Math.abs(c.u0) <= TOL && c.u1 - c.u0 >= row.depth) },
    ].find((x) => x.c);
    if (dead) return { kind: "dead", blindOn: dead.onPrev ? "prev" : "next", filler: Math.max(0, round2(dead.c.u1 - dead.c.u0 - row.frontPlane)) };
    return null;
  };

  const walls = seedWalls.slice();
  while (walls.length < 3) {
    const last = walls[walls.length - 1], nx = nextWall(last);
    if (walls.includes(nx) || !cornerAt(last, nx)) break;
    walls.push(nx);
  }
  while (walls.length < 3) {
    const pv = prevWall(walls[0]);
    if (walls.includes(pv) || !cornerAt(pv, walls[0])) break;
    walls.unshift(pv);
  }
  if (walls.length < 2) return null;

  const corners = walls.slice(1).map((w, i) => ({ ...defaultCorner(row), ...cornerAt(walls[i], w) }));
  const moduleIds = [], panelIds = [], cabinets = {}, armLength = {};
  walls.forEach((w, i) => {
    if (i < walls.length - 1) {
      const L = cornerMods.find((m) => norm(m.rotation) === CORNER_ROTATION[`${w}>${walls[i + 1]}`]);
      if (L) moduleIds.push(L.id);
    }
    const { ms, ps } = wallItems(w);
    ms.forEach((c) => { if (!moduleIds.includes(c.m.id)) moduleIds.push(c.m.id); });
    ps.forEach((c) => { if (!panelIds.includes(c.p.id)) panelIds.push(c.p.id); });
    cabinets[w] = ms.filter((c) => !isBlind(c.m)).sort((a, b) => a.u0 - b.u0)
      .map((c) => ({ u0: round2(c.u0), u1: round2(c.u1), width: num(c.m.dimensions.width) }));
    const all = [...ms, ...ps];
    if (!all.length) return;
    const length = wallLength(room, w);
    // Skrajne ściany: obecny zasięg ciągu od narożnika (cała ściana = puste pole).
    if (i === 0) {
      const arm = round2(length - Math.min(...all.map((c) => c.u0)));
      if (arm < length - TOL) armLength[w] = arm;
    }
    if (i === walls.length - 1) {
      const arm = round2(Math.max(...all.map((c) => c.u1)));
      if (arm < length - TOL) armLength[w] = arm;
    }
  });

  return {
    walls, presetId: walls.join("+"), type, gap, corners, armLength, cabinets,
    moduleIds, panelIds, templateId: template ? template.id : null,
  };
}

// Własne szerokości odcinków planu = obecne szafki stojące w tych odcinkach, więc
// podgląd zmiany startuje od tego, co stoi.
export function customFromRun(info, plan) {
  const custom = {};
  plan.walls.forEach((w) => w.segments.forEach((s) => {
    const widths = (info.cabinets[w.wallId] || []).filter((c) => c.u0 >= s.u0 - TOL && c.u1 <= s.u1 + TOL).map((c) => c.width);
    if (widths.length) custom[s.key] = widths.join(", ");
  }));
  return custom;
}

// Zmienia kuchnię (z findKitchenRunAround) według planu (planKitchenRun z ignoreIds),
// zamiast usuwać ją i wstawiać od nowa: szafki są używane ponownie - na każdej
// ścianie po kolei od lewej, szafka L w tym samym narożniku, szafka ślepa na tej samej
// ścianie (zostają wnętrza, fronty, nazwy; zmienia się szerokość i miejsce), brakujące
// dochodzą z planu, nadmiarowe znikają. Blendy i zaślepki są zastępowane nowymi.
// Zwraca { modules, removed }.
export function replaceKitchenRun(info, plan) {
  const project = state.project;
  const room = getRoom(project);
  const slot = (m) => (m.type === "corner_cabinet" ? `L:${norm(m.rotation)}` : `${isBlind(m) ? "B" : "W"}:${wallOfRotation(m.rotation)}`);
  const order = (m) => {
    const w = wallOfRotation(m.rotation);
    return m.type !== "corner_cabinet" && w ? modWallLoc(room, w, m).u0 : 0;
  };
  const byOrder = (a, b) => order(a) - order(b);
  const existing = info.moduleIds.map((id) => project.modules.find((m) => m.id === id)).filter(Boolean);
  const pools = {};
  existing.slice().sort(byOrder).forEach((m) => { (pools[slot(m)] = pools[slot(m)] || []).push(m); });
  const kept = new Set();
  const modules = plan.modules.slice().sort(byOrder).map((neu) => {
    const old = (pools[slot(neu)] || []).shift();
    if (!old) {
      project.modules.push(neu);
      return neu;
    }
    kept.add(old.id);
    old.position = { ...neu.position };
    old.rotation = neu.rotation;
    if (neu.type === "corner_cabinet") {
      old.dimensions = { ...old.dimensions, width: neu.dimensions.width, legB: neu.dimensions.legB };
      if (neu.cornerFitting) old.cornerFitting = neu.cornerFitting;
      else delete old.cornerFitting;
      ensureCornerDefaults(old);
    } else {
      old.dimensions = { ...old.dimensions, width: neu.dimensions.width };
      if (isBlind(neu)) {
        old.blindCorner = { ...old.blindCorner, ...neu.blindCorner };
        const hingeSide = blindHingeSide(old);
        (old.elements || []).forEach((el) => { if (el.typ === "front" && el.subtype === "drzwi") el.openingSide = hingeSide; });
      }
    }
    return old;
  });
  const removed = existing.filter((m) => !kept.has(m.id)).map((m) => m.id);
  if (removed.length) project.modules = project.modules.filter((m) => !removed.includes(m.id));
  const panelIds = new Set(info.panelIds);
  project.sidePanels = (project.sidePanels || []).filter((p) => !panelIds.has(p.id));
  project.sidePanels.push(...plan.panels);
  ensureSidePanelsDefaults(project);
  if (modules.length) {
    state.activeModuleId = modules[0].id;
    state.activeSidePanelId = null;
  }
  if (state.selectedModules) state.selectedModules = new Set(modules.length ? [modules[0].id] : []);
  return { modules, removed };
}
