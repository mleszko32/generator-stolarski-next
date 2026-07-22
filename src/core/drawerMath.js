import { drawerSystems } from './drawerSystems.js';

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
export function getDrawerVariant(frontHeight) {
  // Klasyfikacja oparta na standardach (np. Blum Antaro)
  if (frontHeight < 160) {
    return { type: 'M', backHeight: 84 }; // Niska (np. na sztućce)
  } else if (frontHeight >= 160 && frontHeight < 280) {
    return { type: 'C', backHeight: 167 }; // Średnia 
  } else {
    return { type: 'D', backHeight: 199 }; // Wysoka (garnkowa)
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
  
  // Pobieramy dokładne dane o wariancie (typ i wysokość tyłu)
  const variant = getDrawerVariant(frontHeight);

  const bottomWidth = internalWidth - system.bottomWidthDeduct;
  const bottomLength = nl - system.bottomLengthDeduct;
  const backWidth = internalWidth - system.backWidthDeduct;

  return {
    systemName: system.name,
    nominalLength: nl,
    bottom: {
      width: bottomWidth,
      length: bottomLength
    },
    back: {
      width: backWidth,
      height: variant.backHeight, // Dokładna wysokość z katalogu
      variantType: variant.type // M, C lub D
    }
  };
}