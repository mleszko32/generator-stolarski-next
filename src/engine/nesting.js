// src/engine/nesting.js
//
// Rozkrój formatek na arkusze płyty. Algorytm "półkowy" (rzędy): formatki
// układane w poziomych pasach o wysokości najwyższej formatki w pasie - to
// wynik z cięciami NA WYLOT (guillotine), czyli taki, który da się wykonać na
// zwykłej pilarce formatowej. Sprawdzamy kilka strategii (orientacja arkusza,
// obracanie formatek) i bierzemy tę z najmniejszą liczbą arkuszy, a przy
// remisie tę, która zostawia największy zwarty odpad na ostatnim arkuszu.
//
// Układ współrzędnych wyniku: x wzdłuż szerokości arkusza (sheetW), y wzdłuż
// jego wysokości (sheetH), (0,0) = lewy górny róg arkusza (razem z obrzeżem).

function packOnce(pieces, sheetW, sheetH, kerf, trim, rotPolicy, transposed) {
  const usableW = (transposed ? sheetH : sheetW) - 2 * trim;
  const usableH = (transposed ? sheetW : sheetH) - 2 * trim;

  const items = pieces.map(p => {
    // Wymiary w układzie pakowania: przy transpozycji arkusza zamieniamy je
    // miejscami, a przy wyniku zamieniamy z powrotem.
    let w = transposed ? p.h : p.w;
    let h = transposed ? p.w : p.h;
    let rotated = false;
    if (p.canRotate && rotPolicy !== 'none') {
      const big = Math.max(w, h), small = Math.min(w, h);
      const wantH = rotPolicy === 'tall' ? big : small;
      if (h !== wantH) { [w, h] = [h, w]; rotated = true; }
    }
    return { piece: p, w, h, rotated };
  });
  items.sort((a, b) => b.h - a.h || b.w - a.w);

  const sheets = [];
  const unplaced = [];

  const fits = (it) => it.w <= usableW && it.h <= usableH;

  items.forEach(it => {
    if (!fits(it)) {
      // Ostatnia szansa: obrót, jeśli wolno.
      if (it.piece.canRotate && it.h <= usableW && it.w <= usableH) {
        [it.w, it.h] = [it.h, it.w];
        it.rotated = !it.rotated;
      } else {
        unplaced.push(it.piece);
        return;
      }
    }
    let placed = false;
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        if (it.h <= row.h && row.x + it.w <= usableW) {
          sheet.placements.push({ item: it, x: row.x, y: row.y });
          row.x += it.w + kerf;
          placed = true;
          break;
        }
      }
      if (placed) break;
      if (sheet.nextY + it.h <= usableH) {
        const row = { y: sheet.nextY, h: it.h, x: it.w + kerf };
        sheet.rows.push(row);
        sheet.nextY += it.h + kerf;
        sheet.placements.push({ item: it, x: 0, y: row.y });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const sheet = { rows: [], placements: [], nextY: 0 };
      const row = { y: 0, h: it.h, x: it.w + kerf };
      sheet.rows.push(row);
      sheet.nextY = it.h + kerf;
      sheet.placements.push({ item: it, x: 0, y: 0 });
      sheets.push(sheet);
    }
  });

  return { sheets, unplaced, transposed, usableW, usableH };
}

// pieces: [{ id, w, h, canRotate, ...dowolne pola opisowe }] (w = długość,
// h = szerokość formatki). opts: { sheetW, sheetH, kerf, trim }.
export function nestParts(pieces, opts) {
  const sheetW = opts.sheetW, sheetH = opts.sheetH;
  const kerf = opts.kerf ?? 3;
  const trim = opts.trim ?? 10;

  const strategies = [];
  [false, true].forEach(transposed => {
    ['none', 'tall', 'wide'].forEach(rot => strategies.push({ transposed, rot }));
  });

  let best = null;
  strategies.forEach(({ transposed, rot }) => {
    const r = packOnce(pieces, sheetW, sheetH, kerf, trim, rot, transposed);
    const lastUsed = r.sheets.length ? r.sheets[r.sheets.length - 1].nextY : 0;
    const score = [r.unplaced.length, r.sheets.length, lastUsed];
    if (!best || compare(score, best.score) < 0) best = { r, score };
  });

  const r = best.r;
  const usableArea = r.usableW * r.usableH;
  const outSheets = r.sheets.map((s, index) => {
    const placements = s.placements.map(({ item, x, y }) => {
      // Z powrotem do oryginalnej orientacji arkusza.
      const pw = item.w, ph = item.h;
      return r.transposed
        ? { piece: item.piece, x: trim + y, y: trim + x, w: ph, h: pw, rotated: item.rotated, sheetIndex: index }
        : { piece: item.piece, x: trim + x, y: trim + y, w: pw, h: ph, rotated: item.rotated, sheetIndex: index };
    });
    const usedArea = placements.reduce((sum, p) => sum + p.w * p.h, 0);
    return { index, width: sheetW, height: sheetH, placements, usedArea, wastePct: 100 * (1 - usedArea / (sheetW * sheetH)) };
  });

  const partsArea = outSheets.reduce((sum, s) => sum + s.usedArea, 0);
  return {
    sheets: outSheets,
    unplaced: r.unplaced,
    sheetCount: outSheets.length,
    partsArea,
    wastePct: outSheets.length ? 100 * (1 - partsArea / (outSheets.length * sheetW * sheetH)) : 0,
    usableArea,
  };
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Rozkrój DOWOLNY (bez cięć na wylot) - dla CNC, gdzie frez wytnie każdy
// układ. Algorytm MaxRects: arkusz to lista maksymalnych wolnych prostokątów,
// każda formatka trafia w najlepiej pasujący, a po wstawieniu wolne prostokąty
// są dzielone i czyszczone z zawartych w innych. Sprawdzamy kilka kolejności
// formatek i reguł dopasowania; wygrywa najmniej arkuszy, a przy remisie
// najmniejszy zajęty obszar ostatniego arkusza (większy, zwarty odpad).
//
// Odstęp (kerf) to odstęp między formatkami (na CNC: średnica frezu + zapas).
// Wynik w tym samym formacie co nestParts.

const FREE_ORDERS = [
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
  (a, b) => (b.w + b.h) - (a.w + a.h),
];

// Mniejszy wynik = lepsze miejsce.
const FREE_RULES = {
  // Najkrótszy pozostały bok.
  bssf: (fr, w, h) => [Math.min(fr.w - w, fr.h - h), Math.max(fr.w - w, fr.h - h)],
  // Najmniejszy niewykorzystany obszar wolnego prostokąta.
  baf: (fr, w, h) => [fr.w * fr.h - w * h, Math.min(fr.w - w, fr.h - h)],
  // Jak najniżej, potem jak najbardziej w lewo (zwarty układ).
  bl: (fr, w, h) => [fr.y + h, fr.x],
};

function splitFree(free, used) {
  const out = [];
  free.forEach((fr) => {
    if (used.x >= fr.x + fr.w || used.x + used.w <= fr.x || used.y >= fr.y + fr.h || used.y + used.h <= fr.y) {
      out.push(fr);
      return;
    }
    if (used.x > fr.x) out.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
    if (used.x + used.w < fr.x + fr.w) out.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - used.x - used.w, h: fr.h });
    if (used.y > fr.y) out.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
    if (used.y + used.h < fr.y + fr.h) out.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: fr.y + fr.h - used.y - used.h });
  });
  // Usuń prostokąty zawarte w innych.
  return out.filter((a, i) => !out.some((b, j) => j !== i
    && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
    && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
}

function packFree(pieces, order, rule, sheetW, sheetH, gap, trim) {
  // Każda formatka powiększona o odstęp, obszar roboczy też - ostatnia
  // formatka może wtedy dojść do samego obrzeża.
  const areaW = sheetW - 2 * trim + gap, areaH = sheetH - 2 * trim + gap;
  const items = pieces.map((p) => ({ piece: p, w: p.w + gap, h: p.h + gap })).sort(order);
  const score = FREE_RULES[rule];
  const sheets = [];
  const unplaced = [];
  const newSheet = () => { const s = { free: [{ x: 0, y: 0, w: areaW, h: areaH }], placements: [] }; sheets.push(s); return s; };
  const best = (sheet, it) => {
    let found = null;
    const sizes = [[it.w, it.h, false]];
    if (it.piece.canRotate && it.w !== it.h) sizes.push([it.h, it.w, true]);
    sheet.free.forEach((fr) => sizes.forEach(([w, h, rotated]) => {
      if (w > fr.w || h > fr.h) return;
      const sc = score(fr, w, h);
      if (!found || compare(sc, found.sc) < 0) found = { sc, x: fr.x, y: fr.y, w, h, rotated };
    }));
    return found;
  };
  items.forEach((it) => {
    const fitsEmpty = (it.w <= areaW && it.h <= areaH) || (it.piece.canRotate && it.h <= areaW && it.w <= areaH);
    if (!fitsEmpty) { unplaced.push(it.piece); return; }
    let sheet = null, spot = null;
    for (const s of sheets) { spot = best(s, it); if (spot) { sheet = s; break; } }
    if (!spot) { sheet = newSheet(); spot = best(sheet, it); }
    sheet.free = splitFree(sheet.free, spot);
    sheet.placements.push({ piece: it.piece, x: trim + spot.x, y: trim + spot.y, w: spot.w - gap, h: spot.h - gap, rotated: spot.rotated });
  });
  return { sheets, unplaced };
}

// pieces i opts jak w nestParts (opts.kerf = odstęp między formatkami).
export function nestPartsFree(pieces, opts) {
  const sheetW = opts.sheetW, sheetH = opts.sheetH;
  const gap = opts.kerf ?? 3;
  const trim = opts.trim ?? 10;
  let bestRun = null;
  FREE_ORDERS.forEach((order) => Object.keys(FREE_RULES).forEach((rule) => {
    const r = packFree(pieces, order, rule, sheetW, sheetH, gap, trim);
    const last = r.sheets[r.sheets.length - 1];
    // Zajęty obszar ostatniego arkusza (prostokąt obejmujący jego formatki).
    const lastBox = last
      ? Math.max(...last.placements.map((p) => p.x + p.w)) * Math.max(...last.placements.map((p) => p.y + p.h))
      : 0;
    const sc = [r.unplaced.length, r.sheets.length, lastBox];
    if (!bestRun || compare(sc, bestRun.sc) < 0) bestRun = { r, sc };
  }));

  const r = bestRun.r;
  const outSheets = r.sheets.map((s, index) => {
    const placements = s.placements.map((p) => ({ ...p, sheetIndex: index }));
    const usedArea = placements.reduce((sum, p) => sum + p.w * p.h, 0);
    return { index, width: sheetW, height: sheetH, placements, usedArea, wastePct: 100 * (1 - usedArea / (sheetW * sheetH)) };
  });
  const partsArea = outSheets.reduce((sum, s) => sum + s.usedArea, 0);
  return {
    sheets: outSheets,
    unplaced: r.unplaced,
    sheetCount: outSheets.length,
    partsArea,
    wastePct: outSheets.length ? 100 * (1 - partsArea / (outSheets.length * sheetW * sheetH)) : 0,
    usableArea: (sheetW - 2 * trim) * (sheetH - 2 * trim),
  };
}
