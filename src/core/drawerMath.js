// src/core/drawerMath.js
import { drawerSystems } from './drawerSystems.js';
import { state } from './state.js';

// Domyślna, "Blumowa" seria NL — używana gdy system nie podaje własnej
// (nlSeries w drawerSystems.js). Różni producenci mają różne maksima (np.
// Merivobox i Legrabox kończą na 600, GTV Axis Pro na 600, tylko antaro/
// tandembox mają 650) — dobór NL musi to respektować, inaczej dla głębokiej
// szafki może wyjść długość prowadnicy, której dany system w ogóle nie oferuje.
const DEFAULT_NL_SERIES = [270, 300, 350, 400, 450, 500, 550, 600, 650];

export function calculateNominalLength(internalDepth, systemId) {
  const safeSystemId = systemId ? systemId.toLowerCase() : null;
  const system = safeSystemId ? drawerSystems[safeSystemId] : null;
  const standardNLs = (system && system.nlSeries) || DEFAULT_NL_SERIES;
  const safetyClearance = 5;
  const maxAvailableSpace = internalDepth - safetyClearance;

  let selectedNL = 0;
  for (let i = standardNLs.length - 1; i >= 0; i--) {
    if (standardNLs[i] <= maxAvailableSpace) {
      selectedNL = standardNLs[i];
      break;
    }
  }

  return selectedNL > 0 ? selectedNL : standardNLs[0];
}

export function getDrawerVariant(availableSpace, systemId, forceVariant = 'auto') {
  // Dane wariantów wysokości boku pobierane są z jedynego wspólnego katalogu
  // (drawerSystems.js), żeby uniknąć rozjazdu wartości między plikami.
  const safeSystemId = systemId ? systemId.toLowerCase() : 'merivobox';
  const systemData = (drawerSystems[safeSystemId] || drawerSystems['merivobox']).variants;

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

  const nl = calculateNominalLength(internalDepth, systemId);
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

  // Offsety montażowe pobierane są z jedynego wspólnego katalogu
  // (drawerSystems.js), żeby uniknąć rozjazdu wartości między plikami.
  const safeSystemId = systemId ? systemId.toLowerCase() : 'merivobox';
  const systemParams = (drawerSystems[safeSystemId] || drawerSystems['merivobox']).mounting;

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