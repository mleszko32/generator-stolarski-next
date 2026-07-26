// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from '../core/state.js';

let scene, camera, renderer, controls;
let cabinetGroup;
let frontsVisible = true;
let isInitialized = false;

export function update3D() {
  if (!state || !state.project || !state.project.modules || !state.project.modules[0]) return;
  
  const mod = state.project.modules[0];
  const th = state.project.materials.boardThickness;
  const { width, height } = mod.dimensions;
  const depth = mod.dimensions.depth || 513; 

  // SZEROKA SIEĆ - szukamy kontenera pod różnymi najczęstszymi nazwami
  const container = document.getElementById('viewer-3d') || 
                    document.getElementById('viewer-3d-container') || 
                    document.getElementById('viewer3d') || 
                    document.getElementById('3d-viewer') ||
                    document.querySelector('.viewer-3d-wrapper');
                    
  if (!container) {
    console.error("BŁĄD KRYTYCZNY: Nie znaleziono div-a dla 3D. Sprawdź jakie ID ma ten element w pliku index.html!");
    return;
  }

  if (!isInitialized) {
    container.innerHTML = ''; 
    container.style.position = 'relative';

    const cw = container.clientWidth > 0 ? container.clientWidth : 800;
    const ch = container.clientHeight > 0 ? container.clientHeight : 600;

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1f5f9');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(1000, 2000, 1500);
    scene.add(dirLight);

    camera = new THREE.PerspectiveCamera(45, cw / ch, 1, 5000);
    camera.position.set(0, 400, 1800); 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(cw, ch);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = '👁️ Pokaż / Ukryj Fronty';
    toggleBtn.style.position = 'absolute';
    toggleBtn.style.top = '10px';
    toggleBtn.style.right = '10px';
    toggleBtn.style.padding = '8px 12px';
    toggleBtn.style.backgroundColor = '#ffffff';
    toggleBtn.style.border = '1px solid #cbd5e1';
    toggleBtn.style.borderRadius = '6px';
    toggleBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontWeight = 'bold';
    toggleBtn.style.color = '#334155';
    toggleBtn.style.zIndex = '10';
    
    toggleBtn.onclick = () => {
      frontsVisible = !frontsVisible;
      update3D(); 
    };
    container.appendChild(toggleBtn);

    const animate = function () {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
      if (container && renderer) {
        const newCw = container.clientWidth > 0 ? container.clientWidth : 800;
        const newCh = container.clientHeight > 0 ? container.clientHeight : 600;
        camera.aspect = newCw / newCh;
        camera.updateProjectionMatrix();
        renderer.setSize(newCw, newCh);
      }
    });

    isInitialized = true;
  }

  while (cabinetGroup.children.length > 0) {
    const child = cabinetGroup.children[0];
    cabinetGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  }

  const boardMat = new THREE.MeshStandardMaterial({ color: '#a68a68', roughness: 0.9 });
  const frontMat = new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 0.7 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3e2723, opacity: 0.3, transparent: true });

  const createBoard = (w, h, d, x, y, z, mat) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w/2, y + h/2, z + d/2);
    
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);
    mesh.add(line);
    
    cabinetGroup.add(mesh);
  };

  createBoard(th, height, depth, 0, 0, 0, boardMat); 
  createBoard(th, height, depth, width - th, 0, 0, boardMat); 
  createBoard(width - th*2, th, depth, th, 0, 0, boardMat); 
  createBoard(width - th*2, th, depth, th, height - th, 0, boardMat); 

  mod.elements.forEach(el => {
    if (el.typ === 'poziom') {
      createBoard(el.w, th, depth - th, el.x, el.y, 0, boardMat);
    } 
    else if (el.typ === 'pion') {
      createBoard(th, el.h, depth - th, el.x, el.y, 0, boardMat);
    } 
    else if (el.typ === 'front') {
      if (frontsVisible) {
        createBoard(el.w, el.h, th, el.x, el.y, depth - th, frontMat);
      }
    }
  });

  cabinetGroup.position.set(-width / 2, -height / 2, -depth / 2);
}

export function init3DViewer() {
  // Mechanizm oczekiwania na dynamiczny DOM
  const checkExist = setInterval(() => {
    const container = document.getElementById('viewer-3d-container') || 
                      document.getElementById('viewer-3d') || 
                      document.getElementById('viewer3d') || 
                      document.getElementById('3d-viewer') ||
                      document.querySelector('.viewer-3d-wrapper');
                      
    if (container) {
      clearInterval(checkExist); // Znaleziono kontener, przerywamy pętlę szukającą
      update3D();                // Odpalamy silnik 3D
    }
  }, 50); // Sprawdzaj co 50 milisekund

  // Zabezpieczenie przed nieskończoną pętlą (przerwij po 5 sekundach, jeśli coś poszło nie tak)
  setTimeout(() => {
    clearInterval(checkExist);
  }, 5000); 
}