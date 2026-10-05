// src/ui/slopeCutDrawings.js
//
// Okno wydruku "Rysunki cięcia" szafki pod skos: płyty korpusu z kątem pochylenia
// piły i obrysy frontów/blend/pleców. Ten sam wzorzec okna co wykrój narożnika
// (ui/cornerProperties.js: openCornerBlankPrintView) - samodzielny HTML w nowej karcie.
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { round1 } from "../utils/math.js";
import { getSlopeBoards, getSlopeShapes, getSlopeGeometry, getSlopeDrillings } from "../core/slopeCabinet.js";
import { recalculateLayout } from "../core/layout.js";
import { slopeBoardSVG, slopeShapeSVG, slopeFaceSVG, slopePlanSVG } from "../render/slopeDrawing2d.js";

// Identyczne płyty (np. kilka takich samych przegród) - jeden rysunek z ilością.
function groupBoards(boards) {
  const out = new Map();
  boards.forEach((b) => {
    const key = [b.name, b.length, b.short, b.width, b.tiltStart, b.tiltEnd].map((v) => (typeof v === 'number' ? round1(v) : v)).join('|');
    if (out.has(key)) out.get(key).qty += 1;
    else out.set(key, { board: b, qty: 1 });
  });
  return [...out.values()];
}

export function openSlopeCutDrawings(mod) {
  const config = state.project;
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  const boards = groupBoards(getSlopeBoards(mod, config));
  const angled = boards.filter(({ board: b }) => b.tiltStart || b.tiltEnd);
  recalculateLayout(mod);
  const shapes = getSlopeShapes(mod, config);
  const drill = getSlopeDrillings(mod, config);
  const steep = angled.some(({ board: b }) => Math.max(b.tiltStart, b.tiltEnd) > 45);

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Rysunki cięcia i nawiertów - ${escapeHtml(mod.name)}</title>
  <style>
    :root { color-scheme: light; }
    html { background: #fff; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1e293b; max-width: 900px; margin: 0 auto; background: #fff; }
    .header { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 16px; }
    .header h1 { margin: 0; color: #0f172a; font-size: 22px; }
    .header p { margin: 5px 0 0 0; color: #475569; font-size: 13px; line-height: 1.5; }
    h2 { font-size: 16px; margin: 26px 0 8px; color: #1e3a8a; }
    .card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px; page-break-inside: avoid; background: #fff; }
    svg { width: 100%; height: auto; display: block; }
    .warn { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; margin: 10px 0; }
    @media print { .no-print { display: none !important; } body { padding: 0; max-width: 100%; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
    <button onclick="window.print()" style="padding: 12px 24px; background-color: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">🖨️ Drukuj / Zapisz jako PDF</button>
  </div>
  <div class="header">
    <h1>Rysunki cięcia i nawiertów: ${escapeHtml(mod.name)}</h1>
    <p>Szafka pod skos ${round1(g.W)} × ${round1(g.H)} × ${round1(g.D)} mm, ${g.isTriangle ? 'trójkąt' : `trapez (niska strona ${round1(g.L)} mm)`}, kąt skosu ${round1(g.angle)}°.<br>
    <b>Piła X°</b> — pochylenie piły od cięcia prostopadłego (kąt cięcia przez grubość płyty). Wymiar formatki to jej dłuższa krawędź.</p>
  </div>
  ${steep ? `<div class="warn">Część cięć wymaga pochylenia piły powyżej 45° — typowa piła formatowa tego nie zrobi. Takie końce trzeba dociąć inaczej albo zmienić połączenie.</div>` : ''}
  <h2>Płyty korpusu cięte pod kątem</h2>
  ${angled.map(({ board, qty }) => `<div class="card">${slopeBoardSVG(board, qty)}</div>`).join('') || '<p>Brak.</p>'}
  <h2>Fronty, blendy i plecy o nieprostokątnym obrysie</h2>
  ${shapes.map((sh) => `<div class="card">${slopeShapeSVG(sh)}</div>`).join('') || '<p>Brak.</p>'}
  <h2>Nawierty</h2>
  <p style="font-size:13px;color:#475569">Te same wzory co w zwykłej szafce: prowadnice szuflad, podpórki półek (3 otwory co 32 mm), konfirmat + kołek, puszki zawiasów. Wysokości od dołu danej płyty, odległości od frontu.</p>
  ${drill.notes.map((n) => `<div class="warn">${escapeHtml(n)}</div>`).join('')}
  ${drill.faces.filter((fc) => fc.holes.length).map((fc) => `<div class="card">${slopeFaceSVG(fc)}</div>`).join('')}
  ${drill.plans.map((pl) => `<div class="card">${slopePlanSVG(pl)}</div>`).join('')}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}
