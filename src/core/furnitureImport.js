// src/core/furnitureImport.js
//
// Wstawianie całego mebla z pliku JSON (np. szafa z rysunku projektanta rozpisana na
// kilka korpusów + blendy). Plik: { format: "gsn-furniture", name, modules: [...],
// sidePanels: [...] } - moduły i boki/blendy w formacie projektu, pozycje względem
// lewego dolnego rogu mebla. Mebel ląduje na prawo od tego, co już stoi w projekcie,
// z zachowaniem układu, a jego szafki dostają wspólne groupId (przesuwają się razem,
// "Rozbij grupę" je rozdziela). Moduły idą przez cloneModuleWithNewIds (nowe id,
// przepisane powiązania frontów, sito projectSanitize).
import { cloneModuleWithNewIds, ensureSidePanelsDefaults } from "./state.js";
import { getWorldFootprint } from "./layout.js";
import { sanitizeProjectData } from "./projectSanitize.js";
import { num } from "../utils/math.js";

const isModule = (m) => !!m && typeof m === "object" && !!m.dimensions && Array.isArray(m.elements || []);
const isPanel = (p) => !!p && typeof p === "object" && !!p.dimensions;

// Zwraca { name, modules, sidePanels } albo null przy niepoprawnym pliku.
export function parseFurnitureJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return null; }
  if (!data || typeof data !== "object" || !Array.isArray(data.modules)) return null;
  const modules = data.modules.filter(isModule);
  if (modules.length === 0) return null;
  const sidePanels = Array.isArray(data.sidePanels) ? data.sidePanels.filter(isPanel) : [];
  return { name: String(data.name || "Mebel"), modules, sidePanels };
}

const rightEdge = (o) => num(o.position && o.position.x) + getWorldFootprint(o).worldW;

// Dokłada mebel do projektu. Zwraca dodane moduły.
export function insertFurniture(project, furniture) {
  ensureSidePanelsDefaults(project);
  const existing = [...project.modules, ...project.sidePanels];
  const startX = existing.length ? Math.max(...existing.map(rightEdge)) : 0;
  const minX = Math.min(...[...furniture.modules, ...furniture.sidePanels].map((o) => num(o.position && o.position.x)));
  const dx = startX - minX;
  const groupId = "grp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const shift = (o) => {
    o.position = { x: num(o.position && o.position.x) + dx, y: num(o.position && o.position.y), z: num(o.position && o.position.z) };
  };

  const mods = furniture.modules.map((src) => {
    const mod = cloneModuleWithNewIds(src);
    shift(mod);
    mod.groupId = groupId;
    project.modules.push(mod);
    return mod;
  });
  furniture.sidePanels.forEach((src, i) => {
    const panel = sanitizeProjectData(JSON.parse(JSON.stringify(src)));
    panel.id = (panel.kind === "blenda" ? "blenda-" : "side-") + Date.now() + "-" + i + Math.random().toString(36).slice(2, 6);
    shift(panel);
    panel.groupId = groupId;  // ten sam mebel na liście formatek (core/furnitureGroups.js)
    project.sidePanels.push(panel);
  });
  ensureSidePanelsDefaults(project);
  return mods;
}
