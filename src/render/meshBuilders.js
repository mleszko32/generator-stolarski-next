// src/render/meshBuilders.js
//
// Materiały i budowanie pojedynczych brył sceny 3D (płyty, otwory, okucia, etykiety,
// wieniec narożnika) - wydzielone z render/viewer3d.js. Bez stanu sceny: każda funkcja
// dostaje grupę-rodzica w parametrze. Jedyny stan to tryb x-ray (przełącznik
// "Przezroczysty / Realistyczny" w viewer3d.js), od którego zależą materiały.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { activePicks } from '../core/groupSelection.js';
import { sideFloorExt } from '../engine/carcaseParts.js';
import { partMaterial, isLightColor } from '../core/decorColors.js';

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
      plinth: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.8, metalness: 0.0 }),
      appliance: new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.6 }) // urządzenie AGD (zmywarka)
  },
  xray: {
      corpus: new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.15, depthWrite: false }),
      front: new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15, depthWrite: false }),
      shelf: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.3, depthWrite: false }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6, depthWrite: false }),
      hdf: new THREE.MeshStandardMaterial({ color: 0x475569, transparent: true, opacity: 0.3, depthWrite: false }),
      plinth: new THREE.MeshStandardMaterial({ color: 0x1c1917, transparent: true, opacity: 0.7, depthWrite: true }),
      appliance: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.25, depthWrite: false })
  }
};
export const worktopMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.55, metalness: 0.0 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
// Otwory prowadników zawiasów innym kolorem - od razu widać, czy nie wchodzą na
// rząd podpórek półek (ta sama linia 37 mm od przodu).
const plateHoleMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });

// Materiały współdzielone między klatkami przebudowy (nie wolno ich zwalniać
// razem z siatką, bo używa ich następna wersja sceny).
[...Object.values(mats.xray), ...Object.values(mats.solid), worktopMat, holeMat, plateHoleMat].forEach(m => { m.userData.shared = true; });

// Kolory krawędzi mają po jednym wspólnym materiale (wcześniej każdy prostopadłościan
// tworzył własny, co przy kilkunastu szafkach dawało tysiące materiałów).
const lineMatCache = new Map();
function getLineMat(color) {
  let m = lineMatCache.get(color);
  if (!m) { m = new THREE.LineBasicMaterial({ color }); m.userData.shared = true; lineMatCache.set(color, m); }
  return m;
}

// Geometrie współdzielone przez wiele siatek (te same wymiary płyty, otworu, okucia) -
// przebudowa sceny nie tworzy ich od nowa i nie wolno ich zwalniać razem z siatką.
// Limit wpisów, żeby długa sesja z wieloma różnymi wymiarami nie rosła bez końca
// (powyżej limitu geometria jest zwykła, zwalniana z siatką).
const GEO_CACHE_MAX = 3000;
const geoCache = new Map();
function cachedGeometry(key, make) {
  let g = geoCache.get(key);
  if (g) return g;
  g = make();
  if (geoCache.size < GEO_CACHE_MAX) { g.userData.shared = true; geoCache.set(key, g); }
  return g;
}

// Zwalnia geometrie i materiały (pamięć GPU) usuniętej ze sceny gałęzi. Bez tego
// każde update3D() zostawiało po sobie setki geometrii, aż widok zaczynał zwalniać.
// Pomija wszystko oznaczone userData.shared (materiały, geometrie i tekstury z cache).
export function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(x => {
      if (!x.userData.shared) {
        if (x.map && !x.map.userData.shared) x.map.dispose();
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
// Materiał etykiety (tekstura z canvasa) z cache po tekście - przebudowa sceny przy każdej
// zmianie (np. wpisywaniu w pole) nie rysuje i nie wgrywa na GPU tych samych napisów od nowa.
const labelCache = new Map();
const LABEL_CACHE_MAX = 300;

export function createLabelSprite(text) {
  const cached = labelCache.get(text);
  if (cached) return makeLabelSprite(cached);
  const entry = buildLabelMaterial(text);
  if (labelCache.size < LABEL_CACHE_MAX) {
    entry.material.userData.shared = true;
    entry.material.map.userData.shared = true;
    labelCache.set(text, entry);
  }
  return makeLabelSprite(entry);
}

function makeLabelSprite({ material, aspect }) {
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  const worldH = 130; // mm - wysokość etykiety w scenie (skalowana z zoomem jak reszta bryły)
  sprite.scale.set(worldH * aspect, worldH, 1);
  return sprite;
}

function buildLabelMaterial(text) {
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
  return { material, aspect: canvas.width / canvas.height };
}


// Tryb kolorów płyt: 'real' - kolor dekoru / lakieru, 'materials' - kontrastowa paleta po
// materiałach z legendy (render/viewer3d.js ustawia ją przed przebudową sceny). highlightKey -
// podświetlony materiał z legendy: reszta brył półprzezroczysta.
function loadColorMode() {
  try { return localStorage.getItem('viewerColorMode') === 'materials' ? 'materials' : 'real'; } catch (e) { return 'real'; }
}
export let colorMode = loadColorMode();
export function setColorMode(mode) {
  colorMode = mode === 'materials' ? 'materials' : 'real';
  try { localStorage.setItem('viewerColorMode', colorMode); } catch (e) {}
}
let materialPalette = new Map();
export function setMaterialPalette(map) { materialPalette = map || new Map(); }
export let highlightKey = null;
export function setHighlightKey(key) { highlightKey = key || null; }

// Materiał bryły: domyślny dla typu, a dla korpusu/półek/frontów/cokołu/skrzynek - kopia w kolorze
// dekoru albo palety materiałów (core/decorColors.js), przy podświetleniu innego materiału
// półprzezroczysta; z cache po kolorze.
const tintCache = new Map();
const COLORABLE = new Set(['corpus', 'shelf', 'front', 'plinth', 'drawerBox']);
// active = bryła klikniętej (aktywnej) szafki: kolor płyty podbarwiony na niebiesko, żeby w
// zaznaczonej grupie było widać, którą szafkę zmienia prawy panel (tak samo szafki dobrane
// Shiftem w jej grupie - activePicks). Pozostałe zaznaczone szafki
// (Shift/Ctrl, grupa) mają słabsze podbarwienie - sam jasny obrys krawędzi był niewidoczny.
const ACTIVE_TINT = new THREE.Color(0x2563eb);
const ACTIVE_TYPES = new Set(['corpus', 'shelf', 'front', 'plinth', 'hdf']);
function materialFor(type, userData, active = false) {
  const matObj = isXrayMode ? mats.xray : mats.solid;
  const base = matObj[type] || matObj.corpus;
  const ent = COLORABLE.has(type) ? partMaterial(type, userData, state.project) : null;
  let color = null;
  if (ent) color = colorMode === 'materials' ? (materialPalette.get(ent.key) ?? null) : ent.color;
  if (color != null && colorMode === 'real' && isXrayMode && isLightColor(color)) color = null;
  const faded = highlightKey != null && (!ent || ent.key !== highlightKey);
  if (!active && userData && userData.moduleId && state.editPicks && state.editPicks.size
    && activePicks(state.project, { picks: state.editPicks }, state.activeModuleId).has(userData.moduleId)) active = true;
  const selected = !active && !!(userData && userData.moduleId && state.selectedModules && state.selectedModules.has(userData.moduleId));
  const tinted = (active || selected) && !faded && ACTIVE_TYPES.has(type);
  if (color == null && !faded && !tinted) return base;
  const key = `${isXrayMode ? 'x' : 's'}|${type}|${color}|${faded ? 'f' : ''}|${tinted ? (active ? 'a' : 'z') : ''}`;
  let m = tintCache.get(key);
  if (!m) {
    m = base.clone();
    if (color != null) m.color.setHex(color);
    if (faded) { m.transparent = true; m.opacity = 0.08; m.depthWrite = false; }
    else if (isXrayMode && color != null) m.opacity = Math.max(base.opacity, 0.35);
    if (tinted) {
      m.color.lerp(ACTIVE_TINT, (isXrayMode ? 0.7 : 0.4) * (active ? 1 : 0.5));
      if (isXrayMode) { m.transparent = true; m.opacity = Math.max(m.opacity, active ? 0.55 : 0.35); }
    }
    m.userData.shared = true;
    tintCache.set(key, m);
  }
  return m;
}

export function addBox(w, h, d, x, y, z, type, isActiveModule, userData = null, parentGroup, rotationY = 0) {
  const dimKey = `${w}|${h}|${d}`;
  const geo = cachedGeometry('box|' + dimKey, () => new THREE.BoxGeometry(w, h, d));
  const mat = materialFor(type, userData, isActiveModule);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x + w/2, y + h/2, z + d/2);
  // Front skośny narożnika (render/cornerCabinet3d.js: renderCornerCabinet) to
  // jedyny element, który nie leży płasko na ścianie modułu - obracamy go
  // wokół WŁASNEGO środka (już ustawionego wyżej), reszta wywołań nie
  // podaje rotationY (domyślnie 0) i zachowuje się identycznie jak dotąd.
  if (rotationY) mesh.rotation.y = rotationY;

  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = cachedGeometry('edges|' + dimKey, () => new THREE.EdgesGeometry(geo));
  const isSelected = isActiveModule || (userData && state.selectedModules && state.selectedModules.has(userData.moduleId));
  let edgeColor = isXrayMode ? (type === 'drawerBox' ? 0xd97706 : 0x64748b) : 0x334155; 
  // aktywna szafka - mocny niebieski, pozostałe zaznaczone (reszta grupy) - jasny;
  // skrzynki szuflad zostają w swoim kolorze także w zaznaczonej szafce
  if (isSelected && type !== 'drawerBox') edgeColor = isActiveModule ? 0x2563eb : 0x93c5fd;
  
  const line = new THREE.LineSegments(edges, getLineMat(edgeColor));
  if (userData) line.userData = userData; 

  mesh.add(line);
  parentGroup.add(mesh);
}

// kind: 'plate' = otwór prowadnika zawiasu (osobny kolor), inaczej zwykły otwór.
export function addHole(radius, depth, x, y, z, rotationAxis, parentGroup, kind) {
  if (!isXrayMode) return;
  const geo = cachedGeometry(`hole|${radius}|${depth}`, () => new THREE.CylinderGeometry(radius, radius, depth, 16));
  const mesh = new THREE.Mesh(geo, kind === 'plate' ? plateHoleMat : holeMat);
  if (rotationAxis === 'x') mesh.rotation.z = Math.PI / 2; 
  if (rotationAxis === 'y') mesh.rotation.x = 0;           
  if (rotationAxis === 'z') mesh.rotation.x = Math.PI / 2; 
  mesh.position.set(x, y, z);
  parentGroup.add(mesh);
}

// Okucia (podpórki, kołki, wkręty) - jedna geometria i jeden materiał na typ (wcześniej
// nowy materiał dla każdej sztuki, przy kilkunastu szafkach tysiące obiektów na GPU).
const HARDWARE = {
  support: { geo: new THREE.CylinderGeometry(2.5, 2.5, 12, 16), mat: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 }) },
  dowel: { geo: new THREE.CylinderGeometry(4.0, 4.0, 30, 16), mat: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 }) },
  screw: { geo: new THREE.CylinderGeometry(1.5, 1.5, 45, 16), mat: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 }) },
};
Object.values(HARDWARE).forEach(({ geo, mat }) => { geo.userData.shared = true; mat.userData.shared = true; });

export function addHardware(type, x, y, z, axis, parentGroup) {
  if (!isXrayMode) return; 
  const hw = HARDWARE[type];
  if (!hw) return;
  const geo = hw.geo;
  const mat = hw.mat;
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
  const mesh = new THREE.Mesh(geo, materialFor(type, userData, isActiveModule));
  mesh.position.set(0, 0, z0);
  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = new THREE.EdgesGeometry(geo);
  const isSelected = isActiveModule || (userData && state.selectedModules && state.selectedModules.has(userData.moduleId));
  let edgeColor = isXrayMode ? 0x64748b : 0x334155;
  if (isSelected) edgeColor = isActiveModule ? 0x2563eb : 0x93c5fd;
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

  const mesh = new THREE.Mesh(geo, materialFor('corpus', userData));
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

// Nóżki (4, z ręcznymi korektami wysokości) i listwa cokołu pod szafką. Grupa ma układ
// szafki: x od lewego boku, y = 0 na podłodze, z od tyłu (z = 0) do czoła korpusu (z = D).
// Wspólne dla zwykłej szafki (render/viewer3d.js) i szafki pod skos (slopeCabinet3d.js).
export function addLegsAndPlinth(mod, W, D, th, isActive, group) {
  if (!(mod.legs && mod.legs.active)) return;
  const legH = parseFloat(mod.legs.height) || 100;
  // Ręczna korekta wysokości pojedynczej nóżki (patrz ui/properties.js, zakładka
  // "Nóżki / Blendy" — lista "Nóżka N" z edytowalną wysokością). Indeksy 0-3 =
  // Tył-L, Tył-P, Przód-L, Przód-P, w tej samej kolejności co addBox() niżej —
  // ta sama kolejność jest też w engine/hardware.js (calculateProjectHardware).
  const legOverrides = mod.legs.heightOverrides || {};
  const legHeightFor = (i) => {
    const ov = legOverrides[i];
    return (ov !== undefined && ov !== null && ov !== '') ? (parseFloat(ov) || legH) : legH;
  };
  const rootY = 0.5;
  const udPlinth = { moduleId: mod.id, type: 'plinth' };
  const parsedOffset = parseFloat(mod.legs.plinthOffset);
  const offset = Number.isFinite(parsedOffset) ? parsedOffset : 40;
  const plinthThick = th;
  const frontFaceZ = D;
  const frontLegZ = mod.legs.plinth ? frontFaceZ - offset - plinthThick - 30 : frontFaceZ - 80;
  const clampedFrontLegZ = Math.max(90, frontLegZ);

  addBox(30, legHeightFor(0), 30, 50, rootY, 50, 'corpus', false, udPlinth, group);
  addBox(30, legHeightFor(1), 30, W - 80, rootY, 50, 'corpus', false, udPlinth, group);
  addBox(30, legHeightFor(2), 30, 50, rootY, clampedFrontLegZ, 'corpus', false, udPlinth, group);
  addBox(30, legHeightFor(3), 30, W - 80, rootY, clampedFrontLegZ, 'corpus', false, udPlinth, group);

  // Bok do podłogi (sideFloorExt): cokół kończy się na nim, nie wchodzi pod bok.
  const ext = sideFloorExt(mod, state.project);
  const plinthX0 = ext.left ? th : 0;
  const plinthW = W - plinthX0 - (ext.right ? th : 0);
  if (mod.legs.plinth) {
    addBox(plinthW, legH, plinthThick, plinthX0, rootY, frontFaceZ - offset - plinthThick, 'plinth', isActive, udPlinth, group);
  }
}
