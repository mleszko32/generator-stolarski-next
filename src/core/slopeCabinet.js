// src/core/slopeCabinet.js
//
// Szafka pod skos (mod.type === 'slope_cabinet'), np. pod schodami albo pod dachem.
// Czysta geometria w widoku od frontu + formatki korpusu. Rysuje ją
// render/slopeCabinet3d.js, edytuje ui/slopeProperties.js.
//
// Dane modułu:
//   dimensions: { width, height, depth } - height to WYSOKA strona
//   slope: { lowSide: 'left'|'right', lowHeight, columns: [w|null], shelves: [y] }
//     lowHeight 0 = trójkąt (skos schodzi do podłogi), > 0 = trapez z niskim bokiem
//     columns: szerokości wnęk w świetle, od LEWEJ do prawej; dokładnie jedna
//       pozycja null = "reszta" (liczona z szerokości szafki). Przegrody stoją
//       między kolumnami. Kolumna przy skosie w trójkącie liczona od czubka skosu.
//     shelves: spód półki w mm od dołu szafki
//     (starsze dane: dividers: [x] - lewa ściana przegrody od lewej krawędzi -
//      zamieniane na columns w getSlopeSettings)
//
// Konstrukcja: dno (wieniec dolny) NAKŁADANE - na całą szerokość szafki, a boki,
// skośna płyta i przegrody stoją na nim. W trójkącie lewy koniec dna jest docięty
// równo z linią skosu. Skośna płyta idzie na całą długość (od dna albo od niskiego
// boku do zewnętrznej ściany wysokiego boku), boki i przegrody są do niej docięte
// pod kątem. Przegrody są ciągłe od dna do skosu, półki są dzielone przegrodami
// i docinane do skosu.
//
// Wszystko liczymy w układzie "niska strona po lewej" (x od lewej krawędzi, y od
// dołu); dla lowSide === 'right' wynik 3D jest lustrzany (mirrorX), a formatki
// są takie same.

const MIN_PIECE = 50;   // krótsze kawałki pomijamy (nie da się ich zrobić)

export const SLOPE_DEFAULTS = { lowSide: 'left', lowHeight: 0, columns: [null], shelves: [] };

// Granice wnętrza w poziomie (rzeczywiste x, od lewej krawędzi): w trójkącie
// kolumna przy skosie zaczyna się od czubka (x = 0 albo x = W), przy boku - od
// jego wewnętrznej ściany.
export function getSlopeInnerSpan(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const left = (g.lowSide === 'left' && g.isTriangle) ? 0 : th;
  const right = (g.lowSide === 'right' && g.isTriangle) ? g.W : g.W - th;
  return { left, right };
}

// Stare dane (dividers: pozycje od lewej) -> szerokości kolumn, "reszta" przy skosie.
function columnsFromDividers(mod, dividers, th) {
  const { left, right } = getSlopeInnerSpan(mod, th);
  const xs = dividers.map((x) => parseFloat(x) || 0).sort((a, b) => a - b);
  const cols = [];
  let prev = left;
  xs.forEach((x) => { cols.push(Math.round((x - prev) * 10) / 10); prev = x + th; });
  cols.push(Math.round((right - prev) * 10) / 10);
  const lowRight = mod.slope && mod.slope.lowSide === 'right';
  cols[lowRight ? cols.length - 1 : 0] = null;
  return cols;
}

export function getSlopeSettings(mod, th = 18) {
  const s = { ...SLOPE_DEFAULTS, ...(mod.slope || {}) };
  if (!(mod.slope && Array.isArray(mod.slope.columns)) && mod.slope && Array.isArray(mod.slope.dividers)) {
    s.columns = columnsFromDividers(mod, mod.slope.dividers, th);
  }
  if (!s.columns.length) s.columns = [null];
  if (!s.columns.includes(null)) s.columns = [...s.columns.slice(0, -1), null];
  return s;
}

// Szerokości wszystkich kolumn (z policzoną "resztą") i rzeczywiste x lewych
// ścian przegród między nimi.
export function getSlopeColumns(mod, th = 18) {
  const { left, right } = getSlopeInnerSpan(mod, th);
  const cols = getSlopeSettings(mod, th).columns;
  const fixed = cols.reduce((sum, w) => sum + (w === null ? 0 : (parseFloat(w) || 0)), 0);
  const autoW = right - left - fixed - (cols.length - 1) * th;
  const widths = cols.map((w) => (w === null ? autoW : (parseFloat(w) || 0)));
  const dividers = [];
  let x = left;
  widths.slice(0, -1).forEach((w) => { x += w; dividers.push(x); x += th; });
  return { widths, autoIndex: cols.indexOf(null), autoWidth: autoW, dividers };
}

// Podstawowe wielkości: k - nachylenie (przyrost wysokości na 1 mm szerokości),
// c - pionowa grubość skośnej płyty (th / cos kąta), angle - kąt skosu w stopniach.
export function getSlopeGeometry(mod, th = 18) {
  const W = parseFloat(mod.dimensions.width) || 0;
  const H = parseFloat(mod.dimensions.height) || 0;
  const D = parseFloat(mod.dimensions.depth) || 0;
  // Bez getSlopeSettings - ta (przy starych danych) sama woła geometrię.
  const s = { ...SLOPE_DEFAULTS, ...(mod.slope || {}) };
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
  const minX = g.isTriangle ? 0 : th;
  return getSlopeColumns(mod, th).dividers
    .map((x, index) => ({ index, x: normDividerX(g, x) }))
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

  // Skośna płyta: wierzch i spód. W trójkącie dolny koniec stoi na dnie,
  // docięty poziomo, więc spód jest krótszy od wierzchu.
  const cosA = Math.cos(g.angle * Math.PI / 180);
  const topLen = g.isTriangle ? (g.W - th / g.k) / cosA : Math.hypot(g.W, g.H - g.L);
  const underLen = g.isTriangle ? (g.W - g.underX(th)) / cosA : topLen;
  parts.push({ name: cut('Skos (wieniec skośny)', topLen, underLen), length: r1(topLen), width: depth, qty: 1, category: 'Korpus' });

  // Wysoki bok stoi na dnie; zewnętrzna ściana dłuższa.
  const highOuter = g.under(g.W) - th, highInner = g.under(g.W - th) - th;
  parts.push({ name: cut('Bok wysoki', highOuter, highInner), length: r1(highOuter), width: depth, qty: 1, category: 'Korpus' });

  // Niski bok (tylko trapez) stoi na dnie; wewnętrzna ściana dłuższa.
  if (!g.isTriangle) {
    const lowOuter = g.under(0) - th, lowInner = g.under(th) - th;
    parts.push({ name: cut('Bok niski', lowInner, lowOuter), length: r1(lowInner), width: depth, qty: 1, category: 'Korpus' });
  }
  // Dno nakładane na całą szerokość; w trójkącie koniec przy skosie docięty
  // równo z linią skosu (spód pełny, wierzch krótszy).
  const bottomLong = g.W;
  const bottomShort = g.isTriangle ? g.W - th / g.k : g.W;
  parts.push({ name: cut('Dno (wieniec dolny)', bottomLong, bottomShort), length: r1(bottomLong), width: depth, qty: 1, category: 'Korpus' });

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
    add('corpus', [[th / g.k, th], [g.underX(th), th], [g.W, g.under(g.W)], [g.W, g.H]]);
  } else {
    add('corpus', [[0, g.under(0)], [g.W, g.under(g.W)], [g.W, g.H], [0, g.L]]);
  }
  // Wysoki bok (na dnie)
  add('corpus', [[g.W - th, th], [g.W, th], [g.W, g.under(g.W)], [g.W - th, g.under(g.W - th)]]);
  // Niski bok (na dnie) + dno nakładane
  if (!g.isTriangle) {
    add('corpus', [[0, th], [th, th], [th, g.under(th)], [0, g.under(0)]]);
    add('corpus', [[0, 0], [g.W, 0], [g.W, th], [0, th]]);
  } else {
    add('corpus', [[0, 0], [g.W, 0], [g.W, th], [th / g.k, th]]);
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
