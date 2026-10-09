// src/render/cornerCabinet3d.js
//
// Rysowanie szafki narożnej w 3D - wydzielone z render/viewer3d.js (update3D woła
// renderCornerCabinet zamiast zwykłej ścieżki prostokątnego modułu).
import * as THREE from 'three';
import { state, frontBodyGap } from '../core/state.js';
import { getCornerDoorHinges } from '../engine/cornerParts.js';
import { getWorldFootprint, getCornerDepths } from '../core/layout.js';
import { addBox, addHole, addCornerPanel } from './meshBuilders.js';

// Szafka narożna, kąt prosty (mod.type === 'corner_cabinet', patrz core/
// state.js: addCornerModule) - PIERWSZY nieprostokątny moduł w aplikacji.
// Zgłoszona korekta: pierwsza wersja miała ścięty, skośny narożnik/front -
// docelowo ma to być ostry kąt 90° (typowy "narożnik ślepy") z dwoma
// zwykłymi, prostymi frontami, po jednym na ramię, bez żadnego skosu.
// Lokalny układ (przed position/rotation, jak w generycznej ścieżce
// modułu wyżej): origin w wewnętrznym rogu (styk dwóch ścian), +X wzdłuż
// ramienia A (dimensions.width=legA), +Z wzdłuż ramienia B
// (dimensions.legB). Fronty (mod.elements, rozróżnione przez
// front.cornerArm - dziś dowolnie wiele na ramię, patrz core/zoneTree.js:
// assignFront z opts.cornerArm) przechodzą przez ZWYKŁY recalculateLayout/
// calculateHinges bez żadnych zmian (patrz core/layout.js:
// getCornerArmRect) - są fizycznie płaskimi prostokątami, tylko inaczej
// tu pozycjonowanymi niż w prostokątnym module.
export function renderCornerCabinet(mod, isActive, th, parentGroup) {
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  // Każde ramię ma WŁASNĄ głębokość (core/layout.js: getCornerDepths) -
  // zgłoszona korekta, wcześniej jedna wspólna "depth" dla obu ramion.
  // depthA mierzona wzdłuż Z (głębokość ramienia A, biegnącego wzdłuż X),
  // depthB wzdłuż X (głębokość ramienia B, biegnącego wzdłuż Z).
  const { depthA, depthB } = getCornerDepths(mod);
  const H = parseFloat(mod.dimensions.height) || 720;

  let baseOffsetY = 0;
  if (mod.legs && mod.legs.active) baseOffsetY = parseFloat(mod.legs.height) || 100;

  const { worldW, worldD } = getWorldFootprint(mod);

  const modGroup = new THREE.Group();
  modGroup.userData = { moduleId: mod.id };
  modGroup.position.set(
      (parseFloat(mod.position.x) || 0) + worldW / 2,
      (parseFloat(mod.position.y) || 0) + baseOffsetY + H / 2,
      (parseFloat(mod.position.z) || 0) + worldD / 2
  );
  modGroup.rotation.y = -((parseFloat(mod.rotation) || 0) * Math.PI / 180);

  const innerGroup = new THREE.Group();
  innerGroup.position.set(-legA / 2, -H / 2 - baseOffsetY, -legB / 2);
  modGroup.add(innerGroup);

  const posY = baseOffsetY;
  const udCorp = { moduleId: mod.id, type: 'corpus' };
  const udBack = { moduleId: mod.id, type: 'corpus', part: 'back' };

  // --- Boki (2, na zewnętrznym końcu każdego ramienia) ---
  // Skrócone od tyłu o backThick (jak w zwykłym module przy plecach
  // "nakładane" - core/layout.js/viewer3d.js: sideD = D - backThick) - inaczej
  // płyta plecy siedziałaby WEWNĄTRZ pełnego zasięgu boków (wyglądałoby jak
  // wpuszczane), a nie jako osobna płyta przykładana na zamkniętą od tyłu
  // krawędź boków.
  const backThick = 3;
  addBox(th, H, depthA - backThick, legA - th, posY, backThick, 'corpus', isActive, udCorp, innerGroup);
  addBox(depthB - backThick, H, th, backThick, posY, legB - th, 'corpus', isActive, udCorp, innerGroup);

  // --- Wieniec dolny/górny: obrys L, ostry kąt 90° (bez ścięcia) ---
  // THREE.Shape rysuje w płaszczyźnie XY, a addCornerPanel obraca wytłoczoną
  // geometrię o -90° wokół X, żeby leżała płasko - ten obrót mapuje lokalny
  // Y kształtu na ŚWIATOWE -Z, więc podajemy tu od razu -Z (drugi argument
  // lineTo), żeby po obrocie wylądować na +Z, zgodnie z resztą lokalnego
  // układu (boki/plecy liczone są dla Z rosnącego w stronę pokoju).
  // Narożny "kwadrat" (a od teraz prostokąt, gdy depthA≠depthB) ma rogi
  // (depthB, depthA) - X-owa krawędź wcięcia wyznaczona jest przez głębokość
  // DRUGIEGO ramienia (B), bo to ono fizycznie sięga aż tam wzdłuż X (i
  // odwrotnie dla Z/depthA) - patrz core/layout.js: getCornerArmRect,
  // komentarz przy otherDepth.
  // Zewnętrzne krawędzie (X=legA, Z=legB) pomniejszone o th - wieniec/półka
  // siedzi MIĘDZY bokami (boki przelotowe, jak addBox wyżej: bok A kończy
  // się na X=legA-th, bok B na Z=legB-th), a nie na całej szerokości
  // korpusu (zgłoszona korekta - patrz engine/cabinet.js:
  // getCornerCorpusParts, wieniecA/wieniecB).
  const wieniecA = legA - th;
  const wieniecB = legB - th;
  const shape = new THREE.Shape();
  // Tył wieńca/półki (obie ściany) cofnięty o grubość pleców (backThick) -
  // wymiar głębokości (np. 513) liczy się Z plecami, sama formatka jest o
  // grubość pleców krótsza (510), jak wieniec zwykłej szafki: depth - backThick.
  shape.moveTo(backThick, -backThick);
  shape.lineTo(wieniecA, -backThick);
  shape.lineTo(wieniecA, -depthA);
  shape.lineTo(depthB, -depthA);
  shape.lineTo(depthB, -wieniecB);
  shape.lineTo(backThick, -wieniecB);
  shape.closePath();
  addCornerPanel(shape, th, posY, isActive, udCorp, innerGroup);
  addCornerPanel(shape, th, posY + H - th, isActive, udCorp, innerGroup);

  // --- Półki narożne (typ:'poziom-narozny', ui/cornerConfigModal.js) ---
  // Ten sam obrys L co wieniec wyżej (addCornerPanel/shape) - w realnej
  // stolarce półka w szafce narożnej jest w kształcie L, wspólna dla obu
  // ramion na danej wysokości, NIE dwiema niezależnymi prostymi półkami
  // (zgłoszona korekta - patrz engine/cornerParts.js: getCornerCorpusParts).
  // Listwa narożna (niżej) stoi WEWNĄTRZ korpusu między wieńcami, więc półka
  // ma w tylnym rogu wycięcie battenW×th na tę listwę (zgłoszona korekta).
  const battenW = 100;
  const shelfShape = new THREE.Shape();
  // Listwa stoi ZA plecami (plecy przybijane do niej od zewnątrz): zajmuje
  // X:[backThick, backThick+battenW], Z:[backThick, backThick+th] - wycięcie w
  // półce to dokładnie battenW×th.
  shelfShape.moveTo(backThick, -(backThick + th));
  shelfShape.lineTo(backThick + battenW, -(backThick + th));
  shelfShape.lineTo(backThick + battenW, -backThick);
  shelfShape.lineTo(wieniecA, -backThick);
  // Przód półki cofnięty o 5 mm względem wieńca - tak samo jak zwykła półka
  // ruchoma (engine/cabinet.js: getInteriorParts, innerPartDepth - 5).
  const shelfSetback = 5;
  shelfShape.lineTo(wieniecA, -(depthA - shelfSetback));
  shelfShape.lineTo(depthB - shelfSetback, -(depthA - shelfSetback));
  shelfShape.lineTo(depthB - shelfSetback, -wieniecB);
  shelfShape.lineTo(backThick, -wieniecB);
  shelfShape.closePath();
  (mod.elements || []).forEach(el => {
      if (el.typ !== 'poziom-narozny') return;
      const udShelf = { moduleId: mod.id, type: 'shelf', elementId: el.id };
      addCornerPanel(shelfShape, th, posY + (parseFloat(el.y) || 0), isActive, udShelf, innerGroup);
  });

  // --- Listwa narożna pionowa (w tylnym, wewnętrznym rogu) ---
  // Zgłoszona korekta: dwie płyty plecy (HDF) osobno nie mają się do czego
  // przykleić w rogu, gdzie się stykają - płaska listwa 18(gr.)×100(szer.),
  // przykręcona płasko do ściany ramienia A (Z=0), do której mocują się obie
  // płyty plecy. Wysokość H-2*th: siedzi MIĘDZY wieńcami (nie przechodzi
  // przez nie), a półki opierają się na podpórkach wierconych w niej.
  addBox(battenW, H - th * 2, th, backThick, posY + th, backThick, 'corpus', isActive, udCorp, innerGroup);

  // --- Plecy (2, cienkie płyty HDF "nakładane" - przykręcone płasko na
  // skróconą od tyłu krawędź boków, patrz boki wyżej) ---
  addBox(legA - th - backThick, H, backThick, backThick, posY, 0, 'hdf', isActive, udBack, innerGroup);
  addBox(backThick, H, legB - th - backThick, 0, posY, backThick, 'hdf', isActive, udBack, innerGroup);

  // --- Fronty: zwykłe, płaskie drzwi/szuflady, dowolnie wiele na ramię ---
  // (od wprowadzenia edytora wnętrza per ramię, ui/cornerConfigModal.js,
  // ramię może mieć więcej niż jeden front - core/zoneTree.js: assignFront
  // z opts.cornerArm).
  //
  // Te same zasady co front zwykłego modułu (generyczna ścieżka niżej w tym
  // pliku, zmienna zForFront) - zgłoszona korekta, wcześniej front narożnika
  // siedział sztywno w linii z licem korpusu (Z=depthA/X=depthB), bez
  // zapasu montażowego i bez rozróżnienia nakładane/wpuszczane:
  //   nakładane (domyślne) - front 2mm PRZED licem korpusu (miejsce na
  //     domykanie się drzwi na zawiasach bez ocierania o bok).
  //   wpuszczane - front cofnięty o własną grubość (th), w linii z bokami.
  const frontCfg = { ...(state.project.front || {}), ...(mod.front || {}) };
  const isInsetFront = frontCfg.type === 'wpuszczane';
  const bodyGap = frontBodyGap(frontCfg);
  const frontZA = isInsetFront ? depthA - th : depthA + bodyGap; // czoło ramienia A (Z)
  const frontZB = isInsetFront ? depthB - th : depthB + bodyGap; // czoło ramienia B (X)

  const cornerDoorHinges = new Map(getCornerDoorHinges(mod).map(d => [d.front.id, d]));

  (mod.elements || []).forEach(front => {
      if (front.typ !== 'front') return;
      const fw = parseFloat(front.w) || 0;
      const fh = parseFloat(front.h) || 0;
      const fx = parseFloat(front.x) || 0;
      const fy = parseFloat(front.y) || 0;
      const udFront = { moduleId: mod.id, type: 'front', frontId: front.id };

      if (front.cornerArm === 'A') {
          // Ramię A biegnie wzdłuż +X, front na jego czole: lokalny front.x
          // (0..widthA) mapuje się na X = depthB + front.x (bieg ramienia A
          // zaczyna się dopiero za narożnym prostokątem, którego szerokość w
          // X wyznacza głębokość DRUGIEGO ramienia - depthB).
          addBox(fw, fh, th, depthB + fx, posY + fy, frontZA, 'front', isActive, udFront, innerGroup);
      } else {
          // Ramię B biegnie wzdłuż +Z, front na jego czole: lokalny front.x
          // (0..widthB) mapuje się na Z = depthA + front.x.
          addBox(th, fh, fw, frontZB, posY + fy, depthA + fx, 'front', isActive, udFront, innerGroup);
      }

      // Zawiasy drzwi narożnika (widoczne w trybie przezroczystym, jak w zwykłych
      // szafkach): puszka fi 35 w tylnej stronie frontu, a przy zawiasie na
      // zewnętrznej krawędzi - dwa otwory płytki w boku korpusu.
      const dh = cornerDoorHinges.get(front.id);
      if (dh) {
          dh.hinges.forEach(h => {
              const cupOff = dh.side === 'left' ? h.cupXOffset : fw - h.cupXOffset;
              const cy = posY + fy + h.relY;
              if (front.cornerArm === 'A') {
                  addHole(17.5, 13, depthB + fx + cupOff, cy, frontZA + 6.5, 'z', innerGroup);
                  if (dh.atBok) {
                      addHole(2.5, th, legA - th / 2, cy - 16, depthA - 37, 'x', innerGroup);
                      addHole(2.5, th, legA - th / 2, cy + 16, depthA - 37, 'x', innerGroup);
                  }
              } else {
                  addHole(17.5, 13, frontZB + 6.5, cy, depthA + fx + cupOff, 'x', innerGroup);
                  if (dh.atBok) {
                      addHole(2.5, th, depthB - 37, cy - 16, legB - th / 2, 'z', innerGroup);
                      addHole(2.5, th, depthB - 37, cy + 16, legB - th / 2, 'z', innerGroup);
                  }
              }
          });
      }
  });

  // --- Półki/przegrody wewnątrz ramion (poziom/pion z cornerArm) ---
  // Ten sam lokalny układ 2D (x wzdłuż ramienia, y = wysokość) co fronty
  // wyżej, tylko rozciągnięte na całą głębokość WŁASNEGO ramienia (jak
  // shelfDepth w generycznej ścieżce renderowania niżej w tym pliku), a nie
  // tylko o grubość th jak front. Głębokość liczona od płyty pleców
  // (backThick) do tuż przed czołem frontu (-2mm), żeby nie kolidować z
  // drzwiami - osobno dla każdego ramienia (depthA/depthB).
  const armInnerDepthA = Math.max(10, depthA - 2 - backThick);
  const armInnerDepthB = Math.max(10, depthB - 2 - backThick);
  (mod.elements || []).forEach(el => {
      if (el.typ !== 'poziom' && el.typ !== 'pion') return;
      if (el.cornerArm !== 'A' && el.cornerArm !== 'B') return;
      const ex = parseFloat(el.x) || 0;
      const ey = parseFloat(el.y) || 0;
      const ew = parseFloat(el.w) || 0;
      const eh = parseFloat(el.h) || 0;
      const udShelf = { moduleId: mod.id, type: 'shelf', elementId: el.id };

      if (el.cornerArm === 'A') {
          addBox(ew, eh, armInnerDepthA, depthB + ex, posY + ey, backThick, 'shelf', isActive, udShelf, innerGroup);
      } else {
          addBox(armInnerDepthB, eh, ew, backThick, posY + ey, depthA + ex, 'shelf', isActive, udShelf, innerGroup);
      }
  });

  // --- Nóżki (5 - jedna wspólna w tylnym rogu + po dwie na końcach każdego
  // ramienia) ---
  // Obrys L ma 5 wypukłych (nie wklęsłych) narożników podłogi - dokładnie
  // tyle, ile nóżek widać na zdjęciu referencyjnym (core/state.js:
  // addCornerModule). Wklęsły róg przy froncie (X=depth,Z=depth) nóżki nie
  // dostaje - nie ma tam żadnego materiału korpusu nad podłogą. Rozstaw 30×30,
  // wcięcie 50mm od krawędzi - identycznie jak przy zwykłym module niżej.
  if (mod.legs && mod.legs.active) {
      const legH = parseFloat(mod.legs.height) || 100;
      const rootY = 0.5;
      const udLeg = { moduleId: mod.id, type: 'plinth' };
      addBox(30, legH, 30, 50, rootY, 50, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, legA - 80, rootY, 50, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, legA - 80, rootY, depthA - 80, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, 50, rootY, legB - 80, 'corpus', false, udLeg, innerGroup);
      addBox(30, legH, 30, depthB - 80, rootY, legB - 80, 'corpus', false, udLeg, innerGroup);
  }

  parentGroup.add(modGroup);
}
