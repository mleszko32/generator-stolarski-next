// src/render/dimensions3d.js
//
// Rysuje w scenie 3D odcinki wymiarowe policzone przez core/dimensions3d.js: linia wymiarowa,
// kreski na końcach i etykieta z liczbą (ta sama etykieta-sprite co nazwy szafek).
import * as THREE from 'three';
import { createLabelSprite } from './meshBuilders.js';

const TICK = 35;           // pół długości kreski na końcu linii (mm)
const LABEL_SCALE = 1.3;   // etykiety wymiarów czytelne także przy widoku całego pokoju
const COLORS = { chain: 0x334155, total: 0x0f172a, height: 0x334155, active: 0x2563eb, gap: 0xd97706 };

const lineMats = {};
const lineMat = (kind) => {
  if (!lineMats[kind]) {
    lineMats[kind] = new THREE.LineBasicMaterial({ color: COLORS[kind] || COLORS.chain, depthTest: false, transparent: true });
    lineMats[kind].userData.shared = true;   // disposeObject (meshBuilders.js) nie zwalnia wspólnych materiałów
  }
  return lineMats[kind];
};

export function buildDimensionGroup(segments, group) {
  const byKind = {};
  segments.forEach((s) => {
    const pts = (byKind[s.kind] = byKind[s.kind] || []);
    const a = new THREE.Vector3(s.a.x, s.a.y, s.a.z), b = new THREE.Vector3(s.b.x, s.b.y, s.b.z);
    pts.push(a, b);
    // kreski na końcach - prostopadle do linii (w pionie albo wzdłuż ściany)
    const d = new THREE.Vector3(s.tick === 'y' ? 0 : s.tick === 'x' ? 1 : 0, s.tick === 'y' ? 1 : 0, s.tick === 'z' ? 1 : 0).multiplyScalar(TICK);
    [a, b].forEach((p) => pts.push(p.clone().sub(d), p.clone().add(d)));

    const label = createLabelSprite(s.label);
    label.scale.multiplyScalar(LABEL_SCALE);
    label.position.copy(a).add(b).multiplyScalar(0.5);
    label.position.y += s.tick === 'y' ? 110 : 0;
    group.add(label);
  });
  Object.entries(byKind).forEach(([kind, pts]) => {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(kind));
    lines.renderOrder = 998;
    group.add(lines);
  });
}
