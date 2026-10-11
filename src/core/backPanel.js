// src/core/backPanel.js
//
// Jedyne miejsce domyślnych ustawień pleców szafki. Wcześniej każdy plik miał własny
// fallback (`mod.backPanel || { type, offset }`) i moduł bez `grooveDepth` (np. z importu
// szkicu AI) po przełączeniu na plecy w nucie dawał formatkę „Plecy” NaN × NaN, choć
// formularz pokazywał domyślne 6 mm. Wartości domyślne = to, co pokazuje formularz
// (ui/properties.js, sekcja Plecy).
import { num } from "../utils/math.js";

export const BACK_PANEL_DEFAULTS = Object.freeze({
  type: "nakladane",
  offset: 16,      // cofnięcie nutu od tyłu boku
  grooveDepth: 6,  // głębokość nutu
  clearance: 2,    // luz płyty pleców w nucie (na stronę)
  nutBuild: "all", // które płyty mają nut: all | sides | top_bottom
});

// Scalone ustawienia pleców: domyślne < project.backPanel < mod.backPanel, liczby jako liczby.
export function resolveBackPanel(mod, project) {
  const bp = {
    ...BACK_PANEL_DEFAULTS,
    ...((project && project.backPanel) || {}),
    ...((mod && mod.backPanel) || {}),
  };
  return {
    type: bp.type === "nut" ? "nut" : "nakladane",
    offset: num(bp.offset, BACK_PANEL_DEFAULTS.offset),
    grooveDepth: num(bp.grooveDepth, BACK_PANEL_DEFAULTS.grooveDepth),
    clearance: num(bp.clearance, BACK_PANEL_DEFAULTS.clearance),
    nutBuild: ["all", "sides", "top_bottom"].includes(bp.nutBuild) ? bp.nutBuild : BACK_PANEL_DEFAULTS.nutBuild,
  };
}

// Głębokość wieńców korpusu (bez płyty pleców; przy plecach w nucie jeszcze bez cofnięcia
// nutu) dla podanej głębokości szafki - od niej liczą się półki, przegrody i szuflady.
export function corpusInnerDepth(mod, project, depth = num(mod.dimensions && mod.dimensions.depth)) {
  const backThick = num(project && project.materials && project.materials.backThickness, 3) || 3;
  const bp = resolveBackPanel(mod, project);
  return bp.type === "nut" ? depth - bp.offset - backThick : depth - backThick;
}
