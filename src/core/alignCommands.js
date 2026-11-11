// Ruch zaznaczonych szafek bez przeciągania: strzałki, odstęp od sąsiada, wyrównanie
// krawędzi, dosunięcie do sąsiada / ściany, zsunięcie rzędu. Czysta logika na projekcie
// (pozycje szafek i boków dokładanych) - wołający robi standardowe odświeżenie.
//
// sel = { moduleIds: Set, panelIds: Set }. Kierunki 'left' | 'right' | 'back' | 'front'
// liczą się względem szafki odniesienia (jej obrót): lewa/prawa tak, jak ją widać od
// frontu, tył = ściana za plecami.

import { getModuleBox, getWorldFootprint } from './layout.js';
import { getSidePanelBox, boxesOverlap, nudgeSelection, dragGaps } from './moduleDrag.js';
import { getWallGap } from './wallFill.js';
import { DEFAULT_ROOM } from './state.js';
import { num } from '../utils/math.js';

const roomOf = (project) => project.room || DEFAULT_ROOM;
const round2 = (v) => Math.round(v * 100) / 100;

// Zaznaczenie do ruchu: zaznaczone szafki i boki + boki / blendy z grup zaznaczonych szafek
// (jadą razem z nimi, jak przy przeciąganiu). Bez zaznaczenia - aktywna szafka albo bok.
export function moveSelectionOf(st) {
  const project = st.project;
  const moduleIds = new Set(st.selectedModules || []);
  const panelIds = new Set(st.selectedSidePanels || []);
  if (!moduleIds.size && !panelIds.size) {
    if (st.activeModuleId) moduleIds.add(st.activeModuleId);
    else if (st.activeSidePanelId) panelIds.add(st.activeSidePanelId);
  }
  const groupIds = new Set((project.modules || []).filter((m) => moduleIds.has(m.id) && m.groupId).map((m) => m.groupId));
  (project.sidePanels || []).forEach((p) => { if (p.groupId && groupIds.has(p.groupId)) panelIds.add(p.id); });
  return { moduleIds, panelIds };
}

// Elementy zaznaczenia i reszta projektu jako [{ item, box, panel }].
function split(project, sel) {
  const moving = [], rest = [];
  (project.modules || []).forEach((m) => (sel.moduleIds.has(m.id) ? moving : rest).push({ item: m, box: getModuleBox(m), panel: false }));
  (project.sidePanels || []).forEach((p) => (sel.panelIds.has(p.id) ? moving : rest).push({ item: p, box: getSidePanelBox(p), panel: true }));
  return { moving, rest };
}

function shift(entry, dx, dy, dz) {
  const pos = entry.item.position;
  if (dx) pos.x = round2(num(pos.x) + dx);
  if (dy) pos.y = round2(num(pos.y) + dy);
  if (dz) pos.z = round2(num(pos.z) + dz);
}

// Kierunek względem szafki → oś i zwrot w pokoju.
export function worldDir(rotation, dir) {
  const rot = ((num(rotation) % 360) + 360) % 360;
  const table = {
    0: { left: ['x', -1], right: ['x', 1], back: ['z', -1], front: ['z', 1] },
    90: { left: ['z', -1], right: ['z', 1], back: ['x', 1], front: ['x', -1] },
    180: { left: ['x', 1], right: ['x', -1], back: ['z', 1], front: ['z', -1] },
    270: { left: ['z', 1], right: ['z', -1], back: ['x', -1], front: ['x', 1] },
  };
  const [axis, sign] = (table[rot] || table[0])[dir];
  return { axis, sign };
}

function refEntry(moving, refId) {
  return moving.find((e) => e.item.id === refId) || moving[0] || null;
}

// Przesunięcie zaznaczenia o move = {dx,dy,dz}: granice pokoju + zatrzymanie na
// przeszkodach (te, na które zaznaczenie już nachodzi, nie blokują). Zwraca faktyczny ruch.
export function moveSelection(project, sel, move) {
  const { moving, rest } = split(project, sel);
  if (!moving.length) return { dx: 0, dy: 0, dz: 0 };
  const boxes = moving.map((e) => e.box);
  const obstacles = rest.map((e) => e.box).filter((o) => !boxes.some((b) => boxesOverlap(b, o)));
  let dy = move.dy || 0;
  moving.forEach((e) => { dy = Math.max(dy, -num(e.item.position.y)); });   // nie pod podłogę
  const r = nudgeSelection(boxes, { dx: move.dx || 0, dy, dz: move.dz || 0 }, obstacles, roomOf(project));
  moving.forEach((e) => shift(e, r.dx, r.dy, r.dz));
  return r;
}

// Odstępy zaznaczenia do sąsiadów / ścian względem szafki odniesienia:
// { left, right, back, front } - każdy { gap, wall } (jak dragGaps).
export function selectionGaps(project, sel, refId) {
  const { moving, rest } = split(project, sel);
  const ref = refEntry(moving, refId);
  if (!ref) return null;
  const boxes = moving.map((e) => e.box);
  const g = dragGaps(boxes, rest.map((e) => e.box).filter((o) => !boxes.some((b) => boxesOverlap(b, o))), roomOf(project));
  const out = {};
  ['left', 'right', 'back', 'front'].forEach((dir) => {
    const { axis, sign } = worldDir(ref.item.rotation, dir);
    out[dir] = g[axis + (sign > 0 ? 'Max' : 'Min')];
  });
  return out;
}

// Ustawia odstęp zaznaczenia od sąsiada / ściany po stronie dir na `gap` mm.
export function setSelectionGap(project, sel, refId, dir, gap) {
  const gaps = selectionGaps(project, sel, refId);
  if (!gaps || !gaps[dir]) return false;
  const { moving } = split(project, sel);
  const { axis, sign } = worldDir(refEntry(moving, refId).item.rotation, dir);
  const delta = (gaps[dir].gap - Math.max(0, num(gap))) * sign;
  if (Math.abs(delta) < 0.005) return false;
  moveSelection(project, sel, { ['d' + axis]: delta });
  return true;
}

// Dosuwa zaznaczenie do najbliższej szafki / boku albo do ściany. W tył szafka staje
// w odległości szczeliny od ściany (getWallGap dla typu szafki odniesienia).
export function pushSelection(project, sel, refId, dir) {
  const { moving } = split(project, sel);
  const ref = refEntry(moving, refId);
  if (!ref) return false;
  const { axis, sign } = worldDir(ref.item.rotation, dir);
  const room = roomOf(project);
  const limit = axis === 'x' ? room.width : room.depth;
  let dist = Infinity;
  moving.forEach((e) => { dist = Math.min(dist, sign > 0 ? limit - e.box[axis + '1'] : e.box[axis + '0']); });
  if (dir === 'back' && !ref.panel) {
    const face = sign > 0 ? limit - ref.box[axis + '1'] : ref.box[axis + '0'];
    dist = Math.min(dist, face - getWallGap(project, ref.item.type));
  }
  if (!(dist > 0.005)) return false;
  const r = moveSelection(project, sel, { ['d' + axis]: dist * sign });
  return Math.abs(r['d' + axis]) > 0.005;
}

const EDGES = {
  left: (rot) => worldDir(rot, 'left'),
  right: (rot) => worldDir(rot, 'right'),
  back: (rot) => worldDir(rot, 'back'),
  front: (rot) => worldDir(rot, 'front'),
  top: () => ({ axis: 'y', sign: 1 }),
  bottom: () => ({ axis: 'y', sign: -1 }),
};

// Zrównuje krawędź `edge` (left / right / back / front / top / bottom) każdego elementu
// zaznaczenia z tą samą krawędzią szafki odniesienia. Każdy element jedzie osobno
// (bez kolizji - wyrównanie to świadoma decyzja), w granicach pokoju.
export function alignSelection(project, sel, refId, edge) {
  const { moving } = split(project, sel);
  const ref = refEntry(moving, refId);
  if (!ref || !EDGES[edge] || moving.length < 2) return false;
  const { axis, sign } = EDGES[edge](ref.item.rotation);
  const key = axis + (sign > 0 ? '1' : '0');
  const room = roomOf(project);
  let changed = false;
  moving.forEach((e) => {
    if (e === ref) return;
    let d = ref.box[key] - e.box[key];
    if (axis === 'x') d = Math.min(Math.max(d, -e.box.x0), Math.max(0, room.width - e.box.x1));
    if (axis === 'z') d = Math.min(Math.max(d, -e.box.z0), Math.max(0, room.depth - e.box.z1));
    if (axis === 'y') d = Math.max(d, -num(e.item.position.y));
    if (Math.abs(d) < 0.005) return;
    shift(e, axis === 'x' ? d : 0, axis === 'y' ? d : 0, axis === 'z' ? d : 0);
    changed = true;
  });
  return changed;
}

// Zsuwa zaznaczone elementy w rząd bez szczelin i nałożeń, wzdłuż szerokości szafki
// odniesienia (która zostaje na miejscu). Rząd wychodzący poza pokój jest dosuwany do ściany.
export function packSelection(project, sel, refId) {
  const { moving } = split(project, sel);
  const ref = refEntry(moving, refId);
  if (!ref || moving.length < 2) return false;
  const { axis } = worldDir(ref.item.rotation, 'right');
  const lo = axis + '0', hi = axis + '1';
  const size = (e) => (axis === 'x' ? getWorldFootprint(e.item).worldW : getWorldFootprint(e.item).worldD);
  const sorted = [...moving].sort((a, b) => (a.box[lo] + a.box[hi]) - (b.box[lo] + b.box[hi]));
  const at = sorted.indexOf(ref);
  const target = new Map([[ref, ref.box[lo]]]);
  let edge = ref.box[hi];
  for (let i = at + 1; i < sorted.length; i++) { target.set(sorted[i], edge); edge += size(sorted[i]); }
  let end = edge;
  edge = ref.box[lo];
  for (let i = at - 1; i >= 0; i--) { edge -= size(sorted[i]); target.set(sorted[i], edge); }
  const room = roomOf(project);
  const limit = axis === 'x' ? room.width : room.depth;
  let fix = 0;
  if (edge < 0) fix = -edge;
  else if (end > limit) fix = Math.max(-edge, limit - end);
  let changed = false;
  sorted.forEach((e) => {
    const d = target.get(e) + fix - e.box[lo];
    if (Math.abs(d) < 0.005) return;
    shift(e, axis === 'x' ? d : 0, 0, axis === 'z' ? d : 0);
    changed = true;
  });
  return changed;
}
