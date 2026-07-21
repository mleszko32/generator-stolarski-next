import * as THREE from 'three';
// Importujemy moduł do obracania kamerą za pomocą myszki
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from '../core/state.js';

let scene, camera, renderer, cabinetGroup, controls;

export function init3DViewer() {
  const container = document.querySelector('.viewport-3d');
  container.innerHTML = ''; 

  // 1. Scena i Kamera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe2e8f0);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000);
  camera.position.set(800, 800, 1200);

  // 2. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // 3. Kontrolery (OrbitControls) - to pozwala obracać i przybliżać model
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 300, 0); // Punkt, wokół którego się obracamy (środek szafki)
  controls.update();

  // 4. Światła
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1000, 1500, 1000);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x808080));

  // 5. Grupa trzymająca całą szafkę
  cabinetGroup = new THREE.Group();
  scene.add(cabinetGroup);

  // Pętla odświeżania (niezbędna dla płynnego obracania kamerą)
  function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    renderer.render(scene, camera);
  }
  animate();

  // Responsywność okna przeglądarki
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // Budujemy szafkę po raz pierwszy
  update3D();
}

// Funkcja pomocnicza: tworzy jedną fizyczną płytę z zaznaczonymi krawędziami
function createBoard(width, height, depth, x, y, z) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  // Ustawiamy kolor przypominający płytę meblową
  const material = new THREE.MeshLambertMaterial({ color: 0xdeb887 }); 
  
  const mesh = new THREE.Mesh(geometry, material);
  
  // Rysujemy ciemniejsze krawędzie formatki, żeby było widać łączenia!
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x8b4513 }));
  mesh.add(line);
  
  // Ustawiamy pozycję płyty w przestrzeni
  mesh.position.set(x, y, z);
  return mesh;
}

export function update3D() {
  if (!cabinetGroup) return;
  
  cabinetGroup.clear();

  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness; 
  const backThick = state.project.materials.backThickness;
  const backOffset = state.project.materials.backOffset;

  // 1-4. Korpus (bez zmian)
  const leftSide = createBoard(board, height, depth, -width/2 + board/2, height/2, 0);
  cabinetGroup.add(leftSide);

  const rightSide = createBoard(board, height, depth, width/2 - board/2, height/2, 0);
  cabinetGroup.add(rightSide);

  const bottomWidth = width - (board * 2);
  const bottomShelf = createBoard(bottomWidth, board, depth, 0, board/2, 0);
  cabinetGroup.add(bottomShelf);

  const topShelf = createBoard(bottomWidth, board, depth, 0, height - board/2, 0);
  cabinetGroup.add(topShelf);

  // 5. Rysujemy plecy (HDF)
  // Obliczamy pozycję tyłu. Krawędź tylna szafki to -depth/2. 
  // Dodajemy cofnięcie (backOffset) i połowę grubości HDF, by znaleźć środek płyty.
  const backZ = -depth/2 + backOffset + (backThick / 2);
  // Do widoku 3D używamy po prostu wymiaru światła szafki (dla uproszczenia wizualnego)
  const backPanel = createBoard(bottomWidth, height - (board*2), backThick, 0, height/2, backZ);
  cabinetGroup.add(backPanel);

  // 6. Aktualizujemy pozycję półki środkowej
  // Wyliczamy nową głębokość (tak jak w silniku)
  const shelfDepth = depth - backOffset - backThick - 5; 
  
  // Magiczny wzór na środek półki (Z), tak aby opierała się o HDF z tyłu, a z przodu miała 5 mm luzu:
  const shelfZ = (-5 + backOffset + backThick) / 2;
  
  const middleShelf = createBoard(bottomWidth, board, shelfDepth, 0, height/2, shelfZ);
  cabinetGroup.add(middleShelf);
}