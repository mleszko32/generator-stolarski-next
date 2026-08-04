// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles, getDrawerComponents } from "../core/drawerMath.js";
import { calculateHinges } from "../core/hingeMath.js"; 

export function calculateParts() {
  const activeModuleId = state.activeModuleId;
  const mod = state.project.modules.find(m => m.id === activeModuleId);
  if (!mod) return { parts: [], mountingData: [] };

  const config = state.project;
  let parts = [];
  let mountingData = [];

  parts.push(...getCorpusParts(mod, config));
  parts.push(...getBackPanelParts(mod, config));
  parts.push(...getInteriorParts(mod, config));

  const frontsAndDrawers = getFrontsAndDrawers(mod, config);
  parts.push(...frontsAndDrawers.parts);
  
  mountingData.push(...frontsAndDrawers.mountingData);
  mountingData.push(...getCorpusHoles(mod, config)); 

  return { parts, mountingData };
}

export function calculateAllProjectParts() {
  const config = state.project;
  let allParts = [];

  config.modules.forEach(mod => {
    const modParts = [];
    modParts.push(...getCorpusParts(mod, config));
    modParts.push(...getBackPanelParts(mod, config));
    modParts.push(...getInteriorParts(mod, config));

    const frontsAndDrawers = getFrontsAndDrawers(mod, config);
    modParts.push(...frontsAndDrawers.parts);

    allParts.push(...modParts.map(p => ({ ...p, moduleName: mod.name })));
  });

  const baseCabinets = config.modules.filter(m => m.legs && m.legs.active && m.legs.plinth);
  baseCabinets.sort((a, b) => (parseFloat(a.position.x) || 0) - (parseFloat(b.position.x) || 0));
  
  let plinthRuns = [];
  baseCabinets.forEach(mod => {
      const x = parseFloat(mod.position.x) || 0;
      const y = parseFloat(mod.position.y) || 0;
      const z = parseFloat(mod.position.z) || 0;
      const w = parseFloat(mod.dimensions.width);
      const d = parseFloat(mod.dimensions.depth);
      const h = parseFloat(mod.legs.height);
      const offset = parseFloat(mod.legs.plinthOffset !== undefined ? mod.legs.plinthOffset : 40);
      const frontZ = z + d; 

      let joined = false;
      if (plinthRuns.length > 0) {
          let last = plinthRuns[plinthRuns.length - 1];
          if (Math.abs((last.x + last.w) - x) <= 1 && last.y === y && last.h === h && last.offset === offset && last.frontZ === frontZ) {
              last.w += w + (x - (last.x + last.w)); 
              joined = true;
          }
      }
      if (!joined) {
          plinthRuns.push({ x, y, z, w, d, h, offset, frontZ });
      }
  });

  plinthRuns.forEach((run, index) => {
    allParts.push({
      name: `Cokół dolny (Odcinek ${index + 1})`,
      length: parseFloat(run.w.toFixed(1)),
      width: parseFloat(run.h.toFixed(1)),
      qty: 1,
      moduleName: "Elementy zbiorcze"
    });
  });

  const aggregated = {};
  allParts.forEach(part => {
     const key = `${part.name}_${part.length}_${part.width}`;
     if (aggregated[key]) {
         aggregated[key].qty += part.qty;
         if (!aggregated[key].modules.includes(part.moduleName)) {
             aggregated[key].modules.push(part.moduleName);
         }
     } else {
         aggregated[key] = {
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
  const config = state.project;
  const hardwareList = {};

  config.modules.forEach(mod => {
    const W = parseFloat(mod.dimensions.width) || 600;
    const D = parseFloat(mod.dimensions.depth) || 513;
    const board = config.materials.boardThickness || 18;
    const backThick = config.materials.backThickness || 3;
    const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
    const topBottomDepth = backP.type === 'nut' ? D - backP.offset - backThick : D - backThick;

    if (mod.legs && mod.legs.active) {
      const legH = mod.legs.height || 100;
      const legKey = `Nóżka regulowana H-${legH}`;
      if (!hardwareList[legKey]) hardwareList[legKey] = { name: legKey, qty: 0, unit: 'szt.' };
      hardwareList[legKey].qty += 4; 
    }

    const joinKey = `Złącze korpusowe (Kołek 8x30 + Konfirmat)`;
    if (!hardwareList[joinKey]) hardwareList[joinKey] = { name: joinKey, qty: 0, unit: 'kpl.' };
    hardwareList[joinKey].qty += 8; 

    if (!mod.elements) return;

    const fronts = mod.elements.filter(el => el.typ === 'front');
    const obstacles = mod.elements.filter(el => el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna');
    fronts.sort((a, b) => a.y - b.y);

    fronts.forEach((front, index) => {
      const isInternalDrawer = front.subtype === 'szuflada-wewnetrzna';
      
      if (front.subtype === 'szuflada' || isInternalDrawer) {
        const isBottomInZone = front.frontIndex === 0;
        const isTopInZone = index === fronts.length - 1;

        let availableSpace = front.h;
        if (isBottomInZone) availableSpace -= (board - (config.front.clearance.bottom || 0));
        if (isTopInZone) availableSpace -= (board - (config.front.clearance.top || 0));

        const innerWidth = front.baseZone ? (front.baseZone.maxX - front.baseZone.minX) : W - (board * 2);
        const userForcedVariant = front.forceVariant || 'auto';
        const drawerComps = getDrawerComponents(config.front.drawerSystem, innerWidth, topBottomDepth, availableSpace, userForcedVariant);

        if (drawerComps) {
          const sysName = config.front.drawerSystem || 'merivobox';
          const nl = drawerComps.nominalLength;
          const variantType = drawerComps.back.variantType ? drawerComps.back.variantType.toUpperCase() : 'M';
          
          const hwKey = `Komplet szuflady (${sysName.toUpperCase()} - H:${variantType} L-${nl})`;
          
          if (!hardwareList[hwKey]) hardwareList[hwKey] = { name: hwKey, qty: 0, unit: 'kpl.' };
          hardwareList[hwKey].qty += 1;
        }
      } 
      else if (front.subtype.includes('drzwi')) {
        const side = front.subtype === 'drzwi-lp' ? (front.id.endsWith('-L') ? 'left' : 'right') : (front.openingSide || 'left');
        const hinges = calculateHinges(front, board, obstacles, side);
        const hingeCount = hinges.length;

        const hingeKey = `Zawias meblowy + prowadnik (puszka 35mm)`;
        if (!hardwareList[hingeKey]) hardwareList[hingeKey] = { name: hingeKey, qty: 0, unit: 'szt.' };
        hardwareList[hingeKey].qty += hingeCount;
      }
    });
  });

  return Object.values(hardwareList);
}

// ZAKTUALIZOWANE WARTOŚCI NAWIERTÓW (37 mm oraz 37+32 mm)
function getCorpusHoles(mod, config) {
  const { width, height, depth } = mod.dimensions;
  const th = config.materials.boardThickness || 18;
  const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  
  const holes = [];

  const addJoint = (y, distFromFront, reverse = false) => {
     const screwDist = distFromFront;
     const dowelDist = reverse ? distFromFront - 32 : distFromFront + 32;
     holes.push({ y: y, xFromFront: screwDist, holeType: 'screw' });
     holes.push({ y: y, xFromFront: dowelDist, holeType: 'dowel' });
  };

  if (cons.joinType === 'boki_przelotowe') {
     const bottomY = th / 2;
     addJoint(bottomY, 37); // Startujemy od 37 mm
     addJoint(bottomY, depth - 37, true); 
     
     const topY = height - th / 2;
     if (cons.topType === 'pelny') {
        addJoint(topY, 37);
        addJoint(topY, depth - 37, true);
     } else if (cons.topType === 'trawersy_poziom') {
        addJoint(topY, 37); 
        addJoint(topY, depth - 37, true);
     } else if (cons.topType === 'trawersy_pion') {
        holes.push({ y: height - 37, xFromFront: th / 2, holeType: 'screw' });
        holes.push({ y: height - 69, xFromFront: th / 2, holeType: 'dowel' });
        
        holes.push({ y: height - 37, xFromFront: depth - th / 2, holeType: 'screw' });
        holes.push({ y: height - 69, xFromFront: depth - th / 2, holeType: 'dowel' });
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
        addJoint(topY, 37);
        addJoint(topY, depth - 37, true);
     }
  }

  return holes.length > 0 ? [{ type: 'corpus', holes: holes }] : [];
}

function getCorpusParts(mod, config) {
  const parts = [];
  const { width, height, depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 }; 
  
  const construction = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
  const isTopBottomFullWidth = construction.joinType === 'wience_przelotowe';

  const sideDepth = backP.type === 'nut' ? depth : depth - backThick;
  const sideHeight = isTopBottomFullWidth ? height - (board * 2) : height;
  parts.push({ name: "Bok (L/P)", length: parseFloat(sideHeight.toFixed(1)), width: sideDepth, qty: 2 });

  const tbDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;
  const tbWidth = isTopBottomFullWidth ? width : width - (board * 2);

  parts.push({ name: "Wieniec dolny", length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1 });

  if (construction.topType === 'pelny') {
    parts.push({ name: "Wieniec górny", length: parseFloat(tbWidth.toFixed(1)), width: tbDepth, qty: 1 });
  } else if (construction.topType.includes('trawersy')) {
    const isVertical = construction.topType === 'trawersy_pion';
    const trWidth = construction.traverseWidth || 100;
    parts.push({ name: `Trawers górny (${isVertical ? 'pionowy' : 'poziomy'})`, length: parseFloat(tbWidth.toFixed(1)), width: trWidth, qty: 2 });
  }

  const structuralShelvesCount = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' && el.isStructural).length : 0;
  if (structuralShelvesCount > 0) {
    const shelfWidth = width - (board * 2);
    parts.push({ name: "Półka konstrukcyjna", length: parseFloat(shelfWidth.toFixed(1)), width: tbDepth, qty: structuralShelvesCount });
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

  return [{ name: "Plecy (HDF)", length: parseFloat(hdfHeight.toFixed(1)), width: parseFloat(hdfWidth.toFixed(1)), qty: 1 }];
}

function getInteriorParts(mod, config) {
  const parts = [];
  if (!mod.elements || mod.elements.length === 0) return parts;

  const { depth } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backThick = config.materials.backThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
  
  const frontType = config.front && config.front.type ? config.front.type : 'nakladane';
  const isInset = frontType === 'wpuszczane';

  const topBottomDepth = backP.type === 'nut' ? depth - backP.offset - backThick : depth - backThick;
  const innerPartDepth = topBottomDepth - (isInset ? board : 0);

  let shelfCount = 0;
  let partitionCount = 0;

  mod.elements.forEach(el => {
    if (el.typ === 'pion') {
      partitionCount++;
      parts.push({ name: `Przegroda pionowa ${partitionCount}`, length: parseFloat(el.h.toFixed(1)), width: innerPartDepth, qty: 1 });
    } else if (el.typ === 'poziom' && !el.isStructural) {
      shelfCount++;
      parts.push({ name: `Półka ${shelfCount}`, length: parseFloat(el.w.toFixed(1)), width: innerPartDepth - 5, qty: 1 });
    }
  });

  return parts;
}
function getFrontsAndDrawers(mod, config) {
  const parts = [];
  const mountingData = [];
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front') : [];
  const obstacles = mod.elements ? mod.elements.filter(el => el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna') : [];

  if (fronts.length === 0) return { parts, mountingData };
  fronts.sort((a, b) => a.y - b.y);

  const { width, depth, height } = mod.dimensions;
  const board = config.materials.boardThickness;
  const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
  const topBottomDepth = backP.type === 'nut' ? depth - backP.offset - config.materials.backThickness : depth - config.materials.backThickness;

  let drawerCount = 0;
  let doorCount = 0;

  fronts.forEach((front, index) => {
    let partName = "Front";
    if (front.subtype === 'szuflada') { drawerCount++; partName = `Front szuflady ${drawerCount}`; } 
    else if (front.subtype === 'szuflada-wewnetrzna') { drawerCount++; partName = `Front szuflady wewn. ${drawerCount}`; } 
    else if (front.subtype === 'drzwi') { doorCount++; partName = `Drzwi ${doorCount}`; } 
    else if (front.subtype === 'drzwi-lp') {
      const side = front.id.endsWith('-L') ? 'Lewe' : 'Prawe';
      partName = `Drzwi ${side}`;
    }

    parts.push({ name: partName, length: parseFloat(front.h.toFixed(1)), width: parseFloat(front.w.toFixed(1)), qty: 1 });

    if (front.subtype.includes('szuflada')) {
      // ZMIANA: Przywracamy wiedzę o tym, że pierwsza prowadnica leży na dolnym wieńcu
      const isBottomInZone = front.frontIndex === 0;
      const isTopInZone = index === fronts.length - 1;
      
      let innerThick = 18;
      let innerSetback = 0;
      if (front.subtype === 'szuflada-wewnetrzna') {
          innerThick = parseFloat(front.innerFrontThickness ?? 18);
          innerSetback = parseFloat(front.innerSetback ?? 2);
      }

      if (typeof calculateDrawerHoles === 'function') {
        const drawerHoles = calculateDrawerHoles(config.front.drawerSystem, front.y, front.h, board, drawerCount - 1, isBottomInZone);
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

          adjustedHoles.frontId = front.id; 
          adjustedHoles.type = 'drawer'; 
          mountingData.push(adjustedHoles); 
        }
      }

      if (typeof getDrawerComponents === 'function') {
        let availableSpace = front.h;
        if (front.y < board) availableSpace -= board; 
        if (front.y + front.h > height - board) availableSpace -= board; 

        let availableDepth = topBottomDepth;
        if (front.subtype === 'szuflada-wewnetrzna') {
            availableDepth -= (innerThick + innerSetback);
        }

        const userForcedVariant = front.forceVariant || 'auto';
        const drawerComps = getDrawerComponents(config.front.drawerSystem, width - (board * 2), availableDepth, availableSpace, userForcedVariant);
        
        if (drawerComps) {
          parts.push({ name: `Dno szuflady (NL: ${drawerComps.nominalLength})`, length: parseFloat(drawerComps.bottom.length.toFixed(1)), width: parseFloat(drawerComps.bottom.width.toFixed(1)), qty: 1 });
          parts.push({ name: `Tył szuflady (Wariant ${drawerComps.back.variantType})`, length: parseFloat(drawerComps.back.width.toFixed(1)), width: parseFloat(drawerComps.back.height.toFixed(1)), qty: 1 });
        }
      }
    } 
    else if (front.subtype.includes('drzwi')) {
      const side = front.subtype === 'drzwi-lp' ? (front.id.endsWith('-L') ? 'left' : 'right') : (front.openingSide || 'left');
      const hinges = calculateHinges(front, board, obstacles, side);
      mountingData.push({ type: 'door', name: partName, side: side, frontId: front.id, hinges: hinges });
    }
  });

  return { parts, mountingData };
}
  