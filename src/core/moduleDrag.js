// Przyciąganie i kolizje przy przeciąganiu szafek w 3D (render/viewer3d.js).
// Czysta logika: dostaje proponowaną pozycję i prostokąty sąsiadów, zwraca
// poprawioną pozycję - bez Three.js i bez ruszania state.

import { getWorldFootprint } from './layout.js';
import { num } from '../utils/math.js';

// Prostopadłościan boku dokładanego / blendy (project.sidePanels) w tym samym
// formacie co getModuleBox. position.y boku to jego spód (od podłogi).
export function getSidePanelBox(p) {
  const { worldW, worldD } = getWorldFootprint(p);
  const x0 = num(p.position && p.position.x);
  const y0 = num(p.position && p.position.y);
  const z0 = num(p.position && p.position.z);
  return { x0, x1: x0 + worldW, y0, y1: y0 + num(p.dimensions && p.dimensions.height), z0, z1: z0 + worldD };
}

const EPS = 0.5;

function overlap(a, b) {
  return {
    x: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    y: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0),
    z: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0),
  };
}

// Z kilku kandydatów (pozycja rogu, przy której krawędź przeciąganej szafki
// zrównuje się z czymś) wybiera NAJBLIŻSZEGO w promieniu snapDist. Wcześniej
// wygrywał pierwszy/ostatni pasujący z pętli po modułach, więc daleka szafka
// potrafiła "przejąć" przyciąganie i wyrzucić szafkę przed albo za linię.
export function nearestSnap(value, candidates, snapDist) {
  let best = value;
  let bestDist = snapDist;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// Ranga kandydata przyciągania: styk bok-do-boku wygrywa ze ścianą / szczeliną od
// ściany, te z licem frontów, a na końcu zrównanie krawędzi. Kandydat niższej rangi
// wygrywa tylko, gdy jest wyraźnie bliżej (odległość × waga).
export const SNAP_WEIGHT = { touch: 1, wall: 1.4, gap: 1.4, front: 1.8, align: 2.4 };

// Z kandydatów [{ v, kind, line, other }] wybiera tego o najmniejszej ważonej
// odległości w promieniu snapDist; null = nic nie złapało.
export function pickSnap(value, candidates, snapDist) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = Math.abs(value - c.v);
    if (d >= snapDist) continue;
    const score = d * (SNAP_WEIGHT[c.kind] || SNAP_WEIGHT.align);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// Płaszczyzna lica frontów szafki o (rot = obrót, front = wysunięcie frontu przed
// korpus): { axis: 'x' | 'z', value, dir } - dir = strona, w którą patrzą fronty.
function frontPlane(o) {
  const f = o.front || 0;
  if (o.rot === 90) return { axis: 'x', value: o.x - f, dir: -1 };
  if (o.rot === 180) return { axis: 'z', value: o.z - f, dir: -1 };
  if (o.rot === 270) return { axis: 'x', value: o.x + o.w + f, dir: 1 };
  return { axis: 'z', value: o.z + o.d + f, dir: 1 };
}

const FRONT_REACH = 700; // lico frontów prostopadłego ciągu łapie przez pusty narożnik
const Y_REACH = 600; // w pionie zrównują się tylko szafki stojące w pobliżu

// pos = proponowany róg {x,y,z}; size = {w,d,h} odcisku przeciąganej szafki;
// others = [{x,y,z,w,d,h, rot?, front?}] pozostałych szafek (position + getWorldFootprint);
// lockX/lockZ = oś nie przyciąga się (zablokowana przez Alt / Shift).
// Obiekt z noY: true (bok dokładany, blenda) przyciąga tylko w X/Z.
// opts.selection = [{dx,dy,dz,w,d,h}] reszta przeciąganego zaznaczenia (przesunięcie
// względem klikniętej szafki) - przyciągają też jej krawędzie;
// opts.rotation / opts.front = obrót i wysunięcie frontu przeciąganej szafki (lico frontów);
// opts.wallGap = szczelina od ściany, do której zwrócony jest tył (rotation);
// opts.floorY = pozycja „na podłodze” (domyślnie 0).
// Zwraca { x, y, z, guides } - guides = [{ axis, kind, line, other }] to, co złapało
// (line = współrzędna wspólnej płaszczyzny, other = sąsiad albo null dla ściany).
export function snapModulePosition(pos, size, others, room, snapDist, opts = {}) {
  const { lockX = false, lockZ = false, selection = [], rotation = null, front = 0, wallGap = 0, floorY = 0 } = opts;
  const xs = [], zs = [];
  const ys = [{ v: floorY, kind: 'wall', line: floorY, other: null }];
  const boxes = [{ dx: 0, dy: 0, dz: 0, w: size.w, d: size.d, h: size.h, main: true }, ...selection];

  for (const b of boxes) {
    const bx = pos.x + b.dx, bz = pos.z + b.dz;
    const addX = (edge, kind, line, other) => xs.push({ v: edge - b.dx, kind, line, other });
    const addZ = (edge, kind, line, other) => zs.push({ v: edge - b.dz, kind, line, other });
    addX(0, 'wall', 0, null);
    addX(room.width - b.w, 'wall', room.width, null);
    addZ(0, 'wall', 0, null);
    addZ(room.depth - b.d, 'wall', room.depth, null);

    for (const o of others) {
      // Krawędzie w X liczą się tylko od szafek, które w Z leżą w tej samej
      // "linii" (nachodzą w głąb), a krawędzie w Z tylko od tych, które w X są
      // obok/nad/pod - inaczej szafka z przeciwległej ściany przyciągała.
      const nearZ = bz < o.z + o.d + snapDist && bz + b.d > o.z - snapDist;
      const nearX = bx < o.x + o.w + snapDist && bx + b.w > o.x - snapDist;
      const fp = (o.rot === undefined || o.noY) ? null : frontPlane(o);
      const sameRot = fp && rotation !== null && o.rot === rotation;
      if (nearZ) {
        addX(o.x + o.w, 'touch', o.x + o.w, o);
        addX(o.x - b.w, 'touch', o.x, o);
        addX(o.x, 'align', o.x, o);
        addX(o.x + o.w - b.w, 'align', o.x + o.w, o);
      }
      if (nearX) {
        // Tyły równo (o.z), fronty równo (o.z + o.d - d) - to drugie pozwala
        // wyrównać fronty szafek o różnej głębokości.
        addZ(o.z + o.d, 'touch', o.z + o.d, o);
        addZ(o.z - b.d, 'touch', o.z, o);
        addZ(o.z, 'align', o.z, o);
        addZ(o.z + o.d - b.d, 'align', o.z + o.d, o);
      }
      // Lico frontów: równo z licem sąsiada w tym samym obrocie (różne wysunięcie
      // frontu) albo krawędź szafki na licu frontów prostopadłego ciągu (narożnik).
      // W narożniku szafka nie styka się z ciągiem (pusty narożnik), stąd większy zasięg.
      const reach = sameRot ? snapDist : FRONT_REACH;
      const nearFront = fp && (fp.axis === 'z'
        ? bx < o.x + o.w + reach && bx + b.w > o.x - reach
        : bz < o.z + o.d + reach && bz + b.d > o.z - reach);
      if (fp && b.main && nearFront) {
        const add = fp.axis === 'z' ? addZ : addX;
        const len = fp.axis === 'z' ? b.d : b.w;
        if (sameRot) {
          if ((o.front || 0) !== front) add(fp.dir > 0 ? fp.value - front - len : fp.value + front, 'front', fp.value, o);
        } else if (o.front) {
          add(fp.dir > 0 ? fp.value : fp.value - len, 'front', fp.value, o);
        }
      }
      if (!o.noY && b.main) {
        const reachX = bx < o.x + o.w + Y_REACH && bx + b.w > o.x - Y_REACH;
        const reachZ = bz < o.z + o.d + Y_REACH && bz + b.d > o.z - Y_REACH;
        if (reachX && reachZ) {
          ys.push({ v: o.y + o.h, kind: 'touch', line: o.y + o.h, other: o });
          ys.push({ v: o.y - b.h, kind: 'touch', line: o.y, other: o });
          ys.push({ v: o.y, kind: 'align', line: o.y, other: o });
          ys.push({ v: o.y + o.h - b.h, kind: 'align', line: o.y + o.h, other: o });
        }
      }
    }
  }

  // Szczelina od ściany za plecami szafki (dolne i słupki stoją 50 mm od ściany).
  if (wallGap > 0 && rotation !== null) {
    if (rotation === 0) zs.push({ v: wallGap, kind: 'gap', line: wallGap, other: null });
    else if (rotation === 180) zs.push({ v: room.depth - size.d - wallGap, kind: 'gap', line: room.depth - wallGap, other: null });
    else if (rotation === 90) xs.push({ v: room.width - size.w - wallGap, kind: 'gap', line: room.width - wallGap, other: null });
    else if (rotation === 270) xs.push({ v: wallGap, kind: 'gap', line: wallGap, other: null });
  }

  const guides = [];
  const take = (axis, value, cands, locked) => {
    if (locked) return value;
    const c = pickSnap(value, cands, snapDist);
    if (!c) return value;
    guides.push({ axis, kind: c.kind, line: c.line, other: c.other });
    return c.v;
  };
  const x = take('x', pos.x, xs, lockX);
  const y = take('y', pos.y, ys, false);
  const z = take('z', pos.z, zs, lockZ);
  return { x, y, z, guides };
}

// Odstępy przeciąganego zaznaczenia do najbliższej przeszkody (albo ściany) w czterech
// kierunkach po podłodze. selectedBoxes / otherBoxes = prostopadłościany {x0..z1}.
// Zwraca { xMin, xMax, zMin, zMax } - każdy { gap, wall, a, b } (a, b = końce odcinka
// {x,y,z} do narysowania wymiaru) albo null, gdy nie ma zaznaczenia.
export function dragGaps(selectedBoxes, otherBoxes, room) {
  const out = { xMin: null, xMax: null, zMin: null, zMax: null };
  if (!selectedBoxes.length) return out;
  const dirs = [
    { key: 'xMin', axis: 'x', sign: -1, cross: 'z', limit: 0 },
    { key: 'xMax', axis: 'x', sign: 1, cross: 'z', limit: room.width },
    { key: 'zMin', axis: 'z', sign: -1, cross: 'x', limit: 0 },
    { key: 'zMax', axis: 'z', sign: 1, cross: 'x', limit: room.depth },
  ];
  for (const d of dirs) {
    const lo = d.axis + '0', hi = d.axis + '1', c0 = d.cross + '0', c1 = d.cross + '1';
    let best = null;
    for (const s of selectedBoxes) {
      const face = d.sign > 0 ? s[hi] : s[lo];
      let gap = d.sign > 0 ? d.limit - face : face - d.limit;
      let wall = true;
      let mid = (s[c0] + s[c1]) / 2;
      for (const o of otherBoxes) {
        const ov = overlap(s, o);
        if (ov.y <= EPS || ov[d.cross] <= EPS) continue;
        const g = d.sign > 0 ? o[lo] - face : face - o[hi];
        if (g < -EPS || g >= gap) continue;
        gap = Math.max(0, g);
        wall = false;
        mid = (Math.max(s[c0], o[c0]) + Math.min(s[c1], o[c1])) / 2;
      }
      if (best && gap >= best.gap) continue;
      const a = { y: s.y0 }, b = { y: s.y0 };
      a[d.axis] = face; b[d.axis] = face + d.sign * gap;
      a[d.cross] = mid; b[d.cross] = mid;
      best = { gap: Math.round(gap * 10) / 10, wall, a, b };
    }
    out[d.key] = best;
  }
  return out;
}

// Przesunięcie zaznaczenia o move = {dx,dy,dz} (strzałki, polecenia „dosuń”): granice
// pokoju + zatrzymanie na przeszkodach (sweepSelection). Zwraca faktyczne {dx,dy,dz}.
export function nudgeSelection(selectedBoxes, move, otherBoxes, room) {
  let dx = move.dx || 0, dz = move.dz || 0;
  for (const s of selectedBoxes) {
    dx = Math.min(Math.max(dx, Math.min(0, -s.x0)), Math.max(0, room.width - s.x1));
    dz = Math.min(Math.max(dz, Math.min(0, -s.z0)), Math.max(0, room.depth - s.z1));
  }
  return sweepSelection(selectedBoxes, { dx, dy: move.dy || 0, dz }, otherBoxes);
}

export function boxesOverlap(a, b) {
  const o = overlap(a, b);
  return o.x > EPS && o.y > EPS && o.z > EPS;
}

const AXES = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };

// Przeciągane szafki NIE odpychają sąsiadów (wcześniej odsuwało je łańcuchowo,
// więc przypadkowe szturchnięcie środkowej szafki rozjeżdżało cały rząd) -
// to przeciągane zaznaczenie zatrzymuje się na sąsiedzie.
// selectedBoxes = zaznaczenie w OSTATNIEJ dobrej pozycji, move = {dx,dy,dz}
// do pozycji spod kursora. Ruch idzie po osiach (Y, potem X, potem Z) i każda
// oś kończy się na pierwszej napotkanej przeszkodzie, więc szafka nigdy nie
// przeskakuje przez sąsiada ani nie jest wypychana przed/za linię (tak robiło
// rozwiązywanie nałożenia "po najmniejszej osi" przy szybkim ruchu myszą).
// Zwraca faktyczne przesunięcie {dx,dy,dz} wspólne dla całego zaznaczenia.
export function sweepSelection(selectedBoxes, move, otherBoxes) {
  const off = { x: 0, y: 0, z: 0 };
  const shifted = (s) => ({
    x0: s.x0 + off.x, x1: s.x1 + off.x,
    y0: s.y0 + off.y, y1: s.y1 + off.y,
    z0: s.z0 + off.z, z1: s.z1 + off.z,
  });
  for (const axis of ['y', 'x', 'z']) {
    let m = move['d' + axis] || 0;
    if (!m) continue;
    const [a, b] = AXES[axis];
    for (const s0 of selectedBoxes) {
      const s = shifted(s0);
      for (const o of otherBoxes) {
        const ov = overlap(s, o);
        // Przeszkodą jest tylko to, co leży na drodze (nachodzi w dwóch
        // pozostałych osiach); to, co już nachodzi w osi ruchu, pomijamy.
        if (ov[a] <= EPS || ov[b] <= EPS || ov[axis] > EPS) continue;
        if (m > 0 && s[axis + '1'] <= o[axis + '0'] + EPS) m = Math.min(m, Math.max(0, o[axis + '0'] - s[axis + '1']));
        if (m < 0 && s[axis + '0'] >= o[axis + '1'] - EPS) m = Math.max(m, Math.min(0, o[axis + '1'] - s[axis + '0']));
      }
    }
    off[axis] = m;
  }
  return { dx: off.x, dy: off.y, dz: off.z };
}
