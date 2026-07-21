export const state = {
  project: {
    dimensions: { width: 600, height: 720, depth: 500 },
    materials: {
      boardThickness: 18,
      backThickness: 3,
    },
    // Konfiguracja pleców dopasowana do Twojego warsztatu
    backPanel: {
      type: 'nut',       // 'nut' lub 'nakladane'
      offset: 17,        // Odsunięcie nutu od tyłu
      grooveDepth: 13,   // Głębokość frezowania (nutu) w bokach
      clearance: 2       // Luz montażowy na stronę (np. 2mm z lewej, 2 z prawej = 4mm łącznie)
    },
    interior: { shelvesCount: 1 }
  }
};