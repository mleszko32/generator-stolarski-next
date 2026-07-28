// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from '../core/state.js';
import { getDrawerComponents } from '../core/drawerMath.js';
import { initPropertiesPanel } from '../ui/properties.js';
import { updateSidebar } from '../ui/sidebar.js';
import { renderEditor2D } from './editor2d.js';

let scene, camera, renderer, controls;
let cabinetGroup;
let roomGroup; // Grupa przechowująca ściany i podłogę
let isInitialized = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;
let draggedModuleId = null;
let dragOffset = 0;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); 
let dragIntersection = new THREE.Vector3();

export function init3DViewer() {
  const checkExist = setInterval(() => {
    const container = document.getElementById('viewer-3d-container') || document.querySelector('.viewport-3d');
    if (container) {
      clearInterval(checkExist); 
      if (isInitialized) return;
      container.innerHTML = ''; 

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf1f5f9); 

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10000);
      camera.position.set(1500, 1200, 2200);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
      dirLight.position.set(1000, 2000, 1000);
      scene.add(dirLight);

      // Grupy sceny
      roomGroup = new THREE.Group();
      scene.add(roomGroup);

      cabinetGroup = new THREE.Group();
      scene.add(cabinetGroup);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(1000, 500, 0);

      // --- OBSŁUGA MYSZY (DRAG & DROP + ŚCIANY) ---
      const canvas = renderer.domElement;

      canvas.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return; 

          const rect = canvas.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(cabinetGroup.children, true);

          if (intersects.length > 0) {
              let object = intersects[0].object;
              while (object && !object.userData.moduleId) {
                  object = object.parent;
              }
              
              if (object && object.userData.moduleId) {
                  draggedModuleId = object.userData.moduleId;
                  isDragging = true;
                  controls.enabled = false; 

                  if (state.activeModuleId !== draggedModuleId) {
                      state.activeModuleId = draggedModuleId;
                      initPropertiesPanel();
                      updateSidebar();
                      renderEditor2D();
                      update3D();
                  }

                  raycaster.ray.intersectPlane(dragPlane, dragIntersection);
                  const mod = state.project.modules.find(m => m.id === draggedModuleId);
                  if (mod) dragOffset = dragIntersection.x - (mod.position.x || 0);
              }
          }
      });

      canvas.addEventListener('pointermove', (event) => {
          if (!isDragging || !draggedModuleId) return;

          const rect = canvas.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
              let newX = dragIntersection.x - dragOffset;
              const mod = state.project.modules.find(m => m.id === draggedModuleId);
              if (!mod) return;

              const roomW = state.project.room?.width || 3500;
              const draggedW = parseFloat(mod.dimensions.width) || 600;

              // --- LOGIKA MAGNESU I ŚCIAN ---
              let snapX = newX;
              const snapDistance = 40; // mm

              // 1. Przyciąganie do ścian granicznych
              if (Math.abs(snapX - 0) < snapDistance) {
                  snapX = 0; // Lewa ściana
              } else if (Math.abs((snapX + draggedW) - roomW) < snapDistance) {
                  snapX = roomW - draggedW; // Prawa ściana
              }

              // 2. Przyciąganie do innych szafek
              state.project.modules.forEach(otherMod => {
                  if (otherMod.id !== draggedModuleId) {
                      const otherX = parseFloat(otherMod.position.x) || 0;
                      const otherW = parseFloat(otherMod.dimensions.width);
                      
                      if (Math.abs(snapX - (otherX + otherW)) < snapDistance) {
                          snapX = otherX + otherW;
                      } else if (Math.abs((snapX + draggedW) - otherX) < snapDistance) {
                          snapX = otherX - draggedW;
                      } else if (Math.abs(snapX - otherX) < snapDistance) {
                          snapX = otherX;
                      }
                  }
              });

              // Twarde ograniczenie fizyczne (nie pozwól wyjechać poza ściany pomieszczenia)
              if (snapX < 0) snapX = 0;
              if (snapX + draggedW > roomW) snapX = roomW - draggedW;

              const targetGroup = cabinetGroup.children.find(g => g.userData.moduleId === draggedModuleId);
              if (targetGroup) targetGroup.position.x = snapX;
              
              mod.position.x = snapX; 
          }
      });

      window.addEventListener('pointerup', () => {
          if (isDragging) {
              isDragging = false;
              draggedModuleId = null;
              controls.enabled = true; 
              
              update3D(); 
              initPropertiesPanel(); 
              window.dispatchEvent(new CustomEvent('cabinetMoved')); 
          }
      });

      isInitialized = true;

      const animate = function () {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      update3D();

      window.addEventListener('resize', () => {
         if (container) {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
         }
      });
    }
  }, 50); 
}

function clearGroupMemory(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child.children && child.children.length > 0) clearGroupMemory(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
      else child.material.dispose();
    }
  }
}

export function update3D() {
  if (!cabinetGroup || !roomGroup) return; 
  
  // Czyszczenie pamięci
  clearGroupMemory(cabinetGroup);
  clearGroupMemory(roomGroup);

  const config = state.project;
  const room = config.room || { width: 3500, height: 2600, depth: 600 };
  
  // --- RYSOWANIE POMIESZCZENIA (ŚCIANY I PODŁOGA) ---
  const matFloor = new THREE.MeshLambertMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide });
  const matWall = new THREE.MeshLambertMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const lineMatWall = new THREE.LineBasicMaterial({ color: 0xcbd5e1 });

  // 1. Podłoga
  const floorGeo = new THREE.BoxGeometry(room.width, 20, 1500);
  const floorMesh = new THREE.Mesh(floorGeo, matFloor);
  floorMesh.position.set(room.width / 2, -10, 1500 / 2 - 300);
  roomGroup.add(floorMesh);

  // 2. Ściana tylna
  const backWallGeo = new THREE.BoxGeometry(room.width, room.height, 20);
  const backWallMesh = new THREE.Mesh(backWallGeo, matWall);
  backWallMesh.position.set(room.width / 2, room.height / 2, -10);
  roomGroup.add(backWallMesh);
  
  const backEdges = new THREE.EdgesGeometry(backWallGeo);
  const backLine = new THREE.LineSegments(backEdges, lineMatWall);
  backWallMesh.add(backLine);

  // 3. Ściana lewa
  const leftWallGeo = new THREE.BoxGeometry(20, room.height, 1200);
  const leftWallMesh = new THREE.Mesh(leftWallGeo, matWall);
  leftWallMesh.position.set(-10, room.height / 2, 400);
  roomGroup.add(leftWallMesh);

  // --- RYSOWANIE SZAFEK ---
  const th = parseFloat(config.materials.boardThickness) || 18;
  const activeModuleId = state.activeModuleId;
  const isAnyModuleActive = activeModuleId !== null;

  state.project.modules.forEach(mod => {
    const isThisModuleActive = mod.id === activeModuleId;
    const renderAsActive = !isAnyModuleActive || isThisModuleActive;
    
    const opacityMesh = renderAsActive ? 0.5 : 0.15;
    const opacityLine = renderAsActive ? 0.9 : 0.2;
    
    const cBody = renderAsActive ? 0x93c5fd : 0x94a3b8;
    const cBodyLine = renderAsActive ? 0x1e3a8a : 0x475569;
    
    const cFront = renderAsActive ? 0x6ee7b7 : 0x94a3b8;
    const cFrontLine = renderAsActive ? 0x064e3b : 0x475569;

    const matBody = new THREE.MeshLambertMaterial({ color: cBody, transparent: true, opacity: opacityMesh, side: THREE.DoubleSide }); 
    const lineMatBody = new THREE.LineBasicMaterial({ color: cBodyLine, opacity: opacityLine, transparent: true });

    const matFront = new THREE.MeshLambertMaterial({ color: cFront, transparent: true, opacity: opacityMesh, side: THREE.DoubleSide }); 
    const lineMatFront = new THREE.LineBasicMaterial({ color: cFrontLine, opacity: opacityLine, transparent: true });

    const matFrontInternal = new THREE.MeshLambertMaterial({ color: 0xfde047, transparent: true, opacity: opacityMesh, side: THREE.DoubleSide }); 
    const lineMatFrontInternal = new THREE.LineBasicMaterial({ color: 0xb45309, opacity: opacityLine, transparent: true });

    const matDrawer = new THREE.MeshLambertMaterial({ color: 0xe2e8f0, transparent: true, opacity: opacityMesh, side: THREE.DoubleSide }); 
    const lineMatDrawer = new THREE.LineBasicMaterial({ color: 0x475569, opacity: opacityLine, transparent: true });

    const matHDF = new THREE.MeshLambertMaterial({ color: renderAsActive ? 0xf97316 : 0x94a3b8, transparent: true, opacity: renderAsActive ? 0.55 : 0.15, side: THREE.DoubleSide }); 
    const lineMatHDF = new THREE.LineBasicMaterial({ color: renderAsActive ? 0x9a3412 : 0x475569, opacity: opacityLine, transparent: true });

    const matLegs = new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: renderAsActive ? 1.0 : 0.3 }); 

    const moduleGroup = new THREE.Group();
    moduleGroup.userData = { moduleId: mod.id }; 
    moduleGroup.position.set(mod.position.x || 0, mod.position.y || 0, mod.position.z || 0);
    cabinetGroup.add(moduleGroup);

    const W = parseFloat(mod.dimensions.width) || 600;
    const H = parseFloat(mod.dimensions.height) || 720;
    const D = parseFloat(mod.dimensions.depth) || 513;

    const legsActive = mod.legs && mod.legs.active;
    const legHeight = legsActive ? (parseFloat(mod.legs.height) || 100) : 0;

    const createBoard = (w, h, d, x, y, z, material, lineMaterial) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x + w/2, y + legHeight + h/2, z + d/2);
      moduleGroup.add(mesh); 
      
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, lineMaterial);
      mesh.add(line);
    };

    if (legsActive && legHeight > 0) {
      const legGeo = new THREE.CylinderGeometry(15, 15, legHeight, 16);
      const insetX = Math.min(50, W / 4);
      const plinthOffset = mod.legs?.plinthOffset !== undefined ? parseFloat(mod.legs.plinthOffset) : 40;
      const insetZFront = plinthOffset + 25; 
      const insetZBack = 50;

      const legPositions = [
          [insetX, legHeight/2, D - insetZFront], 
          [W - insetX, legHeight/2, D - insetZFront], 
          [insetX, legHeight/2, insetZBack], 
          [W - insetX, legHeight/2, insetZBack], 
      ];

      legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, matLegs);
          leg.position.set(pos[0], pos[1], pos[2]);
          moduleGroup.add(leg);
      });
    }

    const backType = mod.backPanel?.type || 'nakladane';
    const nutBuild = mod.backPanel?.nutBuild || 'all';
    const offset = mod.backPanel?.offset !== undefined ? parseFloat(mod.backPanel.offset) : 16;
    const groove = mod.backPanel?.grooveDepth !== undefined ? parseFloat(mod.backPanel.grooveDepth) : 6;
    const hdfThick = 3; 

    const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
    const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
    const hasTraverses = cons.topType.includes('trawersy');
    const isVerticalTraverse = cons.topType === 'trawersy_pion';
    const traverseWidth = cons.traverseWidth || 100;

    let sidesD = D, sidesZ = 0, tbD = D, tbZ = 0;
    let bpW = W, bpH = H, bpX = 0, bpY = 0, bpZ = -hdfThick;

    if (backType === 'nakladane') {
      bpW = W; bpH = H; bpX = 0; bpY = 0; bpZ = -hdfThick;
    } else if (backType === 'nut') {
      bpZ = offset;
      if (nutBuild === 'all') {
        bpW = (W - 2*th) + (2 * groove); bpX = th - groove; bpH = (H - 2*th) + (2 * groove); bpY = th - groove;
      } else if (nutBuild === 'sides') {
        bpW = (W - 2*th) + (2 * groove); bpX = th - groove; bpH = H; bpY = 0; tbZ = offset + hdfThick; tbD = D - tbZ;           
      } else if (nutBuild === 'top_bottom') {
        bpW = W; bpX = 0; bpH = (H - 2*th) + (2 * groove); bpY = th - groove; sidesZ = offset + hdfThick; sidesD = D - sidesZ;
      }
    }

    const sideH = isTopBottomFullWidth ? H - (th * 2) : H;
    const sideY = isTopBottomFullWidth ? th : 0;
    createBoard(th, sideH, sidesD, 0, sideY, sidesZ, matBody, lineMatBody); 
    createBoard(th, sideH, sidesD, W - th, sideY, sidesZ, matBody, lineMatBody); 
    
    const tbW = isTopBottomFullWidth ? W : W - (th * 2);
    const tbX = isTopBottomFullWidth ? 0 : th;
    createBoard(tbW, th, tbD, tbX, 0, tbZ, matBody, lineMatBody); 
    
    if (cons.topType === 'pelny') {
      createBoard(tbW, th, tbD, tbX, H - th, tbZ, matBody, lineMatBody); 
    } else if (cons.topType === 'trawersy_poziom') {
      createBoard(tbW, th, traverseWidth, tbX, H - th, tbZ, matBody, lineMatBody); 
      createBoard(tbW, th, traverseWidth, tbX, H - th, tbD + tbZ - traverseWidth, matBody, lineMatBody); 
    } else if (cons.topType === 'trawersy_pion') {
      createBoard(tbW, traverseWidth, th, tbX, H - traverseWidth, tbZ, matBody, lineMatBody); 
      createBoard(tbW, traverseWidth, th, tbX, H - traverseWidth, tbD + tbZ - th, matBody, lineMatBody); 
    }
    createBoard(bpW, bpH, hdfThick, bpX, bpY, bpZ, matHDF, lineMatHDF);

    if (mod.elements) {
      mod.elements.forEach(el => {
        if (isNaN(el.x) || isNaN(el.y) || isNaN(el.w) || isNaN(el.h)) return;

        if (el.typ === 'poziom' || el.typ === 'pion') {
          let elZ = backType === 'nut' ? offset + hdfThick : 0;
          let baseD = D - elZ; 
          let elD = el.typ === 'poziom' && !el.isStructural ? baseD - 5 : baseD; 
          createBoard(el.w, el.h, elD, el.x, el.y, elZ, matBody, lineMatBody);
        }
        else if (el.typ === 'front') {
          const isInternalDrawer = el.subtype === 'szuflada-wewnetrzna';
          const isInset = config.front?.type === 'wpuszczane';
          const frontZ = isInternalDrawer ? (D - th - 15) : (isInset ? D - th : D + 2);
          const currentMatFront = isInternalDrawer ? matFrontInternal : matFront;
          const currentLineMat = isInternalDrawer ? lineMatFrontInternal : lineMatFront;

          createBoard(el.w, el.h, th, el.x, el.y, frontZ, currentMatFront, currentLineMat);

          if (el.subtype === 'szuflada' || isInternalDrawer) {
              const innerWidth = el.baseZone ? (el.baseZone.maxX - el.baseZone.minX) : el.w;
              let availableSpace = el.h;
              if (el.frontIndex === 0) availableSpace -= th;
              const isTopInZone = (el.baseZone && el.y + el.h >= el.baseZone.maxY - 1);
              if (isTopInZone) {
                  if (hasTraverses && isVerticalTraverse) availableSpace -= traverseWidth;
                  else availableSpace -= th;
              }
              
              const userForcedVariant = el.forceVariant || 'auto';
              const drawerComps = getDrawerComponents(config.front.drawerSystem, innerWidth, tbD, availableSpace, userForcedVariant);

              let boxW = innerWidth - 30, boxH = Math.min(el.h * 0.75, 180), boxD = Math.min(D - 35, 500); 
              if (drawerComps) { boxD = drawerComps.nominalLength; boxH = drawerComps.back.height + 16; boxW = innerWidth - 25; }
              
              const centerX = el.baseZone ? (el.baseZone.minX + el.baseZone.maxX) / 2 : el.x + el.w / 2;
              const boxX = centerX - boxW / 2, boxY = el.y + 15, boxZ = frontZ - boxD; 
              
              createBoard(boxW, boxH, boxD, boxX, boxY, boxZ, matDrawer, lineMatDrawer);
          }
        }
      });
    }

    if (isAnyModuleActive && isThisModuleActive) {
        moduleGroup.updateMatrixWorld(true);
        const boxHelper = new THREE.BoxHelper(moduleGroup, 0xea580c); 
        cabinetGroup.add(boxHelper);
    }
  }); 

  // --- ŁĄCZENIE COKOŁU ---
  const baseCabinets = state.project.modules.filter(m => m.legs && m.legs.active && m.legs.plinth);
  baseCabinets.sort((a, b) => a.position.x - b.position.x); 

  let plinthRuns = [];
  baseCabinets.forEach(mod => {
      const x = parseFloat(mod.position.x) || 0;
      const y = parseFloat(mod.position.y) || 0;
      const z = parseFloat(mod.position.z) || 0;
      const w = parseFloat(mod.dimensions.width);
      const d = parseFloat(mod.dimensions.depth);
      const h = parseFloat(mod.legs.height);
      const offset = parseFloat(mod.legs.plinthOffset !== undefined ? mod.legs.plinthOffset : 40);
      const frontZ = z + d; 

      let joined = false;
      if (plinthRuns.length > 0) {
          let last = plinthRuns[plinthRuns.length - 1];
          if (Math.abs((last.x + last.w) - x) <= 1 && last.y === y && last.h === h && last.offset === offset && last.frontZ === frontZ) {
              last.w += w + (x - (last.x + last.w)); 
              joined = true;
          }
      }
      if (!joined) plinthRuns.push({ x: x, y: y, z: z, w: w, d: d, h: h, offset: offset, frontZ: frontZ });
  });

  const plinthMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }); 
  const plinthLineMat = new THREE.LineBasicMaterial({ color: 0x475569, opacity: 0.5, transparent: true });

  plinthRuns.forEach(run => {
      const pThick = 18; 
      const pZ = run.frontZ - run.offset - pThick/2;
      const pX = run.x + run.w/2;
      const pY = run.y + run.h/2;

      const geo = new THREE.BoxGeometry(run.w, run.h, pThick);
      const mesh = new THREE.Mesh(geo, plinthMat); 
      mesh.position.set(pX, pY, pZ);
      cabinetGroup.add(mesh);

      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, plinthLineMat);
      mesh.add(line);
  });
}