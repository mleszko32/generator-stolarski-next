// src/render/cameraViews.js
//
// Szybkie widoki kamery (przód / góra / z lewej / z prawej / izometria) i dopasowanie
// kadru do prostopadłościanu {x0..z1} - cały projekt albo zaznaczenie.
import * as THREE from 'three';

// Kierunek od celu do kamery. Tylna ściana to z = 0, więc „przód” patrzy od +Z.
export const VIEW_DIRS = {
  front: [0, 0, 1],
  top: [0, 1, 0.001],      // odrobina Z, żeby tylna ściana była u góry ekranu
  left: [-1, 0, 0],
  right: [1, 0, 0],
  iso: [0.6, 0.45, 1],
};

// Pozycja kamery i cel, przy których prostopadłościan mieści się w kadrze.
// dir = kierunek od celu do kamery (dowolnej długości), fov w stopniach.
export function frameBox(box, dir, fov, aspect, margin = 1.15) {
  const target = new THREE.Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
  const radius = Math.max(300, 0.5 * Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0));
  const vFov = THREE.MathUtils.degToRad(fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.1, aspect));
  const dist = (radius * margin) / Math.sin(Math.min(vFov, hFov) / 2);
  const position = target.clone().addScaledVector(new THREE.Vector3(...dir).normalize(), dist);
  return { position, target };
}

let flight = 0;

// Płynny przelot kamery do nowej pozycji i celu (ok. 0,3 s).
export function flyCamera(camera, controls, position, target, requestRender, ms = 300) {
  const id = ++flight;
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const start = performance.now();
  const step = (now) => {
    if (id !== flight) return;   // nowy przelot przerwał ten
    const k = Math.min(1, (now - start) / ms);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(p0, position, e);
    controls.target.lerpVectors(t0, target, e);
    controls.update();
    requestRender();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
