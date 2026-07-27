// src/hardware/index.js
import { getBlumMountingData } from './blum.js';
import { getGtvMountingData } from './gtv.js';

export function getHardwareMounting(brand, cabinetConfig, drawers, systemType) {
  switch (brand?.toLowerCase()) {
    case 'blum':
    case 'blum metal':
      return getBlumMountingData(cabinetConfig, drawers, systemType);
    
    case 'gtv':
      return getGtvMountingData(cabinetConfig, drawers, systemType);

    // W przyszłości łatwo dodasz kolejnych producentów odkomentowując i dodając nowy import:
    // case 'hettich':
    //   return getHettichMountingData(cabinetConfig, drawers, systemType);

    default:
      return null;
  }
}