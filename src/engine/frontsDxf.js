// src/engine/frontsDxf.js
//
// Eksport frontów do DXF na maszynę CNC: wszystkie fronty projektu (też boki
// dokładane i blendy - kategoria "Front") ułożone na arkuszach płyty tym samym
// algorytmem co plan rozkroju (engine/nesting.js). Każdy materiał frontu ma
// własne arkusze. Fronty szafki pod skos mają prawdziwy obrys (trapez, trójkąt
// itd. - pole `outline` z core/slopeCabinet.js), reszta to prostokąty.
//
// DXF w wersji R12 (AC1009) - czyta go każdy program CAM. Jednostki: mm.
// Warstwy: ARKUSZ (obrys arkusza), FRONTY_KONTUR (zamknięte polilinie do
// wycięcia), OPISY (numer i nazwa frontu, tylko do podglądu).
// Oś X arkusza = jego długość (słoje), oś Y w górę; (0, 0) = lewy dolny róg.

import { nestPartsFree } from "./nesting.js";

export const DXF_DEFAULTS = { gap: 20, trim: 10, rotateFronts: false };

const LAYERS = [
  { name: 'ARKUSZ', color: 8 },
  { name: 'FRONTY_KONTUR', color: 1 },
  { name: 'OPISY', color: 3 },
];

// Polskie znaki zamienione na ASCII - DXF R12 nie ma pewnego kodowania
// i część programów pokazałaby krzaki.
const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
export function asciiText(text) {
  return String(text ?? '')
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL[c])
    .replace(/[—–]/g, '-')
    .replace(/×/g, 'x')
    .replace(/°/g, '%%d')
    .replace(/[^\x20-\x7E]/g, '');
}

const fmt = (v) => String(Math.round(v * 1000) / 1000);

// Fronty z listy formatek projektu (collectProjectParts) rozwinięte na sztuki.
// Obrys w układzie frontu: x = szerokość, y = wysokość, (0, 0) = lewy dolny róg.
export function collectFrontPieces(parts, frontMaterials = []) {
  const catalog = frontMaterials.length ? frontMaterials : [{ id: 'default', name: 'Standard' }];
  const byId = Object.fromEntries(catalog.map((m) => [m.id, m]));
  const pieces = [];
  let n = 0;
  parts.filter((p) => p.category === 'Front').forEach((p) => {
    const h = parseFloat(p.length) || 0;   // wysokość frontu (wzdłuż słojów)
    const w = parseFloat(p.width) || 0;
    if (h <= 0 || w <= 0) return;
    const mat = (p.materialId && byId[p.materialId]) || catalog[0];
    const outline = Array.isArray(p.outline) && p.outline.length >= 3 ? p.outline : [[0, 0], [w, 0], [w, h], [0, h]];
    const qty = Math.max(1, parseInt(p.qty, 10) || 1);
    for (let i = 0; i < qty; i++) {
      n++;
      pieces.push({
        id: 'F' + String(n).padStart(3, '0'),
        name: p.name,
        moduleName: p.moduleName || '',
        materialId: mat.id,
        materialName: mat.name,
        frontW: w,
        frontH: h,
        outline,
      });
    }
  });
  return pieces;
}

// Układa fronty na arkuszach, osobno dla każdego materiału. Odstęp między
// frontami (gap) zamiast szerokości piły - na CNC to średnica frezu + zapas.
export function nestFronts(pieces, opts) {
  const { sheetW, sheetH } = opts;
  const gap = opts.gap ?? DXF_DEFAULTS.gap;
  const trim = opts.trim ?? DXF_DEFAULTS.trim;
  const groups = new Map();
  pieces.forEach((p) => {
    if (!groups.has(p.materialId)) groups.set(p.materialId, { materialId: p.materialId, materialName: p.materialName, pieces: [] });
    groups.get(p.materialId).pieces.push(p);
  });
  return [...groups.values()].map((g) => {
    // Wysokość frontu wzdłuż długości arkusza (słoje), dopóki nie wolno obracać.
    const items = pairTriangles(g.pieces, gap).map((p) => ({ ...p, w: p.frontH, h: p.frontW, canRotate: !!opts.rotateFronts }));
    return { ...g, result: nestPartsFree(items, { sheetW, sheetH, kerf: gap, trim }) };
  });
}

const EPS = 0.05;
const near = (a, b) => Math.abs(a - b) < EPS;

// Trójkąt prostokątny o przyprostokątnych równych bokom prostokąta, który go
// obejmuje (blendy skosu). Zwraca róg kąta prostego: { lr: 'L'|'R', bt: 'B'|'T' }.
export function rightTriangleCorner(outline, w, h) {
  if (!outline || outline.length !== 3) return null;
  for (let i = 0; i < 3; i++) {
    const [vx, vy] = outline[i];
    const others = outline.filter((_, j) => j !== i);
    const sameX = others.find(([x]) => near(x, vx));
    const sameY = others.find(([, y]) => near(y, vy));
    if (!sameX || !sameY || sameX === sameY) continue;
    if (!near(Math.abs(sameY[0] - vx), w) || !near(Math.abs(sameX[1] - vy), h)) continue;
    return { lr: near(vx, 0) ? 'L' : 'R', bt: near(vy, 0) ? 'B' : 'T' };
  }
  return null;
}

// Dwa jednakowe trójkąty prostokątne składa przeciwprostokątnymi w jeden
// prostokąt (drugi obrócony o 180° - obrót, nie lustro, więc lico i słoje
// zostają). Między przeciwprostokątnymi zostaje odstęp `gap`: drugi trójkąt
// jest odsunięty w poziomie o gap · przeciwprostokątna / wysokość.
// Każdy element wyniku ma `members` - obrysy pojedynczych frontów w układzie
// elementu (dla zwykłych frontów jeden, dla pary dwa).
export function pairTriangles(pieces, gap) {
  const out = [];
  const waiting = new Map();   // klucz wymiarów -> trójkąty czekające na parę
  const single = (p) => ({ ...p, members: [{ piece: p, points: p.outline }] });
  pieces.forEach((p) => {
    const corner = rightTriangleCorner(p.outline, p.frontW, p.frontH);
    if (!corner) { out.push(single(p)); return; }
    const key = `${Math.round(p.frontW * 10)}x${Math.round(p.frontH * 10)}`;
    if (!waiting.has(key)) waiting.set(key, []);
    const list = waiting.get(key);
    const mate = list.shift();
    // Pierwszy z pary na razie stoi sam; drugi podmienia go na parę.
    if (!mate) { list.push({ p, corner, slot: out.length }); out.push(single(p)); return; }
    const { p: a, corner: ca } = mate;
    const w = a.frontW, h = a.frontH;
    // Drugi trójkąt z kątem prostym w rogu naprzeciwko pierwszego.
    const opposite = corner.lr !== ca.lr && corner.bt !== ca.bt;
    const bPts = opposite ? p.outline : p.outline.map(([x, y]) => [w - x, h - y]);
    const dx = gap * Math.hypot(w, h) / h;
    // Trójkąt z kątem prostym po lewej zostaje z lewej, drugi idzie w prawo.
    const [offA, offB] = ca.lr === 'L' ? [0, dx] : [dx, 0];
    out[mate.slot] = {
      id: `${a.id}+${p.id}`,
      name: `${a.name} (para)`,
      moduleName: a.moduleName,
      materialId: a.materialId,
      materialName: a.materialName,
      frontW: w + dx,
      frontH: h,
      members: [
        { piece: a, points: a.outline.map(([x, y]) => [x + offA, y]) },
        { piece: p, points: bPts.map(([x, y]) => [x + offB, y]) },
      ],
    };
  });
  return out;
}

// Obrysy frontów w miejscu na arkuszu, w układzie DXF (Y w górę):
// [{ piece, points }]. Bez obrotu wysokość frontu leży wzdłuż X arkusza (front
// obrócony o 90° w prawo), z obrotem - wzdłuż Y. W obu przypadkach to obrót,
// nie lustro: obrys widziany od strony licowej.
export function placedOutlines(placement, sheetH) {
  const item = placement.piece;
  const top = sheetH - placement.y;           // górna krawędź miejsca w DXF
  const members = item.members || [{ piece: item, points: item.outline }];
  return members.map(({ piece, points }) => ({
    piece,
    points: placement.rotated
      ? points.map(([x, y]) => [placement.x + x, top - item.frontH + y])
      : points.map(([x, y]) => [placement.x + y, top - x]),
  }));
}

// Obrys pojedynczego frontu (pierwszego w elemencie).
export function placedOutline(placement, sheetH) {
  return placedOutlines(placement, sheetH)[0].points;
}

// Środek ciężkości wielokąta (do opisu w środku frontu, też trójkąta).
export function centroid(points) {
  let a = 0, cx = 0, cy = 0;
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  });
  if (Math.abs(a) < 1e-9) return points[0];
  return [cx / (3 * a), cy / (3 * a)];
}

function polyline(points, layer) {
  let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1\n`;
  points.forEach(([x, y]) => { s += `0\nVERTEX\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0\n`; });
  return s + `0\nSEQEND\n8\n${layer}\n`;
}

function text(x, y, height, value, layer, centered = false) {
  // Wyśrodkowany: 72 = 1 i punkt wyrównania 11/21 (R12).
  const align = centered ? `72\n1\n11\n${fmt(x)}\n21\n${fmt(y)}\n31\n0\n` : '';
  return `0\nTEXT\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0\n40\n${fmt(height)}\n1\n${asciiText(value)}\n${align}`;
}

// Encje jednego arkusza przesunięte o offsetX (kilka arkuszy w jednym pliku).
function sheetEntities(sheet, settings, offsetX, title) {
  const { sheetW, sheetH } = settings;
  const sh = (pts) => pts.map(([x, y]) => [x + offsetX, y]);
  let s = polyline(sh([[0, 0], [sheetW, 0], [sheetW, sheetH], [0, sheetH]]), 'ARKUSZ');
  if (title) s += text(offsetX, sheetH + 30, 40, title, 'OPISY');
  sheet.placements.forEach((pl) => {
    const outlines = placedOutlines(pl, sheetH);
    outlines.forEach(({ piece: p, points }) => {
      s += polyline(sh(points), 'FRONTY_KONTUR');
      // Opis w środku ciężkości frontu, wielkość dopasowana do mniejszego boku
      // (w parze trójkątów mniejsza, bo trójkąt jest wąski przy wierzchołkach).
      const hgt = Math.max(8, Math.min(30, Math.min(pl.w, pl.h) / (outlines.length > 1 ? 14 : 8)));
      const [cx, cy] = centroid(points);
      s += text(cx + offsetX, cy + hgt * 0.7, hgt, p.id, 'OPISY', true);
      s += text(cx + offsetX, cy - hgt * 0.9, hgt * 0.8, `${fmt(p.frontW)} x ${fmt(p.frontH)}`, 'OPISY', true);
    });
  });
  return s;
}

function wrapDxf(entities) {
  let s = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n';
  s += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${LAYERS.length}\n`;
  LAYERS.forEach((l) => { s += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n`; });
  s += '0\nENDTAB\n0\nENDSEC\n';
  s += '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n0\nEOF\n';
  return s.replace(/\n/g, '\r\n');
}

// Jeden arkusz = jeden plik DXF.
export function sheetToDxf(sheet, settings, title = '') {
  return wrapDxf(sheetEntities(sheet, settings, 0, title));
}

// Wszystkie arkusze (wszystkich materiałów) w jednym pliku, obok siebie wzdłuż X.
export function allSheetsToDxf(groups, settings) {
  let entities = '';
  let i = 0;
  groups.forEach((g) => {
    g.result.sheets.forEach((sh) => {
      const title = `${g.materialName} - arkusz ${sh.index + 1}/${g.result.sheetCount}`;
      entities += sheetEntities(sh, settings, i * (settings.sheetW + 300), title);
      i++;
    });
  });
  return wrapDxf(entities);
}
