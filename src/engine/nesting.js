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
  const kerf = opts.kerf ?? 4;
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
