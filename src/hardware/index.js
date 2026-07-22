// src/hardware/index.js
import { getBlumMountingData } from './blum.js';

export function getHardwareMounting(brand, variantType, nominalLength) {
  switch (brand?.toLowerCase()) {
    case 'blum':
    case 'blum metal':
      return getBlumMountingData(variantType, nominalLength);
    
    // W przyszłości łatwo dodasz kolejnych producentów:
    // case 'hettich':
    //   return getHettichMountingData(variantType, nominalLength);

    default:
      return null;
  }
}