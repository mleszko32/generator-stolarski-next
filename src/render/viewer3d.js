// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { state, duplicateModule, deleteModule, DEFAULT_ROOM } from '../core/state.js';

import { getDrawerComponents, calculateDrawerHoles } from '../core/drawerMath.js';
import { drawerSystems, DRAWER_VARIANT_ORDER, DRAWER_VARIANT_LABELS } from '../core/drawerSystems.js';
import { calculateHinges } from '../core/hingeMath.js';
import { autoDistributeShelves } from '../core/shelfMath.js';
import { recalculateLayout, getTraverseConfig, getWorldFootprint } from '../core/layout.js';
import { scheduleCheckpoint } from '../core/history.js';
import { toggleInteriorEditor, renderInteriorEditorIfVisible } from '../ui/interiorEditor.js';

import { updateSidebar } from '../ui/sidebar.js';
import { initPropertiesPanel } from '../ui/properties.js';

let alignMode = { active: false, sourceMod: null, sourceEl: null, banner: null };
let isXrayMode = true; 
let isFrontsVisible = true; 

let isDragging = false;
let dragTarget = null;
let dragModule = null;
const dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane();
const SNAP_DIST = 40; 
let dragSelectionOrigins = new Map();
let wasSelectedOnDown = false;

let scene, camera, renderer, controls;
let container;
let cabinetGroup;
let roomGroup;
const WALL_THICKNESS = 20;
// Ściany bliżej kamery przygasają, żeby wnętrze prawdziwego (zamkniętego z 4 stron)
// pokoju zawsze było widoczne z orbitującej kamery — patrz updateWallVisibility().
let wallMeshes = []; // { mesh, normal: THREE.Vector3 } (normalna skierowana na zewnątrz ściany)

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = new THREE.Vector2();

function getRoom() {
  return state.project.room || DEFAULT_ROOM;
}

// Czyści i odbudowuje geometrię pokoju (podłoga + 4 ściany) na podstawie
// state.project.room. Wołane raz przy starcie i za każdym razem, gdy użytkownik
// zapisze nowe wymiary w ui/roomPanel.js (przez eksportowane niżej updateRoom()) —
// ściany nie muszą się przebudowywać przy każdej drobnej edycji szafki, więc to
// NIE jest wołane z update3D().
function rebuildRoomGeometry() {
  if (!roomGroup) return;
  while (roomGroup.children.length > 0) {
    const child = roomGroup.children[0];
    roomGroup.remove(child);
    child.geometry?.dispose();
    child.material?.dispose();
  }
  wallMeshes = [];

  const room = getRoom();
  const W = parseFloat(room.width) || DEFAULT_ROOM.width;
  const D = parseFloat(room.depth) || DEFAULT_ROOM.depth;
  const H = parseFloat(room.height) || DEFAULT_ROOM.height;

  const floorMargin = Math.max(W, D) * 0.4;
  const floorGeo = new THREE.PlaneGeometry(W + floorMargin * 2, D + floorMargin * 2);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.12 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // 4 ściany prostokątnego pokoju, narożnik (0,0) = tylno-lewy — dokładnie tam, gdzie
  // dotąd stały dwie sztywno zakodowane ściany, więc istniejące projekty (moduły przy
  // x=0/z=0) nadal "stoją przy ścianie" bez żadnej migracji współrzędnych.
  // Każda ściana ma WŁASNY, przezroczysty materiał (transparent:true) — pozwala to
  // przygaszać niezależnie te bliżej kamery w updateWallVisibility(), żeby wnętrze
  // zamkniętego z 4 stron pokoju było zawsze widoczne z orbitującej kamery.
  const makeWallMat = () => new THREE.MeshStandardMaterial({
    color: 0xf7f5f1, roughness: 0.95, metalness: 0, transparent: true, opacity: 1, side: THREE.DoubleSide,
  });

  const wallDefs = [
    { geo: new THREE.BoxGeometry(W + WALL_THICKNESS, H, WALL_THICKNESS), pos: [W / 2, H / 2, -WALL_THICKNESS / 2], normal: new THREE.Vector3(0, 0, -1) }, // tylna, z=0
    { geo: new THREE.BoxGeometry(W + WALL_THICKNESS, H, WALL_THICKNESS), pos: [W / 2, H / 2, D + WALL_THICKNESS / 2], normal: new THREE.Vector3(0, 0, 1) }, // przednia, z=D
    { geo: new THREE.BoxGeometry(WALL_THICKNESS, H, D + WALL_THICKNESS), pos: [-WALL_THICKNESS / 2, H / 2, D / 2], normal: new THREE.Vector3(-1, 0, 0) }, // lewa, x=0
    { geo: new THREE.BoxGeometry(WALL_THICKNESS, H, D + WALL_THICKNESS), pos: [W + WALL_THICKNESS / 2, H / 2, D / 2], normal: new THREE.Vector3(1, 0, 0) }, // prawa, x=W
  ];

  wallDefs.forEach(({ geo, pos, normal }) => {
    const mesh = new THREE.Mesh(geo, makeWallMat());
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.receiveShadow = true;
    roomGroup.add(mesh);
    wallMeshes.push({ mesh, normal });
  });
}

const roomCenterScratch = new THREE.Vector3();
const toCameraScratch = new THREE.Vector3();

// Wołane co klatkę z animate(): przygasza ścianę, jeśli kamera patrzy na pokój
// "zza" niej (jej normalna, skierowana na zewnątrz, wskazuje w stronę kamery) —
// dzięki temu pełny, zamknięty z 4 stron pokój nigdy nie zasłania wnętrza,
// niezależnie jak użytkownik obróci widok.
function updateWallVisibility() {
  if (!wallMeshes.length || !camera) return;
  const room = getRoom();
  roomCenterScratch.set(
    (parseFloat(room.width) || DEFAULT_ROOM.width) / 2,
    (parseFloat(room.height) || DEFAULT_ROOM.height) / 2,
    (parseFloat(room.depth) || DEFAULT_ROOM.depth) / 2
  );
  toCameraScratch.subVectors(camera.position, roomCenterScratch).normalize();

  wallMeshes.forEach(({ mesh, normal }) => {
    const facingCamera = normal.dot(toCameraScratch) > 0;
    const targetOpacity = facingCamera ? 0.05 : 0.97;
    mesh.material.opacity += (targetOpacity - mesh.material.opacity) * 0.15;
  });
}

// Ustawia cel orbitowania na środek pokoju i cofa kamerę na odległość dopasowaną
// do jego przekątnej, zachowując obecny kierunek patrzenia — żeby zmiana wymiarów
// pokoju (ui/roomPanel.js) nie "teleportowała" widoku w losowe miejsce.
function reframeCameraToRoom() {
  if (!camera || !controls) return;
  const room = getRoom();
  const W = parseFloat(room.width) || DEFAULT_ROOM.width;
  const D = parseFloat(room.depth) || DEFAULT_ROOM.depth;
  const H = parseFloat(room.height) || DEFAULT_ROOM.height;

  const center = new THREE.Vector3(W / 2, H / 3, D / 2);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  if (dir.lengthSq() < 1) dir.set(0.6, 0.4, 1); // pierwsze wywołanie: kamera i target się pokrywają
  dir.normalize();

  const diag = Math.sqrt(W * W + D * D);
  const targetDist = Math.max(diag * 1.1, 1500);

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, targetDist);
  controls.update();
}

// Wołane po zapisaniu nowych wymiarów w ui/roomPanel.js — przebudowuje ściany/podłogę
// i dopasowuje kamerę. Celowo NIE jest częścią update3D() (ten biegnie przy każdej
// drobnej edycji szafki; ściany pokoju zmieniają się dużo rzadziej).
export function updateRoom() {
  rebuildRoomGeometry();
  reframeCameraToRoom();
}

export function init3DViewer() {
  container = document.getElementById('viewer-3d-container') || document.getElementById('editor-3d-container') || document.querySelector('.viewer-3d');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 10, 100000);
  camera.position.set(2500, 1500, 3500); // nadpisane zaraz po utworzeniu controls przez reframeCameraToRoom()

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Bez tego PBR-owe materiały (MeshStandardMaterial) wyglądają płasko —
  // ACES daje bardziej filmowe wygaszanie świateł zamiast liniowego "wypalania".
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  container.innerHTML = '';
  container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Miękkie oświetlenie otoczenia (IBL) z gotowej "pokojowej" sceny three.js —
  // bez tego płyty korpusu (MeshStandardMaterial) odbijają światło tylko z
  // dwóch kierunkowych lamp i wyglądają matowo-plastikowo. Z environment
  // dostają delikatne, realistyczne doświetlenie ze wszystkich stron.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.035).texture;
  pmremGenerator.dispose();

  // Intensywności świateł kierunkowych trochę niższe niż wcześniej — teraz
  // dokładają się do doświetlenia z environment, a nie muszą same za nie odpowiadać.
  const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x94a3b8, 0.45);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff4e6, 0.75);
  dirLight.position.set(4000, 5000, 6000);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  const d = 8000;
  dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.camera.far = 20000;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0xe0f2fe, 0.3);
  backLight.position.set(-2000, 2000, -3000);
  scene.add(backLight);

  scene.fog = new THREE.Fog(0xf1f5f9, 9000, 24000); // wtapia ściany/podłogę w tło zamiast twardej krawędzi

  roomGroup = new THREE.Group();
  scene.add(roomGroup);
  rebuildRoomGeometry();

  cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);

  reframeCameraToRoom();

  renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos.set(e.clientX, e.clientY);
      if (alignMode.active) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(cabinetGroup.children, true);
      if (intersects.length > 0) {
          let group = intersects[0].object;
          while(group.parent && group.parent !== cabinetGroup) { group = group.parent; }
          
          if (group.userData && group.userData.moduleId) {
              isDragging = true;
              dragTarget = group;
              dragModule = state.project.modules.find(m => m.id === group.userData.moduleId);
              
              controls.enabled = false; 
              
              const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
              dragPlane.setFromNormalAndCoplanarPoint(normal, intersects[0].point);
              dragOffset.copy(dragTarget.position).sub(intersects[0].point);
              
              const gId = dragModule.groupId;
              const idsToSelect = gId ? state.project.modules.filter(m => m.groupId === gId).map(m => m.id) : [dragModule.id];

              if (!state.selectedModules) state.selectedModules = new Set();
              wasSelectedOnDown = state.selectedModules.has(dragModule.id);

              if (!wasSelectedOnDown) {
                  if (e.shiftKey) {
                      idsToSelect.forEach(id => state.selectedModules.add(id));
                  } else {
                      state.selectedModules = new Set(idsToSelect);
                  }
                  state.activeModuleId = dragModule.id;
                  updateSidebar();
                  initPropertiesPanel();
                  update3D(); 
              }

              dragSelectionOrigins.clear();
              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(mod => mod.id === id);
                  if (m) dragSelectionOrigins.set(id, { x: m.position.x || 0, y: m.position.y || 0, z: m.position.z || 0 });
              });

              dragTarget = cabinetGroup.children.find(g => g.userData.moduleId === dragModule.id);
          }
      }
  });

  window.addEventListener('pointermove', (e) => {
      if (!isDragging || !dragTarget || !dragModule) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      
      const intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersect);
      
      if (intersect) {
          let newGroupPos = intersect.add(dragOffset);

          const H = parseFloat(dragModule.dimensions.height) || 720;
          // Odcisk na podłodze (worldW/worldD) - przy rotation 90/270 zamienia się
          // szerokość z głębokością (patrz core/layout.js getWorldFootprint). To on,
          // nie surowe dimensions.width/depth, decyduje gdzie leży róg (position.x/z)
          // - modGroup w update3D() centruje się dokładnie tak samo.
          const { worldW, worldD } = getWorldFootprint(dragModule);
          let baseOffsetY = (dragModule.legs && dragModule.legs.active) ? (parseFloat(dragModule.legs.height) || 100) : 0;

          const dragLeftW = (dragModule.fillers && dragModule.fillers.left && dragModule.fillers.left.active) ? (parseFloat(dragModule.fillers.left.width) || 50) : 0;
          const dragRightW = (dragModule.fillers && dragModule.fillers.right && dragModule.fillers.right.active) ? (parseFloat(dragModule.fillers.right.width) || 50) : 0;

          let snapX = newGroupPos.x - worldW/2;
          let snapY = newGroupPos.y - H/2 - baseOffsetY;
          let snapZ = newGroupPos.z - worldD/2;

          const room = getRoom();

          if (Math.abs(snapX - dragLeftW) < SNAP_DIST) snapX = dragLeftW;
          if (Math.abs(snapY) < SNAP_DIST) snapY = 0;
          if (Math.abs(snapZ) < SNAP_DIST) snapZ = 0;
          // Przyciąganie do dalszych ścian pokoju (bliższe x=0/z=0 obsługują linie wyżej).
          if (Math.abs((snapX + worldW) - room.width) < SNAP_DIST) snapX = room.width - worldW;
          if (Math.abs((snapZ + worldD) - room.depth) < SNAP_DIST) snapZ = room.depth - worldD;

          state.project.modules.forEach(other => {
              if (state.selectedModules && state.selectedModules.has(other.id)) return;

              const oH = parseFloat(other.dimensions.height);
              const { worldW: oW, worldD: oD } = getWorldFootprint(other);
              const oX = parseFloat(other.position.x);
              const oY = parseFloat(other.position.y);
              const oZ = parseFloat(other.position.z);

              const otherLeftW = (other.fillers && other.fillers.left && other.fillers.left.active) ? (parseFloat(other.fillers.left.width) || 50) : 0;
              const otherRightW = (other.fillers && other.fillers.right && other.fillers.right.active) ? (parseFloat(other.fillers.right.width) || 50) : 0;

              const effOX = oX - otherLeftW;
              const effOW = oW + otherLeftW + otherRightW;

              let dragStartX = snapX - dragLeftW;
              let dragEndX = snapX + worldW + dragRightW;

              if (Math.abs(dragStartX - (effOX + effOW)) < SNAP_DIST) snapX = effOX + effOW + dragLeftW;
              else if (Math.abs(dragEndX - effOX) < SNAP_DIST) snapX = effOX - worldW - dragRightW;
              else if (Math.abs(dragStartX - effOX) < SNAP_DIST) snapX = effOX + dragLeftW;

              if (Math.abs(snapY - (oY + oH)) < SNAP_DIST) snapY = oY + oH;
              else if (Math.abs((snapY + H) - oY) < SNAP_DIST) snapY = oY - H;
              else if (Math.abs(snapY - oY) < SNAP_DIST) snapY = oY;

              if (Math.abs(snapZ - (oZ + oD)) < SNAP_DIST) snapZ = oZ + oD;
              else if (Math.abs((snapZ + worldD) - oZ) < SNAP_DIST) snapZ = oZ - worldD;
              else if (Math.abs(snapZ - oZ) < SNAP_DIST) snapZ = oZ;
          });

          snapX = Math.max(dragLeftW, snapX);
          snapY = Math.max(0, snapY);
          snapZ = Math.max(0, snapZ);

          const orig = dragSelectionOrigins.get(dragModule.id);
          if (orig) {
              const deltaX = snapX - orig.x;
              const deltaY = snapY - orig.y;
              const deltaZ = snapZ - orig.z;

              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(mod => mod.id === id);
                  if (!m) return;
                  const mOrig = dragSelectionOrigins.get(id);
                  if (mOrig) {
                      m.position.x = Math.round(mOrig.x + deltaX);
                      m.position.y = Math.round(mOrig.y + deltaY);
                      m.position.z = Math.round(mOrig.z + deltaZ);

                      const tTarget = cabinetGroup.children.find(g => g.userData.moduleId === id);
                      if (tTarget) {
                          const tH = parseFloat(m.dimensions.height) || 720;
                          const { worldW: tW, worldD: tD } = getWorldFootprint(m);
                          const tBaseY = (m.legs && m.legs.active) ? (parseFloat(m.legs.height) || 100) : 0;
                          tTarget.position.set(
                              m.position.x + tW/2,
                              m.position.y + tBaseY + tH/2,
                              m.position.z + tD/2
                          );
                      }
                  }
              });
          }

          const inpX = document.getElementById('input-pos-x');
          const inpY = document.getElementById('input-pos-y');
          const inpZ = document.getElementById('input-pos-z');
          if (inpX) inpX.value = dragModule.position.x;
          if (inpY) inpY.value = dragModule.position.y;
          if (inpZ) inpZ.value = dragModule.position.z;
      }
  });

  window.addEventListener('pointerup', (e) => {
      if (isDragging) {
          isDragging = false;
          dragTarget = null;
          dragModule = null;
          controls.enabled = true; 
          updateSidebar();
          initPropertiesPanel();
      }
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.abs(e.clientX - pointerDownPos.x) < 5 && Math.abs(e.clientY - pointerDownPos.y) < 5) {
          handle3DClick(e);
      }
  });

  window.addEventListener('pointerdown', (e) => {
      const existingMenu = document.getElementById('context-menu-3d');
      if (existingMenu && !existingMenu.contains(e.target) && e.target !== renderer.domElement) {
          existingMenu.remove();
      }
  });

  const uiOverlay = document.createElement('div');
  uiOverlay.style.position = 'absolute';
  uiOverlay.style.top = '15px';
  uiOverlay.style.right = '15px';
  uiOverlay.style.zIndex = '100';
  uiOverlay.style.display = 'flex';
  uiOverlay.style.gap = '10px';
  
  const toggleBtn = document.createElement('button');
  toggleBtn.innerText = '🔄 Przezroczysty (Szkic)';
  Object.assign(toggleBtn.style, {
      padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none',
      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'background 0.2s'
  });
  
  toggleBtn.onclick = () => {
      isXrayMode = !isXrayMode;
      toggleBtn.innerText = isXrayMode ? '🔄 Przezroczysty (Szkic)' : '🔄 Realistyczny (Bryły)';
      toggleBtn.style.background = isXrayMode ? '#3b82f6' : '#10b981';
      update3D();
  };
  
  const toggleFrontsBtn = document.createElement('button');
  toggleFrontsBtn.innerText = '🚪 Ukryj fronty zewn.';
  Object.assign(toggleFrontsBtn.style, {
      padding: '10px 16px', background: '#8b5cf6', color: '#fff', border: 'none',
      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'background 0.2s'
  });
  
  toggleFrontsBtn.onclick = () => {
      isFrontsVisible = !isFrontsVisible;
      toggleFrontsBtn.innerText = isFrontsVisible ? '🚪 Ukryj fronty zewn.' : '🚪 Pokaż fronty zewn.';
      toggleFrontsBtn.style.background = isFrontsVisible ? '#8b5cf6' : '#64748b';
      update3D();
  };

  const toggleInteriorBtn = document.createElement('button');
  toggleInteriorBtn.innerText = '🗂️ Wnętrze 2D';
  toggleInteriorBtn.title = 'Klikalny edytor wnęk — dziel/obsadzaj fronty bez trafiania w 3D';
  Object.assign(toggleInteriorBtn.style, {
      padding: '10px 16px', background: '#0f766e', color: '#fff', border: 'none',
      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'background 0.2s'
  });
  toggleInteriorBtn.onclick = () => {
      toggleInteriorEditor();
      const showingInterior = document.getElementById('editor-interior-container')?.style.display !== 'none';
      toggleInteriorBtn.innerText = showingInterior ? '🧊 Podgląd 3D' : '🗂️ Wnętrze 2D';
      toggleInteriorBtn.style.background = showingInterior ? '#475569' : '#0f766e';
      if (!showingInterior && container) {
          // #editor-3d-container był ukryty (display:none) — jego clientWidth/Height mogły
          // w tym czasie wynosić 0 i "zatrzasnąć się" w renderze/kamerze (patrz resize listener
          // niżej). Wymuś przeliczenie teraz, gdy kontener już ma prawdziwy rozmiar.
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
      }
  };

  uiOverlay.appendChild(toggleBtn);
  uiOverlay.appendChild(toggleFrontsBtn);
  uiOverlay.appendChild(toggleInteriorBtn);
  // NAPRAWA: overlay wpięty w .center-panel (nie w #editor-3d-container), bo
  // przełącznik "Wnętrze 2D" chowa cały #editor-3d-container display:none —
  // gdyby overlay był jego dzieckiem, przycisk powrotu do 3D zniknąłby razem z nim.
  (container.parentElement || container).appendChild(uiOverlay);

  window.addEventListener('resize', () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
  });

  update3D();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateWallVisibility();
  renderer.render(scene, camera);
}

function enterAlignMode(mod, el) {
  alignMode.active = true;
  alignMode.sourceMod = mod;
  alignMode.sourceEl = el;

  const banner = document.createElement('div');
  Object.assign(banner.style, {
      position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#0ea5e9', color: 'white', padding: '12px 24px', borderRadius: '8px',
      fontWeight: 'bold', zIndex: '2000', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '15px'
  });
  
  banner.innerHTML = `
      <span>🧲 Kliknij na scenie wieniec lub półkę innej szafki, do której chcesz wyrównać...</span>
      <button style="background:white; color:#0ea5e9; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Anuluj</button>
  `;

  banner.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      exitAlignMode();
  };

  document.getElementById('viewer-3d-container').appendChild(banner);
  alignMode.banner = banner;
}

function exitAlignMode() {
  alignMode.active = false;
  alignMode.sourceMod = null;
  alignMode.sourceEl = null;
  if (alignMode.banner) {
      alignMode.banner.remove();
      alignMode.banner = null;
  }
}

function handle3DClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cabinetGroup.children, true);

  let validHit = null;
  let data = null;

  for (let i = 0; i < intersects.length; i++) {
      const obj = intersects[i].object;
      if (obj.userData && obj.userData.moduleId) {
          validHit = intersects[i];
          data = obj.userData;
          break;
      }
  }

  const existingMenu = document.getElementById('context-menu-3d');
  if (existingMenu) existingMenu.remove();

  if (!validHit) {
      if (!event.shiftKey) {
          state.activeModuleId = null;
          if (state.selectedModules) state.selectedModules.clear();
          updateSidebar();
          initPropertiesPanel();
          update3D();
      }
      return;
  }

  if (alignMode.active) {
      if (validHit && data) {
          const objHeight = validHit.object.geometry.parameters.height;
          
          if (objHeight > 50) {
              alert("Kliknij w element poziomy (wieniec lub półkę), a nie w pionowy bok!");
              return;
          }

          const worldPos = new THREE.Vector3();
          validHit.object.getWorldPosition(worldPos);
          const objAbsoluteY = worldPos.y;
          const targetAbsoluteBottomY = objAbsoluteY - (objHeight / 2);

          const sourceMod = alignMode.sourceMod;
          const sourceLegH = (sourceMod.legs && sourceMod.legs.active) ? (parseFloat(sourceMod.legs.height) || 0) : 0;
          const sourceModAbsoluteY = (parseFloat(sourceMod.position.y) || 0) + sourceLegH;

          const newLocalY = targetAbsoluteBottomY - sourceModAbsoluteY;

          if (newLocalY > 0 && newLocalY < parseFloat(sourceMod.dimensions.height)) {
              alignMode.sourceEl.y = newLocalY;
              update3D();
              updateSidebar();
          } else {
              alert("Wybrany punkt znajduje się poza zakresem wysokości tej szafki!");
          }
      }
      exitAlignMode();
      return; 
  }

  if (validHit && data) {
      const clickedMod = state.project.modules.find(m => m.id === data.moduleId);
      const gId = clickedMod && clickedMod.groupId;
      const idsToSelect = gId ? state.project.modules.filter(m => m.groupId === gId).map(m => m.id) : [data.moduleId];

      if (wasSelectedOnDown) {
          if (event.shiftKey) {
              idsToSelect.forEach(id => state.selectedModules.delete(id));
              if (state.activeModuleId === data.moduleId) state.activeModuleId = Array.from(state.selectedModules).pop() || null;
              updateSidebar();
              initPropertiesPanel();
              update3D();
          } else if (state.selectedModules.size > idsToSelect.length) {
              state.selectedModules = new Set(idsToSelect);
              state.activeModuleId = data.moduleId;
              updateSidebar();
              initPropertiesPanel();
              update3D();
          }
      }

      if (state.selectedModules && state.selectedModules.has(data.moduleId)) {
          show3DContextMenu(event, validHit, data);
      }
  }
}

function show3DContextMenu(event, hit, data) {
  const menu = document.createElement('div');
  menu.id = 'context-menu-3d';
  Object.assign(menu.style, {
      position: 'fixed', left: `${event.clientX}px`, top: `${event.clientY}px`,
      backgroundColor: '#ffffff', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      borderRadius: '6px', padding: '4px', zIndex: '1000', minWidth: '220px', fontFamily: 'sans-serif'
  });

  const createOption = (text, icon, callback, color = '#1e293b') => {
      const btn = document.createElement('div');
      btn.innerHTML = `${icon} <span style="margin-left: 6px;">${text}</span>`;
      Object.assign(btn.style, {
          padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: color,
          borderRadius: '4px', transition: 'background 0.1s', fontWeight: 'bold'
      });
      btn.onmouseenter = () => btn.style.backgroundColor = color === '#dc2626' ? '#fee2e2' : '#f1f5f9';
      btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
      
      if (callback) {
          btn.onclick = (e) => {
              e.stopPropagation();
              callback();
              menu.remove();
              update3D(); 
              updateSidebar();
          };
      }
      return btn;
  };

  const createHeader = (text) => {
      const hdr = document.createElement('div');
      hdr.innerText = text;
      Object.assign(hdr.style, {
        fontSize: '11px', color: '#64748b', textTransform: 'uppercase',
        margin: '8px 8px 4px 8px', fontWeight: 'bold'
      });
      return hdr;
  };

  const createInputRow = (labelTxt, val) => {
      const row = document.createElement('div');
      row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.marginBottom = '6px';
      const lbl = document.createElement('span'); lbl.innerText = labelTxt; lbl.style.fontSize = '12px'; lbl.style.color = '#475569';
      const inp = document.createElement('input'); inp.type = 'number'; inp.value = val;
      Object.assign(inp.style, { width: '60px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' });
      row.appendChild(lbl); row.appendChild(inp); return { row, inp };
  };

  const mod = state.project.modules.find(m => m.id === data.moduleId);
  if (!mod) return;

  if (state.selectedModules && state.selectedModules.size > 1) {
      const selectedArray = Array.from(state.selectedModules);
      const firstMod = state.project.modules.find(m => m.id === selectedArray[0]);
      const allSameGroup = firstMod && firstMod.groupId && selectedArray.every(id => {
          const m = state.project.modules.find(md => md.id === id);
          return m && m.groupId === firstMod.groupId;
      });

      if (!allSameGroup) {
          menu.appendChild(createHeader('Grupowanie modułów'));
          menu.appendChild(createOption('🔗 Połącz zaznaczone w grupę', '🔗', () => {
              const newGroupId = 'group-' + Date.now();
              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(md => md.id === id);
                  if (m) m.groupId = newGroupId;
              });
          }, '#0284c7'));
      }
  }

  if (mod.groupId) {
      menu.appendChild(createHeader('Grupowanie modułów'));
      menu.appendChild(createOption('✂️ Rozbij grupę (Rozgrupuj)', '✂️', () => {
          const gId = mod.groupId;
          state.project.modules.forEach(m => {
              if (m.groupId === gId) delete m.groupId;
          });
          state.selectedModules = new Set([mod.id]); 
      }, '#dc2626'));
  }

  if (data.type === 'corpus' && data.part !== 'back') {
      menu.appendChild(createHeader('Pozycja szafki (Ręczna korekta)'));
      
      const posWrap = document.createElement('div');
      Object.assign(posWrap.style, { padding: '8px', backgroundColor: '#f8fafc', borderRadius: '4px', marginBottom: '6px' });
      
      const createPosControl = (axis, label, val) => {
          const row = document.createElement('div');
          row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between'; row.style.marginBottom = '6px';
          
          const lbl = document.createElement('span'); lbl.innerText = label; lbl.style.fontSize = '12px'; lbl.style.fontWeight = 'bold'; lbl.style.color = '#334155';
          
          const controls = document.createElement('div'); controls.style.display = 'flex'; controls.style.gap = '4px';
          
          const btnMinus = document.createElement('button'); btnMinus.innerText = '-'; 
          const btnPlus = document.createElement('button'); btnPlus.innerText = '+';
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = val; inp.style.width = '55px'; inp.style.textAlign = 'center';
          
          [btnMinus, btnPlus].forEach(b => Object.assign(b.style, { width: '28px', height: '28px', cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '4px', fontWeight: 'bold', color: '#0ea5e9' }));
          
          const updatePos = (newVal) => {
              mod.position[axis] = parseFloat(newVal) || 0;
              inp.value = mod.position[axis];
              update3D();
              updateSidebar();
              initPropertiesPanel();
          };
          
          btnMinus.onclick = (e) => { e.stopPropagation(); updatePos(mod.position[axis] - 10); };
          btnPlus.onclick = (e) => { e.stopPropagation(); updatePos(mod.position[axis] + 10); };
          inp.onchange = (e) => { e.stopPropagation(); updatePos(e.target.value); };
          
          controls.appendChild(btnMinus); controls.appendChild(inp); controls.appendChild(btnPlus);
          row.appendChild(lbl); row.appendChild(controls);
          return row;
      };
      
      posWrap.appendChild(createPosControl('x', '↔️ Oś X', mod.position.x));
      posWrap.appendChild(createPosControl('y', '↕️ Oś Y', mod.position.y));
      posWrap.appendChild(createPosControl('z', '↗️ Oś Z', mod.position.z || 0));
      menu.appendChild(posWrap);

      menu.appendChild(createHeader('Obrót (co 90°)'));
      const rotWrap = document.createElement('div');
      Object.assign(rotWrap.style, { display: 'flex', gap: '4px', padding: '0 8px 8px 8px' });
      [0, 90, 180, 270].forEach(rot => {
          const active = (mod.rotation || 0) === rot;
          const b = document.createElement('button');
          b.innerText = `${rot}°`;
          Object.assign(b.style, {
              flex: '1', padding: '6px 2px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
              borderRadius: '4px', border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
              background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#334155'
          });
          b.onclick = (e) => {
              e.stopPropagation();
              mod.rotation = rot;
              update3D();
              updateSidebar();
              initPropertiesPanel();
              menu.remove();
          };
          rotWrap.appendChild(b);
      });
      menu.appendChild(rotWrap);

      menu.appendChild(createHeader('Akcje korpusu'));
      menu.appendChild(createOption('Klonuj szafkę obok', '📋', () => { duplicateModule(mod.id); }, '#059669'));
      menu.appendChild(createOption('Usuń całą szafkę', '🗑️', () => { deleteModule(mod.id); state.activeModuleId = null; }, '#dc2626'));
  }

  if (data.type === 'shelf') {
      const el = mod.elements.find(e => e.id === data.elementId);
      if (el) {
          const isStruct = el.isStructural;
          const isPoziom = el.typ === 'poziom';

          const th = parseFloat(state.project.materials.boardThickness) || 18;
          const H = parseFloat(mod.dimensions.height);
          const W = parseFloat(mod.dimensions.width);
          const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(mod.construction || {}) };
          const hasTraverses = cons.topType.includes('trawersy');
          const isVerticalTraverse = cons.topType === 'trawersy_pion';
          const traverseWidth = cons.traverseWidth || 100;
          const topZoneY = (hasTraverses && isVerticalTraverse) ? H - traverseWidth : H - th;
          const topZoneH = (hasTraverses && isVerticalTraverse) ? traverseWidth : th;

          const obstacles = [
              ...mod.elements.filter(e => e.typ === 'poziom' && e.id !== el.id),
              { id: 'cab-left', x: 0, y: 0, w: th, h: H },
              { id: 'cab-right', x: W - th, y: 0, w: th, h: H },
              { id: 'cab-bottom', x: 0, y: 0, w: W, h: th },
              { id: 'cab-top', x: 0, y: topZoneY, w: W, h: topZoneH }
          ];

          let boundMin = 0; let boundMax = isPoziom ? H : W;

          if (isPoziom) {
              obstacles.forEach(obs => {
                  if (obs.x < el.x + el.w && obs.x + obs.w > el.x) {
                      if (obs.y + (obs.h||th) <= el.y && obs.y + (obs.h||th) > boundMin) boundMin = obs.y + (obs.h||th);
                      if (obs.y >= el.y + el.h && obs.y < boundMax) boundMax = obs.y;
                  }
              });
          } else {
              obstacles.forEach(obs => {
                  if (obs.y < el.y + el.h && obs.y + obs.h > el.y) {
                      if (obs.x + obs.w <= el.x && obs.x + obs.w > boundMin) boundMin = obs.x + obs.w;
                      if (obs.x >= el.x + el.w && obs.x < boundMax) boundMax = obs.x;
                  }
              });
          }

          const currentSpace1 = Math.round((isPoziom ? el.y : el.x) - boundMin);
          const currentSpace2 = Math.round(boundMax - ((isPoziom ? el.y : el.x) + (isPoziom ? el.h : el.w)));
          const maxSpace = currentSpace1 + currentSpace2;

          const moveWrap = document.createElement('div');
          Object.assign(moveWrap.style, {
              padding: '10px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px',
              backgroundColor: '#f8fafc', borderRadius: '4px 4px 0 0'
          });
          moveWrap.innerHTML = `<div style="font-size:11px; font-weight:bold; color:#334155; margin-bottom:10px; text-transform: uppercase;">Regulacja światła [mm]</div>`;

          const inp1Data = createInputRow(isPoziom ? '↕️ Światło pod:' : '↔️ Światło z lewej:', currentSpace1);
          const inp2Data = createInputRow(isPoziom ? '↕️ Światło nad:' : '↔️ Światło z prawej:', currentSpace2);
          
          const inp1 = inp1Data.inp; const inp2 = inp2Data.inp;
          inp1.oninput = () => { const v = parseFloat(inp1.value); if(!isNaN(v)) inp2.value = maxSpace - v; };
          inp2.oninput = () => { const v = parseFloat(inp2.value); if(!isNaN(v)) inp1.value = maxSpace - v; };

          const applyBtn = document.createElement('button'); applyBtn.innerText = 'Zatwierdź pozycję';
          Object.assign(applyBtn.style, { width: '100%', padding: '6px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' });

          const applyPosition = (evt) => {
              evt.stopPropagation(); 
              const newVal1 = parseFloat(inp1.value);
              if (!isNaN(newVal1) && newVal1 >= 0 && newVal1 <= maxSpace) { 
                  if (isPoziom) el.y = boundMin + newVal1; else el.x = boundMin + newVal1; 
                  menu.remove();
                  update3D();
                  updateSidebar();
              } else {
                  alert('Wartość wykracza poza wnękę!');
              }
          };

          applyBtn.onclick = applyPosition; 
          inp1.onkeydown = (evt) => { if (evt.key === 'Enter') applyPosition(evt); }; 
          inp2.onkeydown = (evt) => { if (evt.key === 'Enter') applyPosition(evt); };

          moveWrap.appendChild(inp2Data.row); moveWrap.appendChild(inp1Data.row); moveWrap.appendChild(applyBtn); 
          menu.appendChild(moveWrap);

          menu.appendChild(createHeader('Narzędzia precyzyjne'));
          if (isPoziom) {
              menu.appendChild(createOption('Wyrównaj do innego elementu', '🧲', () => {
                  enterAlignMode(mod, el);
              }, '#0284c7'));
          }

          menu.appendChild(createHeader('Parametry elementu'));
          if (isPoziom) {
              menu.appendChild(createOption(isStruct ? 'Zmień na ruchomą' : 'Zmień na konstrukcyjną', '🔩', () => { el.isStructural = !isStruct; }, isStruct ? '#059669' : '#1e293b'));
          }
          menu.appendChild(createOption('Usuń element', '🗑️', () => { mod.elements = mod.elements.filter(e => e.id !== el.id); }, '#dc2626'));
          
          setTimeout(() => inp1.focus(), 50);
      }
  }
  else if (data.type === 'front') {
      const el = mod.elements.find(e => e.id === data.elementId);
      if (el) {
          
          menu.appendChild(createHeader('Korekta Ręczna Frontu'));
          const overrideWrap = document.createElement('div');
          Object.assign(overrideWrap.style, { padding: '10px', backgroundColor: '#f8fafc', borderRadius: '4px', marginBottom: '6px', border: '1px solid #e2e8f0' });
          
          const info = document.createElement('div');
          info.innerHTML = `Aktualne: <b>${(el.w||0).toFixed(1)} x ${(el.h||0).toFixed(1)}</b> mm`;
          Object.assign(info.style, { fontSize: '10px', color: '#64748b', marginBottom: '8px', textAlign: 'center' });
          overrideWrap.appendChild(info);

          const rowH = createInputRow('Wymuś Wys. [mm]:', el.forceH || '');
          rowH.inp.placeholder = 'Auto';
          const rowW = createInputRow('Wymuś Szer. [mm]:', el.forceW || '');
          rowW.inp.placeholder = 'Auto';
          const rowY = createInputRow('Przesuń Y ↕ [mm]:', el.forceOffsetY || '0');
          const rowX = createInputRow('Przesuń X ↔ [mm]:', el.forceOffsetX || '0');

          const btnApplyOverride = document.createElement('button');
          btnApplyOverride.innerText = 'Zastosuj korektę';
          Object.assign(btnApplyOverride.style, { width: '100%', padding: '6px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' });

          btnApplyOverride.onclick = (evt) => {
              evt.stopPropagation();
              el.forceH = rowH.inp.value !== '' ? parseFloat(rowH.inp.value) : null;
              el.forceW = rowW.inp.value !== '' ? parseFloat(rowW.inp.value) : null;
              el.forceOffsetY = rowY.inp.value !== '' ? parseFloat(rowY.inp.value) : 0;
              el.forceOffsetX = rowX.inp.value !== '' ? parseFloat(rowX.inp.value) : 0;
              menu.remove();
              update3D();
              updateSidebar();
          };

          overrideWrap.appendChild(rowH.row);
          overrideWrap.appendChild(rowW.row);
          overrideWrap.appendChild(rowY.row);
          overrideWrap.appendChild(rowX.row);
          overrideWrap.appendChild(btnApplyOverride);
          menu.appendChild(overrideWrap);

          if (el.subtype.includes('szuflada')) {
              menu.appendChild(createHeader('Opcje pudła szuflady'));
              const boxWrap = document.createElement('div');
              Object.assign(boxWrap.style, {
                  padding: '10px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', backgroundColor: '#f8fafc', borderRadius: '4px'
              });

              // NAPRAWA: front.forceVariant to klucz katalogu systemu szuflad (np. "srednia"),
              // nie litera typu — różne systemy różnie nazywają literą ten sam klucz (patrz
              // core/drawerSystems.js), więc stała lista liter N/M/K/E/C nigdy się nie
              // zgadzała i wymuszenie po cichu nie działało. Lista opcji jest teraz budowana
              // z realnych wariantów wybranego systemu szuflad tej szafki.
              const fMerged = { ...(state.project.front || {}), ...(mod.front || {}) };
              const sysNameForMenu = (fMerged.drawerSystem || 'merivobox').toLowerCase();
              const sysVariants = (drawerSystems[sysNameForMenu] || drawerSystems.merivobox).variants;
              const variantOptionsHtml = DRAWER_VARIANT_ORDER.filter(k => sysVariants[k]).map(k =>
                  `<option value="${k}" ${el.forceVariant === k ? 'selected' : ''}>${DRAWER_VARIANT_LABELS[k]} (${sysVariants[k].type}, ${sysVariants[k].height}mm)</option>`
              ).join('');

              const rowVar = document.createElement('div');
              rowVar.style.display = 'flex'; rowVar.style.justifyContent = 'space-between'; rowVar.style.alignItems = 'center'; rowVar.style.marginBottom = '6px';
              rowVar.innerHTML = `<label style="font-size:11px; color:#475569;">Wariant boku:</label>
                  <select id="inp-var" style="padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; width:150px;">
                      <option value="auto" ${(!el.forceVariant || el.forceVariant === 'auto') ? 'selected' : ''}>Auto (Maks.)</option>
                      ${variantOptionsHtml}
                  </select>`;
              
              const rowNL = document.createElement('div');
              rowNL.style.display = 'flex'; rowNL.style.justifyContent = 'space-between'; rowNL.style.alignItems = 'center'; rowNL.style.marginBottom = '6px';
              rowNL.innerHTML = `<label style="font-size:11px; color:#475569;">Wymuś głębokość (NL):</label>
                  <input type="number" id="inp-nl" placeholder="Auto" value="${el.forceNL || ''}" style="width:100px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; text-align:center;">`;

              const applyBoxBtn = document.createElement('button'); applyBoxBtn.innerText = 'Zastosuj do szuflady';
              Object.assign(applyBoxBtn.style, { width: '100%', padding: '6px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });

              applyBoxBtn.onclick = (evt) => {
                  evt.stopPropagation();
                  el.forceVariant = document.getElementById('inp-var').value;
                  const nlVal = document.getElementById('inp-nl').value;
                  el.forceNL = nlVal ? parseFloat(nlVal) : null;
                  menu.remove();
                  update3D();
                  updateSidebar();
              };

              boxWrap.appendChild(rowVar);
              boxWrap.appendChild(rowNL);
              boxWrap.appendChild(applyBoxBtn);
              menu.appendChild(boxWrap);
              
              menu.appendChild(createOption('➕ Dodaj szufladę wewn. nad tą', '📥', () => {
                  let boxHeight = el.h;
                  if (el.forceVariant && el.forceVariant !== 'auto' && sysVariants[el.forceVariant]) {
                      boxHeight = sysVariants[el.forceVariant].height;
                  }
                  
                  const newInnerBottomY = el.y + boxHeight + 5;
                  const newInnerTopY = el.y + el.h;
                  
                  if (newInnerBottomY + 40 > newInnerTopY) {
                      alert("Za mało miejsca nad pudłem! Zmniejsz wariant boku tej szuflady (np. na M lub K) i zapisz, aby zrobić miejsce.");
                      return;
                  }

                  const baseMinY = parseFloat(el.baseZone.minY) || 18;
                  const baseMaxY = parseFloat(el.baseZone.maxY) || parseFloat(mod.dimensions.height);
                  
                  const newOffsetBottom = newInnerBottomY - baseMinY;
                  const newOffsetTop = baseMaxY - newInnerTopY;

                  mod.elements.push({
                      id: 'front-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                      typ: 'front', 
                      subtype: 'szuflada-wewnetrzna', 
                      baseZone: { 
                          ...el.baseZone, 
                          offsetBottom: Math.max(0, newOffsetBottom), 
                          offsetTop: Math.max(0, newOffsetTop) 
                      },
                      frontCount: 1, distribution: "1", frontIndex: 0, gap: parseFloat(state.project.front?.gap || 3),
                      intGapX: 15, intGapY: 5, forceVariant: 'auto', forceNL: null,
                      innerFrontThickness: 18, innerSetback: 2
                  });

                  menu.remove();
                  update3D();
                  updateSidebar();
              }, '#059669'));
          }

          if (el.subtype === 'szuflada-wewnetrzna') {
              menu.appendChild(createHeader('Front wewn. i prowadnice'));
              const pWrap = document.createElement('div');
              Object.assign(pWrap.style, {
                  padding: '10px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px',
                  backgroundColor: '#f8fafc', borderRadius: '4px 4px 0 0'
              });

              const inpThickData = createInputRow('Grubość frontu [mm]:', el.innerFrontThickness ?? 18);
              const inpSetbackData = createInputRow('Luz do krawędzi [mm]:', el.innerSetback ?? 2);
              
              const applyBtn2 = document.createElement('button'); applyBtn2.innerText = 'Zapisz parametry frontu';
              Object.assign(applyBtn2.style, { width: '100%', padding: '6px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' });

              applyBtn2.onclick = (evt) => {
                  evt.stopPropagation(); 
                  el.innerFrontThickness = parseFloat(inpThickData.inp.value) || 18; 
                  el.innerSetback = parseFloat(inpSetbackData.inp.value) || 0; 
                  menu.remove();
                  update3D();
                  updateSidebar();
              };

              pWrap.appendChild(inpThickData.row); pWrap.appendChild(inpSetbackData.row); pWrap.appendChild(applyBtn2); 
              menu.appendChild(pWrap);
              
              if (el.baseZone) {
                  menu.appendChild(createHeader('Marginesy Bloku (np. na zawias)'));
                  const bWrap = document.createElement('div');
                  Object.assign(bWrap.style, {
                      padding: '10px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', backgroundColor: '#f8fafc'
                  });

                  const inpBotData = createInputRow('Wolne miejsce od dołu:', el.baseZone.offsetBottom || 0);
                  const inpTopData = createInputRow('Wolne miejsce od góry:', el.baseZone.offsetTop || 0);

                  const applyMargBtn = document.createElement('button'); applyMargBtn.innerText = 'Zapisz omijanie';
                  Object.assign(applyMargBtn.style, { width: '100%', padding: '6px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' });

                  applyMargBtn.onclick = (evt) => {
                      evt.stopPropagation();
                      mod.elements.forEach(sibling => {
                          if (sibling.typ === 'front' && sibling.baseZone && sibling.baseZone.minY === el.baseZone.minY && sibling.baseZone.maxY === el.baseZone.maxY) {
                              sibling.baseZone.offsetBottom = parseFloat(inpBotData.inp.value) || 0;
                              sibling.baseZone.offsetTop = parseFloat(inpTopData.inp.value) || 0;
                          }
                      });
                      menu.remove();
                      update3D();
                      updateSidebar();
                  };

                  bWrap.appendChild(inpBotData.row); bWrap.appendChild(inpTopData.row); bWrap.appendChild(applyMargBtn);
                  menu.appendChild(bWrap);
              }
          }

          if (el.subtype === 'drzwi') {
              menu.appendChild(createHeader('Kierunek otwierania'));
              const isLeft = (el.openingSide === 'left' || !el.openingSide);
              menu.appendChild(createOption(isLeft ? 'Zmień na Prawe (Zawias z prawej)' : 'Zmień na Lewe (Zawias z lewej)', '🔄', () => {
                  el.openingSide = isLeft ? 'right' : 'left';
              }, '#0284c7'));
          }

          menu.appendChild(createHeader('Zarządzanie bloku'));
          menu.appendChild(createOption('Usuń ten front/szufladę', '🗑️', () => { mod.elements = mod.elements.filter(e => e.id !== el.id); }, '#dc2626'));
          
          if (el.baseZone) {
              menu.appendChild(createOption('Wyczyść całą wnękę', '🧹', () => {
                  mod.elements = mod.elements.filter(e => !(e.typ === 'front' && e.baseZone && e.baseZone.minY === el.baseZone.minY && e.baseZone.maxY === el.baseZone.maxY));
              }, '#991b1b'));
          }
      }
  }
  else if (data.type === 'corpus' && data.part === 'back') {
      const th = parseFloat(state.project.materials.boardThickness) || 18;
      const legHeight = mod.legs && mod.legs.active ? (parseFloat(mod.legs.height) || 0) : 0;
      
      const worldPos = new THREE.Vector3();
      hit.object.getWorldPosition(worldPos);
      
      const localY = hit.point.y - (parseFloat(mod.position.y) || 0) - legHeight;
      const localX = hit.point.x - (parseFloat(mod.position.x) || 0); 
      
      const H = parseFloat(mod.dimensions.height);
      const W = parseFloat(mod.dimensions.width);
      
      if (localY > 0 && localY < H && localX > 0 && localX < W) {
          let zoneMinY = th;
          let zoneMaxY = H - th;
          let zoneMinX = th;
          let zoneMaxX = W - th;

          let boundBottomId = 'cab-bottom';
          let boundTopId = 'cab-top';
          let boundLeftId = 'cab-left';
          let boundRightId = 'cab-right';

          if (mod.elements) {
              mod.elements.forEach(el => {
                  if (el.typ === 'pion') {
                      if (localY >= el.y && localY <= el.y + el.h) {
                          let rightEdge = el.x + el.w;
                          let leftEdge = el.x;

                          if (rightEdge <= localX && rightEdge >= zoneMinX) {
                              zoneMinX = rightEdge;
                              boundLeftId = el.id;
                          }
                          if (leftEdge >= localX && leftEdge <= zoneMaxX) {
                              zoneMaxX = leftEdge;
                              boundRightId = el.id;
                          }
                      }
                  }
              });

              mod.elements.forEach(el => {
                  if (el.typ === 'poziom') {
                      if (el.x < zoneMaxX && el.x + el.w > zoneMinX) {
                          let topEdge = el.y + el.h;
                          let bottomEdge = el.y;

                          if (topEdge <= localY && topEdge >= zoneMinY) {
                              zoneMinY = topEdge;
                              boundBottomId = el.id;
                          }
                          if (bottomEdge >= localY && bottomEdge <= zoneMaxY) {
                              zoneMaxY = bottomEdge;
                              boundTopId = el.id;
                          }
                      }
                  }
              });
          }

          const currentW = zoneMaxX - zoneMinX;
          const currentH = zoneMaxY - zoneMinY;

          const targetBaseZone = { 
              minX: zoneMinX, maxX: zoneMaxX, minY: zoneMinY, maxY: zoneMaxY,
              boundBottom: boundBottomId, boundTop: boundTopId, boundLeft: boundLeftId, boundRight: boundRightId,
              offsetBottom: 0, offsetTop: 0 
          };

          const fullCabBaseZone = {
              minX: th, maxX: W - th, minY: th, maxY: H - th,
              boundBottom: 'cab-bottom', boundTop: 'cab-top', boundLeft: 'cab-left', boundRight: 'cab-right',
              offsetBottom: 0, offsetTop: 0
          };

          menu.appendChild(createHeader('Dodaj elementy konstrukcyjne'));
          
          menu.appendChild(createOption(`Wstaw półkę (Wys: ${Math.round(localY)} mm)`, '➕', () => {
              mod.elements.push({
                  id: 'poziom-' + Date.now() + Math.random().toString(36).substring(2, 6),
                  typ: 'poziom', x: zoneMinX, y: localY - (th/2), w: currentW, h: th, isStructural: false 
              });
          }, '#2563eb'));

          const halfY = zoneMinY + currentH / 2;
          menu.appendChild(createOption('Półka (dokładnie w połowie)', '➗', () => {
              mod.elements.push({
                  id: 'poziom-half-' + Date.now() + Math.random().toString(36).substring(2, 6),
                  typ: 'poziom', x: zoneMinX, y: halfY - (th/2), w: currentW, h: th, isStructural: false
              });
          }, '#2563eb'));

          const btnAutoShelves = createOption('Półki (rozmieść równomiernie)', '📚', null, '#2563eb');
          btnAutoShelves.onclick = (e) => {
              e.stopPropagation();
              menu.innerHTML = '';
              menu.style.width = '240px';
              menu.style.padding = '12px';

              const title = document.createElement('div');
              title.innerText = 'Równomierne półki';
              title.style.fontWeight = 'bold'; title.style.marginBottom = '10px';

              const wrap = document.createElement('div');
              wrap.innerHTML = `<label style="font-size:11px;">Podaj ilość półek:</label><br><input type="number" id="inp-shelves" value="2" min="1" style="width:100%; padding:6px; margin-top:4px; border:1px solid #ccc; border-radius:4px;">`;

              const btnApply = document.createElement('button');
              btnApply.innerText = 'Wstaw półki';
              Object.assign(btnApply.style, { width: '100%', marginTop: '12px', padding: '8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });

              btnApply.onclick = (ev) => {
                  ev.stopPropagation();
                  const shelfCount = parseInt(document.getElementById('inp-shelves').value, 10);
                  if (isNaN(shelfCount) || shelfCount <= 0) return;

                  const internalHeight = currentH;
                  const newShelvesBase = autoDistributeShelves(internalHeight, th, shelfCount);

                  const ts = Date.now();
                  newShelvesBase.forEach((s, idx) => {
                      mod.elements.push({
                          id: 'poziom-auto-' + ts + '-' + idx,
                          typ: 'poziom', x: zoneMinX, y: zoneMinY + s.y, w: currentW, h: th, isStructural: false
                      });
                  });

                  menu.remove();
                  update3D();
                  updateSidebar();
              };

              menu.appendChild(title);
              menu.appendChild(wrap);
              menu.appendChild(btnApply);
              
              setTimeout(() => {
                  const inp = document.getElementById('inp-shelves');
                  if (inp) inp.focus();
              }, 50);
          };
          menu.appendChild(btnAutoShelves);

          const halfX = zoneMinX + currentW / 2;
          menu.appendChild(createOption('Przegroda pionowa (w połowie)', '➕', () => {
              mod.elements.push({
                  id: 'pion-half-' + Date.now() + Math.random().toString(36).substring(2, 6),
                  typ: 'pion', x: halfX - (th/2), y: zoneMinY, w: th, h: currentH
              });
          }, '#059669'));

          menu.appendChild(createHeader('Zabuduj wybraną wnękę'));

          const showDrawerMenu = (e, subtype, titleTxt) => {
              e.stopPropagation();
              menu.innerHTML = '';
              menu.style.width = '260px';
              menu.style.padding = '12px';

              const title = document.createElement('div');
              title.innerText = titleTxt;
              title.style.fontWeight = 'bold'; title.style.marginBottom = '10px';

              const wrapDist = document.createElement('div');
              wrapDist.innerHTML = `<label style="font-size:11px;">Podział (np. 3 lub 200:200):</label><br><input type="text" id="inp-dist" value="3" style="width:100%; padding:6px; margin-top:4px; border:1px solid #ccc; border-radius:4px;">`;

              const wrapGap = document.createElement('div');
              wrapGap.innerHTML = `<label style="font-size:11px;">Szczelina między frontami [mm]:</label><br><input type="number" id="inp-gap" value="${state.project.front?.gap || 3}" style="width:100%; padding:6px; margin-top:4px; border:1px solid #ccc; border-radius:4px;">`;

              const wrapOffsets = document.createElement('div');
              if (subtype === 'szuflada-wewnetrzna') {
                  wrapOffsets.innerHTML = `
                      <div style="display:flex; gap:10px; margin-top:8px;">
                          <div style="flex:1;">
                              <label style="font-size:10px;">Odsunięcie od Dołu (np. zawias):</label>
                              <input type="number" id="inp-bot" value="0" style="width:100%; padding:4px; margin-top:2px; border:1px solid #ccc; border-radius:4px;">
                          </div>
                          <div style="flex:1;">
                              <label style="font-size:10px;">Odsunięcie od Góry (np. zawias):</label>
                              <input type="number" id="inp-top" value="0" style="width:100%; padding:4px; margin-top:2px; border:1px solid #ccc; border-radius:4px;">
                          </div>
                      </div>
                  `;
              }

              const btnApply = document.createElement('button');
              btnApply.innerText = 'Zastosuj i dodaj';
              Object.assign(btnApply.style, { width: '100%', marginTop: '12px', padding: '8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });

              btnApply.onclick = (ev) => {
                  ev.stopPropagation();
                  const distStr = document.getElementById('inp-dist').value.trim() || "1";
                  const gapValInput = parseFloat(document.getElementById('inp-gap').value) || 0;
                  
                  const botOffset = document.getElementById('inp-bot') ? (parseFloat(document.getElementById('inp-bot').value) || 0) : 0;
                  const topOffset = document.getElementById('inp-top') ? (parseFloat(document.getElementById('inp-top').value) || 0) : 0;

                  let genCount = 1;
                  if (!distStr.includes(':') && !distStr.includes(',') && !isNaN(distStr)) {
                      genCount = parseInt(distStr, 10) || 1;
                  } else {
                      genCount = distStr.split(distStr.includes(':') ? ':' : ',').length;
                  }

                  const ts = Date.now();
                  for(let i = 0; i < genCount; i++) {
                      mod.elements.push({
                          id: 'front-' + ts + '-' + Math.random().toString(36).substring(2, 6),
                          typ: 'front', subtype: subtype, 
                          baseZone: { ...targetBaseZone, offsetBottom: botOffset, offsetTop: topOffset },
                          frontCount: genCount, distribution: distStr, frontIndex: i, gap: gapValInput,
                          intGapX: subtype === 'szuflada-wewnetrzna' ? 15 : 0, intGapY: subtype === 'szuflada-wewnetrzna' ? 5 : 0,
                          forceVariant: 'auto',
                          forceNL: null
                      });
                  }
                  menu.remove();
                  update3D();       
                  updateSidebar();
              };

              menu.appendChild(title);
              menu.appendChild(wrapDist);
              menu.appendChild(wrapGap);
              if (subtype === 'szuflada-wewnetrzna') menu.appendChild(wrapOffsets);
              menu.appendChild(btnApply);
          };

          const btnDrawers = createOption('Szuflady zewnętrzne', '📦', null, '#d97706');
          btnDrawers.onclick = (e) => showDrawerMenu(e, 'szuflada', 'Szuflady zewnętrzne');
          menu.appendChild(btnDrawers);

          const btnIntDrawers = createOption('Szuflady wewnętrzne', '📥', null, '#d97706');
          btnIntDrawers.onclick = (e) => showDrawerMenu(e, 'szuflada-wewnetrzna', 'Szuflady wewnętrzne');
          menu.appendChild(btnIntDrawers);

          const btnDoor = createOption('Drzwi pojedyncze', '🚪', () => {
              mod.elements.push({
                  id: 'front-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                  typ: 'front', subtype: 'drzwi', baseZone: targetBaseZone, openingSide: 'left', 
                  frontCount: 1, frontIndex: 0, gap: parseFloat(state.project.front?.gap) || 3
              });
          }, '#1e40af');
          menu.appendChild(btnDoor);
          
          const btnDoorLP = createOption('Drzwi podwójne (L/P)', '🚪', () => {
              const gapLp = parseFloat(state.project.front?.gap) || 3;
              mod.elements.push({ id: 'front-L-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: targetBaseZone, frontCount: 2, frontIndex: 0, gap: gapLp });
              mod.elements.push({ id: 'front-P-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: targetBaseZone, frontCount: 2, frontIndex: 1, gap: gapLp });
          }, '#1e40af');
          menu.appendChild(btnDoorLP);

          menu.appendChild(createHeader('Zabudowa całej szafki (Zasłania półki)'));

          const btnFullDoor = createOption('Drzwi pojedyncze (Całość)', '🚪', () => {
              mod.elements.push({
                  id: 'front-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                  typ: 'front', subtype: 'drzwi', baseZone: fullCabBaseZone, openingSide: 'left',
                  frontCount: 1, frontIndex: 0, gap: parseFloat(state.project.front?.gap) || 3
              });
          }, '#7c3aed');
          menu.appendChild(btnFullDoor);

          const btnFullDoorLP = createOption('Drzwi podwójne (Całość)', '🚪', () => {
              const gapLp = parseFloat(state.project.front?.gap) || 3;
              mod.elements.push({ id: 'front-L-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: fullCabBaseZone, frontCount: 2, frontIndex: 0, gap: gapLp });
              mod.elements.push({ id: 'front-P-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: fullCabBaseZone, frontCount: 2, frontIndex: 1, gap: gapLp });
          }, '#7c3aed');
          menu.appendChild(btnFullDoorLP);

      }
  }

  if (menu.children.length > 0) document.body.appendChild(menu);
}

const mats = {
  solid: {
      // Metalness w okolicach 0 — to płyta meblowa, nie blacha; przy metalness
      // >0 environment map dawała nieprzyjemny, plastikowo-metaliczny połysk.
      // Kolory lekko ocieplone (surowa płyta biała ma podtón kremowy, nie czysty biel).
      corpus: new THREE.MeshStandardMaterial({ color: 0xfaf8f4, roughness: 0.62, metalness: 0.0 }),
      front: new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.42, metalness: 0.0 }),
      shelf: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.7, metalness: 0.0 }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xe6e2d9, roughness: 0.78, metalness: 0.0 }),
      hdf: new THREE.MeshStandardMaterial({ color: 0xf4f2ed, roughness: 0.9, metalness: 0.0 }),
      plinth: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.8, metalness: 0.0 })
  },
  xray: {
      corpus: new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.15, depthWrite: false }),
      front: new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15, depthWrite: false }),
      shelf: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.3, depthWrite: false }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4, depthWrite: false }),
      hdf: new THREE.MeshStandardMaterial({ color: 0x475569, transparent: true, opacity: 0.3, depthWrite: false }),
      plinth: new THREE.MeshStandardMaterial({ color: 0x1c1917, transparent: true, opacity: 0.7, depthWrite: true })
  }
};
const holeMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 }); 

function addBox(w, h, d, x, y, z, type, isActiveModule, userData = null, parentGroup) {
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
  
  if (userData) mesh.userData = userData;
  mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;

  const edges = new THREE.EdgesGeometry(geo);
  const isSelected = isActiveModule || (userData && state.selectedModules && state.selectedModules.has(userData.moduleId));
  let edgeColor = isXrayMode ? (type === 'drawerBox' ? 0xd97706 : 0x64748b) : 0x334155; 
  if (isSelected) edgeColor = 0x2563eb;
  
  const lineMat = new THREE.LineBasicMaterial({ color: edgeColor, linewidth: isSelected ? 2 : 1 });
  const line = new THREE.LineSegments(edges, lineMat);
  if (userData) line.userData = userData; 

  mesh.add(line);
  parentGroup.add(mesh);
}

function addHole(radius, depth, x, y, z, rotationAxis, parentGroup) {
  if (!isXrayMode) return; 
  const geo = new THREE.CylinderGeometry(radius, radius, depth, 16);
  const mesh = new THREE.Mesh(geo, holeMat);
  if (rotationAxis === 'x') mesh.rotation.z = Math.PI / 2; 
  if (rotationAxis === 'y') mesh.rotation.x = 0;           
  if (rotationAxis === 'z') mesh.rotation.x = Math.PI / 2; 
  mesh.position.set(x, y, z);
  parentGroup.add(mesh);
}

function addHardware(type, x, y, z, axis, parentGroup) {
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

export function update3D() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js — odświeża się tylko, gdy jest widoczny
  if (!cabinetGroup) return;

  while (cabinetGroup.children.length > 0) {
      cabinetGroup.remove(cabinetGroup.children[0]);
  }

  const th = parseFloat(state.project.materials?.boardThickness) || 18;

  state.project.modules.forEach(mod => {
      recalculateLayout(mod);

      const isActive = mod.id === state.activeModuleId;
      const W = parseFloat(mod.dimensions.width);
      const H = parseFloat(mod.dimensions.height);
      const D = parseFloat(mod.dimensions.depth);
      let baseOffsetY = 0;
      if (mod.legs && mod.legs.active) baseOffsetY = parseFloat(mod.legs.height) || 100;
      
      const { worldW, worldD } = getWorldFootprint(mod);

      const modGroup = new THREE.Group();
      modGroup.userData = { moduleId: mod.id };

      // position.x/z to zawsze róg FAKTYCZNEGO odcisku modułu w pokoju (worldW/worldD,
      // nie surowe dimensions.width/depth) - dzięki temu przy rotation===0 zachowanie
      // jest identyczne jak dawniej (worldW===W, worldD===D), a przy 90/270 środek
      // bryły (wokół którego obraca się modGroup) wypada tam, gdzie faktycznie stoi
      // odcisk szafki na podłodze, zgodnie z tym co liczy drag/snap (getWorldFootprint).
      modGroup.position.set(
          (parseFloat(mod.position.x) || 0) + worldW/2,
          (parseFloat(mod.position.y) || 0) + baseOffsetY + H/2,
          (parseFloat(mod.position.z) || 0) + worldD/2
      );
      modGroup.rotation.y = -((parseFloat(mod.rotation) || 0) * Math.PI / 180);

      const innerGroup = new THREE.Group();
      innerGroup.position.set(-W/2, -H/2 - baseOffsetY, -D/2);
      modGroup.add(innerGroup);

      const posX = 0; 
      const posY = baseOffsetY; 
      const posZ = 0; 

      const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(mod.construction || {}) };
      const isTopBottomFull = cons.joinType === 'wience_przelotowe';
      const trav = getTraverseConfig(cons);

      const udCorp = { moduleId: mod.id, type: 'corpus' };
      const udBack = { moduleId: mod.id, type: 'corpus', part: 'back' }; 

      const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
      const backThick = 3; 
      
      let sideD, tbD, backZ;
      if (backP.type === 'nut') {
          sideD = D;
          tbD = D - backP.offset - backThick; 
          backZ = posZ + backP.offset;
      } else { 
          sideD = D - backThick;
          tbD = D - backThick;
          backZ = posZ;
      }

      const sideStartZ = posZ + D - sideD;
      const tbStartZ = posZ + D - tbD;

      if (isTopBottomFull) {
          addBox(W, th, tbD, posX, posY, tbStartZ, 'corpus', isActive, udCorp, innerGroup); 
          addBox(W, th, tbD, posX, posY + H - th, tbStartZ, 'corpus', isActive, udCorp, innerGroup); 
          addBox(th, H - 2*th, sideD, posX, posY + th, sideStartZ, 'corpus', isActive, udCorp, innerGroup); 
          addBox(th, H - 2*th, sideD, posX + W - th, posY + th, sideStartZ, 'corpus', isActive, udCorp, innerGroup); 
      } else {
          addBox(th, H, sideD, posX, posY, sideStartZ, 'corpus', isActive, udCorp, innerGroup); 
          addBox(th, H, sideD, posX + W - th, posY, sideStartZ, 'corpus', isActive, udCorp, innerGroup); 
          addBox(W - 2*th, th, tbD, posX + th, posY, tbStartZ, 'corpus', isActive, udCorp, innerGroup); 
          
          if (cons.topType === 'pelny') {
              addBox(W - 2*th, th, tbD, posX + th, posY + H - th, tbStartZ, 'corpus', isActive, udCorp, innerGroup);
          } else if (cons.topType === 'trawersy_poziom') {
              if (trav.front.active) addBox(W - 2*th, th, trav.front.width, posX + th, posY + H - th, posZ + D - trav.front.width, 'corpus', isActive, udCorp, innerGroup);
              if (trav.rear.active) addBox(W - 2*th, th, trav.rear.width, posX + th, posY + H - th, tbStartZ, 'corpus', isActive, udCorp, innerGroup);
          } else if (cons.topType === 'trawersy_pion') {
              if (trav.front.active) addBox(W - 2*th, trav.front.width, th, posX + th, posY + H - trav.front.width, posZ + D - th, 'corpus', isActive, udCorp, innerGroup);
              if (trav.rear.active) addBox(W - 2*th, trav.rear.width, th, posX + th, posY + H - trav.rear.width, tbStartZ, 'corpus', isActive, udCorp, innerGroup);
          }
      }

      addBox(W - 4, H - 4, backThick, posX + 2, posY + 2, backZ, 'hdf', isActive, udBack, innerGroup);

      const hwAxis = isTopBottomFull ? 'y' : 'x';
      const jointXs = [posX + th/2, posX + W - th/2];
      
      jointXs.forEach(jx => {
          const bottomY = posY + th/2;
          const rearZ = tbStartZ + 37;
          const rearDowelZ = tbStartZ + 69;
          
          addHardware('screw', jx, bottomY, posZ + D - 37, hwAxis, innerGroup);
          addHardware('dowel', jx, bottomY, posZ + D - 69, hwAxis, innerGroup);
          addHardware('screw', jx, bottomY, rearZ, hwAxis, innerGroup);
          addHardware('dowel', jx, bottomY, rearDowelZ, hwAxis, innerGroup);
          
          if (cons.topType === 'pelny') {
              const topY = posY + H - th/2;
              addHardware('screw', jx, topY, posZ + D - 37, hwAxis, innerGroup);
              addHardware('dowel', jx, topY, posZ + D - 69, hwAxis, innerGroup);
              addHardware('screw', jx, topY, rearZ, hwAxis, innerGroup);
              addHardware('dowel', jx, topY, rearDowelZ, hwAxis, innerGroup);
          } else if (cons.topType === 'trawersy_poziom') {
              const topY = posY + H - th/2;
              if (trav.front.active) { addHardware('screw', jx, topY, posZ + D - 37, hwAxis, innerGroup); addHardware('dowel', jx, topY, posZ + D - 69, hwAxis, innerGroup); }
              if (trav.rear.active) { addHardware('screw', jx, topY, rearZ, hwAxis, innerGroup); addHardware('dowel', jx, topY, rearDowelZ, hwAxis, innerGroup); }
          } else if (cons.topType === 'trawersy_pion') {
              const topY = posY + H - 37;
              const topDowelY = posY + H - 69;
              if (trav.front.active) { addHardware('screw', jx, topY, posZ + D - th/2, 'x', innerGroup); addHardware('dowel', jx, topDowelY, posZ + D - th/2, 'x', innerGroup); }
              if (trav.rear.active) { addHardware('screw', jx, topY, tbStartZ + th/2, 'x', innerGroup); addHardware('dowel', jx, topDowelY, tbStartZ + th/2, 'x', innerGroup); }
          }
      });

      const modFront = { ...(state.project.front || {}), ...(mod.front || {}) };
      const isInsetFront = modFront.type === 'wpuszczane';

      const innerZ = backP.type === 'nut' ? backZ + backThick : posZ + backThick;
      // Front wpuszczany wjeżdża w głąb korpusu o swoją grubość (th), więc półki/przegrody
      // muszą się przed nim zatrzymać — inaczej kolidowałyby z nim w tym samym miejscu, gdzie
      // engine/cabinet.js (getInteriorParts) już skraca ich formatki o tę samą wartość.
      const shelfDepth = (posZ + D - 2 - (isInsetFront ? th : 0)) - innerZ;

      if (mod.elements) {
          mod.elements.forEach((el) => {
              const udElement = { moduleId: mod.id, type: el.typ === 'front' ? 'front' : 'shelf', elementId: el.id };

              if (el.typ === 'poziom') {
                  addBox(el.w, el.h, shelfDepth, posX + el.x, posY + el.y, innerZ, 'shelf', isActive, udElement, innerGroup);

                  if (isXrayMode) {
                      const isStruct = el.isStructural;
                      const frontHoleZ = (posZ + D - 2) - 37;
                      const rearHoleZ = innerZ + 37;
                      const holeZs = [frontHoleZ, rearHoleZ]; 
                      
                      const leftHoleX = posX + el.x - th/2;
                      const rightHoleX = posX + el.x + el.w + th/2;

                      holeZs.forEach(hz => {
                          if (isStruct) {
                              const holeY = posY + el.y + el.h / 2; 
                              const dowelZ = hz === frontHoleZ ? hz - 32 : hz + 32;
                              addHole(1.5, th, leftHoleX, holeY, hz, 'x', innerGroup); 
                              addHole(1.5, th, rightHoleX, holeY, hz, 'x', innerGroup); 
                              addHardware('screw', leftHoleX, holeY, hz, 'x', innerGroup); 
                              addHardware('screw', rightHoleX, holeY, hz, 'x', innerGroup); 
                              
                              addHole(4.0, th, leftHoleX, holeY, dowelZ, 'x', innerGroup); 
                              addHole(4.0, th, rightHoleX, holeY, dowelZ, 'x', innerGroup); 
                              addHardware('dowel', leftHoleX, holeY, dowelZ, 'x', innerGroup); 
                              addHardware('dowel', rightHoleX, holeY, dowelZ, 'x', innerGroup); 
                          } else {
                              const supportY = posY + el.y - 2.5; 
                              addHole(2.5, th, leftHoleX, supportY, hz, 'x', innerGroup); 
                              addHole(2.5, th, rightHoleX, supportY, hz, 'x', innerGroup); 
                              addHardware('support', leftHoleX + th/2 + 4, supportY, hz, 'x', innerGroup); 
                              addHardware('support', rightHoleX - th/2 - 4, supportY, hz, 'x', innerGroup); 
                          }
                      });
                  }
              } 
              else if (el.typ === 'pion') {
                  addBox(el.w, el.h, shelfDepth, posX + el.x, posY + el.y, innerZ, 'shelf', isActive, udElement, innerGroup);
              }
              else if (el.typ === 'front') {
                  const isInternal = el.subtype === 'szuflada-wewnetrzna';
                  
                  if (!isFrontsVisible && !isInternal) {
                      return; 
                  }

                  const f = modFront;

                  let innerFrontThick = 18;
                  let innerSetback = 0;
                  let zForFront;

                  if (isInternal) {
                      innerFrontThick = parseFloat(el.innerFrontThickness ?? 18);
                      innerSetback = parseFloat(el.innerSetback ?? 2);
                      zForFront = posZ + D - innerSetback - innerFrontThick;
                  } else if (isInsetFront) {
                      // Front wpuszczany siedzi W otworze korpusu (lico w linii z bokami),
                      // a nie przed nim jak nakładany — cofnięty o własną grubość (th).
                      zForFront = posZ + D - th;
                  } else {
                      zForFront = posZ + D + 2;
                  }
                  
                  addBox(el.w, el.h, isInternal ? innerFrontThick : 18, posX + el.x, posY + el.y, zForFront, 'front', isActive, udElement, innerGroup);

                  if (el.subtype.includes('szuflada')) {
                      if (isXrayMode) {
                          const isBottomInZone = el.frontIndex === 0;
                          
                          let availableSpace = el.h;
                          if (el.y < th) availableSpace -= th; 
                          if (el.y + el.h > H - th) availableSpace -= th; 

                          const sysName = (f.drawerSystem || 'merivobox').toLowerCase();

                          // NAPRAWA: forceVariant to klucz katalogu (np. "srednia"), nie litera
                          // typu ("K") — różne systemy różnie nazywają literą ten sam klucz
                          // (patrz core/drawerSystems.js). Porównanie po literze nigdy się nie
                          // zgadzało, więc wymuszony wariant był tu po cichu ignorowany.
                          let simulatedSpace = availableSpace;
                          if (el.forceVariant && el.forceVariant !== 'auto') {
                              const variantData = (drawerSystems[sysName] || drawerSystems.merivobox).variants[el.forceVariant];
                              if (variantData) simulatedSpace = Math.min(variantData.height, availableSpace);
                          }
                          const dHoles = calculateDrawerHoles(sysName, el.y, simulatedSpace, th, el.frontIndex, isBottomInZone);
                          
                          const innerWidth = el.w; 
                          
                          let availableDepth = D - 19; 
                          if (isInternal) {
                              availableDepth -= (innerFrontThick + innerSetback);
                          }
                          
                          if (el.forceNL && !isNaN(parseFloat(el.forceNL))) {
                              availableDepth = parseFloat(el.forceNL) + 10;
                          }

                          // Pełne availableSpace, nie simulatedSpace — patrz analogiczny komentarz
                          // w engine/cabinet.js (getFrontsAndDrawers).
                          const drawerComps = getDrawerComponents(sysName, innerWidth, availableDepth, availableSpace, el.forceVariant || 'auto');

                          if (drawerComps) {
                              const NL = drawerComps.nominalLength;
                              const dw = drawerComps.bottom.width;
                              const dl = drawerComps.bottom.length;
                              const dh = drawerComps.back.height;

                              const dX = posX + el.x + (innerWidth - dw) / 2;

                              // NAPRAWA: dno szuflady ma siedzieć tuż nad wieńcem dolnym korpusu
                              // (albo tuż nad frontem szuflady niżej w stosie), nie kilkanaście mm
                              // wyżej. Poprzednia wersja liczyła to od wysokości otworu montażowego
                              // prowadnicy (dHoles) pomniejszonej o stałe 33.5mm — ta liczba to w
                              // rzeczywistości pozycja śrub mocujących FRONT (frontHolesBase z
                              // core/drawerSystems.js), skopiowana tu przez pomyłkę i bez związku
                              // z wysokością samej prowadnicy. Efekt: szuflada renderowała się
                              // zawyżona względem realnie dostępnego miejsca w korpusie.
                              const dY = posY + el.y + (isBottomInZone ? th : 0);

                              const boxStartZ = zForFront - NL;

                              addBox(dw, 16, NL, dX, dY, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(drawerComps.back.width, dh, 16, dX + (dw - drawerComps.back.width)/2, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(16, dh, NL, dX - 16, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(16, dh, NL, dX + dw, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                          }

                          if (dHoles && dHoles.slideSideHoles) {
                              const slideZOffset = isInternal ? (innerFrontThick + innerSetback) : 0; 
                              const leftHoleX = posX + el.x - th/2;
                              const rightHoleX = posX + el.x + el.w + th/2;

                              dHoles.slideSideHoles.forEach(h => {
                                  let calcY = isTopBottomFull ? h.y - th : h.y;
                                  addHole(2.5, th, leftHoleX, posY + calcY, posZ + D - h.x - slideZOffset, 'x', innerGroup); 
                                  addHole(2.5, th, rightHoleX, posY + calcY, posZ + D - h.x - slideZOffset, 'x', innerGroup); 
                              });
                          }
                          if (dHoles && dHoles.frontHoles) {
                              dHoles.frontHoles.forEach(h => {
                                  let calcY = isTopBottomFull ? el.y + h.y - th : el.y + h.y;
                                  addHole(2.5, 12, posX + el.x + (h.xOffsetLeft || 20.5), posY + calcY, zForFront + (isInternal ? innerFrontThick/2 : 9), 'z', innerGroup); 
                                  addHole(2.5, 12, posX + el.x + el.w - (h.xOffsetRight || 20.5), posY + calcY, zForFront + (isInternal ? innerFrontThick/2 : 9), 'z', innerGroup); 
                              });
                          }
                      }
                  }
                  
                  else if (el.subtype.includes('drzwi')) {
                      if (isXrayMode) {
                          let obstacles = [];
                          const modAbsX = parseFloat(mod.position.x) || 0;
                          const modLegH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 0) : 0;
                          const modAbsY = (parseFloat(mod.position.y) || 0) + modLegH;

                          state.project.modules.forEach(otherMod => {
                              const otherAbsX = parseFloat(otherMod.position.x) || 0;
                              const otherLegH = (otherMod.legs && otherMod.legs.active) ? (parseFloat(otherMod.legs.height) || 0) : 0;
                              const otherAbsY = (parseFloat(otherMod.position.y) || 0) + otherLegH;

                              if (Math.abs(modAbsX - otherAbsX) < 10) {
                                  const dy = otherAbsY - modAbsY;
                                  if (otherMod.elements) {
                                      otherMod.elements.forEach(e => {
                                          if (e.typ === 'poziom' || e.subtype === 'szuflada-wewnetrzna') {
                                              obstacles.push({ ...e, y: e.y + dy });
                                          }
                                      });
                                  }
                                  const otherH = parseFloat(otherMod.dimensions.height);
                                  obstacles.push({ typ: 'poziom', y: dy, h: th, isStructural: true });
                                  obstacles.push({ typ: 'poziom', y: dy + otherH - th, h: th, isStructural: true });
                              }
                          });

                          const side = el.subtype === 'drzwi-lp' ? (el.id.includes('-L-') ? 'left' : 'right') : (el.openingSide || 'left');
                          const hinges = calculateHinges(el, th, obstacles, side);
                          
                          hinges.forEach(h => {
                              let calcY = isTopBottomFull ? el.y + h.relY - th : el.y + h.relY;
                              const isLeft = side === 'left';
                              const cupX = isLeft ? el.x + h.cupXOffset : el.x + el.w - h.cupXOffset;

                              addHole(17.5, 13, posX + cupX, posY + calcY, zForFront + 6.5, 'z', innerGroup);

                              const plateX = isLeft ? posX + el.x - th/2 : posX + el.x + el.w + th/2;
                              addHole(2.5, th, plateX, posY + calcY - 16, posZ + D - 37, 'x', innerGroup);
                              addHole(2.5, th, plateX, posY + calcY + 16, posZ + D - 37, 'x', innerGroup);
                          });
                      }
                  }
              }
          });
      }

      if (mod.legs && mod.legs.active) {
          const legH = parseFloat(mod.legs.height) || 100;
          // Ręczna korekta wysokości pojedynczej nóżki (patrz ui/properties.js, zakładka
          // "Nóżki / Blendy" — lista "Nóżka N" z edytowalną wysokością). Indeksy 0-3 =
          // Tył-L, Tył-P, Przód-L, Przód-P, w tej samej kolejności co addBox() niżej —
          // ta sama kolejność jest też w engine/cabinet.js (calculateProjectHardware).
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
          const frontFaceZ = posZ + D;
          const frontLegZ = mod.legs.plinth
              ? frontFaceZ - offset - plinthThick - 30
              : frontFaceZ - 80;
          const clampedFrontLegZ = Math.max(posZ + 90, frontLegZ);

          addBox(30, legHeightFor(0), 30, posX + 50, rootY, posZ + 50, 'corpus', false, udPlinth, innerGroup);
          addBox(30, legHeightFor(1), 30, posX + W - 80, rootY, posZ + 50, 'corpus', false, udPlinth, innerGroup);
          addBox(30, legHeightFor(2), 30, posX + 50, rootY, clampedFrontLegZ, 'corpus', false, udPlinth, innerGroup);
          addBox(30, legHeightFor(3), 30, posX + W - 80, rootY, clampedFrontLegZ, 'corpus', false, udPlinth, innerGroup);

          if (mod.legs.plinth) {
              addBox(W, legH, plinthThick, posX, rootY, frontFaceZ - offset - plinthThick, 'plinth', isActive, udPlinth, innerGroup);
          }
      }

      if (mod.fillers && isFrontsVisible) {
          const frontType = (mod.front && mod.front.type) ? mod.front.type : (state.project.front?.type || 'nakladane');
          const zForFiller = frontType === 'wpuszczane' ? posZ + D - th : posZ + D + 2;

          let leftW = 0;
          let rightW = 0;

          const parseVal = (val, fallback) => (val !== null && val !== undefined && val !== '') ? parseFloat(val) : fallback;

          if (mod.fillers.left && mod.fillers.left.active) {
              leftW = parseFloat(mod.fillers.left.width) || 50;
              const fH = parseVal(mod.fillers.left.height, H);
              const fD = parseFloat(mod.fillers.left.depth) || 80;
              const fY = parseVal(mod.fillers.left.offsetY, 0);

              addBox(leftW, fH, th, posX - leftW, posY + fY, zForFiller, 'front', isActive, null, innerGroup);
              addBox(th, fH, fD - th, posX - th, posY + fY, zForFiller - (fD - th), 'corpus', isActive, null, innerGroup);
          }

          if (mod.fillers.right && mod.fillers.right.active) {
              rightW = parseFloat(mod.fillers.right.width) || 50;
              const fH = parseVal(mod.fillers.right.height, H);
              const fD = parseFloat(mod.fillers.right.depth) || 80;
              const fY = parseVal(mod.fillers.right.offsetY, 0);

              addBox(rightW, fH, th, posX + W, posY + fY, zForFiller, 'front', isActive, null, innerGroup);
              addBox(th, fH, fD - th, posX + W, posY + fY, zForFiller - (fD - th), 'corpus', isActive, null, innerGroup);
          }

          if (mod.fillers.top && mod.fillers.top.active) {
              const fH = parseVal(mod.fillers.top.height, 50);
              const autoW = W + leftW + rightW;
              const topW = parseVal(mod.fillers.top.width, autoW);
              const fD = parseFloat(mod.fillers.top.depth) || 80;
              const fY = parseVal(mod.fillers.top.offsetY, 0);

              const startX = posX - leftW + (autoW - topW) / 2;

              addBox(topW, fH, th, startX, posY + H + fY, zForFiller, 'front', isActive, null, innerGroup);
              addBox(topW, th, fD - th, startX, posY + H + fY, zForFiller - (fD - th), 'corpus', isActive, null, innerGroup);
          }
      }

      cabinetGroup.add(modGroup);
  });
}