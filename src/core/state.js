export const state = {
  project: {
    dimensions: { 
      width: 600, 
      height: 720, 
      depth: 513 
    },
    materials: {
      boardThickness: 18,
      backThickness: 3,
    },
    backPanel: {
      type: 'nakladane', 
      offset: 17,        
      grooveDepth: 13,   
      clearance: 2       
    },
    interior: { 
      shelvesCount: 1 
    },
    // Konfiguracja frontu (Twoje ustawienia)
    front: {
      active: true, // Możliwość włączania/wyłączania
      clearance: {
        sides: 1.5,
        top: 5,
        bottom: 0
      }
    }
  }
};