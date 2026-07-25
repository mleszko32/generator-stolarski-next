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

// NOWE: Funkcja dobierająca wariant szuflady na podstawie wysokości frontu
// ZMIENIONE: Funkcja przyjmuje systemId, aby poprawnie nadać nazwy wariantów
export function getDrawerVariant(frontHeight, systemId) {
  if (frontHeight < 160) {
    return { type: 'M', backHeight: 84 }; 
  } else if (frontHeight >= 160 && frontHeight < 280) {
    const type = systemId === 'merivobox' ? 'K' : 'C'; 
    return { type: type, backHeight: 167 }; 
  } else {
    // Wysoka szuflada z relingiem (Merivobox = E, Antaro = D)
    const type = systemId === 'merivobox' ? 'E' : 'D';
    const backHeight = systemId === 'merivobox' ? 192 : 199;
    return { type: type, backHeight: backHeight }; 
  }
}

// ZMIENIONE: Funkcja przyjmuje teraz czwarty argument (frontHeight)
export function getDrawerComponents(systemId, internalWidth, internalDepth, frontHeight) {
  const system = drawerSystems[systemId];
  
  if (!system) {
    console.error(`Nie znaleziono systemu szuflad: ${systemId}`);
    return null;
  }

  const nl = calculateNominalLength(internalDepth);
  const variant = getDrawerVariant(frontHeight, systemId);

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


// ... (reszta Twojego pliku drawerMath.js) ...

// Funkcja obliczająca nawierty odzwierciedlająca logikę z src/hardware/blum.js
export function calculateDrawerHoles(systemId, currentY, frontHeight, boardThick, index, isBottom) {
  // 1. Zaciągamy ustawienia luzów z globalnego stanu projektu
  const config = state.project;
  const bottomGap = Number(config.front.clearance.bottom ?? 0);
  const sideGap = Number(config.front.clearance.sides ?? 1.5);

  // 2. Słownik offsetów Bluma
  const BLUM_OFFSETS = {
    'merivobox': { railOffset: 54, frontHolesBase: 33.5, frontHolesXBase: 20.5 },
    'legrabox': { railOffset: 38, frontHolesBase: 25, frontHolesXBase: 21.5 }, 
    'tandembox': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 },
    'antaro': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
  };

  const systemParams = BLUM_OFFSETS[systemId.toLowerCase()] || BLUM_OFFSETS['merivobox'];

  // --- OŚ Y PROWADNIC NA BOKU KORPUSU ---
  let slideY;
  if (isBottom) {
    // Pierwsza prowadnica: od wewnętrznej strony dna (wieniec dolny + offset)
    slideY = boardThick + systemParams.railOffset;
  } else {
    // Kolejne prowadnice: pozycjonowane względem dolnej krawędzi frontu
    slideY = currentY + systemParams.railOffset;
  }

  // --- OŚ Y NAWIERTÓW FRONTU ---
  let localFrontHolesBase = systemParams.frontHolesBase;
  if (isBottom) {
    // Korekta dla pierwszej szuflady (nadmiar zakrywający wieniec dolny)
    const bottomOverlap = boardThick - bottomGap; 
    localFrontHolesBase += bottomOverlap;
  }

  // --- OŚ X NAWIERTÓW FRONTU ---
  // Obliczamy nałożenie frontu na bok (grubość boku - luz boczny)
  const frontOverlapX = boardThick - sideGap;
  const localFrontHolesX = systemParams.frontHolesXBase + frontOverlapX;

  // Kompletujemy nawierty we froncie
  const frontHoles = [
    { y: localFrontHolesBase, xOffset: localFrontHolesX, diameter: 3 },
    { y: localFrontHolesBase + 32, xOffset: localFrontHolesX, diameter: 3 }
  ];

  // Dodatkowy otwór na reling dla wysokiej szuflady (front od 280 mm w górę)
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