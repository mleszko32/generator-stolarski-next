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

  // 1-2. Boki
  cabinetGroup.add(createBoard(board, height, sideDepth, -width/2 + board/2, height/2, sideZ));
  cabinetGroup.add(createBoard(board, height, sideDepth, width/2 - board/2, height/2, sideZ));

  // 3-4. Wieńce
  cabinetGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, board/2, topBottomZ));
  cabinetGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, height - board/2, topBottomZ));

  // 5. Plecy HDF
  cabinetGroup.add(createBoard(hdfWidth, hdfHeight, backThick, 0, height/2, hdfZ));

  // 6. Dynamiczne półki
  const shelvesCount = state.project.interior.shelvesCount;
  if (shelvesCount > 0) {
    const shelfDepth = topBottomDepth - 5; 
    const shelfZ = frontZ - 5 - (shelfDepth / 2); 
    const spacing = (height - (board * 2)) / (shelvesCount + 1);

    for (let i = 1; i <= shelvesCount; i++) {
      const shelfY = board + (spacing * i);
      cabinetGroup.add(createBoard(innerWidth, board, shelfDepth, 0, shelfY, shelfZ));
    }
  }

  // 7. FRONT (Nowość!)
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const fWidth = width - (fc.sides * 2);
    const fHeight = height - fc.top - fc.bottom;
    
    // Obliczamy pozycję na osi Y. Zaczynamy od dolnego luzu i dodajemy połowę wysokości frontu.
    const fY = fc.bottom + (fHeight / 2);
    
    // Na osi Z front zaczyna się tam, gdzie kończy się korpus (frontZ). 
    // Dodajemy 1.5mm szczeliny na odbojnik silikonowy (silikonki).
    const fZ = frontZ + 1.5 + (board / 2);

    const frontMesh = createBoard(fWidth, fHeight, board, 0, fY, fZ);
    
    // Klonujemy materiał i robimy go półprzezroczystym "szkłem", by widzieć wnętrze szafki
    frontMesh.material = frontMesh.material.clone();
    frontMesh.material.transparent = true;
    frontMesh.material.opacity = 0.6;
    
    cabinetGroup.add(frontMesh);
  }
}