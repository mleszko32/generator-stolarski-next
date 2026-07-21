export const state = {
  project: {
    dimensions: {
      width: 600,
      height: 720,
      depth: 500
    },
    materials: {
      boardThickness: 18,
      backThickness: 3,
      backOffset: 15
    },
    // Nowa sekcja na parametry wnętrza
    interior: {
      shelvesCount: 1 // Domyślnie startujemy z jedną półką
    }
  }
};