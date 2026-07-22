export const state = {
  project: {
    dimensions: { width: 600, height: 720, depth: 513 },
    materials: { boardThickness: 18, backThickness: 3 },
    backPanel: { type: 'nakladane', offset: 17, grooveDepth: 12, clearance: 2 },
    front: {
      active: true,
      // Zamiast starego "count: 3", używamy naszego nowego ciągu dystrybucyjnego
      distribution: "1:1:141",
      gap: 3, // Szczelina między frontami w pionie (np. 3 mm)
      // NOWE: Wybrany system szuflad dla całego korpusu
      drawerSystem: 'antaro',
      clearance: {
        sides: 1.5,
        top: 5,
        bottom: 0
      }
    }
  }
};