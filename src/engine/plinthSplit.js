// src/engine/plinthSplit.js
//
// Podział scalonego odcinka cokołu (engine/cabinet.js: collectProjectParts łączy
// cokoły stykających się szafek dolnych w jeden bieg) na części, które da się
// wyciąć z arkusza płyty. Pełna ściana kuchni to 3-4 m cokołu, a arkusz ma 2800 mm,
// więc bieg trzeba podzielić - łączenia wypadają na stykach szafek (tam cokół ma
// za sobą nóżki obu szafek), a w środku szafki tylko wtedy, gdy sama szafka jest
// dłuższa niż arkusz.

const EPS = 0.01;

// Najdłuższa formatka cokołu z ustawień rozkroju (project.cutPlan): dłuższy bok
// arkusza minus obrzeże z obu stron - tyle naprawdę zmieści engine/nesting.js
// (i tym bardziej kontrola projektu, która porównuje z pełnym arkuszem).
export function maxPlinthLength(cutPlan) {
  const cp = cutPlan || {};
  const pos = (v, d) => { const n = parseFloat(v); return n > 0 ? n : d; };
  const sheetW = pos(cp.sheetW, 2800), sheetH = pos(cp.sheetH, 2070);
  const trimRaw = parseFloat(cp.trim);
  const trim = trimRaw >= 0 ? trimRaw : 10;
  return Math.max(sheetW, sheetH) - 2 * trim;
}

// totalLen - długość całego biegu; joints - pozycje styków szafek liczone od początku
// biegu (dowolna kolejność, poza zakresem (0, totalLen) są pomijane); maxLen - najdłuższa
// dopuszczalna część. Zwraca długości kolejnych części (suma = totalLen).
// Najpierw najmniej części, potem najkrótsza najdłuższa część (równiejsze kawałki).
export function splitPlinthRun(totalLen, joints, maxLen) {
  if (!(totalLen > 0)) return [];
  if (!(maxLen > 0) || totalLen <= maxLen + EPS) return [totalLen];

  // Punkty, w których wolno ciąć: styki szafek, a odcinek między stykami dłuższy
  // niż arkusz dzielimy dodatkowo na równe kawałki (łączenie w środku szafki).
  const base = [0, ...joints.filter((j) => j > EPS && j < totalLen - EPS), totalLen]
    .sort((a, b) => a - b)
    .filter((p, i, arr) => i === 0 || p - arr[i - 1] > EPS);
  const points = [0];
  for (let i = 1; i < base.length; i++) {
    const span = base[i] - base[i - 1];
    const n = Math.ceil(span / maxLen - EPS);
    for (let k = 1; k < n; k++) points.push(base[i - 1] + (span * k) / n);
    points.push(base[i]);
  }

  // best[j] = najlepszy podział odcinka [0, points[j]] - { count, longest, prev }.
  const best = [{ count: 0, longest: 0, prev: -1 }];
  for (let j = 1; j < points.length; j++) {
    let cand = null;
    for (let i = j - 1; i >= 0; i--) {
      const len = points[j] - points[i];
      if (len > maxLen + EPS) break;
      const c = { count: best[i].count + 1, longest: Math.max(best[i].longest, len), prev: i };
      if (!cand || c.count < cand.count || (c.count === cand.count && c.longest < cand.longest - EPS)) cand = c;
    }
    best.push(cand);
  }

  const pieces = [];
  for (let j = points.length - 1; j > 0; j = best[j].prev) pieces.unshift(points[j] - points[best[j].prev]);
  return pieces;
}
