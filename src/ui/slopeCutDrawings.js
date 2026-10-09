// src/ui/slopeCutDrawings.js
//
// Okno wydruku "Rysunki cięcia i nawiertów" szafki pod skos, podzielone na zakładki:
// Korpus (tabela wszystkich płyt + rysunki płyt ciętych pod kątem, ze stroną od
// wnętrza szafki), Fronty i plecy (obrysy) oraz Nawierty (ściany płyt i rzuty).
// W każdej zakładce spis do szybkiego skoku; druk bieżącej zakładki albo wszystkiego.
// Ten sam wzorzec okna co wykrój narożnika (ui/cornerProperties.js:
// openCornerBlankPrintView) - samodzielny HTML w nowej karcie.
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { round1 } from "../utils/math.js";
import { getSlopeBoards, getSlopeShapes, getSlopeGeometry, getSlopeDrillings } from "../core/slopeCabinet.js";
import { jointSetsFor } from "../engine/carcaseParts.js";
import { recalculateLayout } from "../core/layout.js";
import { slopeBoardSVG, slopeShapeSVG, slopeFaceSVG, slopeFacePairSVG, slopePlanSVG } from "../render/slopeDrawing2d.js";

const fmt = (v) => String(round1(v)).replace('.', ',');

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

const cutText = (b) => {
  const parts = [];
  if (b.tiltStart) parts.push(`${b.startLabel}: piła ${fmt(b.tiltStart)}°`);
  if (b.tiltEnd) parts.push(`${b.endLabel}: piła ${fmt(b.tiltEnd)}°`);
  return parts.length ? parts.join('<br>') : 'cięcie proste';
};

const insideText = (b) => {
  if (b.inside === 'a') return `${escapeHtml(b.aLabel)} — wnętrze szafki<br><span class="muted">${escapeHtml(b.bLabel)} — ${escapeHtml(b.bSide)}</span>`;
  if (b.inside === 'b') return `${escapeHtml(b.bLabel)} — wnętrze szafki<br><span class="muted">${escapeHtml(b.aLabel)} — ${escapeHtml(b.aSide)}</span>`;
  return `obie strony w środku<br><span class="muted">${escapeHtml(b.aLabel)}: ${escapeHtml(b.aSide)}; ${escapeHtml(b.bLabel)}: ${escapeHtml(b.bSide)}</span>`;
};

// Spis kart w zakładce - kliknięcie przewija do rysunku.
const index = (items) => items.length
  ? `<div class="index no-print">${items.map((it) => `<a href="#${it.id}">${escapeHtml(it.label)}</a>`).join('')}</div>`
  : '';

export function openSlopeCutDrawings(mod) {
  const config = state.project;
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const g = getSlopeGeometry(mod, th);
  recalculateLayout(mod);
  const boards = groupBoards(getSlopeBoards(mod, config));
  const angled = boards.filter(({ board: b }) => b.tiltStart || b.tiltEnd);
  const shapes = getSlopeShapes(mod, config);
  const drill = getSlopeDrillings(mod, config, { jointSets: (depth) => jointSetsFor(mod, config, depth) });
  // Płyty z nawiertami; przegroda zawsze z obiema stronami (nawet gdy jedna pusta).
  const drilledNames = new Set(drill.faces.filter((fc) => fc.holes.length).map((fc) => fc.name));
  const faces = drill.faces.filter((fc) => drilledNames.has(fc.name));
  const steep = angled.some(({ board: b }) => Math.max(b.tiltStart, b.tiltEnd) > 45);

  // --- Korpus ---
  const boardCards = angled.map(({ board, qty }, i) => ({ id: `korpus-${i}`, label: `${board.name} ${fmt(board.length)}${qty > 1 ? ` ×${qty}` : ''}`, html: slopeBoardSVG(board, qty) }));
  const table = `<table class="parts">
    <thead><tr><th>Płyta</th><th>Szt.</th><th>Wymiar [mm]</th><th>Krótsza krawędź</th><th>Cięcie końców</th><th>Strona od wnętrza szafki</th></tr></thead>
    <tbody>${boards.map(({ board: b, qty }) => `<tr>
      <td><b>${escapeHtml(b.name)}</b></td><td>${qty}</td>
      <td>${fmt(b.length)} × ${fmt(b.width)}</td>
      <td>${b.short < b.length - 0.05 ? fmt(b.short) : '—'}</td>
      <td>${cutText(b)}</td>
      <td>${insideText(b)}</td></tr>`).join('')}</tbody></table>`;
  const korpus = `
    ${steep ? `<div class="warn">Część cięć wymaga pochylenia piły powyżej 45° — typowa piła formatowa tego nie zrobi. Takie końce trzeba dociąć inaczej albo zmienić połączenie.</div>` : ''}
    <p class="lead"><b>Piła X°</b> — pochylenie piły od cięcia prostopadłego (kąt cięcia przez grubość płyty). Wymiar formatki to jej dłuższa krawędź. Na rysunkach <span class="blue">niebieska krawędź</span> to strona od wnętrza szafki.</p>
    ${table}
    <h3>Płyty cięte pod kątem</h3>
    ${index(boardCards)}
    ${boardCards.map((c) => `<div class="card" id="${c.id}">${c.html}</div>`).join('') || '<p>Brak.</p>'}`;

  // --- Fronty i plecy ---
  // W spisie nazwa bez opisu kształtu + wymiar obrysu, żeby odróżnić podobne fronty.
  const bbox = (pts) => `${fmt(Math.max(...pts.map((q) => q[0])))} × ${fmt(Math.max(...pts.map((q) => q[1])))}`;
  const shapeCards = shapes.map((sh, i) => ({ id: `fronty-${i}`, label: `${sh.name.replace(/\s*\(.*\)$/, '')} ${bbox(sh.points)}${sh.qty > 1 ? ` ×${sh.qty}` : ''}`, html: slopeShapeSVG(sh) }));
  const fronty = `
    <p class="lead">Obrys widziany od frontu, z długościami boków i kątami innymi niż 90°. Fronty prostokątne są tylko na liście formatek.</p>
    ${index(shapeCards)}
    <div class="grid">${shapeCards.map((c) => `<div class="card" id="${c.id}">${c.html}</div>`).join('') || '<p>Brak.</p>'}</div>`;

  // --- Nawierty ---
  // Jedna karta na płytę; obie strony przegrody obok siebie, frontami do siebie.
  const faceCards = [...drilledNames].map((name, i) => {
    const own = faces.filter((fc) => fc.name === name);
    const l = own.find((fc) => fc.side === 'lewa'), r = own.find((fc) => fc.side === 'prawa');
    const html = l && r ? slopeFacePairSVG(l, r) : own.map((fc) => slopeFaceSVG(fc)).join('');
    return { id: `nawierty-${i}`, label: l && r ? `${name} (obie strony)` : `${name} — ${own[0].side}`, html, wide: !!(l && r) };
  });
  const planCards = drill.plans.map((pl, i) => ({ id: `rzut-${i}`, label: `${pl.name} — łączniki`, html: slopePlanSVG(pl) }));
  const nawierty = `
    <p class="lead">Te same wzory co w zwykłej szafce: prowadnice szuflad (MOVENTO wg katalogu Blum), podpórki półek (3 otwory co 32 mm), konfirmat + kołek, puszki zawiasów. Wysokości od dołu danej płyty, odległości od frontu. Każdy rysunek pokazuje jedną stronę płyty — pod tytułem napisane, w którą stronę patrzy.</p>
    ${drill.notes.map((n) => `<div class="warn">${escapeHtml(n)}</div>`).join('')}
    ${index([...faceCards, ...planCards])}
    <h3>Ściany płyt pionowych</h3>
    <div class="grid">${faceCards.map((c) => `<div class="card${c.wide ? ' wide' : ''}" id="${c.id}">${c.html}</div>`).join('') || '<p>Brak nawiertów.</p>'}</div>
    <h3>Rzuty płyt z łącznikami</h3>
    ${planCards.map((c) => `<div class="card" id="${c.id}">${c.html}</div>`).join('')}`;

  const tabs = [
    { id: 'korpus', label: 'Korpus', count: boards.reduce((n, b) => n + b.qty, 0), html: korpus },
    { id: 'fronty', label: 'Fronty i plecy', count: shapes.reduce((n, s) => n + s.qty, 0), html: fronty },
    { id: 'nawierty', label: 'Nawierty', count: faceCards.length + planCards.length, html: nawierty },
  ];

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Rysunki cięcia i nawiertów - ${escapeHtml(mod.name)}</title>
  <style>
    :root { color-scheme: light; }
    html { background: #fff; scroll-padding-top: 70px; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0 30px 30px; color: #1e293b; max-width: 1200px; margin: 0 auto; background: #fff; }
    .header { padding: 20px 0 10px; }
    .header h1 { margin: 0; color: #0f172a; font-size: 22px; }
    .header p { margin: 5px 0 0 0; color: #475569; font-size: 13px; }
    .toolbar { position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 2px solid #cbd5e1; display: flex; gap: 6px; align-items: center; padding: 10px 0; flex-wrap: wrap; }
    .tab { padding: 8px 16px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; cursor: pointer; font-size: 14px; color: #334155; }
    .tab.active { background: #1e3a8a; border-color: #1e3a8a; color: #fff; font-weight: bold; }
    .tab .cnt { opacity: .75; font-size: 12px; margin-left: 4px; }
    .spacer { flex: 1; }
    .pbtn { padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; background: #059669; color: #fff; }
    .pbtn.alt { background: #e2e8f0; color: #334155; }
    .section { display: none; padding-top: 14px; }
    .section.active { display: block; }
    h3 { font-size: 15px; margin: 22px 0 8px; color: #1e3a8a; }
    .lead { font-size: 13px; color: #475569; line-height: 1.5; }
    .blue { color: #2563eb; font-weight: bold; }
    .muted { color: #64748b; font-size: 12px; }
    .index { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 14px; }
    .index a { font-size: 12px; padding: 4px 10px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; text-decoration: none; border: 1px solid #bfdbfe; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 14px; align-items: start; }
    .card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 14px; page-break-inside: avoid; break-inside: avoid; background: #fff; }
    .grid .card { margin-bottom: 0; }
    .grid .card.wide { grid-column: 1 / -1; }
    .pair { display: flex; gap: 0; align-items: flex-end; }
    .pair svg { flex: 1 1 0; min-width: 0; }
    svg { width: 100%; height: auto; display: block; }
    table.parts { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
    table.parts th { text-align: left; background: #f1f5f9; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; }
    table.parts td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .warn { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; font-size: 13px; margin: 10px 0; }
    @media print {
      .no-print, .toolbar { display: none !important; }
      body { padding: 0; max-width: 100%; }
      body.print-all .section { display: block; page-break-before: always; }
      body.print-all .section:first-of-type { page-break-before: auto; }
      .section-title { display: block !important; }
      .grid { grid-template-columns: 1fr 1fr; }
    }
    .section-title { display: none; font-size: 18px; color: #1e3a8a; margin: 0 0 6px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Rysunki cięcia i nawiertów: ${escapeHtml(mod.name)}</h1>
    <p>Szafka pod skos ${fmt(g.W)} × ${fmt(g.H)} × ${fmt(g.D)} mm, ${g.isTriangle ? 'trójkąt' : `trapez (niska strona ${fmt(g.L)} mm)`}, kąt skosu ${fmt(g.angle)}°, niska strona ${g.lowSide === 'left' ? 'po lewej' : 'po prawej'}.</p>
  </div>
  <div class="toolbar">
    ${tabs.map((t, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}<span class="cnt">(${t.count})</span></button>`).join('')}
    <span class="spacer"></span>
    <button class="pbtn" id="print-tab">🖨️ Drukuj zakładkę</button>
    <button class="pbtn alt" id="print-all">Drukuj wszystko</button>
  </div>
  ${tabs.map((t, i) => `<section class="section${i === 0 ? ' active' : ''}" id="sec-${t.id}"><h2 class="section-title">${t.label}</h2>${t.html}</section>`).join('')}
  <script>
    const tabs = document.querySelectorAll('.tab');
    const show = (id) => {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
      document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === 'sec-' + id));
      window.scrollTo(0, 0);
    };
    tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    document.getElementById('print-tab').addEventListener('click', () => window.print());
    document.getElementById('print-all').addEventListener('click', () => { document.body.classList.add('print-all'); window.print(); });
    window.addEventListener('afterprint', () => document.body.classList.remove('print-all'));
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}
