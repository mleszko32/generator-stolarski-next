// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles, getDrawerComponents, drawerComponentsToParts, calculateNominalLength } from "../core/drawerMath.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { calculateHinges } from "../core/hingeMath.js";
import { fmtMm } from "../utils/math.js";
import { getWorktopParts } from "../core/worktops.js";
import { recalculateAllLayouts, getWorldFootprint, getCornerDepths } from "../core/layout.js";
import { getCorpusHoles, getPionMountHoles, getCorpusParts, getBackPanelParts } from "./carcaseParts.js";
import { getCornerCorpusParts } from "./cornerParts.js";
import { getSlopeCabinetParts, getSlopeFrontParts } from "../core/slopeCabinet.js";

export function calculateParts() {
  // Fronty muszą mieć aktualne el.x/y/w/h zanim policzymy z nich formatki.
  // Nie zakładamy, że update3D() (render) pobiegł wcześniej.
  recalculateAllLayouts();

  const activeModuleId = state.activeModuleId;
  const mod = state.project.modules.find(m => m.id === activeModuleId);
  if (!mod) return { parts: [], mountingData: [] };
  return calculateModuleParts(mod);
}

// Formatki i dane wierceń (mountingData) jednej, dowolnej szafki - to samo co calculateParts()
// dla aktywnej, używane też przez instrukcje montażu (core/cabinetDrillings.js). Wymaga
// aktualnego layoutu (recalculateAllLayouts / recalculateLayout).
export function calculateModuleParts(mod) {
  const config = state.project;
  let rawParts = [];
  let mountingData = [];

  // Szafka narożna (mod.type === 'corner_cabinet') ma dwa ramiona zamiast
  // jednego prostokątnego korpusu - getCorpusParts/getBackPanelParts
  // zakładają jeden wspólny width/depth i dałyby błędne formatki, więc ma
  // własną, równoległą funkcję (patrz getCornerCorpusParts niżej).
  // getCorpusHoles (nawierty łączeń kołek+wkręt) też zakłada jeden
  // prostokątny korpus - dla narożnika pomijamy (brak jeszcze rysunku
  // technicznego dla tego typu modułu, patrz plan boki dokładane/narożnik).
  if (mod.type === 'corner_cabinet') {
      rawParts.push(...getCornerCorpusParts(mod, config));
  } else if (mod.type === 'slope_cabinet') {
      // Szafka pod skos: formatki korpusu i wnętrza z core/slopeCabinet.js.
      rawParts.push(...getSlopeCabinetParts(mod, config));
      rawParts.push(...getSlopeFrontParts(mod, config));
  } else {
      rawParts.push(...getCorpusParts(mod, config));
      rawParts.push(...getBackPanelParts(mod, config));
      mountingData.push(...getCorpusHoles(mod, config));
  }
  // Szafka pod skos ma wnętrze i fronty już policzone wyżej (przycięte skosem).
  if (mod.type !== 'slope_cabinet') {
    rawParts.push(...getInteriorParts(mod, config));

    const frontsAndDrawers = getFrontsAndDrawers(mod, config);
    rawParts.push(...frontsAndDrawers.parts);

    mountingData.push(...frontsAndDrawers.mountingData);
    mountingData.push(...getPionMountHoles(mod, config));
    mountingData.push(...getGlobalHingesForModule(mod, config));
  }

  const aggregated = {};
  rawParts.forEach(part => {
     // materialId w kluczu: dwa fronty o tym samym rozmiarze, ale innym
     // materiale (core/state.js: pricing.frontMaterials), to RÓŻNE formatki -
     // bez tego druga po prostu zliczyłaby się do ilości pierwszej.
     const key = `${part.category}_${part.name}_${part.length}_${part.width}_${part.materialId || ''}`;
     if (aggregated[key]) {
         aggregated[key].qty += part.qty;
     } else {
         aggregated[key] = { ...part };
     }
  });

  return { parts: Object.values(aggregated), mountingData };
}

function getGlobalHingesForModule(targetMod, config) {
  const mountingData = [];
  const targetAbsX = parseFloat(targetMod.position.x) || 0;
  const targetAbsZ = parseFloat(targetMod.position.z) || 0;
  const targetD = parseFloat(targetMod.dimensions.depth) || 513;
  const targetLegH = (targetMod.legs && targetMod.legs.active) ? (parseFloat(targetMod.legs.height) || 0) : 0;
  const targetAbsY = (parseFloat(targetMod.position.y) || 0) + targetLegH;
  const targetH = parseFloat(targetMod.dimensions.height);
  const targetW = parseFloat(targetMod.dimensions.width) || 600;
  const th = config.materials.boardThickness || 18;

  config.modules.forEach(sourceMod => {
      const sourceAbsX = parseFloat(sourceMod.position.x) || 0;
      const sourceAbsZ = parseFloat(sourceMod.position.z) || 0;
      const sourceD = parseFloat(sourceMod.dimensions.depth) || 513;
      const sourceLegH = (sourceMod.legs && sourceMod.legs.active) ? (parseFloat(sourceMod.legs.height) || 0) : 0;
      const sourceAbsY = (parseFloat(sourceMod.position.y) || 0) + sourceLegH;
      const sourceW = parseFloat(sourceMod.dimensions.width) || 600;

      const overlapX = Math.max(0, Math.min(targetAbsX + targetW, sourceAbsX + sourceW) - Math.max(targetAbsX, sourceAbsX));
      // Samo nachodzenie w X nie wystarcza - dwie szafki stojące przy różnych
      // ścianach (różne Z) mogą przypadkiem mieć nakładający się zakres X, co
      // dawało fantomowe "globalne" zawiasy (dublujące się nawierty prawie w tym
      // samym miejscu na boku) dla drzwi z zupełnie innej, niepowiązanej szafki
      // (zgłoszony bug). Drzwi "spinające" dwie szafki muszą stać w tym samym
      // miejscu pokoju, więc wymagamy nachodzenia też w Z.
      const overlapZ = Math.max(0, Math.min(targetAbsZ + targetD, sourceAbsZ + sourceD) - Math.max(targetAbsZ, sourceAbsZ));

      if (overlapX > 10 && overlapZ > 10) {
          if (sourceMod.elements) {
              const fronts = sourceMod.elements.filter(el => el.typ === 'front' && el.subtype.includes('drzwi'));
              fronts.forEach(front => {

                  let obstacles = [];
                  config.modules.forEach(otherMod => {
                      const otherAbsX = parseFloat(otherMod.position.x) || 0;
                      const otherAbsZ = parseFloat(otherMod.position.z) || 0;
                      const otherLegH = (otherMod.legs && otherMod.legs.active) ? (parseFloat(otherMod.legs.height) || 0) : 0;
                      const otherAbsY = (parseFloat(otherMod.position.y) || 0) + otherLegH;

                      if (Math.abs(sourceAbsX - otherAbsX) < 10 && Math.abs(sourceAbsZ - otherAbsZ) < 10) {
                          const dy = otherAbsY - sourceAbsY;
                          if (otherMod.elements) {
                              otherMod.elements.forEach(el => {
                                  if (el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna') {
                                      obstacles.push({ ...el, y: el.y + dy });
                                  }
                              });
                          }
                          const otherH = parseFloat(otherMod.dimensions.height);
                          obstacles.push({ typ: 'poziom', y: dy, h: th, isStructural: true });
                          obstacles.push({ typ: 'poziom', y: dy + otherH - th, h: th, isStructural: true });
                      }
                  });

                  const side = front.subtype === 'drzwi-lp' ? (front.id.includes('-L-') ? 'left' : 'right') : (front.openingSide || 'left');
                  const hinges = calculateHinges(front, th, obstacles, side);

                  const translatedHinges = hinges.map(h => {
                      const hingeAbsY = sourceAbsY + h.y; 
                      const localY = hingeAbsY - targetAbsY; 
                      const isLocal = localY >= -5 && localY <= targetH + 5;
                      return { ...h, y: localY, isLocal: isLocal };
                  });

                  if (translatedHinges.some(h => h.isLocal) || sourceMod.id === targetMod.id) {
                      let partName = `Drzwi ${side === 'left' ? 'Lewe' : 'Prawe'}`;
                      mountingData.push({ type: 'door', name: partName, side: side, frontId: front.id, hinges: translatedHinges });
                  }
              });
          }
      }
  });
  return mountingData;
}

// Wszystkie formatki projektu BEZ agregacji - każda z nazwą szafki (moduleName).
// Potrzebne do etykiet i rozkroju, gdzie liczy się, do której szafki należy
// dana sztuka; calculateAllProjectParts() niżej scala je w listę zbiorczą.
export function collectProjectParts() {
  recalculateAllLayouts();

  const config = state.project;
  let allParts = [];

  config.modules.forEach(mod => {
    const modParts = [];
    if (mod.type === 'corner_cabinet') {
        modParts.push(...getCornerCorpusParts(mod, config));
    } else if (mod.type === 'slope_cabinet') {
        modParts.push(...getSlopeCabinetParts(mod, config));
        modParts.push(...getSlopeFrontParts(mod, config));
    } else {
        modParts.push(...getCorpusParts(mod, config));
        modParts.push(...getBackPanelParts(mod, config));
    }
    if (mod.type !== 'slope_cabinet') {
      modParts.push(...getInteriorParts(mod, config));
      modParts.push(...getFrontsAndDrawers(mod, config).parts);
    }

    allParts.push(...modParts.map(p => ({ ...p, moduleName: mod.name })));
  });

  // Boki dokładane (core/state.js: addSidePanel) NIE należą do żadnego
  // modułu - mają obejmować kilka szafek naraz (np. cały słup dolna+górna),
  // więc trafiają do wspólnej listy formatek projektu, ale nie do
  // calculateParts() (lista formatek AKTYWNEGO modułu).
  (config.sidePanels || []).forEach(panel => {
    allParts.push(...getSidePanelParts(panel, config).map(p => ({ ...p, moduleName: panel.name || (panel.kind === 'blenda' ? 'Blenda' : 'Bok dokładany') })));
  });

  // Szafka narożna (mod.type === 'corner_cabinet') wyłączona z tego wspólnego
  // biegu cokołu - jej odcisk to L (dwa ramiona), a ta logika liczy jeden
  // prostokątny odcinek na bazie getWorldFootprint (bounding box legA×legB),
  // co dałoby jedną fikcyjną, za długą listwę cokołu zamiast dwóch krótkich
  // (po jednej na czoło każdego ramienia). Render 3D na razie też nie rysuje
  // cokołu narożnika (patrz renderCornerCabinet) - tylko same nóżki.
  const baseCabinets = config.modules.filter(m => m.legs && m.legs.active && m.legs.plinth && m.type !== 'corner_cabinet' && m.type !== 'slope_cabinet');

  // Tylko szafki o TEJ SAMEJ orientacji (rotation) mogą fizycznie stać w jednym,
  // ciągłym biegu cokołu - stoją wtedy pod tą samą ścianą. Dla rotation 0/180
  // bieg biegnie wzdłuż X (jak dawniej), dla 90/270 - wzdłuż Z, bo obrót zamienia
  // odcisk szerokość/głębokość (patrz getWorldFootprint w core/layout.js).
  const byRotation = new Map();
  baseCabinets.forEach(mod => {
      const rot = ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;
      if (!byRotation.has(rot)) byRotation.set(rot, []);
      byRotation.get(rot).push(mod);
  });

  let plinthRuns = [];
  byRotation.forEach((mods, rot) => {
      const alongZ = rot === 90 || rot === 270;
      mods.sort((a, b) => {
          const av = alongZ ? (parseFloat(a.position.z) || 0) : (parseFloat(a.position.x) || 0);
          const bv = alongZ ? (parseFloat(b.position.z) || 0) : (parseFloat(b.position.x) || 0);
          return av - bv;
      });

      mods.forEach(mod => {
          const x = parseFloat(mod.position.x) || 0;
          const y = parseFloat(mod.position.y) || 0;
          const z = parseFloat(mod.position.z) || 0;
          const { worldW, worldD } = getWorldFootprint(mod);
          const h = parseFloat(mod.legs.height);
          const offset = parseFloat(mod.legs.plinthOffset !== undefined ? mod.legs.plinthOffset : 40);

          // "along" = pozycja wzdłuż kierunku, w którym rośnie bieg; "runLen" = ile
          // zajmuje w tym kierunku; "crossPos"/"frontCoord" muszą się zgadzać u
          // sąsiada, żeby w ogóle mogły się połączyć w jeden ciągły odcinek.
          const along = alongZ ? z : x;
          const runLen = alongZ ? worldD : worldW;
          const crossPos = alongZ ? x : z;
          const frontCoord = alongZ ? (x + worldW) : (z + worldD);

          let joined = false;
          if (plinthRuns.length > 0) {
              let last = plinthRuns[plinthRuns.length - 1];
              if (last.rot === rot && Math.abs((last.along + last.runLen) - along) <= 1 &&
                  last.crossPos === crossPos && last.h === h && last.offset === offset && last.frontCoord === frontCoord) {
                  last.runLen += runLen + (along - (last.along + last.runLen));
                  joined = true;
              }
          }
          if (!joined) {
              plinthRuns.push({ rot, along, runLen, crossPos, y, h, offset, frontCoord });
          }
      });
  });

  plinthRuns.forEach((run, index) => {
    allParts.push({
      name: `Cokół dolny (Odcinek ${index + 1})`,
      length: parseFloat(run.runLen.toFixed(1)),
      width: parseFloat(run.h.toFixed(1)),
      qty: 1,
      category: "Korpus",
      moduleName: "Elementy zbiorcze"
    });
  });

  // Blaty (core/worktops.js) - kategoria "Blat": w liście formatek i kosztorysie,
  // ale poza rozkrojem płyt i okleiną (cięte osobno z płyt 4100/2050).
  allParts.push(...getWorktopParts(config));

  return allParts;
}

export function calculateAllProjectParts() {
  const allParts = collectProjectParts();
  const aggregated = {};
  allParts.forEach(part => {
     // materialId w kluczu - patrz calculateParts() wyżej (ten sam powód).
     const key = `${part.category}_${part.name}_${part.length}_${part.width}_${part.materialId || ''}`;
     if (aggregated[key]) {
         aggregated[key].qty += part.qty;
         if (!aggregated[key].modules.includes(part.moduleName)) {
             aggregated[key].modules.push(part.moduleName);
         }
     } else {
         aggregated[key] = {
             category: part.category || "Inne",
             name: part.name,
             length: part.length,
             width: part.width,
             qty: part.qty,
             materialId: part.materialId,
             modules: [part.moduleName]
         };
     }
  });

  return Object.values(aggregated);
}

function getInteriorParts(mod, config) {
  const parts = [];
  if (!mod.elements || mod.elements.length === 0) return parts;

  const { depth, width } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };

  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const frontType = f.type || 'nakladane';
  const isInset = frontType === 'wpuszczane';

  const depthFor = (d) => (backP.type === 'nut' ? d - backP.offset - backThick : d - backThick) - (isInset ? board : 0);
  const innerPartDepth = depthFor(depth);
  // Szafka narożna ma DWIE niezależne głębokości ramion (core/layout.js:
  // getCornerDepths) - półka/przegroda w ramieniu B musi liczyć się z
  // depthB, nie ze wspólnym `depth` (=depthA) jak reszta modułów, inaczej
  // przy depthA≠depthB formatka wychodziłaby błędnej głębokości.
  const cornerDepths = mod.type === 'corner_cabinet' ? getCornerDepths(mod) : null;
  const innerPartDepthForEl = (el) => {
    if (!cornerDepths) return innerPartDepth;
    return depthFor(el.cornerArm === 'B' ? cornerDepths.depthB : cornerDepths.depthA);
  };

  mod.elements.forEach(el => {
    if (el.typ === 'pion') {
      parts.push({ name: `Przegroda pionowa`, length: parseFloat((el.h || 0).toFixed(1)), width: innerPartDepthForEl(el), qty: 1, category: "Korpus" });
    } else if (el.typ === 'poziom' && !el.isStructural) {
      // NAPRAWA: sama nazwa "P<szerokość_modułu>" myliła, gdy przegroda pionowa
      // dzieli moduł na wnęki węższe niż cały korpus - półka miała np. 458mm,
      // a nazwa sugerowała pełne 960mm (zgłoszony bug). Realna długość (el.w)
      // i tak trafiała poprawnie do kolumny "Wymiar", więc dopisujemy ją też
      // w nazwie w nawiasie - zawsze, niezależnie czy półka jest na całą
      // szerokość czy nie, żeby format był przewidywalny na liście formatek.
      const realW = fmtMm(el.w || 0);
      parts.push({ name: `P${width} (${realW})`, length: parseFloat((el.w || 0).toFixed(1)), width: innerPartDepthForEl(el) - 5, qty: 1, category: "Korpus" });
    }
  });

  return parts;
}

function getFrontsAndDrawers(mod, config) {
  const parts = [];
  const mountingData = [];
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front') : [];

  if (fronts.length === 0) return { parts, mountingData };
  fronts.sort((a, b) => a.y - b.y);

  const { width, depth, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
  const topBottomDepth = backP.type === 'nut' ? depth - backP.offset - config.materials.backThickness : depth - config.materials.backThickness;

  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const isInset = (f.type || 'nakladane') === 'wpuszczane';

  fronts.forEach((front, index) => {
    let partName = "Front";
    if (front.subtype === 'szuflada') { partName = `Front szuflady`; } 
    else if (front.subtype === 'szuflada-wewnetrzna') { partName = `Front szuflady wewn.`; } 
    else if (front.subtype === 'drzwi') {
      // Strona zawiasów: lewe/prawe to różne formatki (inne rozmieszczenie otworów pod zawiasy).
      partName = `Drzwi ${(front.openingSide || 'left') === 'right' ? 'Prawe' : 'Lewe'}`;
    } 
    else if (front.subtype === 'drzwi-lp') {
      const side = front.id.includes('-L-') ? 'Lewe' : 'Prawe';
      partName = `Drzwi ${side}`;
    }

    parts.push({ name: partName, length: parseFloat((front.h || 0).toFixed(1)), width: parseFloat((front.w || 0).toFixed(1)), qty: 1, category: "Front", materialId: front.materialId });

    if (front.subtype.includes('szuflada')) {
      const isBottomInZone = front.frontIndex === 0;
      
      let innerThick = 18;
      let innerSetback = 0;
      if (front.subtype === 'szuflada-wewnetrzna') {
          innerThick = parseFloat(front.innerFrontThickness ?? 18);
          innerSetback = parseFloat(front.innerSetback ?? 2);
      }

      let availableSpace = front.h;
      if (front.y < board) availableSpace -= board; 
      if (front.y + front.h > height - board) availableSpace -= board; 

      const sysName = (f.drawerSystem || 'merivobox').toLowerCase();

      // NAPRAWA: front.forceVariant to klucz katalogu (np. "srednia"), nie litera
      // typu ("K") — to litera jest tym, co dany system pokazuje jako nazwę
      // (patrz drawerSystems.js: różne systemy różnie nazywają ten sam klucz,
      // np. "wysoka" to E w Merivoboxie, ale C w Legraboxie/antaro/GTV). Wcześniej
      // porównanie po literze nigdy się nie zgadzało, więc wymuszony wariant był
      // po cichu ignorowany w tym podglądzie (patrz ui/properties.js, zakładka
      // Szuflady, gdzie ten sam front.forceVariant jest teraz edytowalny).
      let simulatedSpace = availableSpace;
      if (front.forceVariant && front.forceVariant !== 'auto') {
          const variantData = (drawerSystems[sysName] || drawerSystems.merivobox).variants[front.forceVariant];
          if (variantData) simulatedSpace = Math.min(variantData.height, availableSpace);
      }

      // Głębokość dla doboru długości prowadnicy (NL) - wspólna dla nawiertów
      // (MOVENTO: tylne otwory zależą od NL) i dla formatek szuflady niżej.
      let availableDepth = topBottomDepth;
      if (front.subtype === 'szuflada-wewnetrzna') {
          availableDepth -= (innerThick + innerSetback);
      } else if (isInset) {
          // Front wpuszczany wjeżdża w głąb korpusu o swoją grubość (patrz też
          // getInteriorParts() wyżej) — o tyle mniej miejsca zostaje na prowadnice i dno szuflady.
          availableDepth -= board;
      }
      if (front.forceNL && !isNaN(parseFloat(front.forceNL))) {
          availableDepth = parseFloat(front.forceNL) + 10;
      }
      const drawerNL = calculateNominalLength(availableDepth, sysName);

      if (typeof calculateDrawerHoles === 'function') {
        // NAPRAWA: korekta "dolnego frontu" w calculateDrawerHoles (core/drawerMath.js)
        // zakłada, że front na dole stosu ZJEŻDŻA na wieniec dolny (styl nakładany) -
        // dla frontu wpuszczanego front.y jest już liczone od wnętrza (bez zjazdu na
        // wieniec, patrz core/layout.js), więc bez tego warunku otwory prowadnicy/frontu
        // wychodziłyby o całą grubość płyty za wysoko dla wpuszczanego dolnego frontu.
        // Sprawdzamy geometrię (baseZone.minY ~ th), nie tag "boundBottom" - starsze
        // projekty (import AI w sidebar.js) budują baseZone bez tego taga wcale, więc
        // poleganie tylko na nim wyłączyłoby korektę też dla zwykłych, nakładanych
        // frontów w tych projektach.
        const isBottomOuter = front.baseZone && parseFloat(front.baseZone.minY) <= board + 0.5;
        const zoneBottom = front.baseZone ? (parseFloat(front.baseZone.minY) || 0) + (parseFloat(front.baseZone.offsetBottom) || 0) : null;
        const drawerHoles = calculateDrawerHoles(sysName, front.y, simulatedSpace, board, front.frontIndex, isBottomInZone && isBottomOuter && !isInset, drawerNL, zoneBottom);
        if (drawerHoles) { 
          const adjustedHoles = JSON.parse(JSON.stringify(drawerHoles));
          
          if (front.subtype === 'szuflada-wewnetrzna') {
              const totalSetback = innerThick + innerSetback; 
              if (adjustedHoles.slideSideHoles) {
                  adjustedHoles.slideSideHoles.forEach(h => {
                      h.x += totalSetback; 
                  });
              }
          }

          if (adjustedHoles.frontHoles) {
              adjustedHoles.frontHoles.forEach(h => {
                  const actualOverlapLeft = board - (front.x || 0);
                  const rightGap = width - ((front.x || 0) + (front.w || width));
                  const actualOverlapRight = board - rightGap;
                  const innerDist = 20.5;
                  
                  h.xOffsetLeft = actualOverlapLeft + innerDist;
                  h.xOffsetRight = actualOverlapRight + innerDist;
              });
          }

          adjustedHoles.frontId = front.id; 
          adjustedHoles.type = 'drawer'; 
          mountingData.push(adjustedHoles); 
        }
      }

      if (typeof getDrawerComponents === 'function') {
        const userForcedVariant = front.forceVariant || 'auto';
        // Uwaga: tu celowo pełne availableSpace, nie simulatedSpace (przycięte do
        // wysokości wymuszonego wariantu) — getDrawerComponents/getDrawerVariant
        // same sprawdzają, czy w realnej dostępnej przestrzeni mieści się wymuszony
        // wariant (próg minSpace jest zawsze większy niż sama wysokość wariantu).
        // Podanie tu simulatedSpace gwarantowałoby odrzucenie wymuszenia.
        const drawerComps = getDrawerComponents(sysName, width - (board * 2), availableDepth, availableSpace, userForcedVariant, front.drawerSideHeight);

        if (drawerComps) parts.push(...drawerComponentsToParts(drawerComps));
      }
    } 
  });

  return { parts, mountingData };
}

// Blenda (core/state.js: addBlenda): czoło (dekor frontów) + kołnierz mocujący (płyta
// korpusu), jak dawne blendy szafki. Kołnierz biegnie wzdłuż krawędzi czoła wskazanej w
// panel.flange: lewa/prawa - równolegle do wysokości, gora/dol - do szerokości.
function getBlendaParts(panel, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const w = parseFloat(panel.dimensions?.width) || 0;
  const h = parseFloat(panel.dimensions?.height) || 0;
  const d = parseFloat(panel.dimensions?.depth) || 0;
  const label = panel.decor ? `Blenda (${panel.decor})` : 'Blenda';
  const base = panel.name ? `${label} — ${panel.name}` : label;
  const parts = [{ name: `${base} (Czoło)`, length: h, width: w, qty: 1, category: "Front", materialId: panel.materialId }];
  const flange = panel.flange || 'prawa';
  if (flange !== 'brak' && d - th > 0) {
    const along = (flange === 'lewa' || flange === 'prawa') ? h : w;
    parts.push({ name: `${base} (Mocowanie wewn.)`, length: along, width: d - th, qty: 1, category: "Korpus" });
  }
  return parts;
}

// Bok dokładany (core/state.js: addSidePanel) to samodzielny, płaski
// obiekt projektu (nie właściwość jednego modułu jak blenda) - fizycznie
// to tylko jedna płyta (front, dekor), więc jedna formatka: wysokość x
// głębokość (grubość to grubość samej płyty, nie osobny wymiar cięcia).
// Kategoria "Front", bo to zwykle ten sam, droższy dekor co fronty (lakier/
// fornir/okleina) - w Kosztorysie (calculateProjectCost) liczy się razem
// z frontami, dając realną sumę m² tego dekoru do wyceny.
function getSidePanelParts(panel, config) {
  if (panel.kind === 'blenda') return getBlendaParts(panel, config);
  const label = panel.decor ? `Bok dokładany (${panel.decor})` : 'Bok dokładany';
  const name = panel.name ? `${label} — ${panel.name}` : label;
  return [{
    name,
    length: parseFloat(panel.dimensions?.height) || 0,
    width: parseFloat(panel.dimensions?.depth) || 0,
    qty: 1,
    category: "Front",
    materialId: panel.materialId
  }];
}