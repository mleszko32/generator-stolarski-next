// src/render/snapGuides.js
//
// Linie pomocnicze przy przeciąganiu szafek w 3D: do czego szafka się przyciągnęła
// (guides z core/moduleDrag.js: snapModulePosition) i odstępy do najbliższych
// sąsiadów / ścian (dragGaps). Rysowane tylko w trakcie ruchu.
import * as THREE from 'three';
import { buildDimensionGroup } from './dimensions3d.js';
import { fmtMm } from '../utils/math.js';

// styk z sąsiadem / krawędzie równo / ściana / szczelina od ściany / lico frontów
const COLORS = { touch: 0x16a34a, align: 0x2563eb, wall: 0x64748b, gap: 0xd97706, front: 0x9333ea };
const OVERHANG = 120;     // linia wystaje poza szafki (mm)
const MAX_GAP = 2500;     // dalszych odstępów nie opisujemy - zaśmiecały widok

const mats = {};
const mat = (kind) => {
  if (!mats[kind]) {
    mats[kind] = new THREE.LineBasicMaterial({ color: COLORS[kind] || COLORS.align, depthTest: false, transparent: true });
    mats[kind].userData.shared = true;   // disposeObject (meshBuilders.js) nie zwalnia wspólnych materiałów
  }
  return mats[kind];
};

// Wspólny obrys przeciąganego zaznaczenia.
function bounds(boxes) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  boxes.forEach((s) => {
    b.x0 = Math.min(b.x0, s.x0); b.x1 = Math.max(b.x1, s.x1);
    b.y0 = Math.min(b.y0, s.y0); b.y1 = Math.max(b.y1, s.y1);
    b.z0 = Math.min(b.z0, s.z0); b.z1 = Math.max(b.z1, s.z1);
  });
  return b;
}

// guides = [{ axis, kind, line, other }], gaps = wynik dragGaps, selBoxes = prostopadłościany
// przeciąganego zaznaczenia w nowej pozycji.
export function buildSnapGuides(guides, gaps, selBoxes, group) {
  if (!selBoxes.length) return;
  const sel = bounds(selBoxes);
  const byKind = {};
  (guides || []).forEach((g) => {
    if (g.axis === 'y' && g.kind === 'wall') return;   // podłoga - bez linii
    const o = g.other;
    const pts = (byKind[g.kind] = byKind[g.kind] || []);
    const y = sel.y1;
    if (g.axis === 'x') {
      const z0 = Math.min(sel.z0, o ? o.z : sel.z0) - OVERHANG, z1 = Math.max(sel.z1, o ? o.z + o.d : sel.z1) + OVERHANG;
      pts.push(new THREE.Vector3(g.line, y, z0), new THREE.Vector3(g.line, y, z1));
      pts.push(new THREE.Vector3(g.line, sel.y0, sel.z1), new THREE.Vector3(g.line, y, sel.z1));
    } else if (g.axis === 'z') {
      const x0 = Math.min(sel.x0, o ? o.x : sel.x0) - OVERHANG, x1 = Math.max(sel.x1, o ? o.x + o.w : sel.x1) + OVERHANG;
      pts.push(new THREE.Vector3(x0, y, g.line), new THREE.Vector3(x1, y, g.line));
    } else {
      const x0 = Math.min(sel.x0, o ? o.x : sel.x0) - OVERHANG, x1 = Math.max(sel.x1, o ? o.x + o.w : sel.x1) + OVERHANG;
      pts.push(new THREE.Vector3(x0, g.line, sel.z1), new THREE.Vector3(x1, g.line, sel.z1));
    }
  });
  Object.entries(byKind).forEach(([kind, pts]) => {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat(kind));
    lines.renderOrder = 999;
    group.add(lines);
  });

  const segments = [];
  Object.entries(gaps || {}).forEach(([key, g]) => {
    if (!g || g.gap < 0.5 || g.gap > MAX_GAP) return;
    segments.push({
      a: { ...g.a, y: sel.y1 }, b: { ...g.b, y: sel.y1 },
      kind: 'gap', tick: key[0] === 'x' ? 'z' : 'x', label: fmtMm(g.gap),
    });
  });
  if (segments.length) buildDimensionGroup(segments, group);
}
