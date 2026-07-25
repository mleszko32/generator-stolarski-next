import * as THREE from 'three';
// Importujemy moduł do obracania kamerą za pomocą myszki
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from '../core/state.js';
import { getDrawerComponents } from '../core/drawerMath.js'; // DODANE
import { calculateParts } from '../engine/cabinet.js'; // Dodany import
import { updateSidebar } from '../ui/sidebar.js';

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

  // 6. Interakcja z przestrzenią (Raycaster) - Kuloodporna metoda
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let pointerDownPosition = new THREE.Vector2();

  // Rejestrujemy pozycję kursora w momencie WCIŚNIĘCIA przycisku
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerDownPosition.set(event.clientX, event.clientY);
  });

  // Uruchamiamy logikę w momencie PUSZCZENIA przycisku
  renderer.domElement.addEventListener('pointerup', (event) => {
    // Obliczamy dystans, jaki pokonał kursor (twierdzenie Pitagorasa)
    const distance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
    
    // Jeśli myszka przesunęła się o więcej niż 5 pikseli, to był obrót (drag) - przerywamy!
    if (distance > 5) return;

    // Przeliczamy pozycję na układ -1 do 1 dla kamery
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Strzelamy wirtualnym promieniem
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cabinetGroup.children, true);
    
    // DEBUG: Wrzucamy do konsoli wszystko, co przebił promień
    console.log("Detektor trafił w:", intersects);

    // Szukamy naszej pustej strefy
    const clickedSpace = intersects.find(hit => hit.object.userData && hit.object.userData.isClickableSpace);

    if (clickedSpace) {
      const node = clickedSpace.object.userData.nodeRef;
      
      // Usuwamy ewentualne stare menu, jeśli już jakieś wisiało
      const existingMenu = document.getElementById('context-split-menu');
      if (existingMenu) existingMenu.remove();

      // Tworzymy nowoczesne menu wyboru w HTML
      const menu = document.createElement('div');
      menu.id = 'context-split-menu';
      menu.style.position = 'fixed';
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      menu.style.background = '#ffffff';
      menu.style.border = '1px solid #cbd5e1';
      menu.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      menu.style.borderRadius = '6px';
      menu.style.padding = '8px';
      menu.style.zIndex = '1000';
      menu.style.display = 'flex';
      menu.style.flexDirection = 'column';
      menu.style.gap = '4px';

      menu.innerHTML = `
        <div style="font-size: 0.75em; font-weight: bold; color: #64748b; margin-bottom: 4px; padding: 0 4px;">Wybierz podział komory:</div>
        <button id="btn-split-v" style="background: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; text-align: left; font-size: 0.9em;">| Przegroda pionowa</button>
        <button id="btn-split-h" style="background: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; text-align: left; font-size: 0.9em;">- Półka pozioma</button>
      `;

      document.body.appendChild(menu);

      // Obsługa kliknięcia w pion
      document.getElementById('btn-split-v').onclick = () => {
        applySplit('vertical');
      };

      // Obsługa kliknięcia w poziom
      document.getElementById('btn-split-h').onclick = () => {
        applySplit('horizontal');
      };

      // Funkcja wykonująca podział i sprzątająca menu
      function applySplit(direction) {
        node.splitDirection = direction;
        node.children = [
          { id: "space-" + Date.now() + "-1", size: "1fr", splitDirection: "none", children: [] },
          { id: "space-" + Date.now() + "-2", size: "1fr", splitDirection: "none", children: [] }
        ];
        
        update3D();
        menu.remove();
      }

      // Zamknięcie menu po kliknięciu gdziekolwiek indziej
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          window.removeEventListener('pointerdown', closeMenu);
        }
      };
      setTimeout(() => window.addEventListener('pointerdown', closeMenu), 10);
    }
  });
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

  // Iterujemy przez wszystkie moduły w projekcie
  state.project.modules.forEach(mod => {
    const { width, height, depth } = mod.dimensions;
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

    const { parts, mountingData } = calculateParts(); 

    const leftSide = createBoard(board, height, sideDepth, -width/2 + board/2, height/2, sideZ);
    const rightSide = createBoard(board, height, sideDepth, width/2 - board/2, height/2, sideZ);

    function attachSideHoles(boardMesh, isRight) {
      if (!mountingData) return;
      const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x1a202c }); 
      const geom = new THREE.CylinderGeometry(2.5, 2.5, 10, 16); 
      geom.rotateZ(Math.PI / 2);

      mountingData.forEach(drawer => {
        if (!drawer.slideSideHoles) return;
        drawer.slideSideHoles.forEach(hole => {
          const mesh = new THREE.Mesh(geom, holeMaterial);
          const localY = (-height / 2) + hole.y; 
          const localZ = (sideDepth / 2) - hole.x; 
          const localX = (isRight ? -board : board) / 2; 
          mesh.position.set(localX, localY, localZ);
          boardMesh.add(mesh);
        });
      });
    }

    attachSideHoles(leftSide, false);
    attachSideHoles(rightSide, true);

    const moduleGroup = new THREE.Group();
    moduleGroup.add(leftSide);
    moduleGroup.add(rightSide);
    moduleGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, board/2, topBottomZ));
    moduleGroup.add(createBoard(innerWidth, board, topBottomDepth, 0, height - board/2, topBottomZ));
    moduleGroup.add(createBoard(hdfWidth, hdfHeight, backThick, 0, height/2, hdfZ));
// Generowanie wnętrza (Półki, Przegrody i Puste Przestrzenie do klikania)
    parts.forEach(part => {
      if (part.renderData) {
        const { width: pWidth, height: pHeight, depth: pDepth, centerX, centerY, type, nodeRef } = part.renderData;
        
        const localX = centerX - (width / 2);
        const localY = centerY;
        const localZ = topBottomZ; 
        
        // Renderujemy fizyczne formatki
        if (type === 'vertical_partition' || type === 'horizontal_shelf') {
          const mesh = createBoard(pWidth, pHeight, pDepth, localX, localY, localZ);
          moduleGroup.add(mesh);
        } 
        // Renderujemy "powietrze" - obszar interaktywny
        else if (type === 'empty_space') {
          const ghostGeom = new THREE.BoxGeometry(pWidth, pHeight, pDepth);
          // Używamy przezroczystego, jasnozielonego materiału
          const ghostMat = new THREE.MeshBasicMaterial({ 
            color: 0x4ade80, 
            transparent: true, 
            opacity: 0.15,
            side: THREE.DoubleSide
          });
          const ghostMesh = new THREE.Mesh(ghostGeom, ghostMat);
          ghostMesh.position.set(localX, localY, localZ);
          
          // Podpinamy referencję do danych szafki, aby wiedzieć, co dzielimy!
          ghostMesh.userData = { isClickableSpace: true, nodeRef: nodeRef };
          
          moduleGroup.add(ghostMesh);
        }
      }
    });

    // Pozycjonowanie całego modułu w przestrzeni zgodnie z mod.position
    moduleGroup.position.set(mod.position.x, mod.position.y, mod.position.z);
    cabinetGroup.add(moduleGroup);

    // Fronty i szuflady dla modułu
    if (state.project.front.active) {
      const fc = state.project.front.clearance;
      const gap = state.project.front.gap;
      
      const distributionStr = String(state.project.front.distribution || "1").trim();
      let parsedZones = [];

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

      parsedZones.forEach((zone) => {
        if (zone.type === 'fixed') fixedTotal += zone.value;
        if (zone.type === 'fr') frTotal += zone.value;
      });

      availableHeight -= fixedTotal;
      const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;
      
      const fZ = frontZ + 1.5 + (board / 2);
      let currentY = fc.bottom;

      parsedZones.forEach((zone, index) => {
        const fHeight = zone.type === 'fixed' ? zone.value : zone.value * singleFrValue;
        const meshY = currentY + (fHeight / 2);
        
        const frontMesh = createBoard(fWidth, fHeight, board, 0, meshY, fZ);
        frontMesh.material = frontMesh.material.clone();
        frontMesh.material.transparent = true;
        frontMesh.material.opacity = 0.4;
        frontMesh.material.color.setHex(0xffa040); 
        moduleGroup.add(frontMesh);

        if (mountingData && mountingData[index] && mountingData[index].frontHoles) {
          const frontHoleMat = new THREE.MeshBasicMaterial({ color: 0x1a202c });
          const frontGeom = new THREE.CylinderGeometry(1.5, 1.5, 10, 16); 
          frontGeom.rotateX(Math.PI / 2); 

          mountingData[index].frontHoles.forEach(hole => {
            [-1, 1].forEach(sideMultiplier => {
               const mesh = new THREE.Mesh(frontGeom, frontHoleMat);
               const localY = (-fHeight / 2) + hole.y;
               const localX = (sideMultiplier * (fWidth / 2)) + (sideMultiplier * -hole.xOffset);
               const localZ = (-board / 2); 
               mesh.position.set(localX, localY, localZ);
               frontMesh.add(mesh);
            });
          });
        }

        const drawerDetails = getDrawerComponents(state.project.front.drawerSystem, innerWidth, topBottomDepth, fHeight);

        if (drawerDetails) {
          const bottomW = drawerDetails.bottom.width;
          const bottomL = drawerDetails.bottom.length;
          const drawerBoardThickness = 16; 

          const dnoY = currentY + 15 + (drawerBoardThickness / 2);
          const dnoZ = frontZ - (bottomL / 2) - 2; 
          
          const bottomMesh = createBoard(bottomW, drawerBoardThickness, bottomL, 0, dnoY, dnoZ);
          bottomMesh.material = bottomMesh.material.clone();
          bottomMesh.material.color.setHex(0xaaaaaa); 
          moduleGroup.add(bottomMesh);

          const backW = drawerDetails.back.width;
          const backH = drawerDetails.back.height; 
          
          const backY = dnoY + (drawerBoardThickness / 2) + (backH / 2);
          const backZ = frontZ - bottomL - (drawerBoardThickness / 2) - 2;

          const backMesh = createBoard(backW, backH, drawerBoardThickness, 0, backY, backZ);
          backMesh.material = backMesh.material.clone();
          backMesh.material.color.setHex(0xaaaaaa);
          moduleGroup.add(backMesh);
        }

        currentY += fHeight + gap;
      });
    }
  });
}