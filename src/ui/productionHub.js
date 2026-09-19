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
import { getCornerDepths } from "../core/layout.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel } from "./properties.js";
import { mountCutPlan } from "./cutPlanModal.js";
import { openCsvExport, printHardwareList, openTechnicalDrawing, openKosztorysModal, updateSidebar } from "./sidebar.js";

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

const MODULE_TYPE_LABELS = {
  base_cabinet: 'Szafka dolna',
  upper_cabinet: 'Szafka wisząca',
  tall_cabinet: 'Słupek',
  corner_cabinet: 'Szafka narożna',
};

// Opis szafki z wymiarami - czytelny także wtedy, gdy nie ma nazwy.
function moduleLabel(mod) {
  const type = MODULE_TYPE_LABELS[mod.type] || 'Szafka';
  const d = mod.dimensions || {};
  const h = fmt(d.height);
  let dims;
  if (mod.type === 'corner_cabinet') {
    const { depthA, depthB } = getCornerDepths(mod);
    dims = `ramię A ${fmt(d.width)} · ramię B ${fmt(d.legB)} · wys. ${h} · głęb. ${fmt(depthA)}/${fmt(depthB)}`;
  } else {
    dims = `${fmt(d.width)} × ${h} × ${fmt(d.depth)} mm (szer. × wys. × głęb.)`;
  }
  return { name: (mod.name || '').trim() || type, type, dims };
}

function renderRysunki(el) {
  const mods = state.project.modules || [];
  const activeId = state.activeModuleId;
  el.innerHTML = `
    <div class="hub-bar"><div><h3>Rysunki 2D</h3><div class="hub-sub">Rysunek wykonawczy z nawiertami (System 32, wkręty i kołki, zawiasy, podpórki). Wybierz szafkę, dla której chcesz otworzyć rysunek.</div></div></div>
    ${mods.length === 0 ? '<p class="hub-empty">Projekt nie ma jeszcze szafek.</p>' : `
    <table class="hub-table">
      <thead><tr><th>Szafka</th><th>Wymiary</th><th></th></tr></thead>
      <tbody>${mods.map(m => {
        const l = moduleLabel(m);
        return `<tr class="${m.id === activeId ? 'hub-row-active' : ''}">
          <td><div class="hub-strong" style="font-size:13px;">${escapeHtml(l.name)}${m.id === activeId ? ' <span class="hub-sub">· aktywna</span>' : ''}</div><div class="hub-sub">${escapeHtml(l.type)}${m.type === 'corner_cabinet' ? ' · wydruk z rzutem z góry i formatkami' : ''}</div></td>
          <td>${escapeHtml(l.dims)}</td>
          <td class="num" style="width:150px;"><button type="button" class="btn btn-sm hub-draw" data-id="${m.id}">Otwórz rysunek</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`}`;
  el.querySelectorAll('.hub-draw').forEach(btn => btn.addEventListener('click', () => {
    // Rysunek liczy się dla aktywnej szafki - przełączamy ją tak samo jak kliknięcie
    // na liście (panel boczny i 3D idą za wyborem).
    state.activeModuleId = btn.dataset.id;
    update3D();
    updateSidebar();
    initPropertiesPanel();
    openTechnicalDrawing();
    renderRysunki(el);
  }));
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

// Zakładki trybów w górnym pasku (ui/layout.js): Projekt / Produkcja / Wycena.
// Okno raportów odpowiada trybom Produkcja i Wycena (sekcja Kosztorys).
function setModeTab(mode) {
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

let escHandler = null;

export function closeProductionHub() {
  document.getElementById('production-hub')?.remove();
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  setModeTab('projekt');
}

export function openProductionHub(section = 'formatki') {
  document.getElementById('production-hub')?.remove();
  if (escHandler) document.removeEventListener('keydown', escHandler);

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
    setModeTab(id === 'kosztorys' ? 'wycena' : 'produkcja');
    contentEl.scrollTop = 0;
    RENDERERS[id](contentEl);
  }
  overlay.querySelectorAll('.hub-nav-item').forEach(b => b.addEventListener('click', () => show(b.dataset.section)));
  overlay.querySelector('#hub-close').addEventListener('click', closeProductionHub);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeProductionHub(); });
  escHandler = (e) => { if (e.key === 'Escape' && !document.querySelector('.hub-overlay ~ div[style*="z-index: 10000"]')) closeProductionHub(); };
  document.addEventListener('keydown', escHandler);
  show(section);
}
