// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { state, DEFAULT_ROOM, frontBodyGap } from '../core/state.js';

import { getDrawerComponents, calculateDrawerHoles } from '../core/drawerMath.js';
import { drawerSystems } from '../core/drawerSystems.js';
import { calculateHinges } from '../core/hingeMath.js';
import { recalculateLayout, getTraverseConfig, getWorldFootprint, clampModuleToRoom, getModuleBox } from '../core/layout.js';
import { buildZoneTree, moveSplit } from '../core/zoneTree.js';
import { scheduleCheckpoint } from '../core/history.js';
import { toggleInteriorEditor, renderInteriorEditorIfVisible } from '../ui/interiorEditor.js';

import { updateSidebar } from '../ui/sidebar.js';
import { worktopBoxes } from '../core/worktops.js';
import { getOpenings, openingBox } from '../core/openings.js';
import { snapSidePanel } from '../core/sidePanelSnap.js';
import { snapModulePosition, sweepSelection, boxesOverlap, getSidePanelBox } from '../core/moduleDrag.js';
import { refreshModuleInfoCard } from '../ui/moduleInfoPanel.js';
import { initPropertiesPanel } from '../ui/properties.js';
import { mats, worktopMat, disposeObject, createLabelSprite, addBox, addHole, addHardware, isXrayMode, setXrayMode } from './meshBuilders.js';
import { renderCornerCabinet } from './cornerCabinet3d.js';
import { renderSlopeCabinet } from './slopeCabinet3d.js';
import { getBlindPanel } from '../core/blindCorner.js';
import { initMeasureTool, isMeasureActive, setMeasureButton, toggleMeasureMode, updateMeasureHover, handleMeasureClick, measureHoverMouse } from './measureTool.js';
import { showAlert } from "../utils/modal.js";

let alignMode = { active: false, sourceMod: null, sourceEl: null, banner: null };
let isFrontsVisible = true;
// Etykiety z nazwami szafek unoszące się nad każdą z nich w 3D (zgłoszona
// potrzeba: przy wielu modułach nie dało się z widoku poznać, która szafka to
// która, bez klikania każdej po kolei) - stan zapamiętany, żeby nie trzeba było
// włączać na nowo po każdym przeładowaniu strony.
let showLabels = true;
try { showLabels = localStorage.getItem('viewerShowLabels') !== '0'; } catch (e) {}
let labelsGroup;

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
const sidePanelNdcShift = new THREE.Vector2(); // przesunięcie kursora względem podstawy boku (patrz pointerdown)
const SNAP_DIST = 40;
let dragSelectionOrigins = new Map();
let dragStartOverlaps = new Set(); // szafki, na które zaznaczenie nachodziło już przed przeciąganiem
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

// Wszystko, na czym zatrzymuje się przeciągane zaznaczenie szafek: pozostałe
// szafki oraz boki dokładane i blendy (project.sidePanels) - [{ id, box }].
function getDragObstacles() {
  const sel = state.selectedModules || new Set();
  return [
    ...state.project.modules.filter(m => !sel.has(m.id)).map(m => ({ id: m.id, box: getModuleBox(m) })),
    ...(state.project.sidePanels || []).map(p => ({ id: p.id, box: getSidePanelBox(p) })),
  ];
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

  // Okna, drzwi i przeszkody (project.openings, core/openings.js) - cienkie bryły
  // przy wewnętrznej ścianie. Trafiają na listę wallMeshes, więc przygasają razem
  // ze swoją ścianą, gdy kamera patrzy zza niej.
  const OPENING_COLORS = { okno: 0x93c5fd, drzwi: 0xb7791f, inne: 0x9ca3af };
  getOpenings(state.project).forEach(op => {
    const b = openingBox(op, { width: W, depth: D });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.sx, b.sy, b.sz),
      new THREE.MeshStandardMaterial({ color: OPENING_COLORS[op.kind] || 0x93c5fd, roughness: 0.6, metalness: 0, transparent: true, opacity: 1 })
    );
    mesh.position.set(b.cx, b.cy, b.cz);
    roomGroup.add(mesh);
    wallMeshes.push({ mesh, normal: new THREE.Vector3(b.normal[0], b.normal[1], b.normal[2]) });
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

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 100000);
  camera.position.set(2500, 1500, 3500); // nadpisane zaraz po utworzeniu controls przez reframeCameraToRoom()

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true }); // log. bufor głębi: bliska płaszczyzna 1 mm bez migotania krawędzi przy zbliżeniach
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // ekrany 3x+ nie potrzebują 9-krotnej liczby pikseli
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
  if (import.meta.env && import.meta.env.DEV) window.__gsn = { renderer, scene, camera }; // tylko dev: podgląd statystyk renderera w konsoli

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1; // 0.05 dawało "ślizganie" widoku po puszczeniu myszy
  // Jak w SketchUp/Blenderze: środkowy przycisk obraca (z Shift przesuwa), prawy przesuwa,
  // kółko przybliża. Lewy przycisk zostaje dla zaznaczania i przeciągania szafek.
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  // Zbliżanie do detali (łączenia, okucia): zoom w kierunku kursora, prawie do styku
  // i szybsze kółko - wcześniej kamera zatrzymywała się daleko, a bliska płaszczyzna
  // 10 mm ucinała szczegóły.
  controls.zoomToCursor = true;
  controls.zoomSpeed = 1.6;
  controls.minDistance = 20;

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

  initMeasureTool({ scene, camera, renderer, container, raycaster, getTargets: () => [cabinetGroup, roomGroup] });

  // Etykiety nazw szafek - osobna grupa DOTAJĘTA WPROST DO SCENE (nie do
  // cabinetGroup), z tego samego powodu co grupa miarki (render/measureTool.js): żeby samo
  // pokazanie/ukrycie etykiet (toggleLabelsBtn niżej) mogło przełączyć tylko
  // .visible bez pełnego update3D(). Zawartość i tak jest przebudowywana przy
  // każdym update3D() razem z cabinetGroup (patrz tam), bo pozycje/nazwy mogły
  // się zmienić.
  labelsGroup = new THREE.Group();
  labelsGroup.visible = showLabels;
  scene.add(labelsGroup);

  reframeCameraToRoom();

  renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos.set(e.clientX, e.clientY);
      if (alignMode.active || isMeasureActive()) return;

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
              dragStartOverlaps = new Set();
              const selBoxes = state.project.modules.filter(m => state.selectedModules.has(m.id)).map(getModuleBox);
              getDragObstacles().forEach(o => {
                  if (selBoxes.some(sb => boxesOverlap(sb, o.box))) dragStartOverlaps.add(o.id);
              });

              dragTarget = cabinetGroup.children.find(g => g.userData.moduleId === dragModule.id);
          } else if (group.userData && group.userData.sidePanelId) {
              dragSidePanel = state.project.sidePanels.find(p => p.id === group.userData.sidePanelId);
              if (dragSidePanel) {
                  isDraggingSidePanel = true;
                  controls.enabled = false;

                  // Płaszczyzna przeciągania boku leży na jego PODSTAWIE (poziom y boku), nie na
                  // wysokości klikniętego punktu: bok ma 2,6 m, więc złapany wysoko dawał
                  // płaszczyznę prawie równoległą do kierunku patrzenia i kilkumilimetrowy
                  // ruch myszy przesuwał go o metry.
                  const normal = new THREE.Vector3(0, 1, 0);
                  dragPlane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, parseFloat(dragSidePanel.position.y) || 0, 0));

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

                  // Ruch myszy liczymy względem EKRANOWEJ pozycji podstawy boku: zapamiętujemy,
                  // o ile kursor (złapany np. wysoko na boku) jest przesunięty względem
                  // podstawy, i przy przeciąganiu tnie promień przez podstawę leżącą na podłodze.
                  // Dzięki temu podstawa boku jedzie 1:1 za kursorem, a płaszczyzna nie jest
                  // prawie równoległa do promienia (bok złapany za górę skakał o metry).
                  const basePoint = new THREE.Vector3(dragSidePanelTarget.position.x, parseFloat(dragSidePanel.position.y) || 0, dragSidePanelTarget.position.z);
                  const baseNdc = basePoint.clone().project(camera);
                  sidePanelNdcShift.set(baseNdc.x - mouse.x, baseNdc.y - mouse.y);
                  dragOffset.set(0, 0, 0);
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

          mouse.add(sidePanelNdcShift);
          raycaster.setFromCamera(mouse, camera);

          const intersect = new THREE.Vector3();
          if (!raycaster.ray.intersectPlane(dragPlane, intersect)) return;

          const newGroupPos = intersect.clone().add(dragOffset);
          const { worldW, worldD } = getWorldFootprint(dragSidePanel);

          // Przyciąganie do szafek (z blendami), innych boków i ścian oraz wypchnięcie
          // z korpusu - patrz core/sidePanelSnap.js.
          const snapped = snapSidePanel(dragSidePanel, newGroupPos.x - worldW / 2, newGroupPos.z - worldD / 2, state.project, SNAP_DIST);
          const snapX = snapped.x;
          const snapZ = snapped.z;

          dragSidePanel.position.x = Math.round(snapX * 100) / 100;
          dragSidePanel.position.z = Math.round(snapZ * 100) / 100;

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

          const orig = dragSelectionOrigins.get(dragModule.id);

          // Tryb pionowy (Alt): X/Z zostają PRZYPIĘTE do pozycji sprzed
          // przeciągania - liczy się tylko intersect.y z pionowej płaszczyzny
          // (patrz pointerdown wyżej). Bez tego nawet drobny poziomy ruch myszką
          // w trakcie podnoszenia/opuszczania modułu przesuwałby go też w bok.
          let snapX = (verticalDrag && orig) ? orig.x : newGroupPos.x - worldW/2;
          let snapY = newGroupPos.y - H/2 - baseOffsetY;
          let snapZ = (verticalDrag && orig) ? orig.z : newGroupPos.z - worldD/2;

          // Shift w trakcie przeciągania = ruch tylko wzdłuż jednej osi (tej, w
          // którą mysz odjechała dalej) - przesuwanie szafki wzdłuż rzędu bez
          // wypadania przed/za linię.
          let lockX = verticalDrag, lockZ = verticalDrag;
          if (!verticalDrag && e.shiftKey && orig) {
              if (Math.abs(snapX - orig.x) >= Math.abs(snapZ - orig.z)) { snapZ = orig.z; lockZ = true; }
              else { snapX = orig.x; lockX = true; }
          }

          const room = getRoom();

          // Przyciąganie do ścian i krawędzi sąsiadów (najbliższy kandydat,
          // w tym fronty równo) - core/moduleDrag.js.
          const others = state.project.modules
              .filter(o => !(state.selectedModules && state.selectedModules.has(o.id)))
              .map(o => {
                  const { worldW: oW, worldD: oD } = getWorldFootprint(o);
                  return {
                      x: parseFloat(o.position.x) || 0, y: parseFloat(o.position.y) || 0, z: parseFloat(o.position.z) || 0,
                      w: oW, d: oD, h: parseFloat(o.dimensions.height) || 720,
                  };
              });
          // Boki dokładane i blendy też przyciągają (tylko X/Z).
          (state.project.sidePanels || []).forEach(p => {
              const b = getSidePanelBox(p);
              others.push({ x: b.x0, y: b.y0, z: b.z0, w: b.x1 - b.x0, d: b.z1 - b.z0, h: b.y1 - b.y0, noY: true });
          });
          const snapped = snapModulePosition({ x: snapX, y: snapY, z: snapZ }, { w: worldW, d: worldD, h: H }, others, room, SNAP_DIST, { lockX, lockZ });
          snapX = snapped.x;
          snapY = snapped.y;
          snapZ = snapped.z;

          if (!verticalDrag) {
              snapX = Math.max(0, snapX);
              snapX = Math.min(room.width - worldW, snapX);
              snapZ = Math.max(0, snapZ);
          }
          snapY = Math.max(0, snapY);

          if (orig) {
              let deltaX = snapX - orig.x;
              let deltaY = snapY - orig.y;
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
                  const minDeltaX = -mOrig.x;
                  const maxDeltaX = Math.max(0, room.width - mW) - mOrig.x;
                  const maxDeltaZ = Math.max(0, room.depth - mD) - mOrig.z;
                  deltaX = Math.min(Math.max(deltaX, minDeltaX), maxDeltaX);
                  deltaZ = Math.min(Math.max(deltaZ, -mOrig.z), maxDeltaZ);
              });

              // Kolizje: przeciągane zaznaczenie jedzie od ostatniej pozycji
              // i zatrzymuje się na sąsiadach, a sąsiedzi stoją w miejscu
              // (core/moduleDrag.js) - wcześniej byli odpychani łańcuchowo i
              // przypadkowe szturchnięcie środkowej szafki rozjeżdżało cały rząd.
              // Przeszkodami są też boki dokładane i blendy (getDragObstacles).
              // Pomijamy szafki, na które zaznaczenie nachodziło już przed
              // przeciąganiem, żeby stare nałożenie nie blokowało ruchu.
              const prev = {
                  x: (parseFloat(dragModule.position.x) || 0) - orig.x,
                  y: (parseFloat(dragModule.position.y) || 0) - orig.y,
                  z: (parseFloat(dragModule.position.z) || 0) - orig.z,
              };
              const selectedBoxes = state.project.modules
                  .filter(m => state.selectedModules.has(m.id))
                  .map(getModuleBox);
              const otherBoxes = getDragObstacles()
                  .filter(o => !dragStartOverlaps.has(o.id))
                  .map(o => o.box);
              const swept = sweepSelection(selectedBoxes, { dx: deltaX - prev.x, dy: deltaY - prev.y, dz: deltaZ - prev.z }, otherBoxes);
              deltaX = prev.x + swept.dx;
              deltaY = prev.y + swept.dy;
              deltaZ = prev.z + swept.dz;

              state.selectedModules.forEach(id => {
                  const m = state.project.modules.find(mod => mod.id === id);
                  if (!m) return;
                  const mOrig = dragSelectionOrigins.get(id);
                  if (mOrig) {
                      m.position.x = Math.round((mOrig.x + deltaX) * 100) / 100;
                      m.position.y = Math.round((mOrig.y + deltaY) * 100) / 100;
                      m.position.z = Math.round((mOrig.z + deltaZ) * 100) / 100;

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
      if (!isMeasureActive()) return;
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
      setXrayMode(!isXrayMode);
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
  setMeasureButton(toggleMeasureBtn);

  const labelsBtnHtml = (on) => `<i class="ti ti-tag" aria-hidden="true"></i> ${on ? 'Ukryj nazwy' : 'Pokaż nazwy'}`;
  const toggleLabelsBtn = document.createElement('button');
  toggleLabelsBtn.innerHTML = labelsBtnHtml(showLabels);
  toggleLabelsBtn.title = 'Etykiety z nazwami szafek nad każdą z nich';
  toggleLabelsBtn.className = 'btn view-btn' + (showLabels ? ' active' : '');
  toggleLabelsBtn.onclick = () => {
      showLabels = !showLabels;
      try { localStorage.setItem('viewerShowLabels', showLabels ? '1' : '0'); } catch (e) {}
      toggleLabelsBtn.innerHTML = labelsBtnHtml(showLabels);
      toggleLabelsBtn.classList.toggle('active', showLabels);
      if (labelsGroup) labelsGroup.visible = showLabels;
      requestRender();
  };

  uiOverlay.appendChild(toggleBtn);
  uiOverlay.appendChild(toggleFrontsBtn);
  uiOverlay.appendChild(toggleLabelsBtn);
  uiOverlay.appendChild(toggleInteriorBtn);
  uiOverlay.appendChild(toggleMeasureBtn);
  // NAPRAWA: overlay wpięty w .center-panel (nie w #editor-3d-container), bo
  // przełącznik "Wnętrze 2D" chowa cały #editor-3d-container display:none —
  // gdyby overlay był jego dzieckiem, przycisk powrotu do 3D zniknąłby razem z nim.
  (container.parentElement || container).appendChild(uiOverlay);

  ['pointerdown', 'pointermove', 'wheel', 'keydown', 'keyup'].forEach(ev =>
    window.addEventListener(ev, () => requestRender(1200), { passive: true }));

  window.addEventListener('resize', () => {
      requestRender();
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
  });

  update3D();
  animate();
}

// Zdjęcie bieżącego widoku 3D do oferty: JPEG na białym tle (scena ma
// przezroczyste tło), do 1400 px szerokości. Renderujemy klatkę tuż przed
// odczytem, bo bez preserveDrawingBuffer bufor po prezentacji jest pusty.
export function captureViewerSnapshot(maxWidth = 1400) {
  if (!renderer) return null;
  try {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const k = Math.min(1, maxWidth / src.width);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } catch (e) {
    return null;
  }
}

// Małe "zdjęcie" pojedynczej szafki (nie całej sceny) - do miniatur na
// listach (ui/productionHub.js: Formatki grupowane wg szafki, zgłoszona
// potrzeba "realne zdjęcie 3D", nie płaski rysunek). Chwilowo: chowa
// wszystkie POZOSTAŁE szafki i ściany/podłogę, kadruje kamerę na samą
// wybraną bryłę (Box3 z jej grupy - działa identycznie dla zwykłego modułu
// i szafki narożnej, bo obie mają modGroup.userData.moduleId), renderuje
// JEDNĄ klatkę w małej rozdzielczości, odczytuje canvas, po czym przywraca
// WSZYSTKO dokładnie do stanu sprzed wywołania (widoczność, kamera,
// rozmiar bufora) - całość synchronicznie, więc użytkownik nigdy nie widzi
// pośrednich klatek ani pustego/skadrowanego widoku na żywym podglądzie.
export function captureModuleSnapshot(moduleId, size = 160) {
  if (!renderer || !scene || !camera || !controls || !cabinetGroup) return null;
  const targetGroup = cabinetGroup.children.find((g) => g.userData && g.userData.moduleId === moduleId);
  if (!targetGroup) return null;

  const box = new THREE.Box3().setFromObject(targetGroup);
  if (box.isEmpty()) return null;

  const prevCamPos = camera.position.clone();
  const prevTarget = controls.target.clone();
  const prevAspect = camera.aspect;
  // UWAGA: renderer.domElement.width/height to bufor rysowania (już razy
  // devicePixelRatio) - setSize() przyjmuje piksele CSS, więc podanie mu z
  // powrotem tamtych liczb mnożyłoby rozmiar przez DPR przy KAŻDYM
  // przywróceniu (realny bug, złapany przy weryfikacji: bufor rósł z każdym
  // kolejnym zdjęciem). container.clientWidth/Height to te same, poprawne
  // jednostki, których używa reszta tego pliku (patrz resize listener niżej).
  const prevW = container.clientWidth;
  const prevH = container.clientHeight;
  const prevRoomVisible = roomGroup ? roomGroup.visible : null;
  const prevLabelsVisible = labelsGroup ? labelsGroup.visible : null;
  const hidden = [];

  try {
    if (roomGroup) roomGroup.visible = false;
    if (labelsGroup) labelsGroup.visible = false;
    cabinetGroup.children.forEach((g) => {
      if (g !== targetGroup && g.visible) { hidden.push(g); g.visible = false; }
    });

    const center = box.getCenter(new THREE.Vector3());
    const diag = Math.max(box.getSize(new THREE.Vector3()).length(), 100);

    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.position.copy(center).add(new THREE.Vector3(0.85, 0.65, 1).normalize().multiplyScalar(diag * 1.5));
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } catch (e) {
    return null;
  } finally {
    hidden.forEach((g) => { g.visible = true; });
    if (roomGroup) roomGroup.visible = prevRoomVisible;
    if (labelsGroup) labelsGroup.visible = prevLabelsVisible;
    camera.position.copy(prevCamPos);
    controls.target.copy(prevTarget);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(prevW, prevH, false);
    renderer.render(scene, camera);
  }
}

// Render na żądanie: scena jest statyczna, dopóki użytkownik czegoś nie ruszy, więc
// nie ma sensu rysować 60-70 klatek na sekundę z cieniami w bezczynności (grzało
// kartę i zabierało zasoby przeglądarce). Klatki lecą, gdy kamera się porusza, przy
// każdej interakcji (mysz, kółko, klawisz) i po każdej przebudowie sceny; w
// bezczynności zostaje rzadki "oddech" (co ~0,5 s) na wypadek zmian bez zgłoszenia.
let renderActiveUntil = 0;
let lastIdleRender = 0;
function requestRender(ms = 1500) {
  renderActiveUntil = Math.max(renderActiveUntil, performance.now() + ms);
}
const IDLE_RENDER_MS = 500;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (controls.update()) requestRender(600); // kamera jeszcze dojeżdża (damping)
  if (now > renderActiveUntil && now - lastIdleRender < IDLE_RENDER_MS && !isMeasureActive()) return;
  lastIdleRender = now;
  updateWallVisibility();
  if (isMeasureActive()) updateMeasureHover();
  renderer.render(scene, camera);
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

  if (isMeasureActive()) {
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
              showAlert("Kliknij w element poziomy (wieniec lub półkę), a nie w pionowy bok!");
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
              showAlert("Wybrany punkt znajduje się poza zakresem wysokości tej szafki!");
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

export function update3D() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js — odświeża się tylko, gdy jest widoczny
  refreshModuleInfoCard(); // karta "Informacje o szafce" w prawym panelu - na żywo po każdej zmianie
  if (!cabinetGroup) return;

  while (cabinetGroup.children.length > 0) {
      const old = cabinetGroup.children[0];
      cabinetGroup.remove(old);
      disposeObject(old);
  }
  if (labelsGroup) {
      while (labelsGroup.children.length > 0) {
          const old = labelsGroup.children[0];
          labelsGroup.remove(old);
          disposeObject(old);
      }
  }
  requestRender();

  const th = parseFloat(state.project.materials?.boardThickness) || 18;

  state.project.modules.forEach(mod => {
      recalculateLayout(mod);

      // Szafka narożna (mod.type === 'corner_cabinet', core/state.js:
      // addCornerModule) ma zupełnie inną, nieprostokątną geometrię -
      // osobna, w pełni odizolowana ścieżka renderowania (nie dotyka
      // generycznego W/H/D/innerGroup poniżej, które zakłada jeden
      // prostokątny korpus).
      if (mod.type === 'corner_cabinet') {
          renderCornerCabinet(mod, mod.id === state.activeModuleId, th, cabinetGroup);
          return;
      }

      // Szafka pod skos (core/slopeCabinet.js) - płyty o nieprostokątnym obrysie.
      if (mod.type === 'slope_cabinet') {
          renderSlopeCabinet(mod, mod.id === state.activeModuleId, th, cabinetGroup, isFrontsVisible);
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
                  
                  // Ukryte fronty znikają, ale SKRZYNKI SZUFLAD zostają (widać wtedy, co jest za frontem);
                  // drzwi bez frontu nie mają nic do pokazania.
                  if (!isFrontsVisible && !isInternal && !el.subtype.includes('szuflada')) {
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
                      zForFront = posZ + D + frontBodyGap(modFront);
                  }
                  
                  if (isFrontsVisible || isInternal) {
                      addBox(el.w, el.h, isInternal ? innerFrontThick : 18, posX + el.x, posY + el.y, zForFront, 'front', isActive, udElement, innerGroup);
                  }

                  if (el.subtype.includes('szuflada')) {
                      if (isXrayMode || !isFrontsVisible) {
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
                          
                          // NAPRAWA: el.w to szerokość FRONTU (kurczy się dla wpuszczanego,
                          // patrz core/layout.js - front wpuszczany nie "zjeżdża" na boki o
                          // grubość płyty jak nakładany). Realne dno/tył szuflady liczone są
                          // od szerokości KORPUSU (engine/cabinet.js: width - board*2), stałej
                          // niezależnie od stylu frontu - użycie tu el.w rysowało węższe pudło
                          // szuflady w 3D niż w rzeczywistej liście formatek dla frontu
                          // wpuszczanego, mimo że cutlist się nie zmieniał.
                          const innerWidth = W - (th * 2);
                          
                          // Jak w liście formatek (engine/cabinet.js: getFrontsAndDrawers): głębokość wieńców
                          // korpusu, od niej front wewnętrzny albo grubość frontu wpuszczanego. Wcześniej stałe
                          // D - 19 dawało o stopień krótszą prowadnicę (450 zamiast 500 NL) niż formatka dna.
                          const backThickForNL = parseFloat(state.project.materials?.backThickness) || 3;
                          let availableDepth = backP.type === 'nut' ? D - backP.offset - backThickForNL : D - backThickForNL;
                          if (isInternal) {
                              availableDepth -= (innerFrontThick + innerSetback);
                          } else if (isInsetFront) {
                              availableDepth -= th;
                          }
                          
                          if (el.forceNL && !isNaN(parseFloat(el.forceNL))) {
                              availableDepth = parseFloat(el.forceNL) + 10;
                          }

                          // Pełne availableSpace, nie simulatedSpace — patrz analogiczny komentarz
                          // w engine/cabinet.js (getFrontsAndDrawers).
                          const drawerComps = getDrawerComponents(sysName, innerWidth, availableDepth, availableSpace, el.forceVariant || 'auto', el.drawerSideHeight);
                          // NL z doboru szuflady - MOVENTO ma tylne otwory prowadnicy zależne od długości.
                          const dHoles = calculateDrawerHoles(sysName, el.y, simulatedSpace, th, el.frontIndex, isBottomInZone && isBottomOuter && !isInsetFront, drawerComps ? drawerComps.nominalLength : null, el.baseZone ? (parseFloat(el.baseZone.minY) || 0) + (parseFloat(el.baseZone.offsetBottom) || 0) : null);

                          if (drawerComps && drawerComps.woodenBox) {
                              // MOVENTO: skrzynka z płyty (core/drawerMath.js) - boki na całą
                              // długość SKL, dno między bokami podniesione o wcięcie, tył i czoło
                              // wewnętrzne na dnie. Spód boków luz nad dołem wnęki.
                              const t = drawerComps.sideThickness;
                              const dw = drawerComps.bottom.width;
                              const L = drawerComps.sides.length;
                              const sH = drawerComps.sideHeight;
                              const bH = drawerComps.back.height;
                              const dX = posX + th + (innerWidth - dw) / 2;
                              const dY = posY + el.y + (isBottomInZone && isBottomOuter && !isInsetFront ? th : 0) + drawerComps.bottomClearance;
                              const bY = dY + drawerComps.bottomRecess;
                              const boxStartZ = zForFront - L;
                              addBox(t, sH, L, dX - t, dY, boxStartZ, 'drawerBox', isActive, udElement, innerGroup);
                              addBox(t, sH, L, dX + dw, dY, boxStartZ, 'drawerBox', isActive, udElement, innerGroup);
                              addBox(dw, t, L, dX, bY, boxStartZ, 'drawerBox', isActive, udElement, innerGroup);
                              addBox(dw, bH, t, dX, bY + t, boxStartZ, 'drawerBox', isActive, udElement, innerGroup);
                              addBox(dw, bH, t, dX, bY + t, zForFront - t, 'drawerBox', isActive, udElement, innerGroup);
                          } else if (drawerComps) {
                              const NL = drawerComps.nominalLength;
                              const dw = drawerComps.bottom.width;
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
                          if (dHoles && dHoles.frontHoles && (isFrontsVisible || isInternal)) {
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

      // Szafka ślepa: zaślepka części ślepej w płaszczyźnie frontów (core/blindCorner.js).
      const blindPanel = isFrontsVisible ? getBlindPanel(mod, state.project) : null;
      if (blindPanel) {
          const zBlind = isInsetFront ? posZ + D - th : posZ + D + frontBodyGap(modFront);
          addBox(blindPanel.w, blindPanel.h, 18, posX + blindPanel.x, posY + blindPanel.y, zBlind, 'front', isActive, { moduleId: mod.id, type: 'front' }, innerGroup);
      }

      if (mod.legs && mod.legs.active) {
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

      cabinetGroup.add(modGroup);
  });

  // Etykiety nazw szafek (toggleLabelsBtn niżej) - osobny, prosty przebieg po
  // modułach zamiast wpięcia w pętlę wyżej: ta pętla ma wczesny `return` dla
  // szafki narożnej (osobna, nieprostokątna ścieżka renderowania), więc
  // etykieta w środku niej zostałaby pominięta dla narożników. getWorldFootprint
  // (core/layout.js) liczy odcisk na podłodze identycznie dla obu typów (już
  // uwzględnia narożnik jako legA×legB), więc pozycja środka i wysokość górnej
  // krawędzi liczą się tu tym samym, jednym wzorem dla każdej szafki.
  if (labelsGroup) {
      state.project.modules.forEach(mod => {
          const { worldW, worldD } = getWorldFootprint(mod);
          const centerX = (parseFloat(mod.position.x) || 0) + worldW / 2;
          const centerZ = (parseFloat(mod.position.z) || 0) + worldD / 2;
          const legH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 100) : 0;
          const topY = (parseFloat(mod.position.y) || 0) + legH + (parseFloat(mod.dimensions.height) || 720);

          const label = createLabelSprite(mod.name || 'Szafka');
          label.position.set(centerX, topY + 90, centerZ);
          labelsGroup.add(label);
      });
  }

  // Boki dokładane (core/state.js: addSidePanel) - samodzielne, płaskie
  // obiekty projektu (NIE dzieci żadnego modGroup, jak blenda), bo mają
  // obejmować kilka modułów naraz i sięgać niezależnie od podłogi do sufitu.
  // Ta sama sztuczka co przy module: position.x/z to róg FAKTYCZNEGO odcisku
  // po uwzględnieniu obrotu (getWorldFootprint działa na tym obiekcie bez
  // zmian, bo ma ten sam kształt dimensions/rotation co moduł).
  if (isFrontsVisible) {
      worktopBoxes(state.project).forEach(b => {
          const w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.y1 - b.y0;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isXrayMode ? mats.xray.shelf : worktopMat);
          mesh.position.set(b.x0 + w / 2, b.y0 + h / 2, b.z0 + d / 2);
          mesh.castShadow = !isXrayMode; mesh.receiveShadow = !isXrayMode;
          mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x1f2937 })));
          cabinetGroup.add(mesh);
      });
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

          if (panel.kind === 'blenda') {
              // czoło z przodu (+Z) i kołnierz mocujący za nim, przy wskazanej krawędzi
              const ud = { sidePanelId: panel.id };
              const bth = parseFloat(state.project.materials?.boardThickness) || 18;
              addBox(W, H, bth, -W / 2, -H / 2, D / 2 - bth, 'front', isActiveSide, ud, panelGroup);
              const fl = panel.flange || 'prawa';
              const fd = D - bth;
              if (fl !== 'brak' && fd > 0) {
                  if (fl === 'lewa') addBox(bth, H, fd, -W / 2, -H / 2, -D / 2, 'corpus', isActiveSide, ud, panelGroup);
                  else if (fl === 'prawa') addBox(bth, H, fd, W / 2 - bth, -H / 2, -D / 2, 'corpus', isActiveSide, ud, panelGroup);
                  else if (fl === 'gora') addBox(W, bth, fd, -W / 2, H / 2 - bth, -D / 2, 'corpus', isActiveSide, ud, panelGroup);
                  else addBox(W, bth, fd, -W / 2, -H / 2, -D / 2, 'corpus', isActiveSide, ud, panelGroup);
              }
          } else {
              addBox(W, H, D, -W / 2, -H / 2, -D / 2, 'front', isActiveSide, { sidePanelId: panel.id }, panelGroup);
          }

          cabinetGroup.add(panelGroup);
      });
  }
}