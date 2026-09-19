// src/ui/cutPlanModal.js
//
// Okno "Rozkrój i etykiety": układa formatki całego projektu na arkuszach płyty
// (engine/nesting.js), pokazuje schematy cięcia i zużycie okleiny (wszystkie
// formatki dookoła, engine/edgeBanding.js) oraz drukuje rozkrój i etykiety z
// kodem QR. Ustawienia (format arkusza, szerokość cięcia, obrzeże) zapisują się
// w state.project.cutPlan razem z projektem.
import qrcode from "qrcode-generator";
import { escapeHtml } from "../utils/dom.js";
import { state } from "../core/state.js";
import { collectProjectParts } from "../engine/cabinet.js";
import { nestParts } from "../engine/nesting.js";
import { isEdgeBanded, totalEdgeBandingMeters } from "../engine/edgeBanding.js";

const DEFAULTS = { sheetW: 2800, sheetH: 2070, kerf: 4, trim: 10, rotateFronts: false };
const CATEGORY_ORDER = ['Korpus', 'Front', 'Szuflada', 'Plecy'];
const PALETTE = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8', '#d9f99d', '#ddd6fe'];

function getSettings() {
  return { ...DEFAULTS, ...(state.project.cutPlan || {}) };
}

// Rozwija formatki na pojedyncze sztuki z numerem (P001...) - ten sam numer
// jest na schemacie rozkroju i na etykiecie.
function buildPieces() {
  const raw = collectProjectParts().slice().sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category), cb = CATEGORY_ORDER.indexOf(b.category);
    return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb)
      || String(a.moduleName).localeCompare(String(b.moduleName), 'pl')
      || String(a.name).localeCompare(String(b.name), 'pl');
  });
  const s = getSettings();
  const pieces = [];
  let n = 0;
  raw.forEach(p => {
    const qty = Math.max(1, parseInt(p.qty, 10) || 1);
    for (let i = 0; i < qty; i++) {
      n++;
      pieces.push({
        id: 'P' + String(n).padStart(3, '0'),
        w: parseFloat(p.length) || 0,
        h: parseFloat(p.width) || 0,
        // Fronty i tak układamy wg słojów, dopóki użytkownik nie pozwoli obracać.
        canRotate: p.category !== 'Front' || s.rotateFronts,
        category: p.category || 'Inne',
        name: p.name,
        moduleName: p.moduleName || '',
        length: parseFloat(p.length) || 0,
        width: parseFloat(p.width) || 0,
        banded: isEdgeBanded(p),
      });
    }
  });
  return { raw, pieces };
}

function computePlan() {
  const s = getSettings();
  const { raw, pieces } = buildPieces();
  const byCategory = new Map();
  pieces.forEach(p => {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p);
  });
  const groups = [...byCategory.entries()]
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]), ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([category, list]) => ({
      category,
      pieces: list,
      result: nestParts(list, { sheetW: s.sheetW, sheetH: s.sheetH, kerf: s.kerf, trim: s.trim }),
    }));
  // Gdzie leży każda sztuka: id -> { category, sheetNo (od 1), sheetCount }.
  const location = {};
  groups.forEach(g => g.result.sheets.forEach(sh => sh.placements.forEach(pl => {
    location[pl.piece.id] = { category: g.category, sheetNo: sh.index + 1, sheetCount: g.result.sheetCount };
  })));
  return { settings: s, raw, pieces, groups, location, edgeMeters: totalEdgeBandingMeters(raw) };
}

function moduleColor(name, colors) {
  if (!colors.has(name)) colors.set(name, PALETTE[colors.size % PALETTE.length]);
  return colors.get(name);
}

function sheetSvg(sheet, settings, colors) {
  const { sheetW, sheetH, trim } = settings;
  const fs = Math.round(sheetW / 70);
  let svg = `<svg viewBox="0 0 ${sheetW} ${sheetH}" xmlns="http://www.w3.org/2000/svg" font-family="'Segoe UI', sans-serif" style="width:100%; height:auto; background:#fff; border:1px solid #cbd5e1;">`;
  svg += `<rect x="0" y="0" width="${sheetW}" height="${sheetH}" fill="#f8fafc" stroke="#475569" stroke-width="3" />`;
  svg += `<rect x="${trim}" y="${trim}" width="${sheetW - 2 * trim}" height="${sheetH - 2 * trim}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="14,10" />`;
  sheet.placements.forEach(pl => {
    const fill = moduleColor(pl.piece.moduleName, colors);
    svg += `<rect x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" fill="${fill}" stroke="#334155" stroke-width="2" />`;
    if (pl.w > fs * 6 && pl.h > fs * 2.6) {
      svg += `<text x="${pl.x + pl.w / 2}" y="${pl.y + pl.h / 2 - fs * 0.15}" font-size="${fs}" font-weight="bold" fill="#0f172a" text-anchor="middle">${pl.piece.id}</text>`;
      svg += `<text x="${pl.x + pl.w / 2}" y="${pl.y + pl.h / 2 + fs * 1.05}" font-size="${fs * 0.82}" fill="#334155" text-anchor="middle">${Math.round(pl.piece.length)}×${Math.round(pl.piece.width)}${pl.rotated ? ' ↻' : ''}</text>`;
    }
  });
  svg += `</svg>`;
  return svg;
}

function summaryTable(plan) {
  const rows = plan.groups.map(g => `
    <tr>
      <td style="padding:5px 8px;">${escapeHtml(g.category)}</td>
      <td style="padding:5px 8px; text-align:right;">${g.pieces.length}</td>
      <td style="padding:5px 8px; text-align:right; font-weight:bold;">${g.result.sheetCount}</td>
      <td style="padding:5px 8px; text-align:right;">${g.result.sheetCount ? g.result.wastePct.toFixed(1) + ' %' : '-'}</td>
    </tr>`).join('');
  return `
    <table style="width:100%; border-collapse:collapse; font-size:12px; background:#fff; border:1px solid #e2e8f0;">
      <thead><tr style="background:#f1f5f9; text-align:left;">
        <th style="padding:6px 8px;">Materiał (kategoria)</th>
        <th style="padding:6px 8px; text-align:right;">Formatek</th>
        <th style="padding:6px 8px; text-align:right;">Arkuszy</th>
        <th style="padding:6px 8px; text-align:right;">Odpad</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function unplacedHtml(plan) {
  const list = plan.groups.flatMap(g => g.result.unplaced);
  if (list.length === 0) return '';
  return `<div style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:8px 10px; border-radius:6px; font-size:12px; margin-top:8px;">
    ⚠️ ${list.length} formatek nie mieści się na arkuszu ${plan.settings.sheetW}×${plan.settings.sheetH} mm (z obrzeżem): ${list.slice(0, 8).map(p => `${escapeHtml(p.id)} (${Math.round(p.length)}×${Math.round(p.width)})`).join(', ')}${list.length > 8 ? '…' : ''}
  </div>`;
}

function openPrintWindow(title, bodyHtml, extraCss = '') {
  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, sans-serif; color:#0f172a; margin: 0; padding: 20px; }
      .bar { margin-bottom: 14px; } .bar button { padding:10px 20px; background:#059669; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; }
      @media print { .bar { display:none; } body { padding:0; } }
      ${extraCss}
    </style></head><body>
    <div class="bar"><button onclick="window.print()">🖨️ Drukuj / Zapisz jako PDF</button></div>
    ${bodyHtml}</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function printCutPlan(plan) {
  const colors = new Map();
  const s = plan.settings;
  let body = `<h1 style="font-size:20px; margin:0 0 4px;">Rozkrój płyt: ${escapeHtml(state.project.name || 'projekt')}</h1>
    <div style="font-size:12px; color:#64748b; margin-bottom:12px;">Arkusz ${s.sheetW}×${s.sheetH} mm · cięcie ${s.kerf} mm · obrzeże ${s.trim} mm · okleina: wszystkie formatki dookoła, razem ${plan.edgeMeters.toFixed(1)} mb</div>
    ${summaryTable(plan)}`;
  plan.groups.forEach(g => {
    g.result.sheets.forEach(sh => {
      body += `<div style="page-break-before:always; margin-top:20px;">
        <h2 style="font-size:16px; margin:0 0 6px;">${escapeHtml(g.category)} - arkusz ${sh.index + 1} z ${g.result.sheetCount} <span style="font-weight:normal; color:#64748b; font-size:12px;">(odpad ${sh.wastePct.toFixed(1)} %)</span></h2>
        ${sheetSvg(sh, s, colors)}
        <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:8px;">
          <thead><tr style="background:#f1f5f9; text-align:left;"><th style="padding:3px 6px;">Nr</th><th style="padding:3px 6px;">Szafka</th><th style="padding:3px 6px;">Formatka</th><th style="padding:3px 6px;">Wymiar (mm)</th></tr></thead>
          <tbody>${sh.placements.slice().sort((a, b) => a.piece.id.localeCompare(b.piece.id)).map(pl => `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:3px 6px; font-weight:bold;">${escapeHtml(pl.piece.id)}</td><td style="padding:3px 6px;">${escapeHtml(pl.piece.moduleName)}</td><td style="padding:3px 6px;">${escapeHtml(pl.piece.name)}</td><td style="padding:3px 6px;">${Math.round(pl.piece.length)} × ${Math.round(pl.piece.width)}${pl.rotated ? ' (obrócona)' : ''}</td></tr>`).join('')}</tbody>
        </table></div>`;
    });
  });
  openPrintWindow('Rozkrój płyt', body);
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

function printLabels(plan) {
  const project = state.project.name || 'projekt';
  const labels = plan.pieces.map(p => {
    const loc = plan.location[p.id];
    const code = [project, p.id, p.moduleName, p.name, `${Math.round(p.length)}x${Math.round(p.width)}`].join('|');
    return `<div class="label">
      <div class="qr">${qrSvg(code)}</div>
      <div class="txt">
        <div class="id">${escapeHtml(p.id)}</div>
        <div class="mod">${escapeHtml(p.moduleName)}</div>
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="dim">${Math.round(p.length)} × ${Math.round(p.width)} mm</div>
        <div class="mat">${escapeHtml(p.category)}${loc ? ` · arkusz ${loc.sheetNo}/${loc.sheetCount}` : ''}</div>
        <div class="edge">${p.banded ? 'Okleina: dookoła' : 'Bez okleiny'}</div>
      </div>
    </div>`;
  }).join('');
  const css = `
    @page { size: A4; margin: 8mm; }
    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
    .label { display:flex; gap:2mm; border:0.3mm solid #334155; border-radius:1mm; padding:1.5mm; height:32mm; box-sizing:border-box; break-inside:avoid; overflow:hidden; }
    .qr { width:22mm; flex-shrink:0; } .qr svg { width:22mm; height:22mm; }
    .txt { font-size:7pt; line-height:1.25; min-width:0; }
    .id { font-size:12pt; font-weight:bold; } .mod { font-weight:bold; } .nm { color:#334155; }
    .dim { font-size:9pt; font-weight:bold; } .mat, .edge { color:#475569; }
  `;
  openPrintWindow('Etykiety formatek', `<div class="grid">${labels}</div>`, css);
}

export function openCutPlanModal() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  });
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: '#fff', width: '95%', maxWidth: '1000px', maxHeight: '92vh',
    overflowY: 'auto', borderRadius: '8px', padding: '20px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'sans-serif',
  });

  const s = getSettings();
  modal.innerHTML = `
    <h2 style="margin:0 0 4px; color:#1e293b; font-size:16px;">🪚 Rozkrój i etykiety</h2>
    <div style="font-size:11px; color:#64748b; margin-bottom:12px;">Układ formatek na arkuszach (cięcia na wylot, do wykonania na pilarce), zużycie okleiny (wszystkie formatki dookoła, poza plecami HDF) i etykiety z kodem QR.</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px;">
      <div class="property-group" style="flex:1; min-width:120px;"><label>Arkusz - długość (mm):</label><input type="number" id="cp-sheetW" value="${s.sheetW}" /></div>
      <div class="property-group" style="flex:1; min-width:120px;"><label>Arkusz - szerokość (mm):</label><input type="number" id="cp-sheetH" value="${s.sheetH}" /></div>
      <div class="property-group" style="flex:1; min-width:120px;"><label>Szerokość cięcia (mm):</label><input type="number" id="cp-kerf" value="${s.kerf}" step="0.5" /></div>
      <div class="property-group" style="flex:1; min-width:120px;"><label>Obrzeże arkusza (mm):</label><input type="number" id="cp-trim" value="${s.trim}" /></div>
      <label style="display:flex; align-items:center; gap:6px; font-size:12px;"><input type="checkbox" id="cp-rotate-fronts" ${s.rotateFronts ? 'checked' : ''} /> Pozwól obracać fronty (bez pilnowania słojów)</label>
    </div>
    <div id="cp-results"></div>
    <div style="display:flex; gap:8px; margin-top:14px; justify-content:flex-end; flex-wrap:wrap;">
      <button type="button" id="cp-print-plan" class="btn btn-success btn-sm">🖨️ Drukuj rozkrój</button>
      <button type="button" id="cp-print-labels" class="btn btn-warning btn-sm">🏷️ Drukuj etykiety</button>
      <button type="button" id="cp-close" class="btn btn-primary btn-sm">Zamknij</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const resultsEl = modal.querySelector('#cp-results');
  let plan = null;

  function render() {
    plan = computePlan();
    const colors = new Map();
    const totalSheets = plan.groups.reduce((sum, g) => sum + g.result.sheetCount, 0);
    let html = '';
    if (plan.pieces.length === 0) {
      html = `<div style="font-size:12px; color:#94a3b8; font-style:italic;">Projekt nie ma jeszcze formatek.</div>`;
    } else {
      html += summaryTable(plan);
      html += `<div style="font-size:12px; color:#334155; margin-top:8px;">Razem <b>${totalSheets}</b> arkuszy · okleina dookoła: <b>${plan.edgeMeters.toFixed(1)} mb</b> (bez zapasu, plecy HDF bez okleiny)</div>`;
      html += unplacedHtml(plan);
      plan.groups.forEach(g => {
        g.result.sheets.forEach((sh, i) => {
          html += `<details ${i === 0 ? 'open' : ''} style="margin-top:10px;"><summary style="cursor:pointer; font-weight:bold; font-size:13px; color:#1e3a8a;">${escapeHtml(g.category)} - arkusz ${sh.index + 1} z ${g.result.sheetCount} <span style="font-weight:normal; color:#64748b;">(${sh.placements.length} formatek, odpad ${sh.wastePct.toFixed(1)} %)</span></summary>${sheetSvg(sh, plan.settings, colors)}</details>`;
        });
      });
    }
    resultsEl.innerHTML = html;
  }

  const bind = (id, key, parse) => {
    modal.querySelector(id).addEventListener('input', e => {
      const v = parse(e.target);
      if (v === null) return;
      state.project.cutPlan = { ...getSettings(), [key]: v };
      render();
    });
  };
  const num = (min) => (el) => { const v = parseFloat(el.value); return Number.isFinite(v) && v >= min ? v : null; };
  bind('#cp-sheetW', 'sheetW', num(100));
  bind('#cp-sheetH', 'sheetH', num(100));
  bind('#cp-kerf', 'kerf', num(0));
  bind('#cp-trim', 'trim', num(0));
  bind('#cp-rotate-fronts', 'rotateFronts', el => !!el.checked);

  modal.querySelector('#cp-print-plan').addEventListener('click', () => plan && plan.pieces.length && printCutPlan(plan));
  modal.querySelector('#cp-print-labels').addEventListener('click', () => plan && plan.pieces.length && printLabels(plan));
  modal.querySelector('#cp-close').addEventListener('click', () => document.body.removeChild(overlay));

  render();
}
