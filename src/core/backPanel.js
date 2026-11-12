// src/core/backPanel.js
//
// Jedyne miejsce domyślnych ustawień pleców szafki. Wcześniej każdy plik miał własny
// fallback (`mod.backPanel || { type, offset }`) i moduł bez `grooveDepth` (np. z importu
// szkicu AI) po przełączeniu na plecy w nucie dawał formatkę „Plecy” NaN × NaN, choć
// formularz pokazywał domyślne 6 mm. Wartości domyślne = to, co pokazuje formularz
// (ui/properties.js, sekcja Plecy).
import { num } from "../utils/math.js";
import { decorThickness, projectBoardThickness } from "./boardThickness.js";
import { moduleKorpusDecor } from "./materialCatalog.js";

export const BACK_PANEL_DEFAULTS = Object.freeze({
  type: "nakladane",
  offset: 16,      // cofnięcie nutu od tyłu boku
  grooveDepth: 6,  // głębokość nutu
  clearance: 2,    // luz płyty pleców w nucie (na stronę)
  nutBuild: "all", // które płyty mają nut: all | sides | top_bottom
  thickness: 18,   // grubość pleców wpuszczanych (płyta korpusu między bokami i wieńcami)
  insetOffset: 0,  // cofnięcie pleców wpuszczanych od tyłu boków (np. szczelina do ściany)
  overlayThickness: 0, // grubość pleców nakładanych tej szafki; 0 = z projektu (materials.backThickness)
});

// "brak" = szafka bez pleców (np. wyspa, której tył zamyka osobny panel ryflowany): bez formatki
// pleców, boki i wieńce na całą głębokość.
const BACK_TYPES = ["nakladane", "nut", "wpuszczane", "brak"];

// Scalone ustawienia pleców: domyślne < project.backPanel < mod.backPanel, liczby jako liczby.
export function resolveBackPanel(mod, project) {
  const bp = {
    ...BACK_PANEL_DEFAULTS,
    ...((project && project.backPanel) || {}),
    ...((mod && mod.backPanel) || {}),
  };
  return {
    type: BACK_TYPES.includes(bp.type) ? bp.type : "nakladane",
    offset: num(bp.offset, BACK_PANEL_DEFAULTS.offset),
    grooveDepth: num(bp.grooveDepth, BACK_PANEL_DEFAULTS.grooveDepth),
    clearance: num(bp.clearance, BACK_PANEL_DEFAULTS.clearance),
    nutBuild: ["all", "sides", "top_bottom"].includes(bp.nutBuild) ? bp.nutBuild : BACK_PANEL_DEFAULTS.nutBuild,
    // Plecy wpuszczane to płyta korpusu: bez własnej grubości szafki - grubość jej dekoru
    // (U740 PM 19 mm → 19), dopiero potem ustawienie projektu / grubość płyty projektu.
    thickness: num(mod && mod.backPanel && mod.backPanel.thickness, 0) > 0
      ? num(mod.backPanel.thickness, 0)
      : (decorThickness(moduleKorpusDecor(mod)) || num(project && project.backPanel && project.backPanel.thickness, 0)
        || projectBoardThickness(project) || BACK_PANEL_DEFAULTS.thickness),
    insetOffset: Math.max(0, num(bp.insetOffset, 0)),
    // Grubość pleców nakładanych tej szafki (np. 18 mm płyty zamiast HDF); 0 = z projektu.
    overlayThickness: Math.max(0, num(bp.overlayThickness, 0)),
  };
}

// Od tej grubości plecy nakładane to płyta korpusu (pełny wymiar, kategoria Korpus), a nie HDF.
export const BOARD_BACK_MIN = 8;

// Grubość płyty pleców: wpuszczane - własna (płyta korpusu); nakładane - własna szafki, jeśli
// podana (overlayThickness), inaczej jak w nucie - HDF z ustawień projektu.
export function backThicknessOf(mod, project) {
  const bp = resolveBackPanel(mod, project);
  if (bp.type === "brak") return 0;
  if (bp.type === "wpuszczane") return bp.thickness;
  if (bp.type === "nakladane" && bp.overlayThickness > 0) return bp.overlayThickness;
  return num(project && project.materials && project.materials.backThickness, 3) || 3;
}

// Plecy nakładane z płyty (≥ BOARD_BACK_MIN): na pełny wymiar korpusu, zakrywają krawędzie boków i wieńców.
export function isBoardOverlayBack(mod, project) {
  const bp = resolveBackPanel(mod, project);
  return bp.type === "nakladane" && bp.overlayThickness >= BOARD_BACK_MIN;
}

// Głębokość boku: plecy nakładane przykrywają tył boków (bok krótszy o plecy), w nucie i
// wpuszczane mieszczą się między bokami (bok na całą głębokość szafki).
export function sideDepthOf(mod, project, depth = num(mod.dimensions && mod.dimensions.depth)) {
  return resolveBackPanel(mod, project).type === "nakladane" ? depth - backThicknessOf(mod, project) : depth;
}

// Głębokość wieńców korpusu (bez płyty pleców; przy plecach w nucie jeszcze bez cofnięcia
// nutu) dla podanej głębokości szafki - od niej liczą się półki, przegrody i szuflady.
export function corpusInnerDepth(mod, project, depth = num(mod.dimensions && mod.dimensions.depth)) {
  const backThick = backThicknessOf(mod, project);
  const bp = resolveBackPanel(mod, project);
  if (bp.type === "nut") return depth - bp.offset - backThick;
  if (bp.type === "wpuszczane") return depth - bp.insetOffset - backThick;
  return depth - backThick;
}
