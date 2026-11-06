// src/core/boardThickness.js
//
// Grubość płyty korpusu szafki. Domyślnie jedna dla projektu (project.materials.boardThickness),
// ale dekor korpusu z bazy płyt podaje ją w nazwie („U702 ST9 18mm”, „W1000 PM/ST9 19mm”) -
// wtedy szafka liczy się z grubością swojej płyty (formatki, wiercenia, wnętrze, 3D).
// Czyste funkcje.
import { moduleKorpusDecor } from "./materialCatalog.js";

// Grubość z nazwy dekoru („18mm”, „18,6 mm”) albo null. Bierze pierwszą podaną (nominalną:
// „18mm (18.6mm)” -> 18); tylko rozsądny zakres grubości płyt meblowych.
export function decorThickness(label) {
  const m = String(label || "").match(/(\d{1,2}(?:[.,]\d)?)\s*mm\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return v >= 6 && v <= 40 ? v : null;
}

export function projectBoardThickness(project) {
  const v = parseFloat(project && project.materials && project.materials.boardThickness);
  return Number.isFinite(v) && v > 0 ? v : 18;
}

// Grubość płyty korpusu szafki: z dekoru korpusu szafki, inaczej z projektu.
export function moduleBoardThickness(mod, project) {
  return decorThickness(moduleKorpusDecor(mod)) || projectBoardThickness(project);
}
