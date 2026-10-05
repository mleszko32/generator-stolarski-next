// src/core/slopeCabinet.js
//
// Szafka pod skos (mod.type === 'slope_cabinet'), np. pod schodami albo pod dachem.
// Czysta geometria w widoku od frontu + formatki korpusu. Rysuje ją
// render/slopeCabinet3d.js, edytuje ui/slopeProperties.js.
//
// Dane modułu:
//   dimensions: { width, height, depth } - height to WYSOKA strona
//   slope: { lowSide: 'left'|'right', lowHeight, dividers: [x], shelves: [y] }
//     lowHeight 0 = trójkąt (skos schodzi do podłogi), > 0 = trapez z niskim bokiem
//     dividers: lewa ściana przegrody w mm od LEWEJ krawędzi szafki
//     shelves: spód półki w mm od dołu szafki
//
// Konstrukcja: skośna płyta idzie na całą długość (od podłogi albo od niskiego
// boku do zewnętrznej ściany wysokiego boku), a wieniec dolny, boki i przegrody
// są do niej docięte pod kątem. Przegrody są ciągłe od wieńca dolnego do skosu,
// półki są dzielone przegrodami i docinane do skosu.
//
// Wszystko liczymy w układzie "niska strona po lewej" (x od lewej krawędzi, y od
// dołu); dla lowSide === 'right' wynik 3D jest lustrzany (mirrorX), a formatki
// są takie same.

const MIN_PIECE = 50;   // krótsze kawałki pomijamy (nie da się ich zrobić)

export const SLOPE_DEFAULTS = { lowSide: 'left', lowHeight: 0, dividers: [], shelves: [] };

export function getSlopeSettings(mod) {
  return { ...SLOPE_DEFAULTS, ...(mod.slope || {}) };
}

// Podstawowe wielkości: k - nachylenie (przyrost wysokości na 1 mm szerokości),
// c - pionowa grubość skośnej płyty (th / cos kąta), angle - kąt skosu w stopniach.
export function getSlopeGeometry(mod, th = 18) {
  const W = parseFloat(mod.dimensions.width) || 0;
  const H = parseFloat(mod.dimensions.height) || 0;
  const D = parseFloat(mod.dimensions.depth) || 0;
  const s = getSlopeSettings(mod);
  let L = Math.max(0, parseFloat(s.lowHeight) || 0);
  const k = W > 0 ? (H - L) / W : 0;
  const c = th * Math.sqrt(1 + k * k);
  // Za niski bok (mniej niż grubość skosu + wieniec + zapas) traktujemy jak trójkąt.
  const isTriangle = L < c + th + MIN_PIECE;
  if (isTriangle) L = 0;
  const k2 = W > 0 ? (H - L) / W : 0;
  const c2 = th * Math.sqrt(1 + k2 * k2);
  return {
    W, H, D, L, th, k: k2, c: c2, isTriangle,
    angle: Math.atan2(H - L, W) * 180 / Math.PI,
    lowSide: s.lowSide === 'right' ? 'right' : 'left',
    top: (x) => L + k2 * x,              // wierzch skośnej płyty
    under: (x) => L + k2 * x - c2,       // spód skośnej płyty
    underX: (y) => (y + c2 - L) / k2,    // x, w którym spód skosu jest na wysokości y
  };
}

// Pozycja przegrody w układzie "niska strona po lewej" (lewa ściana przegrody).
function normDividerX(g, x) {
  return g.lowSide === 'right' ? g.W - x - g.th : x;
}

// Przegrody w układzie znormalizowanym, posortowane, z wysokością lewej i prawej ściany.
// Odrzucamy te poza wnętrzem i te, które pod skosem miałyby mniej niż MIN_PIECE.
export function getSlopeDividers(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const s = getSlopeSettings(mod);
  const minX = g.isTriangle ? 0 : th;
  return (s.dividers || [])
    .map((x, index) => ({ index, x: normDividerX(g, parseFloat(x) || 0) }))
    .filter((d) => d.x >= minX && d.x + th <= g.W - th)
    .map((d) => ({ ...d, hLeft: g.under(d.x) - th, hRight: g.under(d.x + th) - th }))
    .filter((d) => d.hLeft >= MIN_PIECE)
    .sort((a, b) => a.x - b.x);
}

// Kawałki półek (półka jest dzielona przez ciągłe przegrody). Każdy kawałek:
// { y, x0Bottom, x0Top, x1 } - lewy koniec spodu i wierzchu (różne, gdy docięty
// do skosu) i prawy koniec; długość długiej krawędzi = x1 - x0Bottom.
export function getSlopeShelfPieces(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const s = getSlopeSettings(mod);
  const dividers = getSlopeDividers(mod, th);
  const leftWall = g.isTriangle ? 0 : th;
  const pieces = [];
  (s.shelves || []).map((y) => parseFloat(y) || 0).sort((a, b) => a - b).forEach((y, index) => {
    if (y < th || y + th > g.under(g.W - th)) return;
    // Granice kawałków: lewa ściana (albo skos), przegrody, prawy bok.
    const bounds = [leftWall];
    dividers.forEach((d) => { bounds.push(d.x, d.x + th); });
    bounds.push(g.W - th);
    for (let i = 0; i < bounds.length; i += 2) {
      const a = bounds[i], b = bounds[i + 1];
      const x0Bottom = Math.max(a, g.underX(y));
      const x0Top = Math.max(a, g.underX(y + th));
      if (b - x0Top < MIN_PIECE) continue;
      pieces.push({ index, y, x0Bottom, x0Top, x1: b });
    }
  });
  return pieces;
}

const r1 = (v) => Math.round(v * 10) / 10;

// Formatki korpusu szafki pod skos. Krawędzie docięte pod kątem: długość to
// DŁUŻSZA krawędź, a w nazwie podana krótsza i kąt skosu - tyle wystarczy, żeby
// formatkę wyciąć.
export function getSlopeCabinetParts(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const g = getSlopeGeometry(mod, th);
  const depth = g.D - backThick;
  const ang = `${r1(g.angle)}°`;
  const parts = [];
  const cut = (name, long, short) => Math.abs(long - short) < 0.05
    ? name
    : `${name} (skos ${ang}, krótsza ${r1(short)})`;

  // Skośna płyta: wierzch i spód (dla trójkąta spód jest krótszy, bo dolny
  // koniec stoi na podłodze, docięty poziomo).
  const cosA = Math.cos(g.angle * Math.PI / 180);
  const topLen = Math.hypot(g.W, g.H - g.L);
  const underLen = g.isTriangle ? (g.W - g.c / g.k) / cosA : topLen;
  parts.push({ name: cut('Skos (wieniec skośny)', topLen, underLen), length: r1(topLen), width: depth, qty: 1, category: 'Korpus' });

  // Wysoki bok: zewnętrzna ściana dłuższa.
  const highOuter = g.under(g.W), highInner = g.under(g.W - th);
  parts.push({ name: cut('Bok wysoki', highOuter, highInner), length: r1(highOuter), width: depth, qty: 1, category: 'Korpus' });

  // Niski bok (tylko trapez): wewnętrzna ściana dłuższa.
  let bottomLong, bottomShort;
  if (!g.isTriangle) {
    const lowOuter = g.under(0), lowInner = g.under(th);
    parts.push({ name: cut('Bok niski', lowInner, lowOuter), length: r1(lowInner), width: depth, qty: 1, category: 'Korpus' });
    bottomLong = bottomShort = g.W - 2 * th;
  } else {
    // Wieniec dolny dochodzi do skosu, lewy koniec docięty pod kątem.
    bottomLong = g.W - th - g.underX(0);
    bottomShort = g.W - th - g.underX(th);
  }
  parts.push({ name: cut('Wieniec dolny', bottomLong, bottomShort), length: r1(bottomLong), width: depth, qty: 1, category: 'Korpus' });

  getSlopeDividers(mod, th).forEach((d) => {
    parts.push({ name: cut('Przegroda', d.hRight, d.hLeft), length: r1(d.hRight), width: depth, qty: 1, category: 'Korpus' });
  });

  getSlopeShelfPieces(mod, th).forEach((p) => {
    const long = p.x1 - p.x0Bottom, short = p.x1 - p.x0Top;
    parts.push({ name: cut('Półka', long, short), length: r1(long), width: depth - 5, qty: 1, category: 'Korpus' });
  });

  // Plecy nakładane (HDF) o obrysie szafki, 2 mm mniej z każdej strony.
  const shape = g.isTriangle ? 'trójkąt' : `trapez, niska strona ${r1(g.L - 4)}`;
  parts.push({ name: `Plecy skos ${g.W}x${g.H} (${shape})`, length: r1(g.H - 4), width: r1(g.W - 4), qty: 1, category: 'Plecy' });

  return parts;
}

// Wielokąty płyt w widoku od frontu (x, y), do rysowania 3D. Każdy: { kind, points }.
// Dla lowSide === 'right' punkty są odbite w poziomie.
export function getSlopeCabinetPolygons(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const polys = [];
  const add = (kind, points) => polys.push({ kind, points });

  // Skos
  if (g.isTriangle) {
    add('corpus', [[0, 0], [g.underX(0), 0], [g.W, g.under(g.W)], [g.W, g.H]]);
  } else {
    add('corpus', [[0, g.under(0)], [g.W, g.under(g.W)], [g.W, g.H], [0, g.L]]);
  }
  // Wysoki bok
  add('corpus', [[g.W - th, 0], [g.W, 0], [g.W, g.under(g.W)], [g.W - th, g.under(g.W - th)]]);
  // Niski bok + wieniec dolny
  if (!g.isTriangle) {
    add('corpus', [[0, 0], [th, 0], [th, g.under(th)], [0, g.under(0)]]);
    add('corpus', [[th, 0], [g.W - th, 0], [g.W - th, th], [th, th]]);
  } else {
    add('corpus', [[g.underX(0), 0], [g.W - th, 0], [g.W - th, th], [g.underX(th), th]]);
  }
  getSlopeDividers(mod, th).forEach((d) => {
    add('corpus', [[d.x, th], [d.x + th, th], [d.x + th, g.under(d.x + th)], [d.x, g.under(d.x)]]);
  });
  getSlopeShelfPieces(mod, th).forEach((p) => {
    add('shelf', [[p.x0Bottom, p.y], [p.x1, p.y], [p.x1, p.y + th], [p.x0Top, p.y + th]]);
  });
  // Obrys pleców
  const back = g.isTriangle ? [[0, 0], [g.W, 0], [g.W, g.H]] : [[0, 0], [g.W, 0], [g.W, g.H], [0, g.L]];

  if (g.lowSide === 'right') {
    const m = (pts) => pts.map(([x, y]) => [g.W - x, y]).reverse();
    polys.forEach((p) => { p.points = m(p.points); });
    return { polys, back: m(back), geometry: g };
  }
  return { polys, back, geometry: g };
}
