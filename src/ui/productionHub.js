// src/ui/productionHub.js
//
// Jedno okno "Produkcja i raporty" zamiast stosu przycisków w lewym panelu:
// nawigacja po lewej (Formatki, Rozkrój i etykiety, Rysunki 2D, Okucia i
// okleina, Kosztorys), zawartość po prawej. Akcje (wydruki, CSV, kosztorys)
// to te same funkcje co dotąd (ui/sidebar.js), tylko w jednym miejscu.
import { escapeHtml } from "../utils/dom.js";
import { state, getActiveModule } from "../core/state.js";
import { collectProjectParts, calculateAllProjectParts, calculateProjectHardware } from "../engine/cabinet.js";
import { totalEdgeBandingMeters, EDGE_BANDING_RESERVE } from "../engine/edgeBanding.js";
import { mountCutPlan } from "./cutPlanModal.js";
import { openCsvExport, printHardwareList, openTechnicalDrawing, openKosztorysModal } from "./sidebar.js";

const SECTIONS = [
  { id: 'formatki', label: 'Formatki', icon: 'ti-list-details' },
  { id: 'rozkroj', label: 'Rozkrój i etykiety', icon: 'ti-cut' },
  { id: 'rysunki', label: 'Rysunki 2D', icon: 'ti-ruler-2' },
  { id: 'okucia', label: 'Okucia i okleina', icon: 'ti-shopping-cart' },
  { id: 'kosztorys', label: 'Kosztorys', icon: 'ti-calculator' },
];

let groupMode = 'module';

const CATEGORY_ORDER = ['Korpus', 'Front', 'Szuflada', 'Plecy'];

function fmt(n) { return Math.round((parseFloat(n) || 0) * 10) / 10; }

function partsTable(rows, showModules) {
  return `<table class="hub-table">
    <thead><tr><th>Formatka</th><th>Wymiar (mm)</th><th class="num">Ilość</th>${showModules ? '<th>Szafka</th>' : ''}<th>Materiał</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${fmt(r.length)} × ${fmt(r.width)}</td>
      <td class="num">${r.qty}</td>
      ${showModules ? `<td>${escapeHtml((r.modules || []).join(', '))}</td>` : ''}
      <td>${escapeHtml(r.category || '')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function aggregate(rows) {
  const map = new Map();
  rows.forEach(p => {
    const key = `${p.category}|${p.name}|${p.length}|${p.width}`;
    if (map.has(key)) map.get(key).qty += p.qty;
    else map.set(key, { name: p.name, length: p.length, width: p.width, qty: p.qty, category: p.category });
  });
  return [...map.values()];
}

function renderFormatki(el) {
  const raw = collectProjectParts();
  const total = raw.reduce((s, p) => s + (parseInt(p.qty, 10) || 1), 0);
  const activeName = getActiveModule()?.name;
  let body = '';

  if (raw.length === 0) {
    body = `<p class="hub-empty">Projekt nie ma jeszcze formatek. Dodaj szafkę w trybie projektowania.</p>`;
  } else if (groupMode === 'module') {
    const byModule = new Map();
    raw.forEach(p => {
      const k = p.moduleName || 'Inne';
      if (!byModule.has(k)) byModule.set(k, []);
      byModule.get(k).push(p);
    });
    byModule.forEach((list, name) => {
      const count = list.reduce((s, p) => s + (parseInt(p.qty, 10) || 1), 0);
      body += `<h4 class="hub-group${name === activeName ? ' active' : ''}">${escapeHtml(name)} <span>${count} szt.${name === activeName ? ' · aktywna' : ''}</span></h4>${partsTable(aggregate(list), false)}`;
    });
  } else if (groupMode === 'material') {
    const byCat = new Map();
    raw.forEach(p => {
      const k = p.category || 'Inne';
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k).push(p);
    });
    [...byCat.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]), ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }).forEach(([name, list]) => {
      const count = list.reduce((s, p) => s + (parseInt(p.qty, 10) || 1), 0);
      body += `<h4 class="hub-group">${escapeHtml(name)} <span>${count} szt.</span></h4>${partsTable(aggregate(list), false)}`;
    });
  } else {
    body = partsTable(calculateAllProjectParts(), true);
  }

  el.innerHTML = `
    <div class="hub-bar">
      <div><h3>Formatki</h3><div class="hub-sub">${total} sztuk w projekcie</div></div>
      <div class="hub-actions">
        <label class="hub-sub">Grupuj:
          <select id="hub-group">
            <option value="module" ${groupMode === 'module' ? 'selected' : ''}>wg szafki</option>
            <option value="material" ${groupMode === 'material' ? 'selected' : ''}>wg materiału</option>
            <option value="flat" ${groupMode === 'flat' ? 'selected' : ''}>lista zbiorcza</option>
          </select>
        </label>
        <button type="button" id="hub-csv" class="btn btn-sm">Eksport CSV</button>
      </div>
    </div>
    ${body}`;
  el.querySelector('#hub-group').addEventListener('change', e => { groupMode = e.target.value; renderFormatki(el); });
  el.querySelector('#hub-csv').addEventListener('click', () => openCsvExport());
}

function renderRysunki(el) {
  const mod = getActiveModule();
  el.innerHTML = `
    <div class="hub-bar"><div><h3>Rysunki 2D</h3><div class="hub-sub">Rysunek wykonawczy z nawiertami (System 32, wkręty i kołki, zawiasy, podpórki) dla aktywnej szafki.</div></div></div>
    <div class="hub-card">
      <div class="hub-sub">Aktywna szafka</div>
      <div class="hub-strong">${mod ? escapeHtml(mod.name) : 'brak - wybierz szafkę na liście'}</div>
      ${mod && mod.type === 'corner_cabinet' ? `<div class="hub-sub" style="margin-top:6px;">Szafka narożna: wydruk zawiera rzut z góry oraz rysunki wieńca, półki, boków i listwy.</div>` : ''}
      <button type="button" id="hub-draw" class="btn btn-primary btn-sm" style="margin-top:12px;" ${mod ? '' : 'disabled'}>Otwórz rysunek wykonawczy</button>
    </div>`;
  el.querySelector('#hub-draw').addEventListener('click', () => openTechnicalDrawing());
}

function renderOkucia(el) {
  const hw = calculateProjectHardware();
  const edge = totalEdgeBandingMeters(collectProjectParts());
  el.innerHTML = `
    <div class="hub-bar">
      <div><h3>Okucia i okleina</h3><div class="hub-sub">Lista zakupów z całego projektu. Okleina: wszystkie formatki dookoła (bez pleców HDF), ${edge.toFixed(1)} mb netto, z ${Math.round(EDGE_BANDING_RESERVE * 100)}% zapasu ${(edge * (1 + EDGE_BANDING_RESERVE)).toFixed(1)} mb.</div></div>
      <div class="hub-actions"><button type="button" id="hub-hw-print" class="btn btn-sm">Drukuj listę zakupów</button></div>
    </div>
    ${hw.length === 0 ? `<p class="hub-empty">Lista zakupów jest pusta.</p>` : `
    <table class="hub-table">
      <thead><tr><th>Pozycja</th><th class="num">Ilość</th><th>J.m.</th></tr></thead>
      <tbody>${hw.map(h => `<tr><td>${escapeHtml(h.name)}</td><td class="num">${h.qty}</td><td>${escapeHtml(h.unit || '')}</td></tr>`).join('')}</tbody>
    </table>`}`;
  el.querySelector('#hub-hw-print').addEventListener('click', () => printHardwareList());
}

function renderKosztorys(el) {
  el.innerHTML = `
    <div class="hub-bar"><div><h3>Kosztorys</h3><div class="hub-sub">Materiały (ceny za m² per kategoria), okucia, okleina i marża.</div></div></div>
    <div class="hub-card">
      <div class="hub-sub">Projekt</div>
      <div class="hub-strong">${escapeHtml(state.project.name || 'bez nazwy')}</div>
      <button type="button" id="hub-cost" class="btn btn-primary btn-sm" style="margin-top:12px;">Otwórz kosztorys</button>
    </div>`;
  el.querySelector('#hub-cost').addEventListener('click', () => openKosztorysModal());
}

function renderRozkroj(el) {
  el.innerHTML = '<div id="hub-cutplan"></div>';
  mountCutPlan(el.querySelector('#hub-cutplan'));
}

const RENDERERS = {
  formatki: renderFormatki,
  rozkroj: renderRozkroj,
  rysunki: renderRysunki,
  okucia: renderOkucia,
  kosztorys: renderKosztorys,
};

export function openProductionHub(section = 'formatki') {
  const existing = document.getElementById('production-hub');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'production-hub';
  overlay.className = 'hub-overlay';
  overlay.innerHTML = `
    <div class="hub-modal" role="dialog" aria-label="Produkcja i raporty">
      <div class="hub-nav">
        <div class="hub-title">Produkcja</div>
        ${SECTIONS.map(s => `<button type="button" class="hub-nav-item" data-section="${s.id}"><i class="ti ${s.icon}" aria-hidden="true"></i>${s.label}</button>`).join('')}
        <div class="hub-spacer"></div>
        <button type="button" id="hub-close" class="btn btn-sm">Zamknij</button>
      </div>
      <div class="hub-content" id="hub-content"></div>
    </div>`;
  document.body.appendChild(overlay);

  const contentEl = overlay.querySelector('#hub-content');
  function show(id) {
    overlay.querySelectorAll('.hub-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === id));
    contentEl.scrollTop = 0;
    RENDERERS[id](contentEl);
  }
  overlay.querySelectorAll('.hub-nav-item').forEach(b => b.addEventListener('click', () => show(b.dataset.section)));
  overlay.querySelector('#hub-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  show(section);
}
