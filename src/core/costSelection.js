// src/core/costSelection.js
//
// Wybór mebli liczonych w kosztorysie (wycena etapami: np. tylko szafa za drzwiami). Osobny od wyboru
// w liście formatek / rozkroju (project.partsSelection) - wycena i produkcja mogą mieć różne etapy.
// Zapis: project.costSelection.excluded = klucze odznaczonych mebli (furnitureGroups). Brak = wszystko.
// Czyste - bez state, z testami.

import { furnitureGroups } from "./furnitureGroups.js";

export function getCostExcluded(project) {
  const s = project && project.costSelection;
  return s && Array.isArray(s.excluded) ? [...s.excluded] : [];
}

export function setCostExcluded(project, excluded) {
  if (!excluded.length) { delete project.costSelection; return; }
  project.costSelection = { excluded: [...excluded] };
}

// Meble do wyboru: [{ key, label }] w kolejności projektu.
export function costChoices(project) {
  return furnitureGroups(project).groups.map(({ key, label }) => ({ key, label }));
}

// Odznaczone klucze, które nadal istnieją w projekcie (po usunięciu mebla wpis przestaje się liczyć).
function activeExcluded(project) {
  const known = new Set(costChoices(project).map((c) => c.key));
  return getCostExcluded(project).filter((k) => known.has(k));
}

// Kopia projektu tylko z zaznaczonymi meblami (szafki i boki / blendy / panele); reszta bez zmian.
// Bez odznaczeń zwraca ten sam obiekt.
export function narrowProjectForCost(project) {
  const excluded = activeExcluded(project);
  if (!excluded.length) return project;
  const skip = new Set(excluded);
  const f = furnitureGroups(project);
  return {
    ...project,
    modules: (project.modules || []).filter((m) => !skip.has(f.moduleKey.get(m.id))),
    sidePanels: (project.sidePanels || []).filter((p) => !skip.has(f.panelKey.get(p.id))),
  };
}

// Opis zakresu do nagłówka kosztorysu / oferty; pusty, gdy liczy się całość.
export function costScopeLabel(project) {
  const excluded = activeExcluded(project);
  if (!excluded.length) return "";
  const skip = new Set(excluded);
  const chosen = costChoices(project).filter((c) => !skip.has(c.key)).map((c) => c.label);
  return chosen.length ? `Wycena częściowa: ${chosen.join(", ")}` : "Wycena częściowa: nic nie zaznaczono";
}
