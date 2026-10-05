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

import { drawerSystems } from './drawerSystems.js';
import { getDrawerComponents, getWoodenDrawerHeights, drawerComponentsToParts, drawerHardwareKey } from './drawerMath.js';

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

// ---------------------------------------------------------------------------
// Fronty: każda wnęka (kolumna × rząd między półkami) dostaje własny front,
// docięty linią skosu. Trójkąt = blenda (stała maskownica), reszta = szuflada.
// Typ wnęki można wymusić: slope.cellTypes[klucz] = 'szuflada'|'blenda'|'brak'.
// Skrzynka szuflady: slope.drawerBox 'A' (prostokątna, wysokość od niższej
// strony) albo 'B' (ścięta pod skos: boki różnej wysokości, tył i czoło
// wewnętrzne trapezowe - tylko systemy ze skrzynką drewnianą, np. MOVENTO).
// ---------------------------------------------------------------------------

// Wnęki w układzie znormalizowanym: x0..x1 to światło kolumny, y0..y1 światło
// w pionie (y1 = Infinity, gdy górą jest skos). Klucz wnęki używa RZECZYWISTEGO
// numeru kolumny (od lewej) i rzędu od dołu.
export function getSlopeCells(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const dividers = getSlopeDividers(mod, th);
  const pieces = getSlopeShelfPieces(mod, th);
  const bounds = [];
  let a = g.isTriangle ? 0 : th;
  dividers.forEach((d) => { bounds.push([a, d.x]); a = d.x + th; });
  bounds.push([a, g.W - th]);
  const n = bounds.length;
  const cells = [];
  bounds.forEach(([x0, x1], j) => {
    const col = g.lowSide === 'left' ? j : n - 1 - j;
    const shelfYs = pieces.filter((p) => p.x1 > x0 + 0.5 && p.x1 <= x1 + 0.5).map((p) => p.y).sort((u, v) => u - v);
    const rows = [];
    let yB = th;
    shelfYs.forEach((y) => { rows.push([yB, y]); yB = y + th; });
    rows.push([yB, Infinity]);
    rows.forEach(([y0, y1], row) => {
      const spaceAt = (x) => Math.min(y1, g.under(x)) - y0;
      if (spaceAt(x1) < MIN_PIECE) return;
      cells.push({
        key: `c${col}-r${row}`, col, row, x0, x1, y0, y1,
        leftIsDivider: j > 0, rightIsDivider: j < n - 1,
        bottomIsShelf: row > 0, topIsShelf: y1 !== Infinity,
        spaceAt,
      });
    });
  });
  return { g, cells };
}

// Prostokąt frontu [fx0, fx1] × [fy0, fy1] przycięty linią y = a0 + k·x
// (k > 0, skos rośnie w prawo). Zwraca kształt, wierzchołki i wymiary.
export function clipFrontRect(fx0, fx1, fy0, fy1, a0, k) {
  const yL = a0 + k * fx0, yR = a0 + k * fx1;
  const xAt = (y) => (y - a0) / k;
  const w = fx1 - fx0, h = fy1 - fy0;
  if (yL >= fy1) return { kind: 'prostokat', points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]], w, h };
  if (yR <= fy0) return { kind: 'brak', points: [], w: 0, h: 0 };
  if (yL >= fy0 && yR >= fy1) {
    const xc = xAt(fy1);
    return { kind: 'scietyRog', points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [xc, fy1], [fx0, yL]], w, h, hLow: yL - fy0, wTop: fx1 - xc };
  }
  if (yL >= fy0) return { kind: 'trapez', points: [[fx0, fy0], [fx1, fy0], [fx1, yR], [fx0, yL]], w, h: yR - fy0, hLow: yL - fy0, hHigh: yR - fy0 };
  if (yR >= fy1) {
    const xb = xAt(fy0), xt = xAt(fy1);
    return { kind: 'skosnyBok', points: [[xb, fy0], [fx1, fy0], [fx1, fy1], [xt, fy1]], w: fx1 - xb, h, wBottom: fx1 - xb, wTop: fx1 - xt };
  }
  const xb = xAt(fy0);
  return { kind: 'trojkat', points: [[xb, fy0], [fx1, fy0], [fx1, yR]], w: fx1 - xb, h: yR - fy0 };
}

function shapeText(shape, lowSide) {
  const low = lowSide === 'left' ? 'lewa' : 'prawa';
  const high = lowSide === 'left' ? 'prawa' : 'lewa';
  switch (shape.kind) {
    case 'trapez': return `trapez ${r1(shape.w)} × ${r1(shape.h)}, wys. ${low} ${r1(shape.hLow)}, ${high} ${r1(shape.hHigh)}`;
    case 'scietyRog': return `ścięty róg ${r1(shape.w)} × ${r1(shape.h)}, bok ${low} ${r1(shape.hLow)}, góra ${r1(shape.wTop)}`;
    case 'skosnyBok': return `skośny bok, dół ${r1(shape.wBottom)}, góra ${r1(shape.wTop)}, wys. ${r1(shape.h)}`;
    case 'trojkat': return `trójkąt, podstawa ${r1(shape.w)}, wys. ${r1(shape.h)}`;
    default: return `${r1(shape.w)} × ${r1(shape.h)}`;
  }
}

// Szuflada we wnęce. Zwraca { comps, boxType, fits, box } albo null, gdy system
// nieznany. box - dane do 3D i formatek skrzynki B.
function slopeDrawer(cell, g, ctx) {
  const { sys, system, depth, wantB } = ctx;
  if (!system) return null;
  const innerW = cell.x1 - cell.x0;
  // Najpierw szerokość skrzynki (nie zależy od wysokości), potem miejsce mierzone
  // przy jej bokach, a nie przy ścianach wnęki.
  const probe = getDrawerComponents(sys, innerW, depth, cell.spaceAt(cell.x0));
  if (!probe) return null;
  const t = system.woodenBox ? system.sideThickness : 16;
  const outerW = probe.bottom.width + 2 * t;
  const ox0 = cell.x0 + (innerW - outerW) / 2;
  const ox1 = ox0 + outerW;
  const spaceLow = cell.spaceAt(ox0), spaceHigh = cell.spaceAt(ox1);
  const comps = getDrawerComponents(sys, innerW, depth, spaceLow);
  const boxB = wantB && !!system.woodenBox;

  const lo = boxB ? getWoodenDrawerHeights(system, spaceLow) : null;
  const hi = boxB ? getWoodenDrawerHeights(system, spaceHigh) : null;
  // Skrzynka B tylko wtedy, gdy skos faktycznie obniża jeden bok - przy równych
  // bokach to zwykła skrzynka prostokątna (A).
  if (boxB && hi.sideHeight > lo.sideHeight) {
    const backLow = lo.sideHeight - system.bottomRecess - t;
    const backHigh = hi.sideHeight - system.bottomRecess - t;
    return {
      comps, boxType: 'B', fits: lo.fits, ox0, ox1, t,
      box: { sideLow: lo.sideHeight, sideHigh: hi.sideHeight, backLow, backHigh, yBase: cell.y0 + system.bottomClearance, recess: system.bottomRecess },
    };
  }
  let fits;
  if (system.woodenBox) fits = comps.fits;
  else fits = spaceLow >= Math.min(...Object.values(system.variants).map((v) => v.minSpace));
  const yBase = cell.y0 + (system.woodenBox ? system.bottomClearance : 0);
  return { comps, boxType: 'A', fits, ox0, ox1, t, yBase, wantedB: wantB };
}

// Wszystkie fronty szafki pod skos (układ znormalizowany), z typem, kształtem
// i - dla szuflad - danymi skrzynki.
export function getSlopeFronts(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const { g, cells } = getSlopeCells(mod, th);
  const s = getSlopeSettings(mod, th);
  const { gap, isInset, cLeft, cRight, cBottom, cSlope } = getSlopeFrontSettings(mod, config);
  const f = { ...(config.front || {}), ...(mod.front || {}) };
  // Luzy boków w układzie znormalizowanym: niska strona zawsze po lewej.
  const cLow = g.lowSide === 'left' ? cLeft : cRight;
  const cHigh = g.lowSide === 'left' ? cRight : cLeft;
  const sys = String(f.drawerSystem || 'merivobox').toLowerCase();
  // Front wpuszczany wchodzi w korpus na swoją grubość - o tyle krótsza szuflada.
  const ctx = { sys, system: drawerSystems[sys], depth: g.D - backThick - (isInset ? th : 0), wantB: s.drawerBox === 'B' };
  const types = s.cellTypes || {};
  // Front kończy się pod skośną płytą (płyta zostaje widoczna); luz pod skosem
  // mierzony prostopadle do płyty, więc w pionie jest większy o 1 / cos kąta.
  const a0 = g.L - g.c - cSlope * Math.sqrt(1 + g.k * g.k);

  return cells.map((cell) => {
    let fx0, fx1, fy0, fy1;
    if (isInset) {
      // Wpuszczany: front w świetle wnęki; od korpusu luz, od przegrody/półki pół przerwy.
      fx0 = cell.x0 + (cell.leftIsDivider ? gap / 2 : (g.isTriangle ? 0 : cLow));
      fx1 = cell.x1 - (cell.rightIsDivider ? gap / 2 : cHigh);
      fy0 = cell.y0 + (cell.bottomIsShelf ? gap / 2 : cBottom);
      fy1 = cell.topIsShelf ? cell.y1 - gap / 2 : g.H;
    } else {
      // Nakładany: zachodzi na korpus (luz od zewnętrznej krawędzi), na
      // przegrodach i półkach dzieli płytę na pół ze szczeliną.
      fx0 = cell.leftIsDivider ? cell.x0 - th / 2 + gap / 2 : (g.isTriangle ? 0 : cLow);
      fx1 = cell.rightIsDivider ? cell.x1 + th / 2 - gap / 2 : g.W - cHigh;
      fy0 = cell.bottomIsShelf ? cell.y0 - th / 2 + gap / 2 : cBottom;
      fy1 = cell.topIsShelf ? cell.y1 + th / 2 - gap / 2 : g.H;
    }
    const shape = clipFrontRect(fx0, fx1, fy0, fy1, a0, g.k);
    const tooSmall = shape.kind === 'brak' || shape.h < 40 || shape.w < 40;
    const drawer = tooSmall ? null : slopeDrawer(cell, g, ctx);
    let auto = 'szuflada';
    if (tooSmall) auto = 'brak';
    else if (shape.kind === 'trojkat' || !drawer || !drawer.fits) auto = 'blenda';
    const forced = types[cell.key];
    const type = tooSmall ? 'brak' : (['szuflada', 'blenda', 'brak'].includes(forced) ? forced : auto);
    return { ...cell, shape, auto, type, inset: isInset, drawer: type === 'szuflada' ? drawer : null, text: shapeText(shape, g.lowSide) };
  });
}

// Ustawienia frontów szafki pod skos - te same pola co w zwykłej szafce
// (ui/properties.js, zakładka Front): typ, przerwa między frontami, luzy
// lewy/prawy/dół; zamiast luzu górnego - luz pod skosem (clearance.slope,
// domyślnie jak przerwa). mod.front nadpisuje domyślne projektu.
export function getSlopeFrontSettings(mod, config) {
  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const fc = { ...(config.front?.clearance || {}), ...(mod.front?.clearance || {}) };
  const n = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
  const gap = n(f.gap, 3);
  return {
    isInset: f.type === 'wpuszczane',
    gap,
    cLeft: n(fc.left ?? fc.sides, 1.5),
    cRight: n(fc.right ?? fc.sides, 1.5),
    cBottom: n(fc.bottom, 0),
    cSlope: n(fc.slope, gap),
  };
}

// Formatki frontów, blend i skrzynek szuflad szafki pod skos.
export function getSlopeFrontParts(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  const parts = [];
  getSlopeFronts(mod, config).forEach((fr) => {
    if (fr.type === 'brak') return;
    const rect = fr.shape.kind === 'prostokat';
    const len = r1(fr.shape.h), wid = r1(fr.shape.w);
    if (fr.type === 'blenda') {
      parts.push({ name: rect ? 'Blenda' : `Blenda skos (${fr.text})`, length: len, width: wid, qty: 1, category: 'Front' });
      return;
    }
    parts.push({ name: rect ? 'Front szuflady' : `Front szuflady skos (${fr.text})`, length: len, width: wid, qty: 1, category: 'Front' });
    const d = fr.drawer;
    if (!d) return;
    const eqW = Math.round(fr.x1 - fr.x0 + 2 * th);
    if (d.boxType === 'A') {
      parts.push(...drawerComponentsToParts(d.comps, eqW));
      return;
    }
    // Skrzynka B (ścięta pod skos): boki różnej wysokości, tył i czoło trapezowe.
    const c = d.comps, b = d.box;
    const low = g.lowSide === 'left' ? 'lewa' : 'prawa';
    const tag = `W${eqW} NL${c.nominalLength} H${b.sideLow}-${b.sideHigh}`;
    const trap = `trapez, ${low} ${r1(b.backLow)}`;
    parts.push(
      { name: `Bok szuflady ${tag} (niski)`, length: r1(c.sides.length), width: r1(b.sideLow), qty: 1, category: 'Szuflada' },
      { name: `Bok szuflady ${tag} (wysoki)`, length: r1(c.sides.length), width: r1(b.sideHigh), qty: 1, category: 'Szuflada' },
      { name: `Dno szuflady ${tag}`, length: r1(c.bottom.length), width: r1(c.bottom.width), qty: 1, category: 'Szuflada' },
      { name: `Tył szuflady skos ${tag} (${trap})`, length: r1(c.back.width), width: r1(b.backHigh), qty: 1, category: 'Szuflada' },
      { name: `Czoło wewn. szuflady skos ${tag} (${trap})`, length: r1(c.innerFront.width), width: r1(b.backHigh), qty: 1, category: 'Szuflada' },
    );
  });
  return parts;
}

// Komplety okuć szuflad szafki pod skos (nazwa jak w zwykłych szafkach).
export function getSlopeDrawerHardware(mod, config) {
  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const sys = String(f.drawerSystem || 'merivobox').toLowerCase();
  return getSlopeFronts(mod, config)
    .filter((fr) => fr.type === 'szuflada' && fr.drawer)
    .map((fr) => drawerHardwareKey(sys, fr.drawer.comps));
}

// Bryły frontów i skrzynek do 3D (układ znormalizowany): { kind, points, zFront, depth }
// - zFront: odległość przedniej ściany bryły od płaszczyzny frontu korpusu
//   (ujemna = przed korpusem), depth - grubość w głąb.
function frontSolids(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const solids = [];
  const add = (kind, points, zFront, depth) => solids.push({ kind, points, zFront, depth });
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  getSlopeFronts(mod, config).forEach((fr) => {
    if (fr.type === 'brak') return;
    // Nakładany stoi przed korpusem, wpuszczany w jego obrysie; skrzynka za frontem.
    add('front', fr.shape.points, fr.inset ? 0 : -th, th);
    const zOff = fr.inset ? th : 0;
    const d = fr.drawer;
    if (!d) return;
    const c = d.comps;
    const L = c.sides ? c.sides.length : c.nominalLength;
    const t = d.t;
    if (d.boxType === 'B') {
      const b = d.box;
      const yB = b.yBase + b.recess;
      add('drawerBox', rect(d.ox0, b.yBase, t, b.sideLow), zOff, L);
      add('drawerBox', rect(d.ox1 - t, b.yBase, t, b.sideHigh), zOff, L);
      add('drawerBox', rect(d.ox0 + t, yB, d.ox1 - d.ox0 - 2 * t, t), zOff, L);
      const trap = [[d.ox0 + t, yB + t], [d.ox1 - t, yB + t], [d.ox1 - t, yB + t + b.backHigh], [d.ox0 + t, yB + t + b.backLow]];
      add('drawerBox', trap, zOff, t);
      add('drawerBox', trap, zOff + L - t, t);
      return;
    }
    if (c.woodenBox) {
      const yB = d.yBase + c.bottomRecess;
      add('drawerBox', rect(d.ox0, d.yBase, t, c.sideHeight), zOff, L);
      add('drawerBox', rect(d.ox1 - t, d.yBase, t, c.sideHeight), zOff, L);
      add('drawerBox', rect(d.ox0 + t, yB, d.ox1 - d.ox0 - 2 * t, t), zOff, L);
      add('drawerBox', rect(d.ox0 + t, yB + t, d.ox1 - d.ox0 - 2 * t, c.back.height), zOff + L - t, t);
      return;
    }
    // System metalowy: dno na dole, boki (profil) i tył.
    const h = 16 + c.back.height;
    add('drawerBox', rect(d.ox0 + t, fr.y0, c.bottom.width, 16), zOff, L);
    add('drawerBox', rect(d.ox0, fr.y0, t, h), zOff, L);
    add('drawerBox', rect(d.ox1 - t, fr.y0, t, h), zOff, L);
    add('drawerBox', rect(d.ox0 + t + (c.bottom.width - c.back.width) / 2, fr.y0 + 16, c.back.width, c.back.height), zOff + L - t, t);
  });
  return solids;
}

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
// solids - fronty i skrzynki szuflad (frontSolids). Dla lowSide === 'right'
// punkty są odbite w poziomie.
export function getSlopeCabinetPolygons(mod, config = { materials: { boardThickness: 18, backThickness: 3 } }) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  const solids = frontSolids(mod, config);
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
    solids.forEach((p) => { p.points = m(p.points); });
    return { polys, back: m(back), solids, geometry: g };
  }
  return { polys, back, solids, geometry: g };
}
