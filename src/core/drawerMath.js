// src/core/drawerMath.js
import { drawerSystems } from './drawerSystems.js';
import { state } from './state.js';

// Funkcja do obliczania optymalnej długości prowadnicy (NL)
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

// Funkcja dobierająca wariant szuflady na podstawie światła szafki (dostępnej przestrzeni)
export function getDrawerVariant(availableSpace, systemId) {
  // Słownik z danymi: height = wysokość płyty tyłu, minSpace = minimalna przestrzeń montażowa w korpusie
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
      wysoka:       { type: 'C', height: 167,   minSpace: 192 }, // Dodany brakujący przecinek
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

  // Zaktualizowana logika sprawdzania wariantów - od najwyższego do najniższego.
  // Używamy "systemData.nazwaWariantu &&", aby sprawdzić czy dany system w ogóle ma ten wariant (np. GTV nie ma "bardzowysoka").
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
    // Fallback bezpieczeństwa: jeśli światło jest mniejsze niż minimum najniższej szuflady, 
    // dobieramy najniższą dostępną z danego systemu, by cokolwiek wygenerować (zazwyczaj niska lub bardzoniska).
    const lowestAvailable = systemData.bardzoniska || systemData.niska;
    return { type: lowestAvailable.type, backHeight: lowestAvailable.height };
  }
}

export function getDrawerComponents(systemId, internalWidth, internalDepth, availableSpace) {
  const system = drawerSystems[systemId];
  
  if (!system) {
    console.error(`Nie znaleziono systemu szuflad: ${systemId}`);
    return null;
  }

  const nl = calculateNominalLength(internalDepth);
  const variant = getDrawerVariant(availableSpace, systemId);

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
  const sideGap = Number(config.front.clearance.sides ?? 1.5);

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

  // --- OŚ Y PROWADNIC NA BOKU KORPUSU ---
  let slideY;
  if (isBottom) {
    slideY = boardThick + systemParams.railOffset;
  } else {
    slideY = currentY + systemParams.railOffset;
  }

  // --- OŚ Y NAWIERTÓW FRONTU ---
  let localFrontHolesBase = systemParams.frontHolesBase;
  if (isBottom) {
    const bottomOverlap = boardThick - bottomGap; 
    localFrontHolesBase += bottomOverlap;
  }

  // --- OŚ X NAWIERTÓW FRONTU ---
  const frontOverlapX = boardThick - sideGap;
  const localFrontHolesX = systemParams.frontHolesXBase + frontOverlapX;

  const frontHoles = [
    { y: localFrontHolesBase, xOffset: localFrontHolesX, diameter: 3 },
    { y: localFrontHolesBase + 32, xOffset: localFrontHolesX, diameter: 3 }
  ];

  // Nawiert na reling dla wysokich frontów
  if (frontHeight >= 280) {
    frontHoles.push({
      y: localFrontHolesBase + 160, 
      xOffset: localFrontHolesX, 
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