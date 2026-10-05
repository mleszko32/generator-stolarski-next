// src/ui/frontsDxfPanel.js
//
// Karta „Fronty do CNC (DXF)” w sekcji Rozkrój huba: podgląd frontów ułożonych
// na arkuszach (osobno dla każdego materiału) i pobieranie plików DXF.
// Obliczenia i zapis DXF: engine/frontsDxf.js. Rozmiar arkusza wspólny z
// planem rozkroju (project.cutPlan), odstęp/obrzeże/obracanie - project.frontsDxf.

import { escapeHtml } from "../utils/dom.js";
import { state } from "../core/state.js";
import { collectProjectParts } from "../engine/cabinet.js";
import { DXF_DEFAULTS, collectFrontPieces, nestFronts, placedOutline, sheetToDxf, allSheetsToDxf } from "../engine/frontsDxf.js";

function getSettings() {
  const cut = { sheetW: 2800, sheetH: 2070, ...(state.project.cutPlan || {}) };
  return { ...DXF_DEFAULTS, ...(state.project.frontsDxf || {}), sheetW: cut.sheetW, sheetH: cut.sheetH };
}

function compute() {
  const s = getSettings();
  const pieces = collectFrontPieces(collectProjectParts(), state.project.pricing?.frontMaterials || []);
  return { settings: s, pieces, groups: nestFronts(pieces, s) };
}

function sheetPreview(sheet, s) {
  const fs = Math.round(s.sheetW / 70);
  let svg = `<svg viewBox="0 0 ${s.sheetW} ${s.sheetH}" xmlns="http://www.w3.org/2000/svg" class="dxf-sheet" style="width:100%; height:auto;">`;
  svg += `<rect x="0" y="0" width="${s.sheetW}" height="${s.sheetH}" fill="var(--surface-subtle)" stroke="var(--border-strong)" stroke-width="3"/>`;
  sheet.placements.forEach((pl) => {
    // DXF ma Y w górę, SVG w dół.
    const pts = placedOutline(pl, s.sheetH).map(([x, y]) => `${x},${s.sheetH - y}`).join(' ');
    svg += `<polygon points="${pts}" fill="var(--info-bg)" stroke="var(--danger)" stroke-width="3"/>`;
    svg += `<text x="${pl.x + pl.w / 2}" y="${pl.y + pl.h / 2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-primary)">${escapeHtml(pl.piece.id)}</text>`;
  });
  return svg + '</svg>';
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/dxf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (t) => String(t || 'projekt').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9_-]+/g, '_');

export function mountFrontsDxf(container) {
  const s = getSettings();
  container.innerHTML = `
    <div class="hub-bar" style="margin-top:20px">
      <div><h3>Fronty do CNC (DXF)</h3><div class="hub-sub">Wszystkie fronty ułożone na arkuszach płyty, osobno dla każdego materiału. Warstwy: FRONTY_KONTUR (obrysy do wycięcia), ARKUSZ, OPISY. Jednostki mm, rozmiar arkusza jak w rozkroju wyżej.</div></div>
      <div class="hub-actions">
        <button type="button" id="dxf-all" class="btn btn-sm"><i class="ti ti-download" aria-hidden="true"></i> Wszystkie arkusze (1 plik)</button>
      </div>
    </div>
    <div class="prop-box" style="margin-bottom:14px">
      <div class="field-row">
        <div class="field mb-0"><label>Odstęp między frontami (mm)</label><input type="number" id="dxf-gap" value="${s.gap}" min="0" /></div>
        <div class="field mb-0"><label>Obrzeże arkusza (mm)</label><input type="number" id="dxf-trim" value="${s.trim}" min="0" /></div>
      </div>
      <label class="hub-sub row-center" style="margin-top:8px"><input type="checkbox" id="dxf-rotate" ${s.rotateFronts ? 'checked' : ''} /> Pozwól obracać fronty (bez pilnowania słojów)</label>
    </div>
    <div id="dxf-results"></div>
  `;
  const resultsEl = container.querySelector('#dxf-results');
  let data = null;
  const projectName = () => safeName(state.loadedProjectId || 'projekt');

  function render() {
    data = compute();
    if (!data.pieces.length) {
      resultsEl.innerHTML = '<p class="hub-empty">Projekt nie ma frontów.</p>';
      return;
    }
    let html = '';
    const unplaced = data.groups.flatMap((g) => g.result.unplaced);
    if (unplaced.length) {
      html += `<div class="notice-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${unplaced.length} frontów nie mieści się na arkuszu: ${unplaced.slice(0, 8).map((p) => `${escapeHtml(p.id)} ${escapeHtml(p.name)}`).join(', ')}</div>`;
    }
    data.groups.forEach((g, gi) => {
      g.result.sheets.forEach((sh, si) => {
        html += `<details class="hub-details" ${gi === 0 && si === 0 ? 'open' : ''}><summary>${escapeHtml(g.materialName)} - arkusz ${sh.index + 1} z ${g.result.sheetCount} <span class="hub-sub">(${sh.placements.length} frontów, odpad ${sh.wastePct.toFixed(1)} %)</span>
          <button type="button" class="btn btn-sm" data-dxf="${gi}:${si}" style="margin-left:8px"><i class="ti ti-download" aria-hidden="true"></i> DXF</button></summary>
          ${sheetPreview(sh, data.settings)}
          <div class="hub-sub" style="margin-top:6px">${sh.placements.map((pl) => `<b>${escapeHtml(pl.piece.id)}</b> ${escapeHtml(pl.piece.name)} ${Math.round(pl.piece.frontW)}×${Math.round(pl.piece.frontH)}${pl.piece.moduleName ? ` (${escapeHtml(pl.piece.moduleName)})` : ''}`).join(' · ')}</div>
        </details>`;
      });
    });
    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll('[data-dxf]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      const [gi, si] = b.dataset.dxf.split(':').map(Number);
      const g = data.groups[gi], sh = g.result.sheets[si];
      download(`${projectName()}_fronty_${safeName(g.materialName)}_ark${sh.index + 1}.dxf`, sheetToDxf(sh, data.settings, `${g.materialName} - arkusz ${sh.index + 1}/${g.result.sheetCount}`));
    }));
  }

  const bind = (id, key, parse) => {
    container.querySelector(id).addEventListener('input', (e) => {
      const v = parse(e.target);
      if (v === null) return;
      state.project.frontsDxf = { ...(state.project.frontsDxf || {}), [key]: v };
      render();
    });
  };
  const num = (el) => { const v = parseFloat(el.value); return Number.isFinite(v) && v >= 0 ? v : null; };
  bind('#dxf-gap', 'gap', num);
  bind('#dxf-trim', 'trim', num);
  bind('#dxf-rotate', 'rotateFronts', (el) => !!el.checked);
  container.querySelector('#dxf-all').addEventListener('click', () => {
    if (data && data.pieces.length) download(`${projectName()}_fronty.dxf`, allSheetsToDxf(data.groups, data.settings));
  });

  render();
  return { refresh: render };
}
