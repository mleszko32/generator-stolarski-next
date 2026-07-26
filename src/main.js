import "./styles/global.css";
import { initLayout } from "./ui/layout.js";
import { initPropertiesPanel } from "./ui/properties.js";
import { updateSidebar } from "./ui/sidebar.js";
import { init3DViewer } from "./render/viewer3d.js"; // NOWY IMPORT
import { renderEditor2D } from "./render/editor2d.js"; // DODANY IMPORT 2D

console.log("Generator Stolarski Next uruchomiony");

initLayout();
initPropertiesPanel();
updateSidebar();
init3DViewer(); // Odpalamy scenę 3D
renderEditor2D(); // Wymuszamy narysowanie korpusu 2D przy starcie