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

// pos = proponowany róg {x,y,z}; size = {w,d,h} odcisku przeciąganej szafki;
// others = [{x,y,z,w,d,h}] pozostałych szafek (position + getWorldFootprint);
// lockX/lockZ = oś nie przyciąga się (zablokowana przez Alt / Shift).
// Obiekt z noY: true (bok dokładany, blenda) przyciąga tylko w X/Z - jego
// position.y liczy się od podłogi, a szafki od spodu nóżek, więc w pionie
// nie ma czego zrównywać.
export function snapModulePosition(pos, size, others, room, snapDist, { lockX = false, lockZ = false } = {}) {
  const xs = [0, room.width - size.w];
  const zs = [0, room.depth - size.d];
  const ys = [0];

  for (const o of others) {
    // Krawędzie w X liczą się tylko od szafek, które w Z leżą w tej samej
    // "linii" (nachodzą w głąb), a krawędzie w Z tylko od tych, które w X są
    // obok/nad/pod - inaczej szafka z przeciwległej ściany przyciągała.
    const nearZ = pos.z < o.z + o.d + snapDist && pos.z + size.d > o.z - snapDist;
    const nearX = pos.x < o.x + o.w + snapDist && pos.x + size.w > o.x - snapDist;
    if (nearZ) xs.push(o.x + o.w, o.x - size.w, o.x, o.x + o.w - size.w);
    // Tyły równo (o.z), fronty równo (o.z + o.d - size.d) - to drugie
    // pozwala wyrównać fronty szafek o różnej głębokości.
    if (nearX) zs.push(o.z, o.z + o.d - size.d, o.z + o.d, o.z - size.d);
    if (!o.noY) ys.push(o.y + o.h, o.y - size.h, o.y);
  }

  return {
    x: lockX ? pos.x : nearestSnap(pos.x, xs, snapDist),
    y: nearestSnap(pos.y, ys, snapDist),
    z: lockZ ? pos.z : nearestSnap(pos.z, zs, snapDist),
  };
}

function overlap(a, b) {
  return {
    x: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
    y: Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0),
    z: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0),
  };
}

const EPS = 0.5;

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
