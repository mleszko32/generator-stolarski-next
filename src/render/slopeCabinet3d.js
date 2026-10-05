// src/render/slopeCabinet3d.js
//
// Rysowanie szafki pod skos w 3D (mod.type === 'slope_cabinet'). Płyty mają
// nieprostokątny obrys w widoku od frontu, więc każda to bryła wyciągnięta
// z wielokąta (meshBuilders.js: addPrism). Geometria: core/slopeCabinet.js.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { getWorldFootprint } from '../core/layout.js';
import { getSlopeCabinetPolygons } from '../core/slopeCabinet.js';
import { addPrism } from './meshBuilders.js';

export function renderSlopeCabinet(mod, isActive, th, parentGroup) {
  const W = parseFloat(mod.dimensions.width) || 0;
  const H = parseFloat(mod.dimensions.height) || 0;
  const D = parseFloat(mod.dimensions.depth) || 0;
  const backThick = parseFloat(state.project.materials?.backThickness) || 3;
  const baseOffsetY = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 100) : 0;
  const { worldW, worldD } = getWorldFootprint(mod);

  // Ten sam układ lokalny co zwykły moduł (render/viewer3d.js: update3D):
  // środek grupy w środku odcisku, x od lewej, y od dołu, z od tyłu (z = 0) do frontu.
  const modGroup = new THREE.Group();
  modGroup.userData = { moduleId: mod.id };
  modGroup.position.set(
    (parseFloat(mod.position.x) || 0) + worldW / 2,
    (parseFloat(mod.position.y) || 0) + baseOffsetY + H / 2,
    (parseFloat(mod.position.z) || 0) + worldD / 2
  );
  modGroup.rotation.y = -((parseFloat(mod.rotation) || 0) * Math.PI / 180);

  const innerGroup = new THREE.Group();
  innerGroup.position.set(-W / 2, -H / 2, -D / 2);
  modGroup.add(innerGroup);

  const ud = { moduleId: mod.id, type: 'corpus' };
  const { polys, back } = getSlopeCabinetPolygons(mod, th);
  polys.forEach((p) => addPrism(p.points, backThick, D - backThick, p.kind, isActive, ud, innerGroup));
  addPrism(back, 0, backThick, 'hdf', isActive, { ...ud, part: 'back' }, innerGroup);

  parentGroup.add(modGroup);
}
