// src/render/measureTool.js
//
// Miarka w widoku 3D - wydzielona z render/viewer3d.js. Scena, kamera, renderer i
// raycaster należą do viewer3d.js i przychodzą raz, w initMeasureTool(); getTargets()
// zwraca grupy, po których wolno mierzyć (szafki + pokój).
import * as THREE from 'three';

let ctx = null;
// Miarka - tryb "klik pierwszy punkt, klik drugi punkt" w scenie 3D, do
// szybkiego sprawdzania dowolnego odstępu bez liczenia ręcznie (zgłoszona
// prośba). Punkty łapane raycasterem z DOWOLNEJ widocznej powierzchni
// (szafki, ściany, podłoga) - nie tylko elementów modułu jak handle3DClick.
const measureMode = { active: false, pointA: null, banner: null, btn: null };
let measureGroup;
// Punkt pod kursorem (dokładnie ten, który zatwierdza klik - WYSIWYG),
// przyciągany do najbliższego rogu bryły w promieniu SNAP_PX pikseli
// ekranu, jeśli taki się znajdzie w zasięgu (zgłoszona prośba o precyzję).
export const measureHoverMouse = new THREE.Vector2();
let measureHoverPoint = null;
let measureHoverMarker = null;
const MEASURE_SNAP_PX = 20;

export function initMeasureTool(context) {
  ctx = context;
  // Osobna grupa DOPIĘTA WPROST DO SCENE, nie do cabinetGroup, bo update3D() czyści
  // cabinetGroup przy KAŻDYM przeliczeniu (np. przy zwykłym wpisywaniu w polach) -
  // markery/linia pomiaru musiałyby znikać przy każdej niepowiązanej zmianie.
  measureGroup = new THREE.Group();
  ctx.scene.add(measureGroup);
}

export function isMeasureActive() {
  return measureMode.active;
}

// Przycisk "Miarka" z paska widoku - zmienia napis przy włączaniu/wyłączaniu.
export function setMeasureButton(btn) {
  measureMode.btn = btn;
}

// Miarka - "klik pierwszy punkt, klik drugi punkt", odległość w mm (jednostki
// sceny Three.js SĄ milimetrami w całej appce, patrz CLAUDE.md). Markery/
// linia to zwykłe siatki w measureGroup (dodanej wprost do scene, nie do
// cabinetGroup - przeżywają update3D()), depthTest:false żeby zawsze były
// widoczne na wierzchu, niezależnie co akurat zasłania dany punkt.
export function toggleMeasureMode() {
  if (measureMode.active) exitMeasureMode(); else enterMeasureMode();
}

function enterMeasureMode() {
  measureMode.active = true;
  measureMode.pointA = null;
  clearMeasureVisuals();
  ensureHoverMarker();
  ensureMeasureBanner();
  setMeasureBannerText('Kliknij pierwszy punkt do zmierzenia...');
  if (measureMode.btn) {
      measureMode.btn.innerHTML = '<i class="ti ti-ruler-measure" aria-hidden="true"></i> Wyłącz miarkę';
      measureMode.btn.classList.add('active');
  }
}

function exitMeasureMode() {
  measureMode.active = false;
  measureMode.pointA = null;
  measureHoverPoint = null;
  clearMeasureVisuals();
  if (measureHoverMarker) measureHoverMarker.visible = false;
  if (measureMode.banner) { measureMode.banner.remove(); measureMode.banner = null; }
  if (measureMode.btn) {
      measureMode.btn.innerHTML = '<i class="ti ti-ruler-measure" aria-hidden="true"></i> Miarka';
      measureMode.btn.classList.remove('active');
  }
}

function clearMeasureVisuals() {
  if (!measureGroup) return;
  while (measureGroup.children.length > 0) measureGroup.remove(measureGroup.children[0]);
}

function addMeasurePoint(point) {
  const geo = new THREE.SphereGeometry(6, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.copy(point);
  sphere.renderOrder = 999;
  measureGroup.add(sphere);
}

function addMeasureLine(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 999;
  measureGroup.add(line);
}

// Punkt pod kursorem - osobna, TRWAŁA siatka poza measureGroup (nie znika przy
// clearMeasureVisuals, tylko się chowa/pokazuje i przesuwa) - inaczej
// migałaby przy każdym kliknięciu, które czyści measureGroup. Dwa style: biały
// pierścień = przyciągnięty do rogu formatki (precyzyjnie), mniejsza szara
// kropka = swobodny punkt na powierzchni (zgłoszona prośba o widoczny
// "punkcik pod myszką" i przyciąganie do punktów w modułach).
function ensureHoverMarker() {
  if (measureHoverMarker) return measureHoverMarker;
  const group = new THREE.Group();
  const dot = new THREE.Mesh(
      new THREE.SphereGeometry(4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x94a3b8, depthTest: false })
  );
  const ring = new THREE.Mesh(
      new THREE.RingGeometry(9, 12, 20),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.name = 'snapRing';
  dot.name = 'freeDot';
  group.add(dot, ring);
  group.renderOrder = 1000;
  group.visible = false;
  ctx.scene.add(group);
  measureHoverMarker = group;
  return group;
}

// Raz na klatkę (patrz animate()): łapie raycastem punkt pod kursorem i - jeśli
// trafiony obiekt to prostopadłościenna formatka (wszystkie w tej appce są,
// patrz addBox) - sprawdza, czy któryś z jej 8 rogów w przestrzeni świata
// wypada bliżej niż MEASURE_SNAP_PX pikseli ekranu od kursora; jeśli tak,
// PRZYCIĄGA do tego rogu zamiast do surowego punktu na powierzchni. To
// dokładnie ten punkt, który zatwierdza klik (handleMeasureClick) - podgląd i
// realny wynik są zawsze tym samym punktem (WYSIWYG, zgłoszona prośba o
// precyzję).
export function updateMeasureHover() {
  const marker = ensureHoverMarker();
  ctx.raycaster.setFromCamera(measureHoverMouse, ctx.camera);
  const targets = ctx.getTargets().filter(Boolean);
  const hits = targets.length ? ctx.raycaster.intersectObjects(targets, true).filter(h => !h.object.userData?.isMeasureTool) : [];

  if (hits.length === 0) {
      measureHoverPoint = null;
      marker.visible = false;
      return;
  }

  const hit = hits[0];
  let point = hit.point.clone();
  let snapped = false;

  if (hit.object.isMesh && hit.object.geometry) {
      const box = new THREE.Box3().setFromObject(hit.object);
      if (isFinite(box.min.x)) {
          const corners = [
              [box.min.x, box.min.y, box.min.z], [box.min.x, box.min.y, box.max.z],
              [box.min.x, box.max.y, box.min.z], [box.min.x, box.max.y, box.max.z],
              [box.max.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.max.z],
              [box.max.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.max.z],
          ];
          const rect = ctx.renderer.domElement.getBoundingClientRect();
          const mousePx = (measureHoverMouse.x * 0.5 + 0.5) * rect.width;
          const mousePy = (-measureHoverMouse.y * 0.5 + 0.5) * rect.height;
          let bestDist = MEASURE_SNAP_PX;
          let best = null;
          corners.forEach(([x, y, z]) => {
              const v = new THREE.Vector3(x, y, z).project(ctx.camera);
              const px = (v.x * 0.5 + 0.5) * rect.width;
              const py = (-v.y * 0.5 + 0.5) * rect.height;
              const d = Math.hypot(px - mousePx, py - mousePy);
              if (d < bestDist) { bestDist = d; best = new THREE.Vector3(x, y, z); }
          });
          if (best) { point = best; snapped = true; }
      }
  }

  measureHoverPoint = point;
  marker.position.copy(point);
  marker.getObjectByName('freeDot').visible = !snapped;
  const ring = marker.getObjectByName('snapRing');
  ring.visible = snapped;
  if (snapped) ring.lookAt(ctx.camera.position); // pierścień płaski w swojej płaszczyźnie - obróć do kamery jak billboard
  marker.visible = true;
}

function ensureMeasureBanner() {
  if (measureMode.banner) return measureMode.banner;
  const banner = document.createElement('div');
  Object.assign(banner.style, {
      position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#f59e0b', color: 'white', padding: '12px 24px', borderRadius: '8px',
      fontWeight: 'bold', zIndex: '2000', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '15px', fontFamily: 'var(--font)', fontSize: '14px'
  });
  const textSpan = document.createElement('span');
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Zamknij miarkę';
  Object.assign(closeBtn.style, { background: 'white', color: '#b45309', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
  closeBtn.onclick = (e) => { e.stopPropagation(); exitMeasureMode(); };
  banner.appendChild(textSpan);
  banner.appendChild(closeBtn);
  banner._textSpan = textSpan;
  (ctx.container || document.body).appendChild(banner);
  measureMode.banner = banner;
  return banner;
}

function setMeasureBannerText(text) {
  const banner = ensureMeasureBanner();
  banner._textSpan.innerText = text;
}

// Zatwierdza DOKŁADNIE ten punkt, który w danej chwili pokazuje marker pod
// kursorem (measureHoverPoint, liczony co klatkę w updateMeasureHover) - nie
// osobny raycast na klik, żeby podgląd i realny wynik nigdy się nie rozjechały.
export function handleMeasureClick() {
  if (!measureHoverPoint) return;
  const point = measureHoverPoint.clone();

  if (!measureMode.pointA) {
      clearMeasureVisuals();
      measureMode.pointA = point;
      addMeasurePoint(point);
      setMeasureBannerText('Kliknij drugi punkt...');
  } else {
      addMeasurePoint(point);
      addMeasureLine(measureMode.pointA, point);
      const distMm = Math.round(measureMode.pointA.distanceTo(point) * 10) / 10;
      setMeasureBannerText(`Odległość: ${distMm} mm — kliknij, żeby zmierzyć od nowa`);
      measureMode.pointA = null;
  }
}
