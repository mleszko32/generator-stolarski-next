// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { state, duplicateModule, deleteModule } from '../core/state.js';

import { getDrawerComponents, calculateDrawerHoles } from '../core/drawerMath.js';
import { calculateHinges } from '../core/hingeMath.js';
import { autoDistributeShelves } from '../core/shelfMath.js';

import { updateSidebar } from '../ui/sidebar.js';
import { initPropertiesPanel } from '../ui/properties.js';

let alignMode = { active: false, sourceMod: null, sourceEl: null, banner: null };
let isXrayMode = true; 
let isFrontsVisible = true; 

// ZMIENNE DO SWOBODNEGO PRZECIĄGANIA (DRAG & DROP Z MAGNESEM)
let isDragging = false;
let dragTarget = null;
let dragModule = null;
const dragOffset = new THREE.Vector3();
const dragPlane = new THREE.Plane();
const SNAP_DIST = 40; 

function recalculateLayout(mod) {
  if (!mod || !mod.elements) return;
  const config = state.project;
  const th = parseFloat(config.materials.boardThickness) || 18;
  const width = parseFloat(mod.dimensions.width) || 600;
  const height = parseFloat(mod.dimensions.height) || 720;
  
  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const fc = { ...(config.front?.clearance || {}), ...(mod.front?.clearance || {}) };
  const isInset = f.type === 'wpuszczane';

  const cLeft = parseFloat(fc.left ?? fc.sides ?? 1.5) || 0;
  const cRight = parseFloat(fc.right ?? fc.sides ?? 1.5) || 0;
  const cTop = parseFloat(fc.top ?? fc.gora ?? 2) || 0;
  const cBottom = parseFloat(fc.bottom ?? fc.dol ?? 2) || 0;

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const hasTraverses = cons.topType.includes('trawersy');
  const isVerticalTraverse = cons.topType === 'trawersy_pion';
  const traverseWidth = cons.traverseWidth || 100;

  mod.elements.forEach(el => {
      if (el.typ === 'front' && el.baseZone) {
          if (el.baseZone.boundBottom) {
              const getBound = (id, type, fallback) => {
                  if (id === 'cab-left') return th;
                  if (id === 'cab-right') return width - th;
                  if (id === 'cab-bottom') return th;
                  if (id === 'cab-top') {
                      if (hasTraverses) return isVerticalTraverse ? height - traverseWidth : height - th;
                      return height - th;
                  }
                  const found = mod.elements.find(e => e.id === id);
                  if (found) {
                      if (type === 'minX') return found.x + found.w;
                      if (type === 'maxX') return found.x;
                      if (type === 'minY') return found.y + found.h;
                      if (type === 'maxY') return found.y;
                  }
                  return parseFloat(fallback) || 0;
              };
              el.baseZone.minX = getBound(el.baseZone.boundLeft, 'minX', el.baseZone.minX);
              el.baseZone.maxX = getBound(el.baseZone.boundRight, 'maxX', el.baseZone.maxX);
              el.baseZone.minY = getBound(el.baseZone.boundBottom, 'minY', el.baseZone.minY);
              el.baseZone.maxY = getBound(el.baseZone.boundTop, 'maxY', el.baseZone.maxY);
          }

          const minX = parseFloat(el.baseZone.minX) || 0;
          const maxX = parseFloat(el.baseZone.maxX) || width;
          const minY = (parseFloat(el.baseZone.minY) || 0) + (parseFloat(el.baseZone.offsetBottom) || 0);
          const maxY = (parseFloat(el.baseZone.maxY) || height) - (parseFloat(el.baseZone.offsetTop) || 0);
          
          const gapVal = parseFloat(el.gap ?? f.gap ?? 3) || 0;

          let startX, totalW, startY, totalH;

          if (el.subtype === 'szuflada-wewnetrzna') {
              const gX = el.intGapX !== undefined ? parseFloat(el.intGapX) : 15;
              const gY = el.intGapY !== undefined ? parseFloat(el.intGapY) : 5;
              startX = minX + gX;
              totalW = (maxX - minX) - (gX * 2);
              startY = minY + gY;
              totalH = (maxY - minY) - (gY * 2);
          } else {
              const isBoundLeftFront = el.baseZone.boundLeft && el.baseZone.boundLeft.startsWith('front');
              const isBoundRightFront = el.baseZone.boundRight && el.baseZone.boundRight.startsWith('front');
              const isBoundBottomFront = el.baseZone.boundBottom && el.baseZone.boundBottom.startsWith('front');
              const isBoundTopFront = el.baseZone.boundTop && el.baseZone.boundTop.startsWith('front');

              const isLeftOuter = minX <= th + 1; 
              const isRightOuter = maxX >= width - th - 1;
              const isBottomOuter = minY <= th + 1;
              const isTopOuter = maxY >= (hasTraverses && isVerticalTraverse ? height - traverseWidth - 1 : height - th - 1);

              const overLeft = isLeftOuter ? (isInset ? -cLeft : th - cLeft) : (isBoundLeftFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overRight = isRightOuter ? (isInset ? -cRight : th - cRight) : (isBoundRightFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overBottom = isBottomOuter ? (isInset ? -cBottom : th - cBottom) : (isBoundBottomFront ? -gapVal : ((th / 2) - (gapVal / 2)));
              const overTop = isTopOuter ? (isInset ? -cTop : th - cTop) : (isBoundTopFront ? -gapVal : ((th / 2) - (gapVal / 2)));

              startX = minX - overLeft;
              totalW = (maxX - minX) + overLeft + overRight;
              startY = minY - overBottom;
              totalH = (maxY - minY) + overBottom + overTop;
          }

          if (el.subtype === 'szuflada' || el.subtype === 'szuflada-wewnetrzna') {
              const distributionStr = String(el.distribution || el.frontCount || "1").trim();
              let parsedZones = [];
              if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
                  const count = parseInt(distributionStr, 10) || 1;
                  for (let i = 0; i < count; i++) parsedZones.push({ type: 'fr', value: 1 });
              } else {
                  const separator = distributionStr.includes(':') ? ':' : ',';
                  parsedZones = distributionStr.split(separator).map(s => {
                      let zone = s.trim();
                      if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
                      const val = parseFloat(zone) || 1;
                      return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
                  });
              }

              const count = parsedZones.length;
              const totalGaps = gapVal * (count - 1);
              let availableHeight = totalH - totalGaps;

              let fixedTotal = 0; let frTotal = 0;
              parsedZones.forEach(z => { if (z.type === 'fixed') fixedTotal += z.value; if (z.type === 'fr') frTotal += z.value; });
              availableHeight -= fixedTotal;
              const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

              let currentY = startY;
              for (let i = 0; i < el.frontIndex; i++) {
                  const z = parsedZones[i] || { type: 'fr', value: 1 };
                  const h = z.type === 'fixed' ? z.value : z.value * singleFrValue;
                  currentY += h + gapVal;
              }

              const myZone = parsedZones[el.frontIndex] || { type: 'fr', value: 1 };
              const myHeight = myZone.type === 'fixed' ? myZone.value : myZone.value * singleFrValue;

              el.x = isNaN(startX) ? 0 : startX; 
              el.w = isNaN(totalW) ? 100 : totalW;
              el.y = isNaN(currentY) ? 0 : currentY; 
              el.h = isNaN(myHeight) ? 100 : myHeight;

          } else if (el.subtype === 'drzwi') {
              el.x = isNaN(startX) ? 0 : startX; el.w = isNaN(totalW) ? 100 : totalW;
              el.y = isNaN(startY) ? 0 : startY; el.h = isNaN(totalH) ? 100 : totalH;
          } else if (el.subtype === 'drzwi-lp') {
              const singleW = (totalW - gapVal) / 2;
              el.w = isNaN(singleW) ? 50 : singleW; el.h = isNaN(totalH) ? 100 : totalH; el.y = isNaN(startY) ? 0 : startY;
              let myX = el.frontIndex === 0 ? startX : startX + singleW + gapVal; 
              el.x = isNaN(myX) ? 0 : myX;
          }
          
          // --- NOWOŚĆ: BEZWZGLĘDNE NADPISYWANIE WYMIARÓW ---
          if (el.forceH !== undefined && el.forceH !== null && !isNaN(el.forceH)) el.h = el.forceH;
          if (el.forceW !== undefined && el.forceW !== null && !isNaN(el.forceW)) el.w = el.forceW;
          if (el.forceOffsetX) el.x += el.forceOffsetX;
          if (el.forceOffsetY) el.y += el.forceOffsetY;
      }
  });
}

let scene, camera, renderer, controls;
let container;
let cabinetGroup;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = new THREE.Vector2();

export function init3DViewer() {
  container = document.getElementById('viewer-3d-container') || document.getElementById('editor-3d-container') || document.querySelector('.viewer-3d');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 10, 100000);
  camera.position.set(2500, 1500, 3500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  container.innerHTML = ''; 
  container.style.position = 'relative'; 
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(500, 500, 0);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.6); 
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85); 
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

  const backLight = new THREE.DirectionalLight(0xffffff, 0.4); 
  backLight.position.set(-2000, 2000, -3000);
  scene.add(backLight);

  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const floorGeo = new THREE.PlaneGeometry(25000, 25000);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.07 }); 
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); 
  
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(10000, 3500, 20), wallMat);
  backWall.position.set(5000, 1750, -10); 
  backWall.receiveShadow = true;
  roomGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(20, 3500, 5000), wallMat);
  leftWall.position.set(-10, 1750, 2500); 
  leftWall.receiveShadow = true;
  roomGroup.add(leftWall);

  cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);

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
              
              if (e.shiftKey) {
                  if (!state.selectedModules) state.selectedModules = new Set();
                  if (!state.selectedModules.has(dragModule.id)) {
                      state.selectedModules.add(dragModule.id);
                  }
                  state.activeModuleId = dragModule.id;
              } else {
                  if (!state.selectedModules || !state.selectedModules.has(dragModule.id)) {
                      state.selectedModules = new Set([dragModule.id]);
                  }
                  state.activeModuleId = dragModule.id;
              }

              updateSidebar();
              initPropertiesPanel();
              update3D(); 
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
          
          const W = parseFloat(dragModule.dimensions.width) || 600;
          const H = parseFloat(dragModule.dimensions.height) || 720;
          const D = parseFloat(dragModule.dimensions.depth) || 510;
          let baseOffsetY = (dragModule.legs && dragModule.legs.active) ? (parseFloat(dragModule.legs.height) || 100) : 0;
          
          let snapX = newGroupPos.x - W/2;
          let snapY = newGroupPos.y - H/2 - baseOffsetY;
          let snapZ = newGroupPos.z - D/2;

          if (Math.abs(snapX) < SNAP_DIST) snapX = 0;
          if (Math.abs(snapY) < SNAP_DIST) snapY = 0;
          if (Math.abs(snapZ) < SNAP_DIST) snapZ = 0;

          state.project.modules.forEach(other => {
              if (other.id === dragModule.id) return;
              const oW = parseFloat(other.dimensions.width);
              const oH = parseFloat(other.dimensions.height);
              const oD = parseFloat(other.dimensions.depth);
              const oX = parseFloat(other.position.x);
              const oY = parseFloat(other.position.y);
              const oZ = parseFloat(other.position.z);

              if (Math.abs(snapX - (oX + oW)) < SNAP_DIST) snapX = oX + oW;
              if (Math.abs((snapX + W) - oX) < SNAP_DIST) snapX = oX - W;
              if (Math.abs(snapX - oX) < SNAP_DIST) snapX = oX;

              if (Math.abs(snapY - (oY + oH)) < SNAP_DIST) snapY = oY + oH;
              if (Math.abs((snapY + H) - oY) < SNAP_DIST) snapY = oY - H;
              if (Math.abs(snapY - oY) < SNAP_DIST) snapY = oY;

              if (Math.abs(snapZ - (oZ + oD)) < SNAP_DIST) snapZ = oZ + oD;
              if (Math.abs((snapZ + D) - oZ) < SNAP_DIST) snapZ = oZ - D;
              if (Math.abs(snapZ - oZ) < SNAP_DIST) snapZ = oZ;
          });

          snapX = Math.max(0, snapX);
          snapY = Math.max(0, snapY);
          snapZ = Math.max(0, snapZ);

          dragModule.position.x = Math.round(snapX);
          dragModule.position.y = Math.round(snapY);
          dragModule.position.z = Math.round(snapZ);

          dragTarget.position.set(
              dragModule.position.x + W/2,
              dragModule.position.y + baseOffsetY + H/2,
              dragModule.position.z + D/2
          );
          
          const inpX = document.getElementById('input-pos-x');
          const inpY = document.getElementById('input-pos-y');
          if (inpX) inpX.value = dragModule.position.x;
          if (inpY) inpY.value = dragModule.position.y;
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

  uiOverlay.appendChild(toggleBtn);
  uiOverlay.appendChild(toggleFrontsBtn);
  container.appendChild(uiOverlay);

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
      if (event.shiftKey) {
          if (!state.selectedModules) state.selectedModules = new Set();
          if (state.selectedModules.has(data.moduleId)) {
              state.selectedModules.delete(data.moduleId);
              if (state.activeModuleId === data.moduleId) {
                  state.activeModuleId = Array.from(state.selectedModules).pop() || null;
              }
          } else {
              state.selectedModules.add(data.moduleId);
              state.activeModuleId = data.moduleId;
          }
      } else {
          state.selectedModules = new Set([data.moduleId]);
          state.activeModuleId = data.moduleId;
      }

      updateSidebar();
      initPropertiesPanel();
      update3D(); 
      show3DContextMenu(event, validHit, data);
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
          
          // --- NOWA SEKCJA: RĘCZNE NADPISYWANIE WYMIARÓW FRONTU ---
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
          // ---------------------------------------------------

          if (el.subtype.includes('szuflada')) {
              menu.appendChild(createHeader('Opcje pudła szuflady'));
              const boxWrap = document.createElement('div');
              Object.assign(boxWrap.style, {
                  padding: '10px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', backgroundColor: '#f8fafc', borderRadius: '4px'
              });

              const rowVar = document.createElement('div');
              rowVar.style.display = 'flex'; rowVar.style.justifyContent = 'space-between'; rowVar.style.alignItems = 'center'; rowVar.style.marginBottom = '6px';
              rowVar.innerHTML = `<label style="font-size:11px; color:#475569;">Wariant boku:</label>
                  <select id="inp-var" style="padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px; width:110px;">
                      <option value="auto" ${(!el.forceVariant || el.forceVariant === 'auto') ? 'selected' : ''}>Auto (Maks.)</option>
                      <option value="N" ${el.forceVariant === 'N' ? 'selected' : ''}>Wariant N</option>
                      <option value="M" ${el.forceVariant === 'M' ? 'selected' : ''}>Wariant M</option>
                      <option value="K" ${el.forceVariant === 'K' ? 'selected' : ''}>Wariant K</option>
                      <option value="E" ${el.forceVariant === 'E' ? 'selected' : ''}>Wariant E</option>
                      <option value="C" ${el.forceVariant === 'C' ? 'selected' : ''}>Wariant C</option>
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
                  if (el.forceVariant && el.forceVariant !== 'auto') {
                      const v = el.forceVariant.toUpperCase();
                      if (v === 'N') boxHeight = 85;
                      else if (v === 'M') boxHeight = 115;
                      else if (v === 'K') boxHeight = 150;
                      else if (v === 'C') boxHeight = 195;
                      else if (v === 'E') boxHeight = 240;
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
      
      const H = parseFloat(mod.dimensions.height);
      const W = parseFloat(mod.dimensions.width);
      
      if (localY > 0 && localY < H) {
          let zoneMinY = th;
          let zoneMaxY = H - th;
          let boundBottomId = 'cab-bottom';
          let boundTopId = 'cab-top';

          if (mod.elements) {
              mod.elements.forEach(el => {
                  if (el.typ === 'poziom') {
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
              });
          }

          const targetBaseZone = { 
              minX: th, maxX: W - th, minY: zoneMinY, maxY: zoneMaxY,
              boundBottom: boundBottomId, boundTop: boundTopId, boundLeft: 'cab-left', boundRight: 'cab-right',
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
                  typ: 'poziom', x: th, y: localY - (th/2), w: W - (th*2), h: th, isStructural: false 
              });
          }, '#2563eb'));

          const halfY = zoneMinY + (zoneMaxY - zoneMinY) / 2;
          menu.appendChild(createOption('Półka (dokładnie w połowie)', '➗', () => {
              mod.elements.push({
                  id: 'poziom-half-' + Date.now() + Math.random().toString(36).substring(2, 6),
                  typ: 'poziom', x: th, y: halfY - (th/2), w: W - (th*2), h: th, isStructural: false
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

                  const internalHeight = zoneMaxY - zoneMinY;
                  const newShelvesBase = autoDistributeShelves(internalHeight, th, shelfCount);

                  const ts = Date.now();
                  newShelvesBase.forEach((s, idx) => {
                      mod.elements.push({
                          id: 'poziom-auto-' + ts + '-' + idx,
                          typ: 'poziom', x: th, y: zoneMinY + s.y, w: W - (th*2), h: th, isStructural: false
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

          const halfX = th + (W - 2*th) / 2;
          menu.appendChild(createOption('Przegroda pionowa (w połowie)', '➕', () => {
              mod.elements.push({
                  id: 'pion-half-' + Date.now() + Math.random().toString(36).substring(2, 6),
                  typ: 'pion', x: halfX - (th/2), y: zoneMinY, w: th, h: zoneMaxY - zoneMinY
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
      corpus: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 }), 
      front: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.1 }),  
      shelf: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7, metalness: 0.0 }),   
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.0 }),
      hdf: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.9, metalness: 0.0 })
  },
  xray: {
      corpus: new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.15, depthWrite: false }),
      front: new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.15, depthWrite: false }),
      shelf: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.3, depthWrite: false }),
      drawerBox: new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4, depthWrite: false }),
      hdf: new THREE.MeshStandardMaterial({ color: 0x475569, transparent: true, opacity: 0.3, depthWrite: false })
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
      geo = new THREE.CylinderGeometry(4, 4, 30, 16);
      mat = new THREE.MeshStandardMaterial({color: 0xb45309, roughness: 0.9}); 
  } else if (type === 'screw') {
      geo = new THREE.CylinderGeometry(3.5, 3.5, 45, 16);
      mat = new THREE.MeshStandardMaterial({color: 0x334155, metalness: 0.6, roughness: 0.4}); 
  }
  const mesh = new THREE.Mesh(geo, mat);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parentGroup.add(mesh);
}

export function update3D() {
  if (!cabinetGroup) return;
  
  while(cabinetGroup.children.length > 0){ cabinetGroup.remove(cabinetGroup.children[0]); }

  const th = parseFloat(state.project.materials.boardThickness) || 18;

  state.project.modules.forEach(mod => {
      recalculateLayout(mod);

      const isActive = mod.id === state.activeModuleId;
      const W = parseFloat(mod.dimensions.width);
      const H = parseFloat(mod.dimensions.height);
      const D = parseFloat(mod.dimensions.depth);
      let baseOffsetY = 0;
      if (mod.legs && mod.legs.active) baseOffsetY = parseFloat(mod.legs.height) || 100;
      
      const modGroup = new THREE.Group();
      modGroup.userData = { moduleId: mod.id };
      
      modGroup.position.set(
          (parseFloat(mod.position.x) || 0) + W/2,
          (parseFloat(mod.position.y) || 0) + baseOffsetY + H/2,
          (parseFloat(mod.position.z) || 0) + D/2
      );

      const innerGroup = new THREE.Group();
      innerGroup.position.set(-W/2, -H/2 - baseOffsetY, -D/2);
      modGroup.add(innerGroup);

      const posX = 0; 
      const posY = baseOffsetY; 
      const posZ = 0; 

      const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(mod.construction || {}) };
      const isTopBottomFull = cons.joinType === 'wience_przelotowe';

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
              const trW = parseFloat(cons.traverseWidth) || 100;
              addBox(W - 2*th, th, trW, posX + th, posY + H - th, posZ + D - trW, 'corpus', isActive, udCorp, innerGroup); 
              addBox(W - 2*th, th, trW, posX + th, posY + H - th, tbStartZ, 'corpus', isActive, udCorp, innerGroup); 
          } else if (cons.topType === 'trawersy_pion') {
              const trW = parseFloat(cons.traverseWidth) || 100;
              addBox(W - 2*th, trW, th, posX + th, posY + H - trW, posZ + D - th, 'corpus', isActive, udCorp, innerGroup); 
              addBox(W - 2*th, trW, th, posX + th, posY + H - trW, tbStartZ, 'corpus', isActive, udCorp, innerGroup); 
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
          
          if (cons.topType === 'pelny' || cons.topType === 'trawersy_poziom') {
              const topY = posY + H - th/2;
              addHardware('screw', jx, topY, posZ + D - 37, hwAxis, innerGroup);
              addHardware('dowel', jx, topY, posZ + D - 69, hwAxis, innerGroup);
              addHardware('screw', jx, topY, rearZ, hwAxis, innerGroup);
              addHardware('dowel', jx, topY, rearDowelZ, hwAxis, innerGroup);
          } else if (cons.topType === 'trawersy_pion') {
              const topY = posY + H - 37;
              const topDowelY = posY + H - 69;
              addHardware('screw', jx, topY, posZ + D - th/2, 'x', innerGroup);
              addHardware('dowel', jx, topDowelY, posZ + D - th/2, 'x', innerGroup);
              addHardware('screw', jx, topY, tbStartZ + th/2, 'x', innerGroup);
              addHardware('dowel', jx, topDowelY, tbStartZ + th/2, 'x', innerGroup);
          }
      });

      const innerZ = backP.type === 'nut' ? backZ + backThick : posZ + backThick;
      const shelfDepth = (posZ + D - 2) - innerZ; 

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
                      
                      holeZs.forEach(hz => {
                          if (isStruct) {
                              const holeY = posY + el.y + el.h / 2; 
                              const dowelZ = hz === frontHoleZ ? hz - 32 : hz + 32;
                              addHole(2.5, th, posX + th/2, holeY, hz, 'x', innerGroup); 
                              addHole(2.5, th, posX + W - th/2, holeY, hz, 'x', innerGroup); 
                              addHardware('screw', posX + th/2, holeY, hz, 'x', innerGroup); 
                              addHardware('screw', posX + W - th/2, holeY, hz, 'x', innerGroup); 
                              addHardware('dowel', posX + th/2, holeY, dowelZ, 'x', innerGroup); 
                              addHardware('dowel', posX + W - th/2, holeY, dowelZ, 'x', innerGroup); 
                          } else {
                              const supportY = posY + el.y - 2.5; 
                              addHole(2.5, th, posX + th/2, supportY, hz, 'x', innerGroup); 
                              addHole(2.5, th, posX + W - th/2, supportY, hz, 'x', innerGroup); 
                              addHardware('support', posX + th + 4, supportY, hz, 'x', innerGroup); 
                              addHardware('support', posX + W - th - 4, supportY, hz, 'x', innerGroup); 
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

                  const f = { ...(state.project.front || {}), ...(mod.front || {}) };
                  
                  let innerFrontThick = 18;
                  let innerSetback = 0;
                  let zForFront;
                  
                  if (isInternal) {
                      innerFrontThick = parseFloat(el.innerFrontThickness ?? 18);
                      innerSetback = parseFloat(el.innerSetback ?? 2);
                      zForFront = posZ + D - innerSetback - innerFrontThick; 
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

                          let simulatedSpace = availableSpace;
                          if (el.forceVariant && el.forceVariant !== 'auto') {
                              const v = el.forceVariant.toUpperCase();
                              if (v === 'N') simulatedSpace = 85;
                              else if (v === 'M') simulatedSpace = 115;
                              else if (v === 'K') simulatedSpace = 150;
                              else if (v === 'C') simulatedSpace = 195;
                              else if (v === 'E') simulatedSpace = 240;
                              simulatedSpace = Math.min(simulatedSpace, availableSpace);
                          }

                          const sysName = f.drawerSystem || 'merivobox';
                          const dHoles = calculateDrawerHoles(sysName, el.y, simulatedSpace, th, el.frontIndex, isBottomInZone);
                          
                          const innerWidth = W - (th * 2);
                          
                          let availableDepth = D - 19; 
                          if (isInternal) {
                              availableDepth -= (innerFrontThick + innerSetback);
                          }
                          
                          if (el.forceNL && !isNaN(parseFloat(el.forceNL))) {
                              availableDepth = parseFloat(el.forceNL) + 10;
                          }

                          const drawerComps = getDrawerComponents(sysName, innerWidth, availableDepth, simulatedSpace, el.forceVariant || 'auto');

                          if (drawerComps) {
                              const NL = drawerComps.nominalLength;
                              const dw = drawerComps.bottom.width;
                              const dl = drawerComps.bottom.length;
                              const dh = drawerComps.back.height;

                              const dX = posX + th + (innerWidth - dw) / 2; 
                              
                              let slideAbsY = el.y + 33.5; 
                              if (dHoles && dHoles.slideSideHoles && dHoles.slideSideHoles.length > 0) {
                                  slideAbsY = dHoles.slideSideHoles[0].y;
                              }
                              const dY = posY + slideAbsY - 33.5; 
                              
                              const boxStartZ = zForFront - NL;

                              addBox(dw, 16, NL, dX, dY, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(drawerComps.back.width, dh, 16, dX + (dw - drawerComps.back.width)/2, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(16, dh, NL, dX - 16, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                              addBox(16, dh, NL, dX + dw, dY + 16, boxStartZ, 'drawerBox', isActive, udElement, innerGroup); 
                          }

                          if (dHoles && dHoles.slideSideHoles) {
                              const slideZOffset = isInternal ? (innerFrontThick + innerSetback) : 0; 
                              
                              dHoles.slideSideHoles.forEach(h => {
                                  let calcY = isTopBottomFull ? h.y - th : h.y;
                                  addHole(2.5, th, posX + th/2, posY + calcY, posZ + D - h.x - slideZOffset, 'x', innerGroup); 
                                  addHole(2.5, th, posX + W - th/2, posY + calcY, posZ + D - h.x - slideZOffset, 'x', innerGroup); 
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
                          const obstacles = mod.elements.filter(e => e.typ === 'poziom' || e.subtype === 'szuflada-wewnetrzna');
                          const side = el.subtype === 'drzwi-lp' ? (el.id.endsWith('-L') ? 'left' : 'right') : (el.openingSide || 'left');
                          const hinges = calculateHinges(el, th, obstacles, side);
                          
                          hinges.forEach(h => {
                              let calcY = isTopBottomFull ? el.y + h.relY - th : el.y + h.relY;
                              const isLeft = side === 'left';
                              const cupX = isLeft ? el.x + h.cupXOffset : el.x + el.w - h.cupXOffset;

                              addHole(17.5, 13, posX + cupX, posY + calcY, zForFront + 6.5, 'z', innerGroup);

                              const plateX = isLeft ? posX + th/2 : posX + W - th/2;
                              addHole(2.5, th, plateX, posY + calcY - 16, posZ + D - 37, 'x', innerGroup);
                              addHole(2.5, th, plateX, posY + calcY + 16, posZ + D - 37, 'x', innerGroup);
                          });
                      }
                  }
              }
          });
      }

      if (mod.legs && mod.legs.active) {
          const legH = mod.legs.height || 100;
          const rootY = 0; 
          
          addBox(30, legH, 30, posX + 50, rootY, posZ + 50, 'corpus', false, null, innerGroup);
          addBox(30, legH, 30, posX + W - 80, rootY, posZ + 50, 'corpus', false, null, innerGroup);
          addBox(30, legH, 30, posX + 50, rootY, posZ + D - 80, 'corpus', false, null, innerGroup);
          addBox(30, legH, 30, posX + W - 80, rootY, posZ + D - 80, 'corpus', false, null, innerGroup);
          
          if (mod.legs.plinth) {
              const offset = mod.legs.plinthOffset || 40;
              addBox(W, legH, 18, posX, rootY, posZ + D - offset - 18, 'corpus', false, null, innerGroup);
          }
      }

      cabinetGroup.add(modGroup);
  });
}