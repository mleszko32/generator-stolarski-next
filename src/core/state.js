// Główny obiekt przechowujący wszystkie dane naszego projektu
export const state = {
  project: {
    name: "Szafka dolna",
    dimensions: {
      width: 600,
      height: 720,
      depth: 500
    },
    materials: {
      boardThickness: 18,
      backPanelThickness: 3
    }
  },
  ui: {
    selectedElement: null // Tu w przyszłości zapiszemy, co kliknął użytkownik
  }
};

// Prosta funkcja do podglądu stanu w konsoli
export function logState() {
  console.log("Aktualny stan projektu:", state);
}