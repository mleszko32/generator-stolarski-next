// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from '../core/state.js';
import { getDrawerComponents } from '../core/drawerMath.js';

let scene, camera, renderer, controls;
let cabinetGroup;
let isInitialized = false;

export function init3DViewer() {
  const checkExist = setInterval(() => {
    const container = document.getElementById('viewer-3d-container') || 
                      document.querySelector('.viewport-3d');
                      
    if (container) {
      clearInterval(checkExist); 
      
      if (isInitialized) return;

      container.innerHTML = ''; 

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf1f5f9); 

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10000);
      camera.position.set(1200, 1000, 1800);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
      dirLight.position.set(1000, 2000, 1000);
      scene.add(dirLight);

      const gridHelper = new THREE.GridHelper(3000, 60, 0x94a3b8, 0xcbd5e1);
      gridHelper.material.opacity = 0.5;
      gridHelper.material.transparent = true;
      scene.add(gridHelper);

      cabinetGroup = new THREE.Group();
      scene.add(cabinetGroup);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

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

export function update3D() {
  if (!cabinetGroup) return; 
  
  while(cabinetGroup.children.length > 0){ 
      const child = cabinetGroup.children[0];
      cabinetGroup.remove(child); 
  }

  const mod = state.project.modules[0];
  const config = state.project;
  const th = parseFloat(config.materials.boardThickness) || 18;
  const W = parseFloat(mod.dimensions.width) || 600;
  const H = parseFloat(mod.dimensions.height) || 720;
  const D = parseFloat(mod.dimensions.depth) || 513;

  const matBody = new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.4, side: THREE.DoubleSide }); 
  const lineMatBody = new THREE.LineBasicMaterial({ color: 0x1e3a8a, opacity: 0.5, transparent: true });

  const matFront = new THREE.MeshLambertMaterial({ color: 0x6ee7b7, transparent: true, opacity: 0.45, side: THREE.DoubleSide }); 
  const lineMatFront = new THREE.LineBasicMaterial({ color: 0x064e3b, opacity: 0.5, transparent: true });

  const matFrontInternal = new THREE.MeshLambertMaterial({ color: 0xfde047, transparent: true, opacity: 0.4, side: THREE.DoubleSide }); 
  const lineMatFrontInternal = new THREE.LineBasicMaterial({ color: 0xb45309, opacity: 0.5, transparent: true });

  const matDrawer = new THREE.MeshLambertMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.4, side: THREE.DoubleSide }); 
  const lineMatDrawer = new THREE.LineBasicMaterial({ color: 0x475569, opacity: 0.5, transparent: true });

  const matHDF = new THREE.MeshLambertMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, side: THREE.DoubleSide }); 
  const lineMatHDF = new THREE.LineBasicMaterial({ color: 0x9a3412, opacity: 0.7, transparent: true });

  const createBoard = (w, h, d, x, y, z, material, lineMaterial) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x + w/2, y + h/2, z + d/2);
    cabinetGroup.add(mesh);
    
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, lineMaterial);
    mesh.add(line);
  };

  // --- LOGIKA PLECÓW I KORPUSU ---
  const backType = config.backPanel?.type || 'nakladane';
  const nutBuild = config.backPanel?.nutBuild || 'all';
  const offset = config.backPanel?.offset !== undefined ? parseFloat(config.backPanel.offset) : 16;
  const groove = config.backPanel?.grooveDepth !== undefined ? parseFloat(config.backPanel.grooveDepth) : 6;
  const hdfThick = 3; 

  const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
  const hasTraverses = cons.topType.includes('trawersy');
  const isVerticalTraverse = cons.topType === 'trawersy_pion';
  const traverseWidth = cons.traverseWidth || 100;

  let sidesD = D, sidesZ = 0;
  let tbD = D, tbZ = 0;
  let bpW = W, bpH = H, bpX = 0, bpY = 0, bpZ = -hdfThick;

  if (backType === 'nakladane') {
    bpW = W; bpH = H; bpX = 0; bpY = 0; bpZ = -hdfThick;
  } else if (backType === 'nut') {
    bpZ = offset;
    if (nutBuild === 'all') {
      bpW = (W - 2*th) + (2 * groove); bpX = th - groove;
      bpH = (H - 2*th) + (2 * groove); bpY = th - groove;
    } else if (nutBuild === 'sides') {
      bpW = (W - 2*th) + (2 * groove); bpX = th - groove;
      bpH = H; bpY = 0; 
      tbZ = offset + hdfThick; 
      tbD = D - tbZ;           
    } else if (nutBuild === 'top_bottom') {
      bpW = W; bpX = 0;
      bpH = (H - 2*th) + (2 * groove); bpY = th - groove;
      sidesZ = offset + hdfThick;
      sidesD = D - sidesZ;
    }
  }

  // --- RYSOWANIE KORPUSU 3D ---
  const sideH = isTopBottomFullWidth ? H - (th * 2) : H;
  const sideY = isTopBottomFullWidth ? th : 0;
  
  createBoard(th, sideH, sidesD, 0, sideY, sidesZ, matBody, lineMatBody); 
  createBoard(th, sideH, sidesD, W - th, sideY, sidesZ, matBody, lineMatBody); 
  
  const tbW = isTopBottomFullWidth ? W : W - (th * 2);
  const tbX = isTopBottomFullWidth ? 0 : th;
  
  createBoard(tbW, th, tbD, tbX, 0, tbZ, matBody, lineMatBody); // Dół
  
  // Rysowanie góry
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

  // --- ELEMENTY Z EDYTORA 2D ---
  if (mod.elements) {
    mod.elements.forEach(el => {
      if (isNaN(el.x) || isNaN(el.y) || isNaN(el.w) || isNaN(el.h)) return;

      if (el.typ === 'poziom' || el.typ === 'pion') {
        let elZ = backType === 'nut' ? offset + hdfThick : 0;
        let baseD = D - elZ; 
        let elD = baseD; 
        
        if (el.typ === 'poziom' && !el.isStructural) {
           elD = baseD - 5; 
        }

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

            const drawerComps = getDrawerComponents(
              config.front.drawerSystem,
              innerWidth,
              tbD, 
              availableSpace,
              userForcedVariant 
            );

            let boxW = innerWidth - 30; 
            let boxH = Math.min(el.h * 0.75, 180); 
            let boxD = Math.min(D - 35, 500); 

            if (drawerComps) {
              boxD = drawerComps.nominalLength;               
              boxH = drawerComps.back.height + 16;            
              boxW = innerWidth - 25;                         
            }
            
            const centerX = el.baseZone ? (el.baseZone.minX + el.baseZone.maxX) / 2 : el.x + el.w / 2;
            const boxX = centerX - boxW / 2;
            const boxY = el.y + 15; 
            const boxZ = frontZ - boxD; 
            
            createBoard(boxW, boxH, boxD, boxX, boxY, boxZ, matDrawer, lineMatDrawer);
        }
      }
    });
  }

  const box = new THREE.Box3().setFromObject(cabinetGroup);
  const center = box.getCenter(new THREE.Vector3());
  if (controls) controls.target.copy(center);
}