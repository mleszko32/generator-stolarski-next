// src/render/viewer3d.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from "../core/state.js";

// Zmienne globalne dla widoku 3D
export let scene, camera, renderer, cabinetGroup, controls;

export function init3DViewer() {
  const container = document.querySelector('.viewport-3d');
  if (!container) return;

  // 1. Inicjalizacja sceny
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fafc); // Kolor tła dopasowany do UI

  // 2. Kamera
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 5000);
  camera.position.set(0, 600, 2500); // Widok lekko z góry i z przodu

  // 3. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // 4. Światła
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1000, 2000, 1000);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // 5. Grupa na szafkę
  cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);

  // 6. Kontrolki obrotu (OrbitControls)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 400, 0); // Środek obrotu

  // 7. Reakcja na zmianę rozmiaru okna
  window.addEventListener('resize', onWindowResize, false);

  // Pierwsze rysowanie szafki
  update3D();

  // Uruchomienie pętli animacji
  animate();
}

function onWindowResize() {
  const container = document.querySelector('.viewport-3d');
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update(); // Wymagane dla enableDamping
  renderer.render(scene, camera);
}

export function update3D() {
  if (!cabinetGroup) return;
  
  cabinetGroup.clear(); // Wyczyść poprzedni stan szafki

  const mod = state.project.modules[0];
  const th = state.project.materials.boardThickness;
  const depth = mod.dimensions.depth;
  const type = state.project.backPanel.type;
  const backThick = state.project.materials.backThickness;
  const offset = state.project.backPanel.offset;
  
  // Wnętrze jest trochę płytsze, żeby zrobić miejsce na plecy
  const innerDepth = type === 'nut' ? depth - offset - backThick : depth - backThick;

  // Zwykła funkcja tworząca Mesh w Three.js na podstawie koordynatów
  const addMesh = (x, y, w, h, d, zOffset = 0) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const material = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Three.js ustawia punkt środkowy (anchor point) w centrum geometrycznym bryły
    mesh.position.x = x + (w / 2) - (mod.dimensions.width / 2); // Wymuszone centrowanie szafki w osi X
    mesh.position.y = y + (h / 2);
    mesh.position.z = zOffset; 

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    cabinetGroup.add(mesh);
  };

  // --- Rysowanie głównego Korpusu ---
  addMesh(0, 0, th, mod.dimensions.height, depth); // Bok Lewy
  addMesh(mod.dimensions.width - th, 0, th, mod.dimensions.height, depth); // Bok Prawy
  addMesh(th, 0, mod.dimensions.width - th*2, th, innerDepth, backThick/2); // Wieniec Dolny
  addMesh(th, mod.dimensions.height - th, mod.dimensions.width - th*2, th, innerDepth, backThick/2); // Wieniec Górny

  // --- Rysowanie płyt z płaskiej tablicy formatek (Elements) ---
  if (mod.elements && mod.elements.length > 0) {
    mod.elements.forEach(el => {
      addMesh(el.x, el.y, el.w, el.h, innerDepth, backThick/2);
    });
  }
}