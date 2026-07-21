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
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  const innerWidth = width - (board * 2);
  const totalClearance = clearance * 2;

  const frontZ = depth / 2;
  const backZ = -depth / 2;

  let sideDepth, topBottomDepth, hdfZ, hdfWidth, hdfHeight;

  if (type === 'nut') {
    sideDepth = depth;
    topBottomDepth = depth - offset - backThick;
    hdfZ = backZ + offset + (backThick / 2);
    hdfWidth = innerWidth + (grooveDepth * 2) - totalClearance;
    hdfHeight = height - totalClearance;
  } else {
    sideDepth = depth - backThick;
    topBottomDepth = depth - backThick;
    hdfZ = backZ + (backThick / 2);
    hdfWidth = width - totalClearance;
    hdfHeight = height - totalClearance;
  }

  const sideZ = frontZ - (sideDepth / 2);
  const topBottomZ = frontZ - (topBottomDepth / 2);

  // Korpus
  cabinetGroup.add(createBoard(board, height, sideDepth, -width/2 + board/2, height/2, sideZ));
  cabinetGroup.add(createBoard(board, height, sideDepth, width/2 - board/2, height/2, sideZ));
  cabinetGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, board/2, topBottomZ));
  cabinetGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, height - board/2, topBottomZ));
  cabinetGroup.add(createBoard(hdfWidth, hdfHeight, backThick, 0, height/2, hdfZ));

  // 7. FRONTY W STREFACH
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const count = state.project.front.count;
    const gap = state.project.front.gap;

    const fWidth = width - (fc.sides * 2);
    const availableHeight = height - fc.top - fc.bottom;
    const totalGaps = (count - 1) * gap;
    const fHeight = (availableHeight - totalGaps) / count;
    
    // Pozycja Z (na odbojnikach)
    const fZ = frontZ + 1.5 + (board / 2);

    for(let i = 0; i < count; i++) {
      // Obliczamy pozycję Y: 
      // Zaczynamy od dołu (luz dolny).
      // Przesuwamy się w górę o wysokość poprzednich frontów i szczelin: i * (fHeight + gap)
      // Środek geometrii to + połowa wysokości obecnego frontu.
      const fY = fc.bottom + (i * (fHeight + gap)) + (fHeight / 2);
      
      const frontMesh = createBoard(fWidth, fHeight, board, 0, fY, fZ);
      
      frontMesh.material = frontMesh.material.clone();
      frontMesh.material.transparent = true;
      frontMesh.material.opacity = 0.6;
      
      cabinetGroup.add(frontMesh);
    }
  }
}