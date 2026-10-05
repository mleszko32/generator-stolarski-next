// src/core/slopeCabinet.js
//
// Szafka pod skos (mod.type === 'slope_cabinet'), np. pod schodami albo pod dachem.
// Czysta geometria w widoku od frontu + formatki. Rysuje ją render/slopeCabinet3d.js,
// ustawienia skosu: ui/slopeProperties.js, wnętrze: zwykły edytor "Wnętrze 2D".
//
// Dane modułu:
//   dimensions: { width, height, depth } - height to WYSOKA strona
//   slope: { lowSide: 'left'|'right', lowHeight, drawerBox: 'A'|'B' }
//     lowHeight 0 = trójkąt (skos schodzi do dna), > 0 = trapez z niskim bokiem
//   elements: TO SAMO wnętrze co w zwykłej szafce (core/zoneTree.js) - przegrody
//     (pion), półki (poziom) i fronty z baseZone. Prostokąt wnętrza
//     (getSlopeInnerRect) sięga do najwyższego miejsca pod skosem; edytor dzieli
//     go jak zwykle, a skos przycina wynik: przegrody i półki dostają cięcie pod
//     kątem, fronty są docinane linią skosu, szuflady liczą miejsce pod skosem.
//     Front, który po docięciu jest trójkątem (albo szuflada się nie mieści),
//     staje się blendą; el.slopeBlenda = true wymusza blendę.
//   (stare dane: slope.columns / slope.dividers / slope.shelves - zamieniane na
//    elements przez migrateSlopeModule)
//
// Konstrukcja: dno (wieniec dolny) NAKŁADANE - na całą szerokość szafki, a boki,
// skośna płyta i przegrody stoją na nim. W trójkącie koniec dna przy skosie jest
// docięty równo z linią skosu. Skośna płyta idzie na całą długość (od dna albo od
// niskiego boku do zewnętrznej ściany wysokiego boku).
//
// Geometrię liczymy w układzie "niska strona po lewej" (x od lewej krawędzi, y od
// dołu); dla lowSide === 'right' elementy są odbijane do tego układu, a wynik 3D
// i rysunki z powrotem (lustro), formatki są takie same.

import { drawerSystems } from './drawerSystems.js';
import { getDrawerComponents, getWoodenDrawerHeights, drawerComponentsToParts, drawerHardwareKey } from './drawerMath.js';

const MIN_PIECE = 50;   // krótsze kawałki pomijamy (nie da się ich zrobić)
const r1 = (v) => Math.round(v * 10) / 10;

export const SLOPE_DEFAULTS = { lowSide: 'left', lowHeight: 0, drawerBox: 'A' };

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
  const lowSide = s.lowSide === 'right' ? 'right' : 'left';
  return {
    W, H, D, L, th, k: k2, c: c2, isTriangle, lowSide,
    angle: Math.atan2(H - L, W) * 180 / Math.PI,
    top: (x) => L + k2 * x,              // wierzch skośnej płyty
    under: (x) => L + k2 * x - c2,       // spód skośnej płyty
    underX: (y) => (y + c2 - L) / k2,    // x, w którym spód skosu jest na wysokości y
    // rzeczywisty x <-> układ "niska strona po lewej" (dla odcinka x..x+w)
    normX: (x, w = 0) => (lowSide === 'right' ? W - x - w : x),
  };
}

// Prostokąt wnętrza (rzeczywiste x, od lewej): w trójkącie od czubka skosu, przy
// boku od jego wewnętrznej ściany; od dna do najwyższego miejsca pod skosem
// (przy wysokim boku). To korzeń drzewa wnęk (core/zoneTree.js) i granice
// cab-left/right/bottom/top frontów (core/layout.js).
export function getSlopeInnerRect(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  return {
    minX: (g.lowSide === 'left' && g.isTriangle) ? 0 : th,
    maxX: (g.lowSide === 'right' && g.isTriangle) ? g.W : g.W - th,
    minY: th,
    maxY: g.under(g.W - th),
  };
}

// ---------------------------------------------------------------------------
// Budowa wnętrza (domyślne wnętrze nowej szafki i zamiana starych danych)
// ---------------------------------------------------------------------------

let idCounter = 0;
const newId = (prefix) => `${prefix}-${Date.now()}-${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Wnętrze jak w edytorze 2D: przegrody na całą wysokość wnętrza w pozycjach
// dividerXs (lewa ściana, rzeczywiste x), w każdej kolumnie półki na wysokościach
// shelfYs (spód półki) - tylko tam, gdzie mieszczą się pod skosem - i szuflada
// w każdej wnęce, która pod skosem ma sensowną wysokość.
export function buildSlopeElements(mod, th, dividerXs, shelfYs, gap = 3) {
  const g = getSlopeGeometry(mod, th);
  const rect = getSlopeInnerRect(mod, th);
  const elements = [];
  const xs = dividerXs.map((x) => parseFloat(x) || 0).filter((x) => x > rect.minX && x + th < rect.maxX).sort((a, b) => a - b);
  const pions = xs.map((x) => {
    const el = { id: newId('pion'), typ: 'pion', x, y: rect.minY, w: th, h: rect.maxY - rect.minY, isStructural: true };
    elements.push(el);
    return el;
  });
  // Kolumny: [minX, maxX] i granice (cab-* albo id przegrody).
  const cols = [];
  let left = rect.minX, leftId = 'cab-left';
  pions.forEach((p) => { cols.push({ minX: left, maxX: p.x, boundLeft: leftId, boundRight: p.id }); left = p.x + th; leftId = p.id; });
  cols.push({ minX: left, maxX: rect.maxX, boundLeft: leftId, boundRight: 'cab-right' });

  // Najwyższy spód skosu w kolumnie (przy jej wyższym końcu).
  const highestUnder = (c) => g.under(g.normX(c.minX, c.maxX - c.minX) + (c.maxX - c.minX));

  cols.forEach((c) => {
    const ys = shelfYs.map((y) => parseFloat(y) || 0)
      .filter((y) => y > rect.minY + MIN_PIECE && y + th < highestUnder(c) - MIN_PIECE)
      .sort((a, b) => a - b);
    const shelves = ys.map((y) => {
      const el = { id: newId('poziom'), typ: 'poziom', x: c.minX, y, w: c.maxX - c.minX, h: th, isStructural: false };
      elements.push(el);
      return el;
    });
    // Wnęki w kolumnie i szuflada w każdej, która ma miejsce pod skosem.
    let bottom = rect.minY, bottomId = 'cab-bottom';
    const rows = shelves.map((s) => { const r = { minY: bottom, maxY: s.y, boundBottom: bottomId, boundTop: s.id }; bottom = s.y + th; bottomId = s.id; return r; });
    rows.push({ minY: bottom, maxY: rect.maxY, boundBottom: bottomId, boundTop: 'cab-top' });
    rows.forEach((r) => {
      if (Math.min(r.maxY, highestUnder(c)) - r.minY < MIN_PIECE) return;
      elements.push({
        id: newId('front'), typ: 'front', subtype: 'szuflada',
        baseZone: { minX: c.minX, maxX: c.maxX, minY: r.minY, maxY: r.maxY, boundLeft: c.boundLeft, boundRight: c.boundRight, boundBottom: r.boundBottom, boundTop: r.boundTop, offsetBottom: 0, offsetTop: 0 },
        frontCount: 1, distribution: '1', frontIndex: 0, gap,
        intGapX: 0, intGapY: 0, forceVariant: 'auto', forceNL: null,
      });
    });
  });
  return elements;
}

// Pozycje przegród (rzeczywiste x) ze starych danych: slope.dividers albo
// slope.columns (szerokości kolumn z jedną "resztą" = null).
function legacyDividerXs(mod, th) {
  const s = mod.slope || {};
  if (!Array.isArray(s.columns) && Array.isArray(s.dividers)) return s.dividers.map((x) => parseFloat(x) || 0);
  if (!Array.isArray(s.columns)) return [];
  const rect = getSlopeInnerRect(mod, th);
  const cols = s.columns.length ? s.columns : [null];
  const fixed = cols.reduce((sum, w) => sum + (w === null ? 0 : (parseFloat(w) || 0)), 0);
  const autoW = rect.maxX - rect.minX - fixed - (cols.length - 1) * th;
  const xs = [];
  let x = rect.minX;
  cols.slice(0, -1).forEach((w) => { x += (w === null ? autoW : (parseFloat(w) || 0)); xs.push(x); x += th; });
  return xs;
}

// Zamienia stare wnętrze skosu (kolumny/półki w mod.slope) na mod.elements.
// Idempotentne: działa tylko, gdy są stare dane i wnętrze jest jeszcze puste.
export function migrateSlopeModule(mod, th = 18, gap = 3) {
  if (!mod || mod.type !== 'slope_cabinet' || !mod.slope) return false;
  const s = mod.slope;
  const hasLegacy = Array.isArray(s.columns) || Array.isArray(s.dividers) || Array.isArray(s.shelves);
  if (!hasLegacy) return false;
  if (!mod.elements || mod.elements.length === 0) {
    mod.elements = buildSlopeElements(mod, th, legacyDividerXs(mod, th), s.shelves || [], gap);
  }
  delete s.columns; delete s.dividers; delete s.shelves; delete s.cellTypes;
  return true;
}

// ---------------------------------------------------------------------------
// Przegrody i półki z mod.elements, przycięte skosem (układ znormalizowany)
// ---------------------------------------------------------------------------

// Przegrody: { el, x, y0, hLeft, hRight } - x lewej ściany, wysokości ścian od
// spodu przegrody do skosu (albo do jej górnego końca, gdy jest niżej).
export function getSlopeDividers(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  return (mod.elements || [])
    .filter((el) => el.typ === 'pion')
    .map((el) => {
      const x = g.normX(parseFloat(el.x) || 0, th);
      const y0 = parseFloat(el.y) || 0;
      const y1 = y0 + (parseFloat(el.h) || 0);
      return { el, x, y0, hLeft: Math.min(y1, g.under(x)) - y0, hRight: Math.min(y1, g.under(x + th)) - y0 };
    })
    .filter((d) => d.hRight >= MIN_PIECE && d.hLeft > 0)
    .sort((a, b) => a.x - b.x);
}

// Półki: { el, y, x0Bottom, x0Top, x1 } - lewy koniec spodu i wierzchu (różne,
// gdy docięta do skosu) i prawy koniec; długość długiej krawędzi = x1 - x0Bottom.
export function getSlopeShelfPieces(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  return (mod.elements || [])
    .filter((el) => el.typ === 'poziom')
    .map((el) => {
      const w = parseFloat(el.w) || 0;
      const nx0 = g.normX(parseFloat(el.x) || 0, w);
      const y = parseFloat(el.y) || 0;
      return { el, y, x0Bottom: Math.max(nx0, g.underX(y)), x0Top: Math.max(nx0, g.underX(y + th)), x1: nx0 + w };
    })
    .filter((p) => p.x1 - p.x0Top >= MIN_PIECE)
    .sort((a, b) => a.y - b.y || a.x1 - b.x1);
}

// ---------------------------------------------------------------------------
// Fronty
// ---------------------------------------------------------------------------

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

// Szuflada w przestrzeni cell = { x0, x1 (światło, układ skosu), y0, y1, spaceAt }.
// Zwraca { comps, boxType, fits, ox0, ox1, t, yBase, box } albo null.
function slopeDrawer(cell, ctx, sideHeight) {
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
  const comps = getDrawerComponents(sys, innerW, depth, spaceLow, 'auto', sideHeight);
  const boxB = wantB && !!system.woodenBox;

  // Wysokość boku wpisana ręcznie (jak w zwykłej szafce, tylko szuflady drewniane):
  // ogranicza oba boki; bok, pod którym skos jest niżej, i tak nie wyjdzie wyżej
  // niż pozwala miejsce. maxSide - największy bok, jaki się mieści (podpowiedź "Auto").
  const lo = boxB ? getWoodenDrawerHeights(system, spaceLow, sideHeight) : null;
  const hi = boxB ? getWoodenDrawerHeights(system, spaceHigh, sideHeight) : null;
  // Skrzynka B tylko wtedy, gdy skos faktycznie obniża jeden bok - przy równych
  // bokach to zwykła skrzynka prostokątna (A).
  if (boxB && hi.sideHeight > lo.sideHeight) {
    const backLow = lo.sideHeight - system.bottomRecess - t;
    const backHigh = hi.sideHeight - system.bottomRecess - t;
    return {
      comps, boxType: 'B', fits: lo.fits, ox0, ox1, t,
      maxSide: getWoodenDrawerHeights(system, spaceHigh).sideHeight, clamped: hi.clamped,
      box: { sideLow: lo.sideHeight, sideHigh: hi.sideHeight, backLow, backHigh, yBase: cell.y0 + system.bottomClearance, recess: system.bottomRecess },
    };
  }
  const fits = system.woodenBox
    ? comps.fits
    : spaceLow >= Math.min(...Object.values(system.variants).map((v) => v.minSpace));
  const yBase = cell.y0 + (system.woodenBox ? system.bottomClearance : 0);
  const maxSide = system.woodenBox ? getWoodenDrawerHeights(system, spaceLow).sideHeight : null;
  return { comps, boxType: 'A', fits, ox0, ox1, t, yBase, maxSide, clamped: !!comps.clamped };
}

// Ustawienia frontów - luzy jak w zwykłej szafce liczy core/layout.js; tu tylko
// to, czego zwykła szafka nie ma: luz pod skosem (clearance.slope, mierzony
// prostopadle do płyty, domyślnie jak przerwa między frontami). Reszta do panelu.
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
    cBottom: n(fc.bottom ?? fc.dol, 2),
    cSlope: n(fc.slope, gap),
  };
}

// Wszystkie fronty szafki pod skos (z mod.elements, po recalculateLayout - el.x/y/w/h),
// w układzie skosu: kształt po docięciu, typ ('szuflada' | 'drzwi' | 'blenda' |
// 'brak') i - dla szuflad - skrzynka. auto - typ bez wymuszenia el.slopeBlenda.
export function getSlopeFronts(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const g = getSlopeGeometry(mod, th);
  const s = getSlopeSettings(mod);
  const { isInset, cSlope } = getSlopeFrontSettings(mod, config);
  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const sys = String(f.drawerSystem || 'merivobox').toLowerCase();
  const system = drawerSystems[sys];
  // Front kończy się pod skośną płytą (płyta zostaje widoczna).
  const a0 = g.L - g.c - cSlope * Math.sqrt(1 + g.k * g.k);

  return (mod.elements || [])
    .filter((el) => el.typ === 'front' && (parseFloat(el.w) || 0) > 0 && (parseFloat(el.h) || 0) > 0)
    .map((el) => {
      const ew = parseFloat(el.w), eh = parseFloat(el.h), ey = parseFloat(el.y) || 0;
      const nx0 = g.normX(parseFloat(el.x) || 0, ew);
      const shape = clipFrontRect(nx0, nx0 + ew, ey, ey + eh, a0, g.k);
      const tooSmall = shape.kind === 'brak' || shape.h < 40 || shape.w < 40;
      const isDrawer = (el.subtype || '').includes('szuflada');
      const isInner = el.subtype === 'szuflada-wewnetrzna';
      const innerThick = parseFloat(el.innerFrontThickness ?? 18);
      const innerSetback = parseFloat(el.innerSetback ?? 2);

      let drawer = null;
      if (isDrawer && !tooSmall) {
        // Miejsce na skrzynkę: światło wnęki (baseZone) w zakresie wysokości frontu.
        const bz = el.baseZone || {};
        const zMinX = parseFloat(bz.minX) || 0, zMaxX = parseFloat(bz.maxX) || g.W;
        const zx0 = g.normX(zMinX, zMaxX - zMinX);
        const y0 = Math.max(ey, (parseFloat(bz.minY) || th) + (parseFloat(bz.offsetBottom) || 0));
        const y1 = Math.min(ey + eh, (parseFloat(bz.maxY) || g.H) - (parseFloat(bz.offsetTop) || 0));
        const cell = { x0: zx0, x1: zx0 + (zMaxX - zMinX), y0, y1, spaceAt: (x) => Math.min(y1, g.under(x)) - y0 };
        const depth = g.D - backThick - (isInner ? innerThick + innerSetback : (isInset ? th : 0));
        drawer = slopeDrawer(cell, { sys, system, depth, wantB: s.drawerBox === 'B' }, el.drawerSideHeight);
      }
      let auto;
      if (tooSmall) auto = 'brak';
      else if (shape.kind === 'trojkat') auto = 'blenda';
      else if (isDrawer) auto = drawer && drawer.fits ? 'szuflada' : 'blenda';
      else auto = 'drzwi';
      const type = tooSmall ? 'brak' : (el.slopeBlenda ? 'blenda' : auto);
      // Głębokość frontu w 3D: nakładany przed korpusem, wpuszczany w obrysie,
      // front szuflady wewnętrznej cofnięty o swoje odsunięcie.
      const z = isInner ? { front: innerSetback, thick: innerThick } : { front: isInset ? 0 : -th, thick: th };
      return {
        el, key: el.id, subtype: el.subtype, shape, auto, type, z,
        drawer: type === 'szuflada' ? drawer : null,
        text: shapeText(shape, g.lowSide),
      };
    });
}

// ---------------------------------------------------------------------------
// Rysunki, formatki, okucia
// ---------------------------------------------------------------------------

// Wielokąt wypukły (punkty przeciwnie do ruchu wskazówek zegara) zwężony o d
// z każdej strony - przesuwamy każdą krawędź do środka i przecinamy sąsiednie.
export function insetPolygon(points, d) {
  const n = points.length;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;   // normalna do środka
    return { p: [p[0] + nx * d, p[1] + ny * d], dir: [dx, dy] };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const det = l0.dir[0] * l1.dir[1] - l0.dir[1] * l1.dir[0];
    const t = ((l1.p[0] - l0.p[0]) * l1.dir[1] - (l1.p[1] - l0.p[1]) * l1.dir[0]) / det;
    return [l0.p[0] + l0.dir[0] * t, l0.p[1] + l0.dir[1] * t];
  });
}

function doorSide(fr) {
  if (fr.subtype === 'drzwi-lp') return String(fr.el.id).includes('-L-') ? 'lewe' : 'prawe';
  return (fr.el.openingSide || 'left') === 'right' ? 'prawe' : 'lewe';
}

// Nazwa frontu na liście formatek i na rysunku.
function frontName(fr) {
  const rect = fr.shape.kind === 'prostokat';
  if (fr.type === 'blenda') return rect ? 'Blenda' : `Blenda skos (${fr.text})`;
  if (fr.type === 'drzwi') return rect ? `Drzwi ${doorSide(fr) === 'prawe' ? 'Prawe' : 'Lewe'}` : `Drzwi ${doorSide(fr)} skos (${fr.text})`;
  const base = fr.subtype === 'szuflada-wewnetrzna' ? 'Front szuflady wewn.' : 'Front szuflady';
  return rect ? base : `${base} skos (${fr.text})`;
}

// Formatki o nieprostokątnym obrysie (fronty, blendy, plecy) do rysunków cięcia:
// { name, category, qty, points } - punkty w rzeczywistej orientacji (patrząc od
// frontu), przesunięte tak, że lewy dolny róg obrysu jest w (0, 0). Te same nazwy
// co na liście formatek; identyczne kształty zliczone razem.
export function getSlopeShapes(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  const real = (pts) => (g.lowSide === 'right' ? pts.map(([x, y]) => [g.W - x, y]).reverse() : pts);
  const norm = (pts) => {
    const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
    return pts.map(([x, y]) => [x - minX, y - minY]);
  };
  const out = new Map();
  const add = (name, category, pts) => {
    const points = norm(real(pts));
    const key = `${name}|${points.map((p) => p.map(r1).join(',')).join(';')}`;
    if (out.has(key)) out.get(key).qty += 1;
    else out.set(key, { name, category, qty: 1, points });
  };
  getSlopeFronts(mod, config).forEach((fr) => {
    if (fr.type === 'brak' || fr.shape.kind === 'prostokat') return;
    add(frontName(fr), 'Front', fr.shape.points);
  });
  const back = g.isTriangle ? [[0, 0], [g.W, 0], [g.W, g.H]] : [[0, 0], [g.W, 0], [g.W, g.H], [0, g.L]];
  const shape = g.isTriangle ? 'trójkąt' : `trapez, niska strona ${r1(g.L - 4)}`;
  add(`Plecy skos ${g.W}x${g.H} (${shape})`, 'Plecy', insetPolygon(back, 2));
  return [...out.values()];
}

// Formatki frontów, blend i skrzynek szuflad szafki pod skos.
export function getSlopeFrontParts(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  const parts = [];
  getSlopeFronts(mod, config).forEach((fr) => {
    if (fr.type === 'brak') return;
    parts.push({ name: frontName(fr), length: r1(fr.shape.h), width: r1(fr.shape.w), qty: 1, category: 'Front', materialId: fr.el.materialId });
    const d = fr.drawer;
    if (!d) return;
    const bz = fr.el.baseZone || {};
    const eqW = Math.round((parseFloat(bz.maxX) || 0) - (parseFloat(bz.minX) || 0) + 2 * th);
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

// Bryły frontów i skrzynek do 3D (układ skosu): { kind, points, zFront, depth }
// - zFront: odległość przedniej ściany bryły od płaszczyzny frontu korpusu
//   (ujemna = przed korpusem), depth - grubość w głąb.
function frontSolids(mod, config) {
  const solids = [];
  const add = (kind, points, zFront, depth) => solids.push({ kind, points, zFront, depth });
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  getSlopeFronts(mod, config).forEach((fr) => {
    if (fr.type === 'brak') return;
    add('front', fr.shape.points, fr.z.front, fr.z.thick);
    const zOff = Math.max(0, fr.z.front + fr.z.thick);
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
    add('drawerBox', rect(d.ox0 + t, d.yBase, c.bottom.width, 16), zOff, L);
    add('drawerBox', rect(d.ox0, d.yBase, t, h), zOff, L);
    add('drawerBox', rect(d.ox1 - t, d.yBase, t, h), zOff, L);
    add('drawerBox', rect(d.ox0 + t + (c.bottom.width - c.back.width) / 2, d.yBase + 16, c.back.width, c.back.height), zOff + L - t, t);
  });
  return solids;
}

// Płyty korpusu szafki pod skos jako prostokąty z końcami ciętymi przez grubość
// (pochylona piła). Każda płyta: { name, width (głębokość), th, a: [a0, a1],
// b: [b0, b1], aLabel, bLabel, startLabel, endLabel } - a i b to dwie powierzchnie
// płyty wzdłuż jej długości (widok na grubość): od - do, w mm. Różnica między
// a i b na końcu to cięcie pod kątem: pochylenie piły = atan(różnica / grubość).
// Kolejność wzdłuż płyty: od strony skosu / od dołu (start) do drugiego końca.
export function getSlopeBoards(mod, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const backThick = parseFloat(config.materials?.backThickness) || 3;
  const g = getSlopeGeometry(mod, th);
  const width = g.D - backThick;
  const tanA = g.k;   // tg kąta skosu
  const boards = [];
  const add = (b) => boards.push({ width, th, ...b });

  // Skośna płyta: wierzch i spód. W trójkącie dolny koniec stoi na dnie,
  // docięty poziomo; górny koniec (przy wysokim boku) docięty pionowo.
  const cosA = Math.cos(g.angle * Math.PI / 180);
  if (g.isTriangle) {
    const topLen = (g.W - th / g.k) / cosA;
    add({ name: 'Skos (wieniec skośny)', a: [th / tanA, topLen - th * tanA], b: [0, topLen], aLabel: 'spód', bLabel: 'wierzch', startLabel: 'dół (na dnie)', endLabel: 'przy wysokim boku' });
  } else {
    const topLen = Math.hypot(g.W, g.H - g.L);
    add({ name: 'Skos (wieniec skośny)', a: [0, topLen], b: [th * tanA, topLen + th * tanA], aLabel: 'spód', bLabel: 'wierzch', startLabel: 'przy niskim boku', endLabel: 'przy wysokim boku' });
  }

  // Wysoki bok stoi na dnie; zewnętrzna ściana dłuższa (góra docięta do skosu).
  add({ name: 'Bok wysoki', a: [0, g.under(g.W - th) - th], b: [0, g.under(g.W) - th], aLabel: 'wewnątrz', bLabel: 'zewnątrz', startLabel: 'dół', endLabel: 'góra (pod skosem)' });
  // Niski bok (tylko trapez); wewnętrzna ściana dłuższa.
  if (!g.isTriangle) {
    add({ name: 'Bok niski', a: [0, g.under(0) - th], b: [0, g.under(th) - th], aLabel: 'zewnątrz', bLabel: 'wewnątrz', startLabel: 'dół', endLabel: 'góra (pod skosem)' });
  }
  // Dno nakładane na całą szerokość; w trójkącie koniec przy skosie docięty
  // równo z linią skosu (spód pełny, wierzch krótszy).
  add({ name: 'Dno (wieniec dolny)', a: [0, g.W], b: [g.isTriangle ? th / g.k : 0, g.W], aLabel: 'spód', bLabel: 'wierzch', startLabel: g.isTriangle ? 'przy skosie' : 'przy niskim boku', endLabel: 'przy wysokim boku' });

  getSlopeDividers(mod, th).forEach((d) => {
    add({ name: 'Przegroda', a: [0, d.hLeft], b: [0, d.hRight], aLabel: 'od strony skosu', bLabel: 'od wysokiego boku', startLabel: 'dół', endLabel: 'góra' });
  });

  getSlopeShelfPieces(mod, th).forEach((p) => {
    const long = p.x1 - p.x0Bottom, short = p.x1 - p.x0Top;
    add({ name: 'Półka', width: p.el.isStructural ? width : width - 5, a: [0, long], b: [long - short, long], aLabel: 'spód', bLabel: 'wierzch', startLabel: 'przy skosie', endLabel: 'drugi koniec' });
  });

  return boards.map((b) => {
    const lenA = b.a[1] - b.a[0], lenB = b.b[1] - b.b[0];
    const tilt = (d) => (Math.abs(d) < 0.05 ? 0 : Math.atan(Math.abs(d) / b.th) * 180 / Math.PI);
    return {
      ...b,
      length: Math.max(lenA, lenB),
      short: Math.min(lenA, lenB),
      tiltStart: tilt(b.a[0] - b.b[0]),
      tiltEnd: tilt(b.a[1] - b.b[1]),
    };
  });
}

// Opis cięcia do nazwy formatki: kąty pochylenia piły na końcach i krótsza krawędź.
function bevelName(b) {
  const tilts = [b.tiltStart, b.tiltEnd].filter((t) => t > 0).map((t) => `${r1(t)}°`);
  if (!tilts.length) return b.name;
  return `${b.name} (cięcie ${tilts.join(' i ')}, krótsza ${r1(b.short)})`;
}

// Formatki korpusu i wnętrza szafki pod skos. Krawędzie docięte pod kątem:
// długość to DŁUŻSZA krawędź, a w nazwie kąt pochylenia piły i krótsza krawędź -
// tyle wystarczy, żeby formatkę wyciąć (rysunki: render/slopeDrawing2d.js).
export function getSlopeCabinetParts(mod, config) {
  const parts = getSlopeBoards(mod, config).map((b) => ({
    name: bevelName(b), length: r1(b.length), width: b.width, qty: 1, category: 'Korpus',
  }));
  // Plecy nakładane (HDF) o obrysie szafki, 2 mm mniej z każdej strony;
  // wymiar formatki to prostokąt opisany na tym obrysie (getSlopeShapes).
  const back = getSlopeShapes(mod, config).find((s) => s.category === 'Plecy');
  const bw = Math.max(...back.points.map((p) => p[0])), bh = Math.max(...back.points.map((p) => p[1]));
  parts.push({ name: back.name, length: r1(bh), width: r1(bw), qty: 1, category: 'Plecy' });
  return parts;
}

// Obszar nad spodem skośnej płyty w widoku od frontu (rzeczywiste x) - do
// zaciemnienia w edytorze wnętrza: { slab: płyta skosu, above: nad skosem }.
export function getSlopeOverlay(mod, th = 18) {
  const g = getSlopeGeometry(mod, th);
  const xu0 = g.isTriangle ? g.underX(th) : 0;
  const slab = g.isTriangle
    ? [[th / g.k, th], [xu0, th], [g.W, g.under(g.W)], [g.W, g.H]]
    : [[0, g.under(0)], [g.W, g.under(g.W)], [g.W, g.H], [0, g.L]];
  const above = g.isTriangle ? [[0, th], [th / g.k, th], [g.W, g.H], [0, g.H]] : [[0, g.L], [g.W, g.H], [0, g.H]];
  const m = (pts) => (g.lowSide === 'right' ? pts.map(([x, y]) => [g.W - x, y]).reverse() : pts);
  return { slab: m(slab), above: m(above) };
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
    add('corpus', [[d.x, d.y0], [d.x + th, d.y0], [d.x + th, d.y0 + d.hRight], [d.x, d.y0 + d.hLeft]]);
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
