// src/core/drawerMath.js
import { drawerSystems } from './drawerSystems.js';
import { state } from './state.js';

export function calculateNominalLength(internalDepth) {
  const standardNLs = [270, 300, 350, 400, 450, 500, 550, 600, 650];
  const safetyClearance = 5; 
  const maxAvailableSpace = internalDepth - safetyClearance;

  let selectedNL = 0;
  for (let i = standardNLs.length - 1; i >= 0; i--) {
    if (standardNLs[i] <= maxAvailableSpace) {
      selectedNL = standardNLs[i];
      break;
    }
  }

  return selectedNL > 0 ? selectedNL : 270; 
}

export function getDrawerVariant(availableSpace, systemId, forceVariant = 'auto') {
  const CATALOG_DATA = {
    'merivobox': {
      bardzoniska:  { type: 'N', height: 60.5,  minSpace: 85.5 },
      niska:        { type: 'M', height: 83,    minSpace: 108 },
      srednia:      { type: 'K', height: 121,   minSpace: 146 },
      wysoka:       { type: 'E', height: 184,   minSpace: 209 }
    },
    'antaro': {
      bardzoniska:  { type: 'N', height: 69,    minSpace: 82.5 },
      niska:        { type: 'M', height: 84,    minSpace: 98.5 },
      srednia:      { type: 'K', height: 116,   minSpace: 130.5 },
      wysoka:       { type: 'C', height: 167,   minSpace: 192 }, 
      bardzowysoka: { type: 'D', height: 199,   minSpace: 224 }
    },
    'tandembox': {
      bardzoniska:  { type: 'N', height: 69,    minSpace: 82.5 },
      niska:        { type: 'M', height: 84,    minSpace: 98.5 },
      srednia:      { type: 'K', height: 116,   minSpace: 130.5 },
      wysoka:       { type: 'C', height: 167,   minSpace: 192 },
      bardzowysoka: { type: 'D', height: 199,   minSpace: 224 }
    },
    'legrabox': {
      bardzoniska:  { type: 'N', height: 39,    minSpace: 80 },
      niska:        { type: 'M', height: 63,    minSpace: 106 }, 
      srednia:      { type: 'K', height: 101,   minSpace: 144 }, 
      wysoka:       { type: 'C', height: 148,   minSpace: 193 } 
    },
    'gtv_axis_16': {
      niska:   { type: 'A', height: 84,  minSpace: 105 },
      srednia: { type: 'B', height: 116, minSpace: 138 },
      wysoka:  { type: 'C', height: 167, minSpace: 195 } 
    },
    'gtv_axis_18': {
      niska:   { type: 'A', height: 84,  minSpace: 105 },
      srednia: { type: 'B', height: 116, minSpace: 138 },
      wysoka:  { type: 'C', height: 167, minSpace: 195 }
    }
  };

  const safeSystemId = systemId ? systemId.toLowerCase() : 'merivobox';
  const systemData = CATALOG_DATA[safeSystemId] || CATALOG_DATA['merivobox'];

  if (forceVariant && forceVariant !== 'auto' && systemData[forceVariant]) {
    if (availableSpace >= systemData[forceVariant].minSpace) {
      return { type: systemData[forceVariant].type, backHeight: systemData[forceVariant].height };
    } else {
      console.warn(`Wymuszono szufladę ${forceVariant}, ale jest na nią za mało miejsca. Wracam do trybu auto.`);
    }
  }

  if (systemData.bardzowysoka && availableSpace >= systemData.bardzowysoka.minSpace) {
    return { type: systemData.bardzowysoka.type, backHeight: systemData.bardzowysoka.height };
  } 
  else if (systemData.wysoka && availableSpace >= systemData.wysoka.minSpace) {
    return { type: systemData.wysoka.type, backHeight: systemData.wysoka.height };
  } 
  else if (systemData.srednia && availableSpace >= systemData.srednia.minSpace) {
    return { type: systemData.srednia.type, backHeight: systemData.srednia.height };
  } 
  else if (systemData.niska && availableSpace >= systemData.niska.minSpace) {
    return { type: systemData.niska.type, backHeight: systemData.niska.height };
  } 
  else if (systemData.bardzoniska && availableSpace >= systemData.bardzoniska.minSpace) {
    return { type: systemData.bardzoniska.type, backHeight: systemData.bardzoniska.height };
  } 
  else {
    const lowestAvailable = systemData.bardzoniska || systemData.niska;
    return { type: lowestAvailable.type, backHeight: lowestAvailable.height };
  }
}

export function getDrawerComponents(systemId, internalWidth, internalDepth, availableSpace, forceVariant = 'auto') {
  const system = drawerSystems[systemId];
  
  if (!system) {
    console.error(`Nie znaleziono systemu szuflad: ${systemId}`);
    return null;
  }

  const nl = calculateNominalLength(internalDepth);
  const variant = getDrawerVariant(availableSpace, systemId, forceVariant);

  const bottomWidth = internalWidth - system.bottomWidthDeduct;
  const bottomLength = nl - system.bottomLengthDeduct;
  const backWidth = internalWidth - system.backWidthDeduct;

  return {
    systemName: system.name,
    nominalLength: nl,
    bottom: { width: bottomWidth, length: bottomLength },
    back: {
      width: backWidth,
      height: variant.backHeight, 
      variantType: variant.type   
    }
  };
}

export function calculateDrawerHoles(systemId, currentY, frontHeight, boardThick, index, isBottom) {
  const config = state.project;
  const bottomGap = Number(config.front.clearance.bottom ?? 0);
  
  const leftGap = Number(config.front.clearance.left ?? config.front.clearance.sides ?? 1.5);
  const rightGap = Number(config.front.clearance.right ?? config.front.clearance.sides ?? 1.5);

  const HARDWARE_OFFSETS = {
    'merivobox': { railOffset: 54, frontHolesBase: 33.5, frontHolesXBase: 20.5 },
    'legrabox': { railOffset: 38, frontHolesBase: 25, frontHolesXBase: 21.5 }, 
    'tandembox': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 },
    'antaro': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 },
    'gtv_axis_16': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 },
    'gtv_axis_18': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  };

  const safeSystemId = systemId ? systemId.toLowerCase() : 'merivobox';
  const systemParams = HARDWARE_OFFSETS[safeSystemId] || HARDWARE_OFFSETS['merivobox'];

  let slideY;
  if (isBottom) {
    // NAPRAWA BŁĘDU: Dodano currentY! Wcześniej szuflada lądowała na 0.
    slideY = currentY + boardThick + systemParams.railOffset;
  } else {
    slideY = currentY + systemParams.railOffset;
  }

  let localFrontHolesBase = systemParams.frontHolesBase;
  if (isBottom) {
    const bottomOverlap = boardThick - bottomGap; 
    localFrontHolesBase += bottomOverlap;
  }

  const localFrontHolesX_Left = systemParams.frontHolesXBase + (boardThick - leftGap);
  const localFrontHolesX_Right = systemParams.frontHolesXBase + (boardThick - rightGap);

  const frontHoles = [
    { y: localFrontHolesBase, xOffsetLeft: localFrontHolesX_Left, xOffsetRight: localFrontHolesX_Right, diameter: 3 },
    { y: localFrontHolesBase + 32, xOffsetLeft: localFrontHolesX_Left, xOffsetRight: localFrontHolesX_Right, diameter: 3 }
  ];

  if (frontHeight >= 200) {
    frontHoles.push({
      y: localFrontHolesBase + 160, 
      xOffsetLeft: localFrontHolesX_Left, 
      xOffsetRight: localFrontHolesX_Right, 
      diameter: 3
    });
  }

  return {
    slideSideHoles: [
      { x: 37, y: slideY },
      { x: 69, y: slideY },
      { x: 261, y: slideY }
    ],
    frontHoles: frontHoles
  };
}