// src/engine/edgeBanding.js
//
// Oklejanie krawędzi: stolarnia okleja WSZYSTKIE formatki dookoła (zgłoszone
// przez użytkownika), więc obwód = 2*(długość+szerokość). Wyjątek: plecy z HDF
// (kategoria "Plecy") - płyty pilśniowej nie okleja się. Formatka L (wieniec/
// półka narożna) ma ten sam obwód co jej prostokąt opisany, bo wcięcie w rogu
// nie zmienia obwodu, więc wystarczy length/width.
export const EDGE_BANDING_EXCLUDED_CATEGORIES = ['Plecy', 'Blat'];
// Zapas okleiny doliczany do zamówienia (odpad na końcach, docinanie).
export const EDGE_BANDING_RESERVE = 0.10;

export function isEdgeBanded(part) {
  return !EDGE_BANDING_EXCLUDED_CATEGORIES.includes(part.category);
}

export function partEdgeBandingMm(part) {
  if (!isEdgeBanded(part)) return 0;
  return 2 * ((parseFloat(part.length) || 0) + (parseFloat(part.width) || 0));
}

export function totalEdgeBandingMeters(parts) {
  const mm = parts.reduce((sum, p) => sum + partEdgeBandingMm(p) * (parseFloat(p.qty) || 1), 0);
  return mm / 1000;
}
