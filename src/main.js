import "./styles/global.css";
import { initLayout } from "./ui/layout.js";
import { logState } from "./core/state.js";
import { initPropertiesPanel } from "./ui/properties.js"; // Nowy import

console.log("Generator Stolarski Next uruchomiony");

// Inicjalizacja komponentów
initLayout();
logState();
initPropertiesPanel(); // Rysujemy prawy panel z parametrami