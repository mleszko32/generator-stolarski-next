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

import { nestParts } from "./nesting.js";

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
    const items = g.pieces.map((p) => ({ ...p, w: p.frontH, h: p.frontW, canRotate: !!opts.rotateFronts }));
    return { ...g, result: nestParts(items, { sheetW, sheetH, kerf: gap, trim }) };
  });
}

// Obrys frontu w miejscu na arkuszu, w układzie DXF (Y w górę). Bez obrotu
// wysokość frontu leży wzdłuż X arkusza (front obrócony o 90° w prawo), z
// obrotem - wzdłuż Y. W obu przypadkach to obrót, nie lustro: obrys widziany
// od strony licowej.
export function placedOutline(placement, sheetH) {
  const p = placement.piece;
  const top = sheetH - placement.y;           // górna krawędź miejsca w DXF
  if (placement.rotated) {
    return p.outline.map(([x, y]) => [placement.x + x, top - p.frontH + y]);
  }
  return p.outline.map(([x, y]) => [placement.x + y, top - x]);
}

function polyline(points, layer) {
  let s = `0\nPOLYLINE\n8\n${layer}\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1\n`;
  points.forEach(([x, y]) => { s += `0\nVERTEX\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0\n`; });
  return s + `0\nSEQEND\n8\n${layer}\n`;
}

function text(x, y, height, value, layer) {
  return `0\nTEXT\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0\n40\n${fmt(height)}\n1\n${asciiText(value)}\n`;
}

// Encje jednego arkusza przesunięte o offsetX (kilka arkuszy w jednym pliku).
function sheetEntities(sheet, settings, offsetX, title) {
  const { sheetW, sheetH } = settings;
  const sh = (pts) => pts.map(([x, y]) => [x + offsetX, y]);
  let s = polyline(sh([[0, 0], [sheetW, 0], [sheetW, sheetH], [0, sheetH]]), 'ARKUSZ');
  if (title) s += text(offsetX, sheetH + 30, 40, title, 'OPISY');
  sheet.placements.forEach((pl) => {
    s += polyline(sh(placedOutline(pl, sheetH)), 'FRONTY_KONTUR');
    // Opis w środku miejsca, wielkość dopasowana do mniejszego boku.
    const p = pl.piece;
    const hgt = Math.max(8, Math.min(30, Math.min(pl.w, pl.h) / 8));
    const cx = offsetX + pl.x + hgt;
    const cy = sheetH - pl.y - pl.h / 2;
    s += text(cx, cy + hgt * 0.8, hgt, `${p.id} ${p.name}`, 'OPISY');
    s += text(cx, cy - hgt * 0.8, hgt * 0.8, `${fmt(p.frontW)} x ${fmt(p.frontH)}${p.moduleName ? ' - ' + p.moduleName : ''}`, 'OPISY');
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
