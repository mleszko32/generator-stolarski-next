// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { state, DEFAULT_ROOM } from '../core/state.js';

import { getDrawerComponents, calculateDrawerHoles } from '../core/drawerMath.js';
import { drawerSystems } from '../core/drawerSystems.js';
import { calculateHinges } from '../core/hingeMath.js';
import { recalculateLayout, getTraverseConfig, getWorldFootprint, clampModuleToRoom, getModuleBox, getCornerDepths } from '../core/layout.js';
import { buildZoneTree, moveSplit } from '../core/zoneTree.js';
import { scheduleCheckpoint } from '../core/history.js';
import { toggleInteriorEditor, renderInteriorEditorIfVisible } from '../ui/interiorEditor.js';

import { updateSidebar } from '../ui/sidebar.js';
import { initPropertiesPanel } from '../ui/properties.js';

let alignMode = { active: false, sourceMod: null, sourceEl: null, banner: null };
// Miarka - tryb "klik pierwszy punkt, klik drugi punkt" w scenie 3D, do
// szybkiego sprawdzania dowolnego odstępu bez liczenia ręcznie (zgłoszona
// prośba). Punkty łapane raycasterem z DOWOLNEJ widocznej powierzchni
// (szafki, ściany, podłoga) - nie tylko elementów modułu jak handle3DClick.
let measureMode = { active: false, pointA: null, banner: null, btn: null };
let measureGroup;
// Punkt pod kursorem (dokładnie ten, który zatwierdza klik - WYSIWYG),
// przyciągany do najbliższego rogu bryły w promieniu SNAP_PX pikseli
// ekranu, jeśli taki się znajdzie w zasięgu (zgłoszona prośba o precyzję).
const measureHoverMouse = new THREE.Vector2();
let measureHoverPoint = null;
let measureHoverSnapped = false;
let measureHoverMarker = null;
const MEASURE_SNAP_PX = 20;
let isXrayMode = true;
let isFrontsVisible = true;

// Odczyt stanu przycisku "Ukryj/Pokaż fronty zewn." dla ui/interiorEditor.js -
// ten sam przełącznik ma teraz ukrywać fronty także we Wnętrzu 2D, nie tylko
// w podglądzie 3D (patrz toggleFrontsBtn.onclick niżej).
export function areFrontsVisible() {
  return isFrontsVisible;
}

let isDragging = false;
let dragTarget = null;
let dragModule = null;
const dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane();
const SNAP_DIST = 40;
let dragSelectionOrigins = new Map();
let wasSelectedOnDown = false;
// Przeciąganie boku dokładanego (core/state.js: addSidePanel) - osobny,
// prostszy tor niż moduły (bez grup, bez blend, bez trybu pionowego Alt),
// bo to pojedynczy, samodzielny obiekt. Współdzieli dragOffset/dragPlane
// z modułami (to samo drzewo pointerdown/pointermove/pointerup, nigdy oba
// naraz), ale ma własne isDragging*/dragSidePanel*, żeby nie mieszać się z
// logiką modułów w handle3DClick i module'owym pointermove.
let isDraggingSidePanel = false;
let dragSidePanelTarget = null;
let dragSidePanel = null;
// Przeciąganie z wciśniętym Alt = tylko w pionie (Y), reszta myszką = tylko
// po podłodze (X/Z) - patrz komentarz przy ustawianiu dragPlane niżej.
let verticalDrag = false;

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

// Odświeża transform bryły modułu w scenie na podstawie aktualnego
// mod.position/rotation - używane po ręcznej korekcie pozycji poza normalnym
// update3D() (pushOverlappingModules niżej), żeby widok od razu nadążał za
// zmianą, klatka po klatce przeciągania.
function syncModuleMesh(mod) {
  const target = cabinetGroup && cabinetGroup.children.find(g => g.userData.moduleId === mod.id);
  if (!target) return;
  const { worldW, worldD } = getWorldFootprint(mod);
  const H = parseFloat(mod.dimensions.height) || 720;
  const baseY = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 100) : 0;
  target.position.set(
      (parseFloat(mod.position.x) || 0) + worldW/2,
      (parseFloat(mod.position.y) || 0) + baseY + H/2,
      (parseFloat(mod.position.z) || 0) + worldD/2
  );
}

// Dotąd przeciąganie tylko PRZYCIĄGAŁO (magnetycznie) do krawędzi sąsiadów,
// ale nic nie stało na przeszkodzie, żeby wjechać w sąsiedni moduł na wylot -
// zmiana szerokości/wysokości modułu (patrz ui/properties.js) już dawno
// odsuwa dalsze moduły w łańcuchu, przeciąganie robiło to tylko dla ściany,
// nie dla innych szafek (zgłoszony bug). Woła się co klatkę przeciągania
// (pointermove niżej) dla aktualnie przesuwanego zaznaczenia (draggedIds) -
// każdy napotkany, kolidujący moduł jest odsuwany o dokładnie tyle, ile
// trzeba, żeby znów stykał się krawędzią, wzdłuż osi (X albo Z) z MNIEJSZYM
// nakładaniem ("minimum translation vector" przy rozwiązywaniu kolizji AABB)
// - dzięki temu odsunięcie idzie w stronę, z której faktycznie nadjechał
// przeciągany moduł. Efekt łańcuchowy: odsunięty moduł sam trafia z powrotem
// do kolejki i jest sprawdzany przeciw reszcie, więc pchnięcie propaguje się
// dalej, tak jak przy zmianie wymiaru.
//
// WAŻNE: minimum translation vector liczymy PO WSZYSTKICH TRZECH osiach
// (X/Y/Z), nie tylko X/Z. Budowanie szafy z dwóch modułów jeden NA DRUGIM
// (np. dolny + górny, ten sam odcisk X/Z) też przechodzi przez chwilową
// kolizję w trakcie przeciągania - ale tam naturalnym rozwiązaniem jest
// dosunięcie w pionie (Y), NIE odepchnięcie stacjonarnego modułu w bok
// (zgłoszony bug: odsuwało dolny moduł). Gdy to oś Y ma najmniejsze
// nałożenie, dosuwamy więc PRZECIĄGANY moduł (m), a nie stacjonarny (other) -
// dokładnie to samo robi core/layout.js:restModuleOnNeighbors() dla pozycji
// Y wpisanej ręcznie w polu w panelu bocznym (ui/properties.js), więc oba
// wejścia (drag i pole liczbowe) dają ten sam, spójny wynik.
function pushOverlappingModules(draggedIds) {
  const EPS = 0.5;
  const queue = Array.from(draggedIds);
  let guard = 0;
  while (queue.length && guard < 100) {
    guard++;
    const id = queue.shift();
    const m = state.project.modules.find(mm => mm.id === id);
    if (!m) continue;
    const boxM = getModuleBox(m);

    state.project.modules.forEach(other => {
      if (other.id === id || draggedIds.has(other.id)) return;
      const boxO = getModuleBox(other);
      const overlapX = Math.min(boxM.x1, boxO.x1) - Math.max(boxM.x0, boxO.x0);
      const overlapY = Math.min(boxM.y1, boxO.y1) - Math.max(boxM.y0, boxO.y0);
      const overlapZ = Math.min(boxM.z1, boxO.z1) - Math.max(boxM.z0, boxO.z0);
      if (overlapX <= EPS || overlapY <= EPS || overlapZ <= EPS) return;

      if (overlapY <= overlapX && overlapY <= overlapZ) {
        const dir = (boxM.y0 + boxM.y1) >= (boxO.y0 + boxO.y1) ? 1 : -1;
        m.position.y = Math.round((parseFloat(m.position.y) || 0) + dir * overlapY);
        boxM.y0 += dir * overlapY;
        boxM.y1 += dir * overlapY;
        syncModuleMesh(m);
        return;
      }

      if (overlapX <= overlapZ) {
        const dir = (boxO.x0 + boxO.x1) >= (boxM.x0 + boxM.x1) ? 1 : -1;
        other.position.x = (parseFloat(other.position.x) || 0) + dir * overlapX;
      } else {
        const dir = (boxO.z0 + boxO.z1) >= (boxM.z0 + boxM.z1) ? 1 : -1;
        other.position.z = (parseFloat(other.position.z) || 0) + dir * overlapZ;
      }
      clampModuleToRoom(other);
      syncModuleMesh(other);
      queue.push(other.id);
    });
  }
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

  // Miarka (measureMode niżej) - osobna grupa DOTAJĘTA WPROST DO SCENE, nie
  // do cabinetGroup, bo update3D() czyści cabinetGroup przy KAŻDYM
  // przeliczeniu (np. przy zwykłym wpisywaniu w polach) - markery/linia
  // pomiaru musiałyby znikać przy każdej niepowiązanej zmianie.
  measureGroup = new THREE.Group();
  scene.add(measureGroup);

  reframeCameraToRoom();

  renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos.set(e.clientX, e.clientY);
      if (alignMode.active || measureMode.active) return;

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

              // Płaszczyzna przeciągania musi być POZIOMA (normalna = pion Y),
              // nie skierowana na kamerę - inaczej przy pochylonej (orbitującej)
              // kamerze przesunięcie myszką "w bok" na ekranie mapowało się na
              // ruch po płaszczyźnie ekranu w 3D, czyli w rzeczywistości po
              // przekątnej (z domieszką Y/Z), więc szafka "uciekała" w górę albo
              // w głąb zamiast jechać wzdłuż podłogi - zgłoszony bug. Płaszczyzna
              // pozioma sprawia, że mysz zawsze rusza modułem wyłącznie po X/Z
              // (po podłodze), niezależnie od kąta kamery.
              //
              // Trzymając Alt: odwrotnie - płaszczyzna PIONOWA (billboard,
              // zawiera oś Y, zwrócona w stronę rzutu kamery na podłogę), więc
              // mysz rusza modułem wyłącznie w GÓRĘ/DÓŁ (Y), z zablokowanym X/Z -
              // bez tego, po wprowadzeniu wyłącznie poziomego przeciągania,
              // nie dało się już wcale podnieść/opuścić modułu myszką
              // (zgłoszony bug), tylko przez wpisanie liczby w polu bocznym.
              verticalDrag = e.altKey;
              let normal;
              if (verticalDrag) {
                  const camDir = camera.getWorldDirection(new THREE.Vector3());
                  camDir.y = 0;
                  if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1);
                  camDir.normalize();
                  normal = camDir;
              } else {
                  normal = new THREE.Vector3(0, 1, 0);
              }
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
                  state.activeSidePanelId = null;
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
          } else if (group.userData && group.userData.sidePanelId) {
              dragSidePanel = state.project.sidePanels.find(p => p.id === group.userData.sidePanelId);
              if (dragSidePanel) {
                  isDraggingSidePanel = true;
                  controls.enabled = false;

                  const normal = new THREE.Vector3(0, 1, 0);
                  dragPlane.setFromNormalAndCoplanarPoint(normal, intersects[0].point);

                  const wasActive = state.activeSidePanelId === dragSidePanel.id;
                  if (!wasActive) {
                      state.activeSidePanelId = dragSidePanel.id;
                      state.activeModuleId = null;
                      if (state.selectedModules) state.selectedModules.clear();
                      updateSidebar();
                      initPropertiesPanel();
                      update3D();
                      dragSidePanelTarget = cabinetGroup.children.find(g => g.userData && g.userData.sidePanelId === dragSidePanel.id);
                  } else {
                      dragSidePanelTarget = group;
                  }

                  dragOffset.copy(dragSidePanelTarget.position).sub(intersects[0].point);
              }
          }
      }
  });

  window.addEventListener('pointermove', (e) => {
      if (isDraggingSidePanel && dragSidePanelTarget && dragSidePanel) {
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);

          const intersect = new THREE.Vector3();
          raycaster.ray.intersectPlane(dragPlane, intersect);
          if (!intersect) return;

          const newGroupPos = intersect.clone().add(dragOffset);
          const { worldW, worldD } = getWorldFootprint(dragSidePanel);
          const room = getRoom();

          let snapX = newGroupPos.x - worldW / 2;
          let snapZ = newGroupPos.z - worldD / 2;

          // Przyciąganie do ścian pokoju.
          if (Math.abs(snapX) < SNAP_DIST) snapX = 0;
          if (Math.abs(snapZ) < SNAP_DIST) snapZ = 0;
          if (Math.abs((snapX + worldW) - room.width) < SNAP_DIST) snapX = room.width - worldW;
          if (Math.abs((snapZ + worldD) - room.depth) < SNAP_DIST) snapZ = room.depth - worldD;

          // Przyciąganie krawędzią do krawędzi modułów i innych boków
          // dokładanych ("żeby się przyklejały" - zgłoszona potrzeba) -
          // dokładnie ta sama logika co przy module, tylko bez cudzych blend
          // (bok dokładany nie ma swoich, a sąsiad w kolizji liczy się i tak
          // po jego własnym world-space AABB, patrz getModuleBox).
          const neighborBoxes = [];
          state.project.modules.forEach(m => {
              const box = getModuleBox(m);
              neighborBoxes.push({ x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 });
          });
          state.project.sidePanels.forEach(p => {
              if (p.id === dragSidePanel.id) return;
              const fp = getWorldFootprint(p);
              const px = parseFloat(p.position.x) || 0;
              const pz = parseFloat(p.position.z) || 0;
              neighborBoxes.push({ x0: px, x1: px + fp.worldW, z0: pz, z1: pz + fp.worldD });
          });

          neighborBoxes.forEach(box => {
              if (Math.abs(snapX - box.x1) < SNAP_DIST) snapX = box.x1;
              else if (Math.abs((snapX + worldW) - box.x0) < SNAP_DIST) snapX = box.x0 - worldW;

              if (Math.abs(snapZ - box.z1) < SNAP_DIST) snapZ = box.z1;
              else if (Math.abs((snapZ + worldD) - box.z0) < SNAP_DIST) snapZ = box.z0 - worldD;
          });

          snapX = Math.max(0, Math.min(room.width - worldW, snapX));
          snapZ = Math.max(0, Math.min(room.depth - worldD, snapZ));

          dragSidePanel.position.x = Math.round(snapX);
          dragSidePanel.position.z = Math.round(snapZ);

          const H = parseFloat(dragSidePanel.dimensions.height) || 0;
          const y = parseFloat(dragSidePanel.position.y) || 0;
          dragSidePanelTarget.position.set(snapX + worldW / 2, y + H / 2, snapZ + worldD / 2);
          return;
      }

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

          const orig = dragSelectionOrigins.get(dragModule.id);

          // Tryb pionowy (Alt): X/Z zostają PRZYPIĘTE do pozycji sprzed
          // przeciągania - liczy się tylko intersect.y z pionowej płaszczyzny
          // (patrz pointerdown wyżej). Bez tego nawet drobny poziomy ruch myszką
          // w trakcie podnoszenia/opuszczania modułu przesuwałby go też w bok.
          let snapX = (verticalDrag && orig) ? orig.x : newGroupPos.x - worldW/2;
          let snapY = newGroupPos.y - H/2 - baseOffsetY;
          let snapZ = (verticalDrag && orig) ? orig.z : newGroupPos.z - worldD/2;

          const room = getRoom();

          if (Math.abs(snapY) < SNAP_DIST) snapY = 0;

          if (!verticalDrag) {
              if (Math.abs(snapX - dragLeftW) < SNAP_DIST) snapX = dragLeftW;
              if (Math.abs(snapZ) < SNAP_DIST) snapZ = 0;
              // Przyciąganie do dalszych ścian pokoju (bliższe x=0/z=0 obsługują linie wyżej).
              // Uwzględnia blendę prawą (dragRightW) tak samo jak lewa ściana wyżej
              // uwzględnia dragLeftW - inaczej blenda prawa przy dosunięciu do
              // ściany przenikała przez nią (zgłoszony bug).
              if (Math.abs((snapX + worldW + dragRightW) - room.width) < SNAP_DIST) snapX = room.width - worldW - dragRightW;
              if (Math.abs((snapZ + worldD) - room.depth) < SNAP_DIST) snapZ = room.depth - worldD;
          }

          state.project.modules.forEach(other => {
              if (state.selectedModules && state.selectedModules.has(other.id)) return;

              const oH = parseFloat(other.dimensions.height);
              const { worldW: oW, worldD: oD } = getWorldFootprint(other);
              const oX = parseFloat(other.position.x);
              const oY = parseFloat(other.position.y);
              const oZ = parseFloat(other.position.z);

              if (!verticalDrag) {
                  const otherLeftW = (other.fillers && other.fillers.left && other.fillers.left.active) ? (parseFloat(other.fillers.left.width) || 50) : 0;
                  const otherRightW = (other.fillers && other.fillers.right && other.fillers.right.active) ? (parseFloat(other.fillers.right.width) || 50) : 0;

                  const effOX = oX - otherLeftW;
                  const effOW = oW + otherLeftW + otherRightW;

                  let dragStartX = snapX - dragLeftW;
                  let dragEndX = snapX + worldW + dragRightW;

                  if (Math.abs(dragStartX - (effOX + effOW)) < SNAP_DIST) snapX = effOX + effOW + dragLeftW;
                  else if (Math.abs(dragEndX - effOX) < SNAP_DIST) snapX = effOX - worldW - dragRightW;
                  else if (Math.abs(dragStartX - effOX) < SNAP_DIST) snapX = effOX + dragLeftW;

                  if (Math.abs(snapZ - (oZ + oD)) < SNAP_DIST) snapZ = oZ + oD;
                  else if (Math.abs((snapZ + worldD) - oZ) < SNAP_DIST) snapZ = oZ - worldD;
                  else if (Math.abs(snapZ - oZ) < SNAP_DIST) snapZ = oZ;
              }

              if (Math.abs(snapY - (oY + oH)) < SNAP_DIST) snapY = oY + oH;
              else if (Math.abs((snapY + H) - oY) < SNAP_DIST) snapY = oY - H;
              else if (Math.abs(snapY - oY) < SNAP_DIST) snapY = oY;
          });

          if (!verticalDrag) {
              snapX = Math.max(dragLeftW, snapX);
              snapX = Math.min(room.width - worldW - dragRightW, snapX);
              snapZ = Math.max(0, snapZ);
          }
          snapY = Math.max(0, snapY);

          if (orig) {
              let deltaX = snapX - orig.x;
              const deltaY = snapY - orig.y;
              let deltaZ = snapZ - orig.z;

              // Twardy limit do wnętrza pokoju - liczony na WSPÓLNEJ delcie całego
              // zaznaczenia (np. grupy), nie osobno dla każdego modułu. Osobne
              // przycinanie każdego modułu do własnych granic rozjeżdżało grupę
              // (jeden człon zatrzymywał się przy ścianie wcześniej niż reszta,
              // więc grupa traciła sztywny, wzajemny odstęp) - stąd zgłoszony bug
              // z modułami "przenikającymi" się i ścianami przy grupach.
              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(mod => mod.id === id);
                  const mOrig = dragSelectionOrigins.get(id);
                  if (!m || !mOrig) return;
                  const { worldW: mW, worldD: mD } = getWorldFootprint(m);
                  // Każdy człon grupy ma WŁASNE blendy - rezerwujemy dla nich
                  // miejsce tak samo jak dla dragModule wyżej, inaczej blenda
                  // innego niż przeciągany modułu członka grupy mogła przeniknąć
                  // przez ścianę, mimo że sam moduł się w niej mieścił.
                  const mLeftW = (m.fillers && m.fillers.left && m.fillers.left.active) ? (parseFloat(m.fillers.left.width) || 50) : 0;
                  const mRightW = (m.fillers && m.fillers.right && m.fillers.right.active) ? (parseFloat(m.fillers.right.width) || 50) : 0;
                  const minDeltaX = mLeftW - mOrig.x;
                  const maxDeltaX = Math.max(0, room.width - mW - mRightW) - mOrig.x;
                  const maxDeltaZ = Math.max(0, room.depth - mD) - mOrig.z;
                  deltaX = Math.min(Math.max(deltaX, minDeltaX), maxDeltaX);
                  deltaZ = Math.min(Math.max(deltaZ, -mOrig.z), maxDeltaZ);
              });

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

              // Odsuń każdy inny moduł, w który właśnie wjechaliśmy - patrz
              // pushOverlappingModules() wyżej.
              pushOverlappingModules(state.selectedModules);
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
          // Ostateczne, świadome obrotu zabezpieczenie (patrz clampModuleToRoom w
          // core/layout.js) - snapowanie/twardy limit w pointermove wyżej zna
          // blendy tylko dla rotation===0, więc dla obróconego modułu mógł
          // wypuścić blendę poza pokój w trakcie przeciągania.
          if (state.selectedModules) {
              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(mod => mod.id === id);
                  if (m) clampModuleToRoom(m);
              });
              update3D();
          }
          dragTarget = null;
          dragModule = null;
          controls.enabled = true;
          updateSidebar();
          initPropertiesPanel();
      }
      if (isDraggingSidePanel) {
          isDraggingSidePanel = false;
          dragSidePanelTarget = null;
          dragSidePanel = null;
          controls.enabled = true;
          update3D();
          updateSidebar();
          initPropertiesPanel(); // odśwież wartości X/Z w formularzu po snapowaniu
      }
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
      if (Math.abs(e.clientX - pointerDownPos.x) < 5 && Math.abs(e.clientY - pointerDownPos.y) < 5) {
          handle3DClick(e);
      }
  });

  // Tylko aktualizuje współrzędne kursora (tanie) - faktyczny raycast/snap
  // (updateMeasureHover) liczy się raz na klatkę w animate(), nie na każdy
  // mousemove (który potrafi odpalać się kilkaset razy/s).
  renderer.domElement.addEventListener('mousemove', (e) => {
      if (!measureMode.active) return;
      const r = renderer.domElement.getBoundingClientRect();
      measureHoverMouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      measureHoverMouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  });

  const uiOverlay = document.createElement('div');
  uiOverlay.style.position = 'absolute';
  uiOverlay.style.top = '15px';
  uiOverlay.style.right = '15px';
  uiOverlay.style.zIndex = '100';
  uiOverlay.style.display = 'flex';
  uiOverlay.style.gap = '10px';
  
  const toggleBtn = document.createElement('button');
  toggleBtn.innerHTML = '<i class="ti ti-refresh" aria-hidden="true"></i> Przezroczysty (Szkic)';
  toggleBtn.className = 'btn view-btn active';
  
  toggleBtn.onclick = () => {
      isXrayMode = !isXrayMode;
      toggleBtn.innerHTML = isXrayMode ? '<i class="ti ti-refresh" aria-hidden="true"></i> Przezroczysty (Szkic)' : '<i class="ti ti-refresh" aria-hidden="true"></i> Realistyczny (Bryły)';
      toggleBtn.classList.toggle('active', isXrayMode);
      update3D();
  };
  
  const toggleFrontsBtn = document.createElement('button');
  toggleFrontsBtn.innerHTML = '<i class="ti ti-door" aria-hidden="true"></i> Ukryj fronty zewn.';
  toggleFrontsBtn.className = 'btn view-btn';
  
  toggleFrontsBtn.onclick = () => {
      isFrontsVisible = !isFrontsVisible;
      toggleFrontsBtn.innerHTML = isFrontsVisible ? '<i class="ti ti-door" aria-hidden="true"></i> Ukryj fronty zewn.' : '<i class="ti ti-door" aria-hidden="true"></i> Pokaż fronty zewn.';
      toggleFrontsBtn.classList.toggle('active', !isFrontsVisible);
      update3D();
      renderInteriorEditorIfVisible();
  };

  const toggleInteriorBtn = document.createElement('button');
  toggleInteriorBtn.innerHTML = '<i class="ti ti-layout-list" aria-hidden="true"></i> Wnętrze 2D';
  toggleInteriorBtn.title = 'Klikalny edytor wnęk — dziel/obsadzaj fronty bez trafiania w 3D';
  toggleInteriorBtn.className = 'btn view-btn';
  toggleInteriorBtn.onclick = () => {
      toggleInteriorEditor();
      const showingInterior = document.getElementById('editor-interior-container')?.style.display !== 'none';
      toggleInteriorBtn.innerHTML = showingInterior ? '<i class="ti ti-cube" aria-hidden="true"></i> Podgląd 3D' : '<i class="ti ti-layout-list" aria-hidden="true"></i> Wnętrze 2D';
      toggleInteriorBtn.classList.toggle('active', showingInterior);
      if (!showingInterior && container) {
          // #editor-3d-container był ukryty (display:none) — jego clientWidth/Height mogły
          // w tym czasie wynosić 0 i "zatrzasnąć się" w renderze/kamerze (patrz resize listener
          // niżej). Wymuś przeliczenie teraz, gdy kontener już ma prawdziwy rozmiar.
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
      }
  };

  const toggleMeasureBtn = document.createElement('button');
  toggleMeasureBtn.innerHTML = '<i class="ti ti-ruler-measure" aria-hidden="true"></i> Miarka';
  toggleMeasureBtn.title = 'Kliknij dwa punkty na scenie, żeby zmierzyć odległość między nimi';
  toggleMeasureBtn.className = 'btn view-btn';
  toggleMeasureBtn.onclick = () => toggleMeasureMode();
  measureMode.btn = toggleMeasureBtn;

  uiOverlay.appendChild(toggleBtn);
  uiOverlay.appendChild(toggleFrontsBtn);
  uiOverlay.appendChild(toggleInteriorBtn);
  uiOverlay.appendChild(toggleMeasureBtn);
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
  if (measureMode.active) updateMeasureHover();
  renderer.render(scene, camera);
}

// Miarka - "klik pierwszy punkt, klik drugi punkt", odległość w mm (jednostki
// sceny Three.js SĄ milimetrami w całej appce, patrz CLAUDE.md). Markery/
// linia to zwykłe siatki w measureGroup (dodanej wprost do scene, nie do
// cabinetGroup - przeżywają update3D()), depthTest:false żeby zawsze były
// widoczne na wierzchu, niezależnie co akurat zasłania dany punkt.
export function toggleMeasureMode() {
  if (measureMode.active) exitMeasureMode(); else enterMeasureMode();
}

export function isMeasureModeActive() {
  return measureMode.active;
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
  scene.add(group);
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
function updateMeasureHover() {
  const marker = ensureHoverMarker();
  raycaster.setFromCamera(measureHoverMouse, camera);
  const targets = [cabinetGroup, roomGroup].filter(Boolean);
  const hits = targets.length ? raycaster.intersectObjects(targets, true).filter(h => !h.object.userData?.isMeasureTool) : [];

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
          const rect = renderer.domElement.getBoundingClientRect();
          const mousePx = (measureHoverMouse.x * 0.5 + 0.5) * rect.width;
          const mousePy = (-measureHoverMouse.y * 0.5 + 0.5) * rect.height;
          let bestDist = MEASURE_SNAP_PX;
          let best = null;
          corners.forEach(([x, y, z]) => {
              const v = new THREE.Vector3(x, y, z).project(camera);
              const px = (v.x * 0.5 + 0.5) * rect.width;
              const py = (-v.y * 0.5 + 0.5) * rect.height;
              const d = Math.hypot(px - mousePx, py - mousePy);
              if (d < bestDist) { bestDist = d; best = new THREE.Vector3(x, y, z); }
          });
          if (best) { point = best; snapped = true; }
      }
  }

  measureHoverPoint = point;
  measureHoverSnapped = snapped;
  marker.position.copy(point);
  marker.getObjectByName('freeDot').visible = !snapped;
  const ring = marker.getObjectByName('snapRing');
  ring.visible = snapped;
  if (snapped) ring.lookAt(camera.position); // pierścień płaski w swojej płaszczyźnie - obróć do kamery jak billboard
  marker.visible = true;
}

function ensureMeasureBanner() {
  if (measureMode.banner) return measureMode.banner;
  const banner = document.createElement('div');
  Object.assign(banner.style, {
      position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#f59e0b', color: 'white', padding: '12px 24px', borderRadius: '8px',
      fontWeight: 'bold', zIndex: '2000', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '15px', fontFamily: 'sans-serif', fontSize: '14px'
  });
  const textSpan = document.createElement('span');
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Zamknij miarkę';
  Object.assign(closeBtn.style, { background: 'white', color: '#b45309', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
  closeBtn.onclick = (e) => { e.stopPropagation(); exitMeasureMode(); };
  banner.appendChild(textSpan);
  banner.appendChild(closeBtn);
  banner._textSpan = textSpan;
  (container || document.body).appendChild(banner);
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
function handleMeasureClick() {
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
      const distMm = Math.round(measureMode.pointA.distanceTo(point));
      setMeasureBannerText(`Odległość: ${distMm} mm — kliknij, żeby zmierzyć od nowa`);
      measureMode.pointA = null;
  }
}

export function enterAlignMode(mod, el) {
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
      <span><i class="ti ti-magnet" aria-hidden="true"></i> Kliknij na scenie wieniec lub półkę innej szafki, do której chcesz wyrównać...</span>
      <button style="background:white; color:#0ea5e9; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Anuluj</button>
  `;

  banner.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      exitAlignMode();
  };

  // NAPRAWA: 'viewer-3d-container' nie istnieje w DOM (jedyny prawdziwy kontener
  // to '#editor-3d-container', patrz init3DViewer) - appendChild na null rzucał
  // błąd i tryb wyrównania nigdy nie pokazywał banera. Ta funkcja jest teraz
  // wołana tylko gdy widok 3D jest aktywny (patrz ui/interiorEditor.js), więc
  // `container` (moduł-scope, ustawiany w init3DViewer) jest zawsze widoczny.
  (container || document.body).appendChild(banner);
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

// Szuka w drzewie stref (core/zoneTree.js) węzła "split", którego dzielnik to
// dokładnie ten element (po id) - potrzebne, żeby wyrównanie międzymodułowe
// (enterAlignMode) mogło przesunąć półkę przez moveSplit() zamiast bezpośrednio
// nadpisywać el.y, co pozwalało wypchnąć ją poza bezpieczny zakres (patrz NAPRAWA
// przy alignMode.active niżej).
function findDividerNode(node, el) {
  if (!node) return null;
  if (node.type === 'split') {
    if (node.divider.id === el.id) return node;
    return findDividerNode(node.a, el) || findDividerNode(node.b, el);
  }
  return null;
}

function handle3DClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (measureMode.active) {
      // Przelicz punkt/snap DOKŁADNIE z współrzędnych tego kliknięcia zamiast
      // polegać na ostatnim zdarzeniu mousemove (mogło nie zdążyć się odpalić
      // tuż przed kliknięciem - dawało nieprecyzyjny/nieaktualny punkt,
      // zgłoszona prośba o precyzję).
      measureHoverMouse.copy(mouse);
      updateMeasureHover();
      handleMeasureClick();
      return;
  }

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cabinetGroup.children, true);

  let validHit = null;
  let data = null;

  for (let i = 0; i < intersects.length; i++) {
      const obj = intersects[i].object;
      if (obj.userData && (obj.userData.moduleId || obj.userData.sidePanelId)) {
          validHit = intersects[i];
          data = obj.userData;
          break;
      }
  }

  if (!validHit) {
      if (!event.shiftKey) {
          state.activeModuleId = null;
          state.activeSidePanelId = null;
          if (state.selectedModules) state.selectedModules.clear();
          updateSidebar();
          initPropertiesPanel();
          update3D();
      }
      return;
  }

  // Bok dokładany (core/state.js: addSidePanel) - w v1 klik go tylko zaznacza
  // (edycja pozycji/wymiarów wyłącznie liczbowo w panelu bocznym), bez trybu
  // przeciągania czy menu kontekstowego, jak przy module.
  if (data.sidePanelId && !data.moduleId) {
      state.activeSidePanelId = data.sidePanelId;
      state.activeModuleId = null;
      if (state.selectedModules) state.selectedModules.clear();
      updateSidebar();
      initPropertiesPanel();
      update3D();
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
              // NAPRAWA: samo `sourceEl.y = newLocalY` pozwalało wyrównać półkę
              // tak blisko góry/dołu szafki, że zoneTree.js przestawało ją
              // rozpoznawać jako prawidłowy podział (traciła "widoczność" we
              // Wnętrzu 2D, mimo że dane w mod.elements zostawały). moveSplit
              // z tego samego pliku co Wnętrze 2D pilnuje tego samego, bezpiecznego
              // zakresu (MIN_GAP) i przelicza resztę wnęki spójnie.
              const tree = buildZoneTree(sourceMod);
              const node = findDividerNode(tree, alignMode.sourceEl);
              if (node) {
                  moveSplit(sourceMod, node, newLocalY);
              } else {
                  alignMode.sourceEl.y = newLocalY;
              }
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
              state.activeSidePanelId = null;
              updateSidebar();
              initPropertiesPanel();
              update3D();
          }
      }
  }
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

function addBox(w, h, d, x, y, z, type, isActiveModule, userData = null, parentGroup, rotationY = 0) {
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
  // Front skośny narożnika (render/viewer3d.js: renderCornerCabinet) to
  // jedyny element, który nie leży płasko na ścianie modułu - obracamy go
  // wokół WŁASNEGO środka (już ustawionego wyżej), reszta wywołań nie
  // podaje rotationY (domyślnie 0) i zachowuje się identycznie jak dotąd.
  if (rotationY) mesh.rotation.y = rotationY;

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

// Panel wieńca narożnika (obrys L ze ściętym rogiem) - jedyna geometria w
// całej aplikacji, która nie jest zwykłym prostopadłościanem (patrz
// render/viewer3d.js: renderCornerCabinet). `shape` to THREE.Shape w
// płaszczyźnie XY (x=lokalny X modułu, y=lokalny Z modułu) - obracamy
// wytłoczoną geometrię o -90° wokół X, żeby leżała płasko (grubość w Y),
// zamiast stać pionowo jak domyślna ekstruzja.
function addCornerPanel(shape, thickness, y, isActiveModule, userData, parentGroup) {
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

// Szafka narożna, kąt prosty (mod.type === 'corner_cabinet', patrz core/
// state.js: addCornerModule) - PIERWSZY nieprostokątny moduł w aplikacji.
// Zgłoszona korekta: pierwsza wersja miała ścięty, skośny narożnik/front -
// docelowo ma to być ostry kąt 90° (typowy "narożnik ślepy") z dwoma
// zwykłymi, prostymi frontami, po jednym na ramię, bez żadnego skosu.
// Lokalny układ (przed position/rotation, jak w generycznej ścieżce
// modułu wyżej): origin w wewnętrznym rogu (styk dwóch ścian), +X wzdłuż
// ramienia A (dimensions.width=legA), +Z wzdłuż ramienia B
// (dimensions.legB). Fronty (mod.elements, rozróżnione przez
// front.cornerArm - dziś dowolnie wiele na ramię, patrz core/zoneTree.js:
// assignFront z opts.cornerArm) przechodzą przez ZWYKŁY recalculateLayout/
// calculateHinges bez żadnych zmian (patrz core/layout.js:
// getCornerArmRect) - są fizycznie płaskimi prostokątami, tylko inaczej
// tu pozycjonowanymi niż w prostokątnym module.
function renderCornerCabinet(mod, isActive, th) {
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  // Każde ramię ma WŁASNĄ głębokość (core/layout.js: getCornerDepths) -
  // zgłoszona korekta, wcześniej jedna wspólna "depth" dla obu ramion.
  // depthA mierzona wzdłuż Z (głębokość ramienia A, biegnącego wzdłuż X),
  // depthB wzdłuż X (głębokość ramienia B, biegnącego wzdłuż Z).
  const { depthA, depthB } = getCornerDepths(mod);
  const H = parseFloat(mod.dimensions.height) || 720;

  let baseOffsetY = 0;
  if (mod.legs && mod.legs.active) baseOffsetY = parseFloat(mod.legs.height) || 100;

  const { worldW, worldD } = getWorldFootprint(mod);

  const modGroup = new THREE.Group();
  modGroup.userData = { moduleId: mod.id };
  modGroup.position.set(
      (parseFloat(mod.position.x) || 0) + worldW / 2,
      (parseFloat(mod.position.y) || 0) + baseOffsetY + H / 2,
      (parseFloat(mod.position.z) || 0) + worldD / 2
  );
  modGroup.rotation.y = -((parseFloat(mod.rotation) || 0) * Math.PI / 180);

  const innerGroup = new THREE.Group();
  innerGroup.position.set(-legA / 2, -H / 2 - baseOffsetY, -legB / 2);
  modGroup.add(innerGroup);

  const posY = baseOffsetY;
  const udCorp = { moduleId: mod.id, type: 'corpus' };
  const udBack = { moduleId: mod.id, type: 'corpus', part: 'back' };

  // --- Boki (2, na zewnętrznym końcu każdego ramienia) ---
  // Skrócone od tyłu o backThick (jak w zwykłym module przy plecach
  // "nakładane" - core/layout.js/viewer3d.js: sideD = D - backThick) - inaczej
  // płyta plecy siedziałaby WEWNĄTRZ pełnego zasięgu boków (wyglądałoby jak
  // wpuszczane), a nie jako osobna płyta przykładana na zamkniętą od tyłu
  // krawędź boków.
  const backThick = 3;
  addBox(th, H, depthA - backThick, legA - th, posY, backThick, 'corpus', isActive, udCorp, innerGroup);
  addBox(depthB - backThick, H, th, backThick, posY, legB - th, 'corpus', isActive, udCorp, innerGroup);

  // --- Wieniec dolny/górny: obrys L, ostry kąt 90° (bez ścięcia) ---
  // THREE.Shape rysuje w płaszczyźnie XY, a addCornerPanel obraca wytłoczoną
  // geometrię o -90° wokół X, żeby leżała płasko - ten obrót mapuje lokalny
  // Y kształtu na ŚWIATOWE -Z, więc podajemy tu od razu -Z (drugi argument
  // lineTo), żeby po obrocie wylądować na +Z, zgodnie z resztą lokalnego
  // układu (boki/plecy liczone są dla Z rosnącego w stronę pokoju).
  // Narożny "kwadrat" (a od teraz prostokąt, gdy depthA≠depthB) ma rogi
  // (depthB, depthA) - X-owa krawędź wcięcia wyznaczona jest przez głębokość
  // DRUGIEGO ramienia (B), bo to ono fizycznie sięga aż tam wzdłuż X (i
  // odwrotnie dla Z/depthA) - patrz core/layout.js: getCornerArmRect,
  // komentarz przy otherDepth.
  // Zewnętrzne krawędzie (X=legA, Z=legB) pomniejszone o th - wieniec/półka
  // siedzi MIĘDZY bokami (boki przelotowe, jak addBox wyżej: bok A kończy
  // się na X=legA-th, bok B na Z=legB-th), a nie na całej szerokości
  // korpusu (zgłoszona korekta - patrz engine/cabinet.js:
  // getCornerCorpusParts, wieniecA/wieniecB).
  const wieniecA = legA - th;
  const wieniecB = legB - th;
  const shape = new THREE.Shape();
  // Tył wieńca/półki (obie ściany) cofnięty o grubość pleców (backThick) -
  // wymiar głębokości (np. 513) liczy się Z plecami, sama formatka jest o
  // grubość pleców krótsza (510), jak wieniec zwykłej szafki: depth - backThick.
  shape.moveTo(backThick, -backThick);
  shape.lineTo(wieniecA, -backThick);
  shape.lineTo(wieniecA, -depthA);
  shape.lineTo(depthB, -depthA);
  shape.lineTo(depthB, -wieniecB);
  shape.lineTo(backThick, -wieniecB);
  shape.closePath();
  addCornerPanel(shape, th, posY, isActive, udCorp, innerGroup);
  addCornerPanel(shape, th, posY + H - th, isActive, udCorp, innerGroup);

  // --- Półki narożne (typ:'poziom-narozny', ui/cornerConfigModal.js) ---
  // Ten sam obrys L co wieniec wyżej (addCornerPanel/shape) - w realnej
  // stolarce półka w szafce narożnej jest w kształcie L, wspólna dla obu
  // ramion na danej wysokości, NIE dwiema niezależnymi prostymi półkami
  // (zgłoszona korekta - patrz engine/cabinet.js: getCornerCorpusParts).
  // Listwa narożna (niżej) stoi WEWNĄTRZ korpusu między wieńcami, więc półka
  // ma w tylnym rogu wycięcie battenW×th na tę listwę (zgłoszona korekta).
  const battenW = 100;
  const shelfShape = new THREE.Shape();
  // Listwa stoi ZA plecami (plecy przybijane do niej od zewnątrz): zajmuje
  // X:[backThick, backThick+battenW], Z:[backThick, backThick+th] - wycięcie w
  // półce to dokładnie battenW×th.
  shelfShape.moveTo(backThick, -(backThick + th));
  shelfShape.lineTo(backThick + battenW, -(backThick + th));
  shelfShape.lineTo(backThick + battenW, -backThick);
  shelfShape.lineTo(wieniecA, -backThick);
  // Przód półki cofnięty o 5 mm względem wieńca - tak samo jak zwykła półka
  // ruchoma (engine/cabinet.js: getInteriorParts, innerPartDepth - 5).
  const shelfSetback = 5;
  shelfShape.lineTo(wieniecA, -(depthA - shelfSetback));
  shelfShape.lineTo(depthB - shelfSetback, -(depthA - shelfSetback));
  shelfShape.lineTo(depthB - shelfSetback, -wieniecB);
  shelfShape.lineTo(backThick, -wieniecB);
  shelfShape.closePath();
  (mod.elements || []).forEach(el => {
      if (el.typ !== 'poziom-narozny') return;
      const udShelf = { moduleId: mod.id, type: 'shelf', elementId: el.id };
      addCornerPanel(shelfShape, th, posY + (parseFloat(el.y) || 0), isActive, udShelf, innerGroup);
  });

  // --- Listwa narożna pionowa (w tylnym, wewnętrznym rogu) ---
  // Zgłoszona korekta: dwie płyty plecy (HDF) osobno nie mają się do czego
  // przykleić w rogu, gdzie się stykają - płaska listwa 18(gr.)×100(szer.),
  // przykręcona płasko do ściany ramienia A (Z=0), do której mocują się obie
  // płyty plecy. Wysokość H-2*th: siedzi MIĘDZY wieńcami (nie przechodzi
  // przez nie), a półki opierają się na podpórkach wierconych w niej.
  addBox(battenW, H - th * 2, th, backThick, posY + th, backThick, 'corpus', isActive, udCorp, innerGroup);

  // --- Plecy (2, cienkie płyty HDF "nakładane" - przykręcone płasko na
  // skróconą od tyłu krawędź boków, patrz boki wyżej) ---
  addBox(legA - th - backThick, H, backThick, backThick, posY, 0, 'hdf', isActive, udBack, innerGroup);
  addBox(backThick, H, legB - th - backThick, 0, posY, backThick, 'hdf', isActive, udBack, innerGroup);

  // --- Fronty: zwykłe, płaskie drzwi/szuflady, dowolnie wiele na ramię ---
  // (od wprowadzenia edytora wnętrza per ramię, ui/cornerConfigModal.js,
  // ramię może mieć więcej niż jeden front - core/zoneTree.js: assignFront
  // z opts.cornerArm).
  //
  // Te same zasady co front zwykłego modułu (generyczna ścieżka niżej w tym
  // pliku, zmienna zForFront) - zgłoszona korekta, wcześniej front narożnika
  // siedział sztywno w linii z licem korpusu (Z=depthA/X=depthB), bez
  // zapasu montażowego i bez rozróżnienia nakładane/wpuszczane:
  //   nakładane (domyślne) - front 2mm PRZED licem korpusu (miejsce na
  //     domykanie się drzwi na zawiasach bez ocierania o bok).
  //   wpuszczane - front cofnięty o własną grubość (th), w linii z bokami.
  const frontCfg = { ...(state.project.front || {}), ...(mod.front || {}) };
  const isInsetFront = frontCfg.type === 'wpuszczane';
  const frontZA = isInsetFront ? depthA - th : depthA + 2; // czoło ramienia A (Z)
  const frontZB = isInsetFront ? depthB - th : depthB + 2; // czoło ramienia B (X)

  (mod.elements || []).forEach(front => {
      if (front.typ !== 'front') return;
      const fw = parseFloat(front.w) || 0;
      const fh = parseFloat(front.h) || 0;
      const fx = parseFloat(front.x) || 0;
      const fy = parseFloat(front.y) || 0;
      const udFront = { moduleId: mod.id, type: 'front', frontId: front.id };

      if (front.cornerArm === 'A') {
          // Ramię A biegnie wzdłuż +X, front na jego czole: lokalny front.x
          // (0..widthA) mapuje się na X = depthB + front.x (bieg ramienia A
          // zaczyna się dopiero za narożnym prostokątem, którego szerokość w
          // X wyznacza głębokość DRUGIEGO ramienia - depthB).
          addBox(fw, fh, th, depthB + fx, posY + fy, frontZA, 'front', isActive, udFront, innerGroup);
      } else {
          // Ramię B biegnie wzdłuż +Z, front na jego czole: lokalny front.x
          // (0..widthB) mapuje się na Z = depthA + front.x.
          addBox(th, fh, fw, frontZB, posY + fy, depthA + fx, 'front', isActive, udFront, innerGroup);
      }
  });

  // --- Półki/przegrody wewnątrz ramion (poziom/pion z cornerArm) ---
  // Ten sam lokalny układ 2D (x wzdłuż ramienia, y = wysokość) co fronty
  // wyżej, tylko rozciągnięte na całą głębokość WŁASNEGO ramienia (jak
  // shelfDepth w generycznej ścieżce renderowania niżej w tym pliku), a nie
  // tylko o grubość th jak front. Głębokość liczona od płyty pleców
  // (backThick) do tuż przed czołem frontu (-2mm), żeby nie kolidować z
  // drzwiami - osobno dla każdego ramienia (depthA/depthB).
  const armInnerDepthA = Math.max(10, depthA - 2 - backThick);
  const armInnerDepthB = Math.max(10, depthB - 2 - backThick);
  (mod.elements || []).forEach(el => {
      if (el.typ !== 'poziom' && el.typ !== 'pion') return;
      if (el.cornerArm !== 'A' && el.cornerArm !== 'B') return;
      const ex = parseFloat(el.x) || 0;
      const ey = parseFloat(el.y) || 0;
      const ew = parseFloat(el.w) || 0;
      const eh = parseFloat(el.h) || 0;
      const udShelf = { moduleId: mod.id, type: 'shelf', elementId: el.id };

      if (el.cornerArm === 'A') {
          addBox(ew, eh, armInnerDepthA, depthB + ex, posY + ey, backThick, 'shelf', isActive, udShelf, innerGroup);
      } else {
          addBox(armInnerDepthB, eh, ew, backThick, posY + ey, depthA + ex, 'shelf', isActive, udShelf, innerGroup);
      }
  });

  // --- Nóżki (5 - jedna wspólna w tylnym rogu + po dwie na końcach każdego
  // ramienia) ---
  // Obrys L ma 5 wypukłych (nie wklęsłych) narożników podłogi - dokładnie
  // tyle, ile nóżek widać na zdjęciu referencyjnym (core/state.js:
  // addCornerModule). Wklęsły róg przy froncie (X=depth,Z=depth) nóżki nie
  // dostaje - nie ma tam żadnego materiału korpusu nad podłogą. Rozstaw 30×30,
  // wcięcie 50mm od krawędzi - identycznie jak przy zwykłym module niżej.
  if (mod.legs && mod.legs.active) {
      const legH = parseFloat(mod.legs.height) || 100;
      const rootY = 0.5;
      const udLeg = { moduleId: mod.id, type: 'plinth' };
      addBox(30, legH, 30, 50, rootY, 50, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, legA - 80, rootY, 50, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, legA - 80, rootY, depthA - 80, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, 50, rootY, legB - 80, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, depthB - 80, rootY, legB - 80, 'corpus', false, udLeg, innerGroup);
  }

  cabinetGroup.add(modGroup);
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

      // Szafka narożna (mod.type === 'corner_cabinet', core/state.js:
      // addCornerModule) ma zupełnie inną, nieprostokątną geometrię -
      // osobna, w pełni odizolowana ścieżka renderowania (nie dotyka
      // generycznego W/H/D/innerGroup poniżej, które zakłada jeden
      // prostokątny korpus).
      if (mod.type === 'corner_cabinet') {
          renderCornerCabinet(mod, mod.id === state.activeModuleId, th);
          return;
      }

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

                  // Mocowanie na kołek+wkręt (patrz core/zoneTree.js: toggleStructural) -
                  // analogicznie do konstrukcyjnej półki (wyżej, oś X przez bok), tylko
                  // obrócone o 90°: wkręt/kołek idzie PIONOWO (oś 'y') przez wieniec/półkę
                  // nad i pod przegrodą, w jej własną krawędź (el.y i el.y+el.h - to, co
                  // faktycznie tam jest, korpus albo sąsiednia półka, wynika już z tego,
                  // że pion zawsze w pełni rozpina swoją wnękę, patrz core/zoneTree.js).
                  if (isXrayMode && el.isStructural) {
                      const frontHoleZ = (posZ + D - 2) - 37;
                      const rearHoleZ = innerZ + 37;
                      const holeZs = [frontHoleZ, rearHoleZ];

                      const bottomHoleY = posY + el.y - th/2;
                      const topHoleY = posY + el.y + el.h + th/2;
                      const holeX = posX + el.x + el.w / 2;

                      holeZs.forEach(hz => {
                          const dowelZ = hz === frontHoleZ ? hz - 32 : hz + 32;
                          addHole(1.5, th, holeX, bottomHoleY, hz, 'y', innerGroup);
                          addHole(1.5, th, holeX, topHoleY, hz, 'y', innerGroup);
                          addHardware('screw', holeX, bottomHoleY, hz, 'y', innerGroup);
                          addHardware('screw', holeX, topHoleY, hz, 'y', innerGroup);

                          addHole(4.0, th, holeX, bottomHoleY, dowelZ, 'y', innerGroup);
                          addHole(4.0, th, holeX, topHoleY, dowelZ, 'y', innerGroup);
                          addHardware('dowel', holeX, bottomHoleY, dowelZ, 'y', innerGroup);
                          addHardware('dowel', holeX, topHoleY, dowelZ, 'y', innerGroup);
                      });
                  }
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
                          // NAPRAWA: jak przy dY niżej - korekta "dolnego frontu" w
                          // calculateDrawerHoles ma sens tylko dla frontu nakładanego,
                          // zjeżdżającego na wieniec dolny. Front wpuszczany ma już
                          // poprawne el.y liczone od wnętrza (core/layout.js). Sprawdzamy
                          // geometrię (baseZone.minY ~ th), nie tag "boundBottom" - starsze
                          // projekty (import AI) budują baseZone bez tego taga wcale.
                          const isBottomOuter = el.baseZone && parseFloat(el.baseZone.minY) <= th + 0.5;
                          const dHoles = calculateDrawerHoles(sysName, el.y, simulatedSpace, th, el.frontIndex, isBottomInZone && isBottomOuter && !isInsetFront);
                          
                          // NAPRAWA: el.w to szerokość FRONTU (kurczy się dla wpuszczanego,
                          // patrz core/layout.js - front wpuszczany nie "zjeżdża" na boki o
                          // grubość płyty jak nakładany). Realne dno/tył szuflady liczone są
                          // od szerokości KORPUSU (engine/cabinet.js: width - board*2), stałej
                          // niezależnie od stylu frontu - użycie tu el.w rysowało węższe pudło
                          // szuflady w 3D niż w rzeczywistej liście formatek dla frontu
                          // wpuszczanego, mimo że cutlist się nie zmieniał.
                          const innerWidth = W - (th * 2);
                          
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

                              // NAPRAWA: analogicznie do innerWidth wyżej - el.x to lewa krawędź
                              // FRONTU, która też przesuwa się między nakładanym a wpuszczanym
                              // (core/layout.js). Pudło szuflady centrujemy względem wnętrza
                              // KORPUSU (posX + th), nie względem frontu, żeby się nie przesuwało
                              // w bok przy samej zmianie stylu frontu.
                              const dX = posX + th + (innerWidth - dw) / 2;

                              // NAPRAWA: dno szuflady ma siedzieć tuż nad wieńcem dolnym korpusu
                              // (albo tuż nad frontem szuflady niżej w stosie), nie kilkanaście mm
                              // wyżej. Poprzednia wersja liczyła to od wysokości otworu montażowego
                              // prowadnicy (dHoles) pomniejszonej o stałe 33.5mm — ta liczba to w
                              // rzeczywistości pozycja śrub mocujących FRONT (frontHolesBase z
                              // core/drawerSystems.js), skopiowana tu przez pomyłkę i bez związku
                              // z wysokością samej prowadnicy. Efekt: szuflada renderowała się
                              // zawyżona względem realnie dostępnego miejsca w korpusie.
                              //
                              // NAPRAWA 2: korekta "+th" ma sens TYLKO gdy front na dole stosu jest
                              // nakładany na wieniec dolny (wtedy el.y sam w sobie jest zaniżone o
                              // th-luz, bo front "zjeżdża" na wieniec — patrz core/layout.js, gałąź
                              // isBottomOuter) — pudło szuflady i tak siedzi na wieńcu, niezależnie
                              // od stylu frontu. Front wpuszczany NIE zjeżdża na wieniec (el.y jest
                              // już poprawne, liczone od wnętrza), więc doliczanie tu drugi raz "th"
                              // podnosiło samo pudło o całą grubość płyty ponad realną pozycję —
                              // widoczne w 3D jako "unosząca się" szuflada przy zmianie frontu na
                              // wpuszczany, mimo że wymiary formatek (cutlist) się nie zmieniały.
                              // (isBottomOuter policzone wyżej, przy dHoles - ten sam front/wnęka)
                              const dY = posY + el.y + (isBottomInZone && isBottomOuter && !isInsetFront ? th : 0);

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

  // Boki dokładane (core/state.js: addSidePanel) - samodzielne, płaskie
  // obiekty projektu (NIE dzieci żadnego modGroup, jak blenda), bo mają
  // obejmować kilka modułów naraz i sięgać niezależnie od podłogi do sufitu.
  // Ta sama sztuczka co przy module: position.x/z to róg FAKTYCZNEGO odcisku
  // po uwzględnieniu obrotu (getWorldFootprint działa na tym obiekcie bez
  // zmian, bo ma ten sam kształt dimensions/rotation co moduł).
  if (isFrontsVisible) {
      (state.project.sidePanels || []).forEach(panel => {
          const isActiveSide = panel.id === state.activeSidePanelId;
          const { worldW, worldD } = getWorldFootprint(panel);
          const x = parseFloat(panel.position?.x) || 0;
          const y = parseFloat(panel.position?.y) || 0;
          const z = parseFloat(panel.position?.z) || 0;
          const H = parseFloat(panel.dimensions?.height) || 0;
          const W = parseFloat(panel.dimensions?.width) || 18;
          const D = parseFloat(panel.dimensions?.depth) || 600;

          const panelGroup = new THREE.Group();
          panelGroup.userData = { sidePanelId: panel.id };
          panelGroup.position.set(x + worldW / 2, y + H / 2, z + worldD / 2);
          panelGroup.rotation.y = -((parseFloat(panel.rotation) || 0) * Math.PI / 180);

          addBox(W, H, D, -W / 2, -H / 2, -D / 2, 'front', isActiveSide, { sidePanelId: panel.id }, panelGroup);

          cabinetGroup.add(panelGroup);
      });
  }
}