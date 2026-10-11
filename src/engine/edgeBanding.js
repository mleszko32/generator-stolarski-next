// src/engine/edgeBanding.js
//
// Oklejanie krawędzi. Domyślnie stolarnia okleja WSZYSTKIE formatki dookoła
// (zgłoszone przez użytkownika), więc obwód = 2*(długość+szerokość). Wyjątek: plecy
// z HDF i blaty (kategorie "Plecy", "Blat") - domyślnie bez okleiny. Formatka L
// (wieniec/półka narożna) ma ten sam obwód co jej prostokąt opisany, bo wcięcie w
// rogu nie zmienia obwodu, więc wystarczy length/width.
//
// Wybór krawędzi (project.edgeBanding): mapa klucz formatki -> [dł.1, dł.2, szer.1,
// szer.2] (true = okleić). Klucz to ta sama tożsamość, po której lista formatek
// zlicza sztuki (kategoria|nazwa|długość|szerokość), więc wybór dotyczy wszystkich
// identycznych formatek w projekcie. Brak wpisu = reguła domyślna (dookoła albo nic).
// Formatka z materialId (fronty, boki dokładane, blendy) ma klucz z materiałem - ta sama
// tożsamość co wiersz listy formatek, więc dwa fronty o tych samych wymiarach w różnych
// materiałach mają osobne ustawienia. Stary klucz bez materiału (projekty sprzed tej
// zmiany) dalej działa jako zapasowy.
export const EDGE_BANDING_EXCLUDED_CATEGORIES = ['Plecy', 'Blat'];
// Zapas okleiny doliczany do zamówienia (odpad na końcach, docinanie).
export const EDGE_BANDING_RESERVE = 0.10;

// Kolejność krawędzi w tablicach: dłuższa 1, dłuższa 2, krótsza 1, krótsza 2.
export const EDGE_NAMES = ['dłuższa 1', 'dłuższa 2', 'krótsza 1', 'krótsza 2'];

export function isEdgeBanded(part) {
  return !EDGE_BANDING_EXCLUDED_CATEGORIES.includes(part.category);
}

const baseEdgeKey = (part) => `${part.category}|${part.name}|${part.length}|${part.width}`;

export function edgeKey(part) {
  const base = baseEdgeKey(part);
  return part.materialId ? `${base}|${part.materialId}` : base;
}

// rules: project.edgeBanding (albo null). Zwraca [dł.1, dł.2, szer.1, szer.2].
export function getPartEdges(part, rules = null) {
  const r = rules && (rules[edgeKey(part)] || rules[baseEdgeKey(part)]);
  if (Array.isArray(r) && r.length === 4) return r.map(Boolean);
  const all = isEdgeBanded(part);
  return [all, all, all, all];
}

// Zapisuje wybór krawędzi; wybór równy regule domyślnej usuwa wpis (mapa nie puchnie).
// Zwraca nową mapę reguł (nie mutuje argumentu).
export function withEdges(rules, part, edges) {
  const next = { ...(rules || {}) };
  const def = isEdgeBanded(part);
  // Wybór równy domyślnemu usuwa wpis - chyba że zostałby stary klucz bez materiału, który
  // by go nadpisał; wtedy zapisujemy domyślny wybór jawnie.
  if (edges.every((e) => e === def) && !(part.materialId && next[baseEdgeKey(part)])) delete next[edgeKey(part)];
  else next[edgeKey(part)] = edges.map(Boolean);
  return next;
}

export function partEdgeBandingMm(part, rules = null) {
  const [l1, l2, w1, w2] = getPartEdges(part, rules);
  const len = parseFloat(part.length) || 0;
  const wid = parseFloat(part.width) || 0;
  return (l1 + l2) * len + (w1 + w2) * wid;
}

export function totalEdgeBandingMeters(parts, rules = null) {
  const mm = parts.reduce((sum, p) => sum + partEdgeBandingMm(p, rules) * (parseFloat(p.qty) || 1), 0);
  return mm / 1000;
}

// Opis słowny do etykiet i list: "dookoła", "brak" albo "2 dł. + 1 szer.".
export function describeEdges(edges) {
  const n = edges.filter(Boolean).length;
  if (n === 4) return 'dookoła';
  if (n === 0) return 'brak';
  const long = edges[0] + edges[1];
  const short = edges[2] + edges[3];
  return [long ? `${long} dł.` : '', short ? `${short} szer.` : ''].filter(Boolean).join(' + ');
}
