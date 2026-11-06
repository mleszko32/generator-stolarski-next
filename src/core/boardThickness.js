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

// Grubość boku dokładanego / panelu poziomego / płyty leżącej: panel poziomy i płyta szersza
// niż wysoka mają grubość w `height`, bok stojący w `width`. Blenda nie ma grubości do ustawiania.
function sidePanelThicknessKey(panel) {
  if (!panel || !panel.dimensions || panel.kind === "blenda") return null;
  if (panel.kind === "poziomy") return "height";
  const w = parseFloat(panel.dimensions.width) || 0, h = parseFloat(panel.dimensions.height) || 0;
  return w > h ? "height" : "width";
}

// Ile płyt sklejonych w jedną (blat biurka, nogi, półki 36 mm = 2 × 18 mm): grubość panelu
// podzielona przez grubość płyty (z dekoru, inaczej z projektu), co najmniej 1.
export function sidePanelLayers(panel, project) {
  const key = sidePanelThicknessKey(panel);
  if (!key) return 1;
  const t = parseFloat(panel.dimensions[key]) || 0;
  const board = decorThickness(panel.decor) || projectBoardThickness(project);
  return Math.max(1, Math.round(t / board));
}

// Nowy dekor z grubością w nazwie ustawia grubość panelu, zachowując liczbę sklejonych płyt
// (36 mm z 18 mm -> nowa płyta 19 mm daje 38 mm, a nie 19). Zwraca true, gdy zmienił grubość.
export function applyPanelDecorThickness(panel, decor) {
  const key = sidePanelThicknessKey(panel);
  const t = decorThickness(decor);
  if (!key || !t) return false;
  const cur = parseFloat(panel.dimensions[key]) || 0;
  const layers = Math.max(1, Math.round(cur / t));
  panel.dimensions[key] = Math.round(t * layers * 10) / 10;
  return true;
}

// Grubość płyty korpusu szafki: z dekoru korpusu szafki, inaczej z projektu.
export function moduleBoardThickness(mod, project) {
  return decorThickness(moduleKorpusDecor(mod)) || projectBoardThickness(project);
}
