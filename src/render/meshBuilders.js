// src/render/meshBuilders.js
//
// Materiały i budowanie pojedynczych brył sceny 3D (płyty, otwory, okucia, etykiety,
// wieniec narożnika) - wydzielone z render/viewer3d.js. Bez stanu sceny: każda funkcja
// dostaje grupę-rodzica w parametrze. Jedyny stan to tryb x-ray (przełącznik
// "Przezroczysty / Realistyczny" w viewer3d.js), od którego zależą materiały.
import * as THREE from 'three';
import { state } from '../core/state.js';

export let isXrayMode = true;
export function setXrayMode(value) {
  isXrayMode = value;
}

export const mats = {
  solid: {
      // Metalness w okolicach 0 — to płyta meblowa, nie blacha; przy metalness
      // >0 environment map dawała nieprzyjemny, plastikowo-metaliczny połysk.
      // Kolory lekko ocieplone (surowa płyta biała ma podtón kremowy, nie czysty biel).
      corpus: new THREE.MeshStandardMaterial({ color: 0xfaf8f4, roughness: 0.62, metalness: 0.0 }),
      front: new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.42, metalness: 0.0 }),
      shelf: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.7, metalness: 0.0 }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.78, metalness: 0.0 }), // ciemniejsza, drewniana skrzynka - odcina się od białego korpusu po ukryciu frontów
      hdf: new THREE.MeshStandardMaterial({ color: 0xf4f2ed, roughness: 0.9, metalness: 0.0 }),
      plinth: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.8, metalness: 0.0 })
  },
  xray: {
      corpus: new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.15, depthWrite: false }),
      front: new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15, depthWrite: false }),
      shelf: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.3, depthWrite: false }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6, depthWrite: false }),
      hdf: new THREE.MeshStandardMaterial({ color: 0x475569, transparent: true, opacity: 0.3, depthWrite: false }),
      plinth: new THREE.MeshStandardMaterial({ color: 0x1c1917, transparent: true, opacity: 0.7, depthWrite: true })
  }
};
export const worktopMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.55, metalness: 0.0 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });

// Materiały współdzielone między klatkami przebudowy (nie wolno ich zwalniać
// razem z siatką, bo używa ich następna wersja sceny).
[...Object.values(mats.xray), ...Object.values(mats.solid), worktopMat, holeMat].forEach(m => { m.userData.shared = true; });

// Kolory krawędzi mają po jednym wspólnym materiale (wcześniej każdy prostopadłościan
// tworzył własny, co przy kilkunastu szafkach dawało tysiące materiałów).
const lineMatCache = new Map();
function getLineMat(color) {
  let m = lineMatCache.get(color);
  if (!m) { m = new THREE.LineBasicMaterial({ color }); m.userData.shared = true; lineMatCache.set(color, m); }
  return m;
}

// Zwalnia geometrie i materiały (pamięć GPU) usuniętej ze sceny gałęzi. Bez tego
// każde update3D() zostawiało po sobie setki geometrii, aż widok zaczynał zwalniać.
export function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(x => {
      if (!x.userData.shared) {
        if (x.map) x.map.dispose(); // etykiety (createLabelSprite) mają własną, jednorazową teksturę canvas
        x.dispose();
      }
    });
  });
}

// Rysuje zaokrąglony prostokąt (tło etykiety) na canvasie 2D.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Etykieta z nazwą szafki - canvas 2D wypalony na teksturze THREE.Sprite (nie
// CSS2DRenderer: sprite jest zwykłym obiektem sceny, więc rysuje się razem z
// resztą w tym samym renderer.render(scene, camera) bez osobnej pętli
// renderowania/synchronizacji). depthTest:false -> zawsze czytelna na wierzchu,
// nawet zza innej szafki albo ściany - to ma pomagać ZNALEŹĆ szafkę, więc
// nie powinna dać się niechcący zasłonić.
export function createLabelSprite(text) {
  const fontPx = 44;
  const padX = 22, padY = 14;
  const measCanvas = document.createElement('canvas');
  const measCtx = measCanvas.getContext('2d');
  measCtx.font = `600 ${fontPx}px sans-serif`;
  const textW = Math.max(1, Math.ceil(measCtx.measureText(text).width));

  const canvas = document.createElement('canvas');
  canvas.width = textW + padX * 2;
  canvas.height = fontPx + padY * 2;
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${fontPx}px sans-serif`; // reset po zmianie canvas.width/height (czyści stan kontekstu)
  ctx.fillStyle = 'rgba(30,41,59,0.82)';
  roundRectPath(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  const worldH = 130; // mm - wysokość etykiety w scenie (skalowana z zoomem jak reszta bryły)
  sprite.scale.set(worldH * (canvas.width / canvas.height), worldH, 1);
  return sprite;
}


export function addBox(w, h, d, x, y, z, type, isActiveModule, userData = null, parentGroup, rotationY = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  let matObj = isXrayMode ? mats.xray : mats.solid;
  let mat = matObj.corpus;
  if (type === 'front') mat = matObj.front;
  if (type === 'shelf') mat = matObj.shelf;
  if (type === 'drawerBox') mat = matObj.drawerBox;
  if (type === 'hdf') mat = matObj.hdf;
  if (type === 'plinth') mat = matObj.plinth;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x + w/2, y + h/2, z + d/2);
  // Front skośny narożnika (render/cornerCabinet3d.js: renderCornerCabinet) to
  // jedyny element, który nie leży płasko na ścianie modułu - obracamy go
  // wokół WŁASNEGO środka (już ustawionego wyżej), reszta wywołań nie
  // podaje rotationY (domyślnie 0) i zachowuje się identycznie jak dotąd.
  if (rotationY) mesh.rotation.y = rotationY;

  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = new THREE.EdgesGeometry(geo);
  const isSelected = isActiveModule || (userData && state.selectedModules && state.selectedModules.has(userData.moduleId));
  let edgeColor = isXrayMode ? (type === 'drawerBox' ? 0xd97706 : 0x64748b) : 0x334155; 
  if (isSelected && type !== 'drawerBox') edgeColor = 0x2563eb; // skrzynki szuflad zostają w swoim kolorze także w zaznaczonej szafce
  
  const line = new THREE.LineSegments(edges, getLineMat(edgeColor));
  if (userData) line.userData = userData; 

  mesh.add(line);
  parentGroup.add(mesh);
}

export function addHole(radius, depth, x, y, z, rotationAxis, parentGroup) {
  if (!isXrayMode) return; 
  const geo = new THREE.CylinderGeometry(radius, radius, depth, 16);
  const mesh = new THREE.Mesh(geo, holeMat);
  if (rotationAxis === 'x') mesh.rotation.z = Math.PI / 2; 
  if (rotationAxis === 'y') mesh.rotation.x = 0;           
  if (rotationAxis === 'z') mesh.rotation.x = Math.PI / 2; 
  mesh.position.set(x, y, z);
  parentGroup.add(mesh);
}

export function addHardware(type, x, y, z, axis, parentGroup) {
  if (!isXrayMode) return; 
  let geo, mat;
  if (type === 'support') {
      geo = new THREE.CylinderGeometry(2.5, 2.5, 12, 16);
      mat = new THREE.MeshStandardMaterial({color: 0x94a3b8, metalness: 0.9, roughness: 0.2}); 
  } else if (type === 'dowel') {
      geo = new THREE.CylinderGeometry(4.0, 4.0, 30, 16);
      mat = new THREE.MeshStandardMaterial({color: 0xb45309, roughness: 0.9}); 
  } else if (type === 'screw') {
      geo = new THREE.CylinderGeometry(1.5, 1.5, 45, 16);
      mat = new THREE.MeshStandardMaterial({color: 0x334155, metalness: 0.6, roughness: 0.4}); 
  }
  const mesh = new THREE.Mesh(geo, mat);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parentGroup.add(mesh);
}

// Płyta o dowolnym obrysie w widoku od frontu (szafka pod skos, render/
// slopeCabinet3d.js): `points` to [x, y] w płaszczyźnie frontu, bryła ciągnie
// się wzdłuż +Z od z0 na `depth`. Typy materiału jak w addBox.
export function addPrism(points, z0, depth, type, isActiveModule, userData, parentGroup) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const matObj = isXrayMode ? mats.xray : mats.solid;
  const mesh = new THREE.Mesh(geo, matObj[type] || matObj.corpus);
  mesh.position.set(0, 0, z0);
  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = new THREE.EdgesGeometry(geo);
  const isSelected = isActiveModule || (userData && state.selectedModules && state.selectedModules.has(userData.moduleId));
  let edgeColor = isXrayMode ? 0x64748b : 0x334155;
  if (isSelected) edgeColor = 0x2563eb;
  const line = new THREE.LineSegments(edges, getLineMat(edgeColor));
  if (userData) line.userData = userData;
  mesh.add(line);
  parentGroup.add(mesh);
}

// Panel wieńca narożnika (obrys L ze ściętym rogiem) - jedyna geometria w
// całej aplikacji, która nie jest zwykłym prostopadłościanem (patrz
// render/cornerCabinet3d.js: renderCornerCabinet). `shape` to THREE.Shape w
// płaszczyźnie XY (x=lokalny X modułu, y=lokalny Z modułu) - obracamy
// wytłoczoną geometrię o -90° wokół X, żeby leżała płasko (grubość w Y),
// zamiast stać pionowo jak domyślna ekstruzja.
export function addCornerPanel(shape, thickness, y, isActiveModule, userData, parentGroup) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);

  const matObj = isXrayMode ? mats.xray : mats.solid;
  const mesh = new THREE.Mesh(geo, matObj.corpus);
  mesh.position.set(0, y, 0);
  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = new THREE.EdgesGeometry(geo);
  let edgeColor = isXrayMode ? 0x64748b : 0x334155;
  if (isActiveModule) edgeColor = 0x2563eb;
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor, linewidth: isActiveModule ? 2 : 1 }));
  if (userData) line.userData = userData;
  mesh.add(line);
  parentGroup.add(mesh);
}
