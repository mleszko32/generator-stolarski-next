export const state = {
  project: {
    dimensions: { width: 600, height: 720, depth: 513 },
    materials: { boardThickness: 18, backThickness: 3 },
    backPanel: { type: 'nakladane', offset: 17, grooveDepth: 13, clearance: 2 },
    interior: { shelvesCount: 1 },
    front: {
      active: true,
      count: 3, // Domyślnie robimy komodę na 3 szuflady
      gap: 3,   // Szczelina między frontami w pionie (np. 3 mm)
      clearance: {
        sides: 1.5,
        top: 5,
        bottom: 0
      }
    }
  }
};