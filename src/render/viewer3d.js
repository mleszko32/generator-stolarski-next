// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from '../core/state.js';
import { getDrawerComponents } from '../core/drawerMath.js'; // DODANY IMPORT

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
  const th = parseFloat(state.project.materials.boardThickness) || 18;
  const W = parseFloat(mod.dimensions.width) || 600;
  const H = parseFloat(mod.dimensions.height) || 720;
  const D = parseFloat(mod.dimensions.depth) || 513;

  // --- MATERIAŁY (TRANSPARENTNE / X-RAY) ---
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
  const backType = state.project.backPanel?.type || 'nakladane';
  const nutBuild = state.project.backPanel?.nutBuild || 'all';
  const offset = state.project.backPanel?.offset !== undefined ? parseFloat(state.project.backPanel.offset) : 16;
  const groove = state.project.backPanel?.grooveDepth !== undefined ? parseFloat(state.project.backPanel.grooveDepth) : 6;
  const hdfThick = 3; 

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

  // --- RYSOWANIE KORPUSU ---
  createBoard(th, H, sidesD, 0, 0, sidesZ, matBody, lineMatBody); 
  createBoard(th, H, sidesD, W - th, 0, sidesZ, matBody, lineMatBody); 
  createBoard(W - 2*th, th, tbD, th, 0, tbZ, matBody, lineMatBody); 
  createBoard(W - 2*th, th, tbD, th, H - th, tbZ, matBody, lineMatBody); 
  
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
        const isInset = state.project.front?.type === 'wpuszczane';
        const frontZ = isInternalDrawer ? (D - th - 15) : (isInset ? D - th : D + 2);
        const currentMatFront = isInternalDrawer ? matFrontInternal : matFront;
        const currentLineMat = isInternalDrawer ? lineMatFrontInternal : lineMatFront;

        createBoard(el.w, el.h, th, el.x, el.y, frontZ, currentMatFront, currentLineMat);

        if (el.subtype === 'szuflada' || isInternalDrawer) {
            const innerWidth = el.baseZone ? (el.baseZone.maxX - el.baseZone.minX) : el.w;
            
            // --- OBLICZANIE RZECZYWISTYCH WYMIARÓW SZUFLADY ---
            let availableSpace = el.h;
            // Jeśli to najniższy front, odliczamy zachodzenie na wieniec dolny
            if (el.frontIndex === 0) availableSpace -= th;
            
            const drawerComps = getDrawerComponents(
              state.project.front.drawerSystem,
              innerWidth,
              tbD, // głębokość w świetle
              availableSpace
            );

            // Zmienne początkowe (fallback)
            let boxW = innerWidth - 30; 
            let boxH = Math.min(el.h * 0.75, 180); 
            let boxD = Math.min(D - 35, 500); 

            // Nadpisujemy zmienne tym, co rzeczywiście wyliczył system
            if (drawerComps) {
              boxD = drawerComps.nominalLength;               // Głębokość = idealnie dobrana prowadnica
              boxH = drawerComps.back.height + 16;            // Wysokość = tył katalogowy + dno 16mm
              boxW = innerWidth - 25;                         // Szerokość zewn. szuflady (ok. 12.5mm grubości prowadnicy na stronę)
            }
            
            const centerX = el.baseZone ? (el.baseZone.minX + el.baseZone.maxX) / 2 : el.x + el.w / 2;
            const boxX = centerX - boxW / 2;
            const boxY = el.y + 15; // Delikatne przesunięcie szuflady w górę od krawędzi frontu dla lepszego wyglądu
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