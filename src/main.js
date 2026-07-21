import "./styles/global.css";
import { initLayout } from "./ui/layout.js";
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js"; // NOWY IMPORT

console.log("Generator Stolarski Next uruchomiony");

initLayout();
initPropertiesPanel();
updateSidebar(); // Rysujemy formatki na starcie