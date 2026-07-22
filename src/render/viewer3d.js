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

// ... reszta górnej części pliku bez zmian

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

  // 7. FRONTY W STREFACH (Z nowym algorytmem asymetrycznym)
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const gap = state.project.front.gap;
    
    const distributionStr = String(state.project.front.distribution || "1").trim();
    let parsedZones = [];

    // Tłumaczymy ciąg tekstowy (dokładnie to samo co w cabinet.js)
    if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
      const count = parseInt(distributionStr, 10);
      for (let i = 0; i < count; i++) {
        parsedZones.push({ type: 'fr', value: 1 });
      }
    } else {
      const separator = distributionStr.includes(':') ? ':' : ',';
      const zones = distributionStr.split(separator).map(s => s.trim());
      
      parsedZones = zones.map(zone => {
        if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
        const val = parseFloat(zone);
        return (val <= 10) ? { type: 'fr', value: val } : { type: 'fixed', value: val };
      });
    }

    const count = parsedZones.length;
    const fWidth = width - (fc.sides * 2);
    
    let availableHeight = height - fc.top - fc.bottom - ((count - 1) * gap);
    let fixedTotal = 0;
    let frTotal = 0;

    parsedZones.forEach(zone => {
      if (zone.type === 'fixed') fixedTotal += zone.value;
      if (zone.type === 'fr') frTotal += zone.value;
    });

    availableHeight -= fixedTotal;
    const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;
    
    // Pozycja Z (wysunięcie do przodu + 1.5mm na odbojnik)
    const fZ = frontZ + 1.5 + (board / 2);

    // Kursor po osi Y - zaczynamy rysowanie od poziomu dolnego luza
    let currentY = fc.bottom;

    // Rysujemy po kolei od dołu do góry
    parsedZones.forEach(zone => {
      const fHeight = zone.type === 'fixed' ? zone.value : zone.value * singleFrValue;
      
      // Środek dla geometrii (bo Three.js pozycjonuje od środka mesha) to aktualny dół + połowa wysokości frontu
      const meshY = currentY + (fHeight / 2);
      
      const frontMesh = createBoard(fWidth, fHeight, board, 0, meshY, fZ);
      
      // Półprzezroczystość, by widzieć środek korpusu
      frontMesh.material = frontMesh.material.clone();
      frontMesh.material.transparent = true;
      frontMesh.material.opacity = 0.6;
      // Możemy im dać lekko pomarańczowy odcień dla kontrastu (jak u Bluma!)
      frontMesh.material.color.setHex(0xffa040); 
      
      cabinetGroup.add(frontMesh);
      
      // Przesuwamy nasz kursor osi Y w górę o dodany front + wymaganą szczelinę, gotowi na kolejny front
      currentY += fHeight + gap;
    });
  }
}