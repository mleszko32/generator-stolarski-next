// src/core/frontRounding.js
//
// Podpowiedź "równych wymiarów": fronty mają wychodzić w pełnych milimetrach. Dla frontów
// szafki (po recalculateLayout - czyta el.x/y/w/h) zwraca te, których szerokość albo wysokość
// ma ułamek, i o ile zmienić luz na zewnętrznej krawędzi korpusu, żeby wyszła pełna liczba.
// Czysta logika, niczego nie zmienia - luz wpisuje użytkownik (sekcja Front).
const EPS = 0.01;
const frac = (v) => v - Math.floor(v + EPS);
const r2 = (v) => Math.round(v * 100) / 100;

// Wynik: [{ frontIds, dim: 'width' | 'height', value, edges: ['left','right'] | ['top','bottom'] (podzbiór),
//           more: { delta, result }, less: { delta, result } }]
// more = zwiększ luz o delta (front mniejszy, `result`), less = zmniejsz luz o delta (front większy).
export function frontRoundingHints(mod, th, { inset = false } = {}) {
  if (!mod || inset) return [];
  const W = parseFloat(mod.dimensions && mod.dimensions.width) || 0;
  const H = parseFloat(mod.dimensions && mod.dimensions.height) || 0;
  const fronts = (mod.elements || []).filter((el) => el.typ === "front" && el.subtype && el.subtype !== "szuflada-wewnetrzna"
    && [el.x, el.y, el.w, el.h].every((v) => Number.isFinite(parseFloat(v))));

  // fronty z jednej wnęki (para drzwi, kolumna szuflad) dzielą szerokość / wysokość między siebie
  const groups = new Map();
  fronts.forEach((el) => {
    const z = el.baseZone || {};
    const key = [el.subtype, z.minX, z.maxX, z.minY, z.maxY].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  });

  const hints = [];
  const push = (els, dim, value, share, edges) => {
    const f = frac(value);
    if (f < EPS || 1 - f < EPS || !edges.length) return;
    hints.push({
      frontIds: els.map((e) => e.id), dim, value: r2(value), edges,
      more: { delta: r2(f * share), result: Math.floor(value + EPS) },
      less: { delta: r2((1 - f) * share), result: Math.floor(value + EPS) + 1 },
    });
  };

  groups.forEach((els) => {
    const pair = els[0].subtype === "drzwi-lp";
    const drawers = els[0].subtype === "szuflada";
    const x0 = Math.min(...els.map((e) => e.x)), x1 = Math.max(...els.map((e) => e.x + e.w));
    const y0 = Math.min(...els.map((e) => e.y)), y1 = Math.max(...els.map((e) => e.y + e.h));

    const wEdges = [x0 < th - EPS && "left", x1 > W - th + EPS && "right"].filter(Boolean);
    push(els, "width", els[0].w, pair ? els.length : 1, wEdges);

    const hEdges = [y1 > H - th + EPS && "top", y0 < th - EPS && "bottom"].filter(Boolean);
    const sameH = els.every((e) => Math.abs(e.h - els[0].h) < EPS);
    // szuflady o różnych wysokościach (podział z wymiarami) - luz ich nie wyrówna, pomijamy
    if (!drawers || sameH) push(els, "height", els[0].h, drawers ? els.length : 1, hEdges);
  });
  return hints;
}

const EDGE_PL = { left: "lewy", right: "prawy", top: "góra", bottom: "dół" };

// Tekst podpowiedzi po polsku, np. "szerokość 546,5 mm: luz lewy albo prawy +0,5 → 546 mm, albo −0,5 → 547 mm".
export function roundingHintText(hint) {
  const num = (v) => String(v).replace(".", ",");
  const edges = hint.edges.map((e) => EDGE_PL[e]).join(" albo ");
  const dim = hint.dim === "width" ? "szerokość" : "wysokość";
  return `${dim} ${num(hint.value)} mm: luz ${edges} +${num(hint.more.delta)} → ${hint.more.result} mm, albo −${num(hint.less.delta)} → ${hint.less.result} mm`;
}
