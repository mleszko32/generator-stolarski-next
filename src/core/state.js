// Główny stan aplikacji (Source of Truth)
export const state = {
  project: {
    dimensions: {
      width: 600,
      height: 720,
      depth: 500
    },
    materials: {
      boardThickness: 18,
      backThickness: 3, // Grubość płyty HDF (plecy)
      backOffset: 15    // Cofnięcie pleców od tyłu szafki (np. na nut)
    }
  }
};