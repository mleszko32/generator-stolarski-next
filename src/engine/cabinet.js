// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles, getDrawerComponents } from "../core/drawerMath.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { calculateHinges } from "../core/hingeMath.js";
import { totalEdgeBandingMeters, EDGE_BANDING_RESERVE } from "./edgeBanding.js";
import { recalculateLayout, recalculateAllLayouts, getTraverseConfig, getWorldFootprint, getCornerDepths } from "../core/layout.js";

export function calculateParts() {
  // Fronty muszą mieć aktualne el.x/y/w/h zanim policzymy z nich formatki.
  // Nie zakładamy, że update3D() (render) pobiegł wcześniej.
  recalculateAllLayouts();

  const activeModuleId = state.activeModuleId;
  const mod = state.project.modules.find(m => m.id === activeModuleId);
  if (!mod) return { parts: [], mountingData: [] };

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
  } else {
      rawParts.push(...getCorpusParts(mod, config));
      rawParts.push(...getBackPanelParts(mod, config));
      mountingData.push(...getCorpusHoles(mod, config));
  }
  rawParts.push(...getInteriorParts(mod, config));
  rawParts.push(...getFillerParts(mod, config));

  const frontsAndDrawers = getFrontsAndDrawers(mod, config);
  rawParts.push(...frontsAndDrawers.parts);

  mountingData.push(...frontsAndDrawers.mountingData);
  mountingData.push(...getPionMountHoles(mod, config));
  mountingData.push(...getGlobalHingesForModule(mod, config));

  const aggregated = {};
  rawParts.forEach(part => {
     const key = `${part.category}_${part.name}_${part.length}_${part.width}`;
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
    } else {
        modParts.push(...getCorpusParts(mod, config));
        modParts.push(...getBackPanelParts(mod, config));
    }
    modParts.push(...getInteriorParts(mod, config));
    modParts.push(...getFillerParts(mod, config));

    const frontsAndDrawers = getFrontsAndDrawers(mod, config);
    modParts.push(...frontsAndDrawers.parts);

    allParts.push(...modParts.map(p => ({ ...p, moduleName: mod.name })));
  });

  // Boki dokładane (core/state.js: addSidePanel) NIE należą do żadnego
  // modułu - mają obejmować kilka szafek naraz (np. cały słup dolna+górna),
  // więc trafiają do wspólnej listy formatek projektu, ale nie do
  // calculateParts() (lista formatek AKTYWNEGO modułu).
  (config.sidePanels || []).forEach(panel => {
    allParts.push(...getSidePanelParts(panel, config).map(p => ({ ...p, moduleName: panel.name || 'Bok dokładany' })));
  });

  // Szafka narożna (mod.type === 'corner_cabinet') wyłączona z tego wspólnego
  // biegu cokołu - jej odcisk to L (dwa ramiona), a ta logika liczy jeden
  // prostokątny odcinek na bazie getWorldFootprint (bounding box legA×legB),
  // co dałoby jedną fikcyjną, za długą listwę cokołu zamiast dwóch krótkich
  // (po jednej na czoło każdego ramienia). Render 3D na razie też nie rysuje
  // cokołu narożnika (patrz renderCornerCabinet) - tylko same nóżki.
  const baseCabinets = config.modules.filter(m => m.legs && m.legs.active && m.legs.plinth && m.type !== 'corner_cabinet');

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

  return allParts;
}

export function calculateAllProjectParts() {
  const allParts = collectProjectParts();
  const aggregated = {};
  allParts.forEach(part => {
     const key = `${part.category}_${part.name}_${part.length}_${part.width}`;
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
             modules: [part.moduleName]
         };
     }
  });

  return Object.values(aggregated);
}

export function calculateProjectHardware() {
  recalculateAllLayouts();

  const config = state.project;
  const hardwareList = {};

  config.modules.forEach(mod => {
    const W = parseFloat(mod.dimensions.width) || 600;
    const D = parseFloat(mod.dimensions.depth) || 513;
    const board = config.materials.boardThickness || 18;
    const backThick = config.materials.backThickness || 3;
    const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
    const topBottomDepth = backP.type === 'nut' ? D - backP.offset - backThick : D - backThick;

    const f = { ...(config.front || {}), ...(mod.front || {}) };
    const fc = { ...(config.front?.clearance || {}), ...(mod.front?.clearance || {}) };

    if (mod.legs && mod.legs.active) {
      const legH = parseFloat(mod.legs.height) || 100;
      const legOverrides = mod.legs.heightOverrides || {};
      // Każda nóżka liczona osobno wg swojej (ew. nadpisanej) wysokości — patrz
      // ui/properties.js "Nóżki — wysokości ręczne" — żeby lista zakupów odzwierciedlała
      // realny komplet (np. 3x H-100 + 1x H-90), a nie zawsze 4x ten sam model.
      // Szafka narożna ma 5 nóżek (kształt L ma 5 wypukłych rogów podłogi,
      // patrz render/viewer3d.js: renderCornerCabinet) - bez nadpisań per-nóżka.
      const legCount = mod.type === 'corner_cabinet' ? 5 : 4;
      for (let i = 0; i < legCount; i++) {
        const ov = legOverrides[i];
        const h = (ov !== undefined && ov !== null && ov !== '') ? (parseFloat(ov) || legH) : legH;
        const legKey = `Nóżka regulowana H-${h}`;
        if (!hardwareList[legKey]) hardwareList[legKey] = { name: legKey, qty: 0, unit: 'szt.' };
        hardwareList[legKey].qty += 1;
      }
    }

    const joinKey = `Złącze korpusowe (Kołek 8x30 + Konfirmat)`;
    if (!hardwareList[joinKey]) hardwareList[joinKey] = { name: joinKey, qty: 0, unit: 'kpl.' };
    hardwareList[joinKey].qty += 8; 

    if (!mod.elements) return;

    const allFronts = mod.elements.filter(el => el.typ === 'front');
    const allObstacles = mod.elements.filter(el => el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna');
    // Półka narożna (typ:'poziom-narozny', ui/cornerConfigModal.js) jest
    // wspólna dla OBU ramion (kształt L) - liczy się jako przeszkoda dla
    // zawiasów w każdym z nich, nie tylko w jednym.
    const cornerShelfObstacles = mod.elements.filter(el => el.typ === 'poziom-narozny');

    // Szafka narożna ma dwa NIEZALEŻNE ramiona (cornerArm 'A'/'B') - "góra
    // stosu" i przeszkody dla zawiasów muszą liczyć się OSOBNO w każdym z nich,
    // inaczej front najwyżej w jednym ramieniu mógłby przypadkiem "ukraść"
    // status najwyższego frontowi w drugim (albo dostać kolizję z półką z
    // sąsiedniego ramienia). Dla zwykłego modułu cornerArm jest zawsze
    // undefined -> jedna grupa '_', zachowanie identyczne jak wcześniej.
    const frontsByArm = {};
    allFronts.forEach(f => {
      const key = f.cornerArm || '_';
      (frontsByArm[key] = frontsByArm[key] || []).push(f);
    });

    Object.entries(frontsByArm).forEach(([armKey, fronts]) => {
      const obstacles = allObstacles.filter(o => (o.cornerArm || '_') === armKey).concat(cornerShelfObstacles);
      fronts.sort((a, b) => a.y - b.y);

      fronts.forEach((front, index) => {
        const isInternalDrawer = front.subtype === 'szuflada-wewnetrzna';

        if (front.subtype === 'szuflada' || isInternalDrawer) {
          const isBottomInZone = front.frontIndex === 0;
          const isTopInZone = index === fronts.length - 1;

          let availableSpace = front.h;
          if (isBottomInZone) availableSpace -= (board - (parseFloat(fc.bottom) || 0));
          if (isTopInZone) availableSpace -= (board - (parseFloat(fc.top) || 0));

          const innerWidth = front.baseZone ? (front.baseZone.maxX - front.baseZone.minX) : W - (board * 2);
          const userForcedVariant = front.forceVariant || 'auto';

          const sysName = f.drawerSystem || 'merivobox';
          const drawerComps = getDrawerComponents(sysName, innerWidth, topBottomDepth, availableSpace, userForcedVariant);

          if (drawerComps) {
            const nl = drawerComps.nominalLength;
            const variantType = drawerComps.back.variantType ? drawerComps.back.variantType.toUpperCase() : 'M';

            const hwKey = `Komplet szuflady (${sysName.toUpperCase()} - H:${variantType} L-${nl})`;

            if (!hardwareList[hwKey]) hardwareList[hwKey] = { name: hwKey, qty: 0, unit: 'kpl.' };
            hardwareList[hwKey].qty += 1;
          }
        }
        else if (front.subtype.includes('drzwi')) {
          const side = front.subtype === 'drzwi-lp' ? (front.id.includes('-L-') ? 'left' : 'right') : (front.openingSide || 'left');
          const hinges = calculateHinges(front, board, obstacles, side);
          const hingeCount = hinges.length;

          // Front łamany szafki narożnej (mod.cornerFrontMode === 'bifold', wybór
          // w ui/cornerConfigModal.js): dwa skrzydła połączone zawiasem
          // uzupełniającym CLIP top 60° (Blum 79T8500), a skrzydło przy korpusie
          // wisi na zawiasie 155°/170°. Puszka zawiasu 60° siedzi w tym samym
          // skrzydle co puszka 155°/170° (katalog Blum, drzwi składane), więc obu
          // jest tyle samo, co zawiasów tego skrzydła; drugie skrzydło nie ma
          // własnych zawiasów przy korpusie.
          if (mod.type === 'corner_cabinet' && mod.cornerFrontMode === 'bifold' && front.cornerArm) {
            const primaryArm = mod.cornerFrontOverlap?.primaryArm || 'A';
            if (front.cornerArm === primaryArm) {
              const wideKey = `Zawias 155°/170° do drzwi składanych (skrzydło przy korpusie)`;
              const foldKey = `Zawias uzupełniający 60° do drzwi składanych (Blum 79T8500)`;
              [wideKey, foldKey].forEach(k => {
                if (!hardwareList[k]) hardwareList[k] = { name: k, qty: 0, unit: 'kpl.' };
                hardwareList[k].qty += hingeCount;
              });
              return;
            }
            const hasPartner = allFronts.some(o => o.cornerArm === primaryArm && (o.subtype || '').includes('drzwi') && o.y < front.y + front.h && o.y + o.h > front.y);
            if (hasPartner) return;
          }

          const hingeKey = `Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)`;
          if (!hardwareList[hingeKey]) hardwareList[hingeKey] = { name: hingeKey, qty: 0, unit: 'kpl.' };
          hardwareList[hingeKey].qty += hingeCount;
        }
      });
    });
  });

  // Okleina krawędziowa: wszystkie formatki dookoła (poza plecami HDF) - patrz
  // engine/edgeBanding.js. Ilość w metrach bieżących z zapasem (EDGE_BANDING_RESERVE).
  const edgeMeters = totalEdgeBandingMeters(calculateAllProjectParts());
  if (edgeMeters > 0) {
    const edgeKey = `Okleina krawędziowa (mb, formatki dookoła + ${Math.round(EDGE_BANDING_RESERVE * 100)}% zapasu)`;
    hardwareList[edgeKey] = { name: edgeKey, qty: Math.ceil(edgeMeters * (1 + EDGE_BANDING_RESERVE) * 10) / 10, unit: 'mb' };
  }

  return Object.values(hardwareList);
}

// Szacunkowy kosztorys materiałowy - liczy powierzchnię formatek Z OSOBNA dla
// każdej kategorii (Korpus/Front/Szuflada/Plecy, patrz PRICING_MATERIAL_
// CATEGORIES w core/state.js), a nie jedną wspólną "płytą" - front to zwykle
// inny, droższy materiał niż korpus (lakier, fornir, okleina), więc jedna
// cena za m² dla obu myliła realny koszt (zgłoszona uwaga). Do tego koszt
// każdej pozycji okuć z listy zakupów, po cenach z state.project.pricing
// (patrz core/state.js: ensurePricingDefaults). Ceny okuć trzymane są w
// słowniku nazwa->cena, bo lista okuć jest dynamiczna (np. różne warianty
// wysokości nóżek w tym samym projekcie) - nie da się z góry przewidzieć
// stałego zestawu pozycji do wycenienia. Tylko kategorie faktycznie obecne
// w projekcie trafiają do wyniku (np. projekt bez szuflad nie pokaże
// pustego wiersza "Szuflada").
const MATERIAL_CATEGORY_ORDER = ['Korpus', 'Front', 'Szuflada', 'Plecy'];

export function calculateProjectCost() {
  const pricing = state.project.pricing || { materials: {}, marginPercent: 0, hardware: {} };
  const parts = calculateAllProjectParts();
  const hardware = calculateProjectHardware();

  const areaMm2ByCategory = {};
  parts.forEach(p => {
    const areaMm2 = (parseFloat(p.length) || 0) * (parseFloat(p.width) || 0) * (parseFloat(p.qty) || 0);
    const cat = p.category || 'Inne';
    areaMm2ByCategory[cat] = (areaMm2ByCategory[cat] || 0) + areaMm2;
  });

  const categories = Object.keys(areaMm2ByCategory).sort((a, b) => {
    const ia = MATERIAL_CATEGORY_ORDER.indexOf(a);
    const ib = MATERIAL_CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const materials = categories.map(cat => {
    const areaM2 = areaMm2ByCategory[cat] / 1e6;
    const pricePerM2 = parseFloat((pricing.materials || {})[cat]) || 0;
    return { category: cat, areaM2, pricePerM2, cost: areaM2 * pricePerM2 };
  });

  const hardwareLines = hardware.map(hw => {
    const price = parseFloat((pricing.hardware || {})[hw.name]) || 0;
    return { ...hw, price, cost: hw.qty * price };
  });

  const materialsSubtotal = materials.reduce((sum, m) => sum + m.cost, 0);
  const hardwareSubtotal = hardwareLines.reduce((sum, l) => sum + l.cost, 0);
  const subtotal = materialsSubtotal + hardwareSubtotal;
  const marginPercent = parseFloat(pricing.marginPercent) || 0;
  const marginAmount = subtotal * (marginPercent / 100);

  return {
    materials,
    hardware: hardwareLines,
    materialsSubtotal,
    hardwareSubtotal,
    subtotal,
    marginPercent,
    marginAmount,
    total: subtotal + marginAmount
  };
}

function getCorpusHoles(mod, config) {
  const { width, height, depth } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const trav = getTraverseConfig(cons);

  const holes = [];

  const addJoint = (y, distFromFront, reverse = false) => {
     const screwDist = distFromFront;
     const dowelDist = reverse ? distFromFront - 32 : distFromFront + 32;
     holes.push({ y: y, xFromFront: screwDist, holeType: 'screw' });
     holes.push({ y: y, xFromFront: dowelDist, holeType: 'dowel' });
  };

  if (cons.joinType === 'boki_przelotowe') {
     const bottomY = th / 2;
     addJoint(bottomY, 37); 
     addJoint(bottomY, depth - 37, true); 
     
     const topY = height - th / 2;
     if (cons.topType === 'pelny') {
        addJoint(topY, 37);
        addJoint(topY, depth - 37, true);
     } else if (cons.topType === 'trawersy_poziom') {
        if (trav.front.active) addJoint(topY, 37);
        if (trav.rear.active) addJoint(topY, depth - 37, true);
     } else if (cons.topType === 'trawersy_pion') {
        if (trav.front.active) {
          holes.push({ y: height - 37, xFromFront: th / 2, holeType: 'screw' });
          holes.push({ y: height - 69, xFromFront: th / 2, holeType: 'dowel' });
        }
        if (trav.rear.active) {
          holes.push({ y: height - 37, xFromFront: depth - th / 2, holeType: 'screw' });
          holes.push({ y: height - 69, xFromFront: depth - th / 2, holeType: 'dowel' });
        }
     }
  } else {
     const bottomY = 0;
     const topY = height;
     addJoint(bottomY, 37);
     addJoint(bottomY, depth - 37, true);

     if (cons.topType === 'pelny') {
        addJoint(topY, 37);
        addJoint(topY, depth - 37, true);
     } else if (cons.topType === 'trawersy_poziom') {
        if (trav.front.active) addJoint(topY, 37);
        if (trav.rear.active) addJoint(topY, depth - 37, true);
     }
  }

  return holes.length > 0 ? [{ type: 'corpus', holes: holes }] : [];
}

// Nawierty kołek+wkręt mocujące przegrodę pionową (isStructural, patrz
// core/zoneTree.js: toggleStructural) do wieńca albo półki NAD i POD nią -
// jeden wpis mountingData PER PANEL (wieniec dolny/górny albo konkretna
// półka), żeby render/viewer2d.js mógł narysować osobny rzut z góry tej
// płyty z zaznaczonymi nawiertami (analogicznie do getCorpusHoles wyżej,
// tylko że tam otwory są na BOKU, tu na WIEŃCU/PÓŁCE - stąd inna płaszczyzna:
// X wzdłuż szerokości korpusu, Z wzdłuż głębokości).
function getPionMountHoles(mod, config) {
  const { width, height, depth } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const backThick = config.materials.backThickness || 3;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
  const topBottomDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;

  const piony = (mod.elements || []).filter(el => el.typ === 'pion' && el.isStructural);
  if (piony.length === 0) return [];

  const poziomy = (mod.elements || []).filter(el => el.typ === 'poziom');
  const EPS = 2;

  // Ta sama formuła co core/zoneTree.js: getCabinetInnerRect (topY światła
  // korpusu) - zduplikowana tu specjalnie, żeby nie wiązać silnika formatek
  // z modułem edytora wnętrza (zoneTree.js) tylko dla jednej stałej.
  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const hasTraverses = cons.topType.includes('trawersy');
  const isVerticalTraverse = cons.topType === 'trawersy_pion';
  const topInnerY = hasTraverses && isVerticalTraverse ? height - (parseFloat(cons.traverseWidth) || 100) : height - th;

  const cons2 = { joinType: 'boki_przelotowe', ...(config.construction || {}), ...(mod.construction || {}) };
  const wieniecWidth = cons2.joinType === 'wience_przelotowe' ? width : width - th * 2;
  // Wieniec pełen (wience_przelotowe) zaczyna się od X=0 korpusu, wieniec
  // "wpuszczony" między boki - dopiero od X=th - potrzebne, żeby przeliczyć
  // bezwzględny X pionu (mod.elements, 0 = lewy bok) na X WZGLĘDEM lewej
  // krawędzi TEGO KONKRETNEGO panelu (tak, jak go narysujemy w viewer2d.js).
  const wieniecOffsetX = cons2.joinType === 'wience_przelotowe' ? 0 : th;

  const byPanel = {};
  const addHoles = (panelKey, panelLabel, panelWidth, panelOffsetX, pionCenterX) => {
    if (!byPanel[panelKey]) byPanel[panelKey] = { type: 'wieniec-mount', panelKey, panelLabel, panelWidth, panelDepth: topBottomDepth, holes: [] };
    const frontZ = topBottomDepth - 37;
    const rearZ = 37;
    const x = pionCenterX - panelOffsetX;
    byPanel[panelKey].holes.push(
      { x, zFromFront: frontZ, holeType: 'screw' },
      { x, zFromFront: frontZ - 32, holeType: 'dowel' },
      { x, zFromFront: rearZ, holeType: 'screw' },
      { x, zFromFront: rearZ + 32, holeType: 'dowel' }
    );
  };

  piony.forEach(p => {
    const centerX = p.x + p.w / 2;

    if (Math.abs(p.y - th) < EPS) {
      addHoles('wieniec-dolny', 'Wieniec dolny', wieniecWidth, wieniecOffsetX, centerX);
    } else {
      const below = poziomy.find(s => Math.abs((s.y + s.h) - p.y) < EPS);
      if (below) addHoles(`polka-${below.id}-gora`, 'Półka (spód przegrody)', below.w, below.x, centerX);
    }

    if (Math.abs((p.y + p.h) - topInnerY) < EPS) {
      addHoles('wieniec-gorny', 'Wieniec górny', wieniecWidth, wieniecOffsetX, centerX);
    } else {
      const above = poziomy.find(s => Math.abs(s.y - (p.y + p.h)) < EPS);
      if (above) addHoles(`polka-${above.id}-dol`, 'Półka (wierzch przegrody)', above.w, above.x, centerX);
    }
  });

  return Object.values(byPanel);
}

function getCorpusParts(mod, config) {
  const parts = [];
  const { width, height, depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 }; 
  
  const construction = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(config.construction || {}), ...(mod.construction || {}) };
  const isTopBottomFullWidth = construction.joinType === 'wience_przelotowe';

  const sideDepth = backP.type === 'nut' ? depth : depth - backThick;
  const sideHeight = isTopBottomFullWidth ? height - (board * 2) : height;
  parts.push({ name: "Bok (L/P)", length: parseFloat(sideHeight.toFixed(1)), width: sideDepth, qty: 2, category: "Korpus" });

  const tbDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;
  const tbWidth = isTopBottomFullWidth ? width : width - (board * 2);

  parts.push({ name: `W${width}`, length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1, category: "Korpus" });

  if (construction.topType === 'pelny') {
    parts.push({ name: `W${width}`, length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1, category: "Korpus" });
  } else if (construction.topType.includes('trawersy')) {
    const isVertical = construction.topType === 'trawersy_pion';
    const trav = getTraverseConfig(construction);
    const trName = `Trawers górny (${isVertical ? 'pionowy' : 'poziomy'})`;
    // Osobne wpisy dla przedniego/tylnego (patrz ui/properties.js, zakładka Konstrukcja) —
    // gdy oba aktywne i tej samej szerokości, agregacja w calculateParts() i tak scali je
    // w jedną pozycję qty:2, tak jak dotychczas.
    if (trav.front.active) parts.push({ name: trName, length: parseFloat(tbWidth.toFixed(1)), width: trav.front.width, qty: 1, category: "Korpus" });
    if (trav.rear.active) parts.push({ name: trName, length: parseFloat(tbWidth.toFixed(1)), width: trav.rear.width, qty: 1, category: "Korpus" });
  }

  const structuralShelvesCount = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' && el.isStructural).length : 0;
  if (structuralShelvesCount > 0) {
    const shelfWidth = width - (board * 2);
    parts.push({ name: `W${width}`, length: parseFloat(shelfWidth.toFixed(1)), width: tbDepth, qty: structuralShelvesCount, category: "Korpus" });
  }

  return parts;
}

function getBackPanelParts(mod, config) {
  const { width, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backP = mod.backPanel || { type: 'nakladane', grooveDepth: 6, clearance: 2, nutBuild: 'all' };
  
  let hdfWidth, hdfHeight;
  const totalClearance = backP.clearance !== undefined ? backP.clearance * 2 : 4; 
  const currentNutBuild = backP.nutBuild || 'all';

  if (backP.type === 'nut') {
    hdfWidth = (currentNutBuild === 'all' || currentNutBuild === 'sides') 
      ? width - (board * 2) + (backP.grooveDepth * 2) - totalClearance : width - 4;
    hdfHeight = (currentNutBuild === 'all' || currentNutBuild === 'top_bottom') 
      ? height - (board * 2) + (backP.grooveDepth * 2) - totalClearance : height - 4;
  } else {
    hdfWidth = width - 4; hdfHeight = height - 4;
  }

  return [{ name: `Plecy ${height}x${width}`, length: parseFloat(hdfHeight.toFixed(1)), width: parseFloat(hdfWidth.toFixed(1)), qty: 1, category: "Plecy" }];
}

// Szafka narożna, kąt prosty (mod.type === 'corner_cabinet', core/
// state.js: addCornerModule) - korpus i plecy dla modułu o dwóch
// ramionach zamiast jednego prostokąta. Wieniec dolny/górny NIE liczy
// prawdziwego obrysu L (z wycięciem w rogu) - wystarcza bounding box obu
// ramion (legA×legB) jako rozmiar formatki do wycięcia (realny kawałek
// montujemy z tego blanku, docinając naroże na miejscu).
function getCornerCorpusParts(mod, config) {
  const parts = [];
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const height = parseFloat(mod.dimensions.height) || 720;
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const battenW = 100;

  // Boki skrócone od tyłu o backThick - plecy "nakładane" (render/viewer3d.js:
  // renderCornerCabinet), tak samo jak sideDepth = depth - backThick w
  // getCorpusParts() dla zwykłego modułu. Każde ramię ma TERAZ własną
  // głębokość (depthA/depthB, core/layout.js: getCornerDepths) - zgłoszona
  // korekta, wcześniej jedna wspólna "depth" dla obu.
  //
  // Nazwa CELOWO taka sama jak "Bok (L/P)" zwykłego modułu (getCorpusParts
  // niżej) - to fizycznie ten sam, płaski prostokątny bok (bez wcięcia,
  // narożnik tnie tylko wieniec/półkę), więc przy takich samych wymiarach ma
  // się zliczyć w Menedżerze Formatek do jednej pozycji zamiast dublować się
  // pod inną nazwą (zgłoszony bug - agregacja w calculateAllProjectParts
  // niżej klucza po category+name+length+width, więc różna nazwa = różny
  // wiersz mimo identycznej formatki do wycięcia).
  parts.push({ name: "Bok (L/P)", length: parseFloat(height.toFixed(1)), width: parseFloat((depthA - backThick).toFixed(1)), qty: 1, category: "Korpus" });
  parts.push({ name: "Bok (L/P)", length: parseFloat(height.toFixed(1)), width: parseFloat((depthB - backThick).toFixed(1)), qty: 1, category: "Korpus" });

  // Wymiar Ramię A/B w konfiguratorze to CAŁY korpus (do zewnętrznej
  // krawędzi boku). Sam wieniec siedzi MIĘDZY bokami (boki przelotowe -
  // patrz getCorpusParts niżej, width - board*2 dla zwykłego modułu), więc
  // formatka wieńca jest pomniejszona o grubość boku (th) na każdym
  // ramieniu - tylko RAZ na ramię, bo drugi koniec wieńca graniczy z
  // listwą narożną/wycięciem, nie z drugim bokiem (zgłoszona korekta).
  // Dodatkowo tył cofnięty o grubość pleców (jak wieniec zwykłej szafki:
  // depth - backThick) - wymiar Ramię/Głębokość liczy się z plecami.
  const wieniecA = legA - th - backThick;
  const wieniecB = legB - th - backThick;
  const wieniecName = `Wieniec narożny ${Math.round(wieniecA)}x${Math.round(wieniecB)} (naroże do wycięcia - patrz rysunek 3D)`;
  parts.push({ name: wieniecName, length: parseFloat(wieniecA.toFixed(1)), width: parseFloat(wieniecB.toFixed(1)), qty: 2, category: "Korpus" });

  // Listwa narożna pionowa (render/viewer3d.js: renderCornerCabinet) - płaska
  // listwa 18(gr.)x100(szer.), do której mocują się obie płyty plecy. Stoi
  // między wieńcami (height - 2*th), nie na pełną wysokość.
  parts.push({ name: "Listwa narożna pionowa", length: parseFloat((height - th * 2).toFixed(1)), width: battenW, qty: 1, category: "Korpus" });

  // Plecy - te same zasady nakładane/nut co getBackPanelParts() zwykłego
  // modułu niżej (zgłoszona korekta, wcześniej narożnik ZAWSZE liczył jak
  // nakładane, ignorując mod.backPanel.type/grooveDepth/clearance/nutBuild).
  // Różnica: KAŻDA płyta plecy narożnika ma tylko JEDNĄ prawdziwą krawędź
  // boku (bok narożny), druga krawędź to zawsze płaska listwa narożna (nie
  // osobny bok) - listwa nie ma z czym się "wpuścić" w rowek, więc zostaje
  // płaska (nakładana) niezależnie od backPanel.type. Rowek (grooveDepth) i
  // pojedynczy luz (clearance, nie clearance*2 jak przy dwóch bokach w
  // zwykłym module) dotyczą więc tylko strony boku, nie strony listwy.
  const backP = mod.backPanel || { type: 'nakladane', grooveDepth: 6, clearance: 2, nutBuild: 'all' };
  const isNutBack = backP.type === 'nut';
  const nutBuild = backP.nutBuild || 'all';
  const grooveDepth = parseFloat(backP.grooveDepth) || 6;
  const clearance = backP.clearance !== undefined ? parseFloat(backP.clearance) : 2;
  const nutSides = isNutBack && (nutBuild === 'all' || nutBuild === 'sides');
  const nutTopBottom = isNutBack && (nutBuild === 'all' || nutBuild === 'top_bottom');

  // Wysokość (krawędzie góra/dół = prawdziwy wieniec z obu stron, tak samo
  // jak w zwykłym module) - identyczna dla obu ramion.
  const plecyLength = nutTopBottom
    ? height - (th * 2) + (grooveDepth * 2) - (clearance * 2)
    : height - 4;

  // Szerokość (jedna krawędź = bok narożny -> rowek gdy nut, druga krawędź
  // = listwa narożna -> zawsze płasko, luz -2mm jak dotąd).
  // Plecy są przybijane do listwy NA ZEWNĄTRZ (listwa stoi za plecami - patrz
  // render/viewer3d.js), więc obie płyty sięgają aż do narożnika (od
  // backThick, żeby się nie nakładały na siebie), a nie kończą przed listwą.
  const plecyWidthA = nutSides
    ? legA - th - backThick - 2 + grooveDepth - clearance
    : legA - th - backThick - 4;
  const plecyWidthB = nutSides
    ? legB - th - backThick - 2 + grooveDepth - clearance
    : legB - th - backThick - 4;

  parts.push({ name: `Plecy narożne ${Math.round(height)}x${Math.round(legA)} (Ramię A)`, length: parseFloat(plecyLength.toFixed(1)), width: parseFloat(plecyWidthA.toFixed(1)), qty: 1, category: "Plecy" });
  parts.push({ name: `Plecy narożne ${Math.round(height)}x${Math.round(legB)} (Ramię B)`, length: parseFloat(plecyLength.toFixed(1)), width: parseFloat(plecyWidthB.toFixed(1)), qty: 1, category: "Plecy" });

  // Półki narożne (typ:'poziom-narozny', ui/cornerConfigModal.js) - w realnej
  // stolarce półka w szafce narożnej jest w KSZTAŁCIE L (jak wieniec wyżej),
  // NIE dwiema niezależnymi prostymi półkami po jednej na ramię (zgłoszona
  // korekta) - dlatego to osobny typ elementu, wspólny dla obu ramion
  // (bez cornerArm), zamiast zwykłego 'poziom' z core/zoneTree.js. Ten sam
  // bounding box co wieniec (pomniejszony o grubość boku na ramię - siedzi
  // MIĘDZY bokami tak samo jak wieniec, patrz komentarz przy
  // wieniecA/wieniecB wyżej) - realny kawałek docina się z blanku na
  // miejscu, tak samo jak przy wieńcu.
  const cornerShelves = (mod.elements || []).filter(el => el.typ === 'poziom-narozny');
  if (cornerShelves.length > 0) {
    const shelfName = `Półka narożna ${Math.round(wieniecA)}x${Math.round(wieniecB)} (naroże do wycięcia + wycięcie ${battenW}x${Math.round(th)} na listwę, przód cofnięty o 5 mm - patrz Wykrój narożny)`;
    parts.push({ name: shelfName, length: parseFloat(wieniecA.toFixed(1)), width: parseFloat(wieniecB.toFixed(1)), qty: cornerShelves.length, category: "Korpus" });
  }

  return parts;
}

// Strona zawiasów drzwi szafki narożnej w układzie LOKALNYM frontu (x rośnie od
// narożnika w stronę zewnętrznego boku ramienia): 'left' = krawędź przy narożniku,
// 'right' = krawędź zewnętrzna (przy boku korpusu). W trybie frontu łamanego
// skrzydło przy korpusie wisi na zewnętrznej krawędzi (na boku), drugie skrzydło
// ma zawiasy 60° od strony narożnika (do pierwszego skrzydła).
export function getCornerDoorHingeSide(mod, front) {
  if (mod.cornerFrontMode === 'bifold' && front.cornerArm) {
    const primary = mod.cornerFrontOverlap?.primaryArm || 'A';
    return front.cornerArm === primary ? 'right' : 'left';
  }
  if (front.subtype === 'drzwi-lp') return front.id.includes('-L-') ? 'left' : 'right';
  return front.openingSide || 'right';
}

// Zawiasy wszystkich drzwi szafki narożnej (pozycje pod puszki i płytki).
// Zakłada aktualny layout (el.x/y/w/h) - wołający robi recalculateLayout. Zawias
// przykręcany do boku korpusu (atBok) tylko gdy leży na zewnętrznej krawędzi.
export function getCornerDoorHinges(mod) {
  recalculateLayout(mod);
  const board = parseFloat(state.project.materials?.boardThickness) || 18;
  const els = mod.elements || [];
  const cornerShelves = els.filter(el => el.typ === 'poziom-narozny');
  return els
    .filter(el => el.typ === 'front' && el.cornerArm && (el.subtype || '').includes('drzwi'))
    .map(front => {
      const side = getCornerDoorHingeSide(mod, front);
      const obstacles = els
        .filter(o => (o.typ === 'poziom' || o.subtype === 'szuflada-wewnetrzna') && o.cornerArm === front.cornerArm)
        .concat(cornerShelves);
      const bifoldSecondary = mod.cornerFrontMode === 'bifold' && side === 'left';
      return {
        front, arm: front.cornerArm, side, atBok: side === 'right',
        bifoldSecondary,
        hinges: calculateHinges(front, board, obstacles, side),
      };
    });
}

// Otwory w wieńcu narożnym w układzie formatki (0,0 = tylny róg, cofnięty o
// plecy): tak jak w zwykłej szafce łączenia z bokami są wiercone w BOKU (patrz
// getCornerShelfHoles: joints), więc w wieńcu zostają tylko dwa kołki pod
// listwę narożną (stoi końcami na wieńcu). Półka nie ma żadnych - opiera się
// na podpórkach i ma wycięcie na listwę.
export function getCornerWieniecHoles(mod, config = state.project) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  return [20, 80].map(x => ({ x, y: th / 2, type: 'dowel', side: 'batten' }));
}

// Wymiary formatek wieńca i półki narożnej w układzie rysunku (0,0 = tylny
// róg): blank pomniejszony o grubość boku, przód półki cofnięty o 5 mm, a
// wycięcie na listwę tylko w półce - te same liczby co w getCornerCorpusParts
// i render/viewer3d.js: renderCornerCabinet.
export function getCornerPartsGeometry(mod, config = state.project) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const shelfCount = (mod.elements || []).filter(el => el.typ === 'poziom-narozny').length;
  return {
    th, backThick, legA, legB, depthA, depthB, shelfCount,
    wieniec: { blankA: legA - th - backThick, blankB: legB - th - backThick, depthA: depthA - backThick, depthB: depthB - backThick },
    polka: { blankA: legA - th - backThick, blankB: legB - th - backThick, depthA: depthA - backThick - 5, depthB: depthB - backThick - 5, notch: { w: 100, h: th } },
  };
}

// Nawierty pod podpórki półek narożnych (System 32, jak półka ruchoma w
// core/shelfMath.js: calculateShelfHoles) - półka L opiera się na OBU bokach
// (bok ramienia A i bok ramienia B), więc każdy z nich dostaje dwa rzędy
// (37 mm od przodu i od tyłu) po 3 otwory na każdą półkę. Zwraca opis obu
// boków w układzie rysunku: x = odległość od tylnej krawędzi boku, y = od dołu.
export function getCornerShelfHoles(mod, config = state.project) {
  const shelves = (mod.elements || []).filter(el => el.typ === 'poziom-narozny');
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const height = parseFloat(mod.dimensions.height) || 720;
  const { depthA, depthB } = getCornerDepths(mod);
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const battenW = 100;
  const pinR = 2.5;

  // bottom: wysokość dolnej krawędzi elementu nad dołem korpusu (listwa stoi
  // między wieńcami, więc th). Wysokości otworów są zawsze liczone od dołu
  // KORPUSU, dzięki czemu otwory listwy zgrywają się z otworami boków.
  const build = (name, sideDepth, xs, h, bottom, withJoints = false) => {
    const holes = [];
    shelves.forEach(sh => {
      const yBase = (parseFloat(sh.y) || 0) - pinR;
      xs.forEach(x => {
        [-32, 0, 32].forEach(dy => {
          holes.push({ x, y: yBase + dy, isCenter: dy === 0 });
        });
      });
    });
    // Łączenia z wieńcem dolnym i górnym (jak getCorpusHoles zwykłego
    // modułu): wkręt 37 mm od przodu/tyłu, kołek 32 mm dalej, w połowie
    // grubości wieńca. Listwa nie ma ich na płaszczyźnie (idą w jej krawędź).
    const joints = [];
    if (withJoints) {
      [th / 2, height - th / 2].forEach(y => {
        joints.push({ x: 37, y, type: 'screw' }, { x: 37 + 32, y, type: 'dowel' });
        joints.push({ x: sideDepth - 37, y, type: 'screw' }, { x: sideDepth - 37 - 32, y, type: 'dowel' });
      });
    }
    return { name, depth: sideDepth, height: h, bottom, holes, joints, hingePlates: [] };
  };

  const sideA = depthA - backThick;
  const sideB = depthB - backThick;
  const sides = [
    build('Bok ramienia A', sideA, [37, sideA - 37], height, 0, true),
    build('Bok ramienia B', sideB, [37, sideB - 37], height, 0, true),
    // Półka ma wycięcie na listwę, więc opiera się też na podpórkach w
    // listwie (dwa pionowe rzędy 20 mm od jej krawędzi).
    build('Listwa narożna', battenW, [20, battenW - 20], height - th * 2, th),
  ];
  // Płytki zawiasów drzwi wiszących na zewnętrznej krawędzi ramienia: dwa otwory
  // (co 32 mm wokół wysokości zawiasu y, 37 mm od przodu boku), na boku tego ramienia.
  getCornerDoorHinges(mod).filter(d => d.atBok).forEach(d => {
    const side = sides[d.arm === 'A' ? 0 : 1];
    d.hinges.forEach(h => side.hingePlates.push({ x: 37, y: h.y }));
  });
  return sides;
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
      const realW = Math.round(el.w || 0);
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

    parts.push({ name: partName, length: parseFloat((front.h || 0).toFixed(1)), width: parseFloat((front.w || 0).toFixed(1)), qty: 1, category: "Front" });

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
        const drawerHoles = calculateDrawerHoles(sysName, front.y, simulatedSpace, board, front.frontIndex, isBottomInZone && isBottomOuter && !isInset);
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

        const userForcedVariant = front.forceVariant || 'auto';
        // Uwaga: tu celowo pełne availableSpace, nie simulatedSpace (przycięte do
        // wysokości wymuszonego wariantu) — getDrawerComponents/getDrawerVariant
        // same sprawdzają, czy w realnej dostępnej przestrzeni mieści się wymuszony
        // wariant (próg minSpace jest zawsze większy niż sama wysokość wariantu).
        // Podanie tu simulatedSpace gwarantowałoby odrzucenie wymuszenia.
        const drawerComps = getDrawerComponents(sysName, width - (board * 2), availableDepth, availableSpace, userForcedVariant);
        
        if (drawerComps) {
          parts.push({ name: `Dno W${width} NL${drawerComps.nominalLength}`, length: parseFloat((drawerComps.bottom.length || 0).toFixed(1)), width: parseFloat((drawerComps.bottom.width || 0).toFixed(1)), qty: 1, category: "Szuflada" });
          parts.push({ name: `Tył W${width} (${drawerComps.back.variantType})`, length: parseFloat((drawerComps.back.width || 0).toFixed(1)), width: parseFloat((drawerComps.back.height || 0).toFixed(1)), qty: 1, category: "Szuflada" });
        }
      }
    } 
  });

  return { parts, mountingData };
}

function getFillerParts(mod, config) {
  const parts = [];
  if (!mod.fillers) return parts;
  
  const th = config.materials.boardThickness || 18;
  const modH = parseFloat(mod.dimensions.height);
  const modW = parseFloat(mod.dimensions.width);

  const parseVal = (val, fallback) => (val !== null && val !== undefined && val !== '') ? parseFloat(val) : fallback;

  if (mod.fillers.left && mod.fillers.left.active) {
      const h = parseVal(mod.fillers.left.height, modH);
      parts.push({ name: `Blenda Lewa (Czoło)`, length: h, width: parseFloat(mod.fillers.left.width) || 50, qty: 1, category: "Front" });
      parts.push({ name: `Blenda Lewa (Mocowanie wewn.)`, length: h, width: (parseFloat(mod.fillers.left.depth) || 80) - th, qty: 1, category: "Korpus" });
  }
  
  if (mod.fillers.right && mod.fillers.right.active) {
      const h = parseVal(mod.fillers.right.height, modH);
      parts.push({ name: `Blenda Prawa (Czoło)`, length: h, width: parseFloat(mod.fillers.right.width) || 50, qty: 1, category: "Front" });
      parts.push({ name: `Blenda Prawa (Mocowanie wewn.)`, length: h, width: (parseFloat(mod.fillers.right.depth) || 80) - th, qty: 1, category: "Korpus" });
  }
  
  if (mod.fillers.top && mod.fillers.top.active) {
      let autoW = modW;
      if (mod.fillers.left && mod.fillers.left.active) autoW += parseFloat(mod.fillers.left.width) || 50;
      if (mod.fillers.right && mod.fillers.right.active) autoW += parseFloat(mod.fillers.right.width) || 50;
      
      const w = parseVal(mod.fillers.top.width, autoW);
      const h = parseVal(mod.fillers.top.height, 50);

      parts.push({ name: `Blenda Górna (Czoło)`, length: w, width: h, qty: 1, category: "Front" });
      parts.push({ name: `Blenda Górna (Mocowanie wewn.)`, length: w, width: (parseFloat(mod.fillers.top.depth) || 80) - th, qty: 1, category: "Korpus" });
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
  const label = panel.decor ? `Bok dokładany (${panel.decor})` : 'Bok dokładany';
  const name = panel.name ? `${label} — ${panel.name}` : label;
  return [{
    name,
    length: parseFloat(panel.dimensions?.height) || 0,
    width: parseFloat(panel.dimensions?.depth) || 0,
    qty: 1,
    category: "Front"
  }];
}