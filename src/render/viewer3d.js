import * as THREE from 'three';
import { state } from '../core/state.js';

let scene, camera, renderer, mesh;

export function init3DViewer() {
  const container = document.querySelector('.viewport-3d');
  container.innerHTML = ''; // Czyścimy nagłówek "Widok 3D", żeby zrobić miejsce na płótno

  // 1. Scena i Kamera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe2e8f0); // Taki sam kolor jak tło w CSS

  // Ustawiamy kamerę tak, by obejmowała szafkę
  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(1000, 1000, 1500);
  camera.lookAt(0, 300, 0);

  // 2. Renderer (Silnik rysujący)
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // 3. Światła
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1000, 1500, 1000);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x606060));

  // 4. Tymczasowy materiał i geometria (półprzezroczysty sześcian pokazujący gabaryt)
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ 
    color: 0x3498db, 
    transparent: true, 
    opacity: 0.7 
  });
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Pętla renderowania (odświeża klatki)
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // Reakcja na zmianę rozmiaru okna przeglądarki
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // Pierwsze ustawienie wymiarów bryły na podstawie stanu
  update3D();
}

// Ta funkcja będzie wywoływana przy każdej zmianie w prawym panelu
export function update3D() {
  if (!mesh) return;
  const { width, height, depth } = state.project.dimensions;
  
  // Skalujemy nasz bazowy sześcian (1x1x1) do podanych milimetrów
  mesh.scale.set(width, height, depth);
  
  // Przesuwamy go w osi Y (góra/dół) o połowę wysokości, żeby podstawa stała na "ziemi" (Y=0)
  mesh.position.y = height / 2;
}