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
import { generateAllWallSVGs } from "../render/wallElevations.js";
import { computeWorktops, getWorktopSettings } from "../core/worktops.js";
import { openCsvExport, printHardwareList, openTechnicalDrawing, openKosztorysModal, updateSidebar } from "./sidebar.js";

const SECTIONS = [
  { id: 'formatki', label: 'Formatki', icon: 'ti-list-details' },
  { id: 'rozkroj', label: 'Rozkrój i etykiety', icon: 'ti-cut' },
  { id: 'rysunki', label: 'Rysunki 2D', icon: 'ti-ruler-2' },
  { id: 'sciany', label: 'Rzuty ścian', icon: 'ti-wall' },
  { id: 'blaty', label: 'Blaty', icon: 'ti-layout-board' },
  { id: 'okucia', label: 'Okucia i okleina', icon: 'ti-shopping-cart' },
  { id: 'kosztorys', label: 'Kosztorys', icon: 'ti-calculator' },
];

let groupMode = 'module';

const CATEGORY_ORDER = ['Korpus', 'Front', 'Szuflada', 'Plecy', 'Blat'];

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

const WT_FIELDS = [
  ['thickness', 'Grubość blatu (mm)', 1],
  ['depth', 'Głębokość blatu od ściany (mm)', 1],
  ['gapTolerance', 'Tolerancja szczeliny w rzędzie (mm)', 1],
  ['sideStart', 'Wysunięcie na początku rzędu (mm)', 1],
  ['sideEnd', 'Wysunięcie na końcu rzędu (mm)', 1],
  ['stockLength', 'Płyta pełna (mm)', 10],
  ['halfLength', 'Połówka płyty (mm)', 10],
  ['kerf', 'Szerokość cięcia (mm)', 1],
  ['minPiece', 'Min. kawałek przy dzieleniu (mm)', 10],
];

function renderBlaty(el) {
  const p = state.project;
  const s = getWorktopSettings(p);
  const refresh = () => { update3D(); renderBlaty(el); };
  const save = (patch) => { p.worktop = { ...getWorktopSettings(p), ...patch }; refresh(); };
  const { pieces, corners, plan } = computeWorktops(p);
  const ov = s.overrides;
  const num = (v) => (v === undefined || v === '' ? '' : v);
  const rows = pieces.map(pc => {
    const o = ov[pc.key] || {};
    const first = pc.part === 1;
    return `<tr>
      <td>${escapeHtml(pc.wallLabel)}${pc.seam ? ` (${pc.part}/${pc.parts})` : ''}</td>
      <td>${Math.round(pc.length)} × ${Math.round(pc.depth)} × ${pc.thickness}</td>
      <td>${pc.joins.map(j => escapeHtml(j.role)).join(', ') || '—'}</td>
      <td>${first ? `<input type="number" class="wt-ov" data-key="${pc.key}" data-f="length" value="${num(o.length)}" placeholder="auto" style="width:80px">` : ''}</td>
      <td>${first ? `<input type="number" class="wt-ov" data-key="${pc.key}" data-f="depth" value="${num(o.depth)}" placeholder="${s.depth}" style="width:70px">` : ''}</td>
      <td>${first ? `<input type="number" class="wt-ov" data-key="${pc.key}" data-f="thickness" value="${num(o.thickness)}" placeholder="${s.thickness}" style="width:60px">` : ''}</td>
      <td>${first ? `<label><input type="checkbox" class="wt-off" data-key="${pc.key}"> pomiń</label>` : ''}</td>
    </tr>`;
  }).join('');
  const offRows = Object.entries(ov).filter(([, o]) => o.disabled).map(([k]) => `<label class="hub-sub"><input type="checkbox" class="wt-on" data-key="${k}"> przywróć pominięty blat ${escapeHtml(k)}</label>`).join('<br>');
  const cornerRows = corners.map(c => `<label class="hub-sub">Narożnik ${escapeHtml(c.walls.join(' / '))}: do ściany idzie blat
    <select class="wt-through" data-key="${c.key}">${c.walls.map(w => `<option value="${w}" ${c.through === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>`).join('<br>');
  const stockRows = plan.stocks.map(st => `<tr><td>${st.size} mm</td><td>${st.depth} × ${st.thickness}</td><td>${st.items.map(i => Math.round(i.length)).join(' + ')}</td><td class="num">${Math.round(st.waste)} mm</td></tr>`).join('');
  el.innerHTML = `
    <div class="hub-bar"><div><h3>Blaty</h3>
      <div class="hub-sub">Blat leży od ściany na 0 i ma stałą głębokość, więc nawis wynika z położenia szafek pod spodem. Blaty układane są nad ciągłymi rzędami szafek dolnych; w narożniku jeden blat idzie do ściany, drugi jest skrócony o jego głębokość (złącze kątowe „na łyżwę”, wykonywane frezem w warsztacie).</div></div></div>
    <label class="hub-sub"><input type="checkbox" id="wt-enabled" ${s.enabled ? 'checked' : ''}/> Dodaj blaty do projektu (3D, formatki, kosztorys)</label>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin:12px 0">
      ${WT_FIELDS.map(([k, l, st]) => `<label class="hub-sub">${l}<br><input type="number" class="wt-f" data-k="${k}" value="${s[k]}" step="${st}" style="width:100%"></label>`).join('')}
      <label class="hub-sub">Łączenie w narożniku<br><select id="wt-joint"><option value="lyzwa" ${s.joint === 'lyzwa' ? 'selected' : ''}>Na łyżwę</option><option value="styk" ${s.joint === 'styk' ? 'selected' : ''}>Na styk</option></select></label>
    </div>
    ${offRows ? `<div style="margin-bottom:12px">${offRows}</div>` : ''}
    ${cornerRows ? `<div style="margin-bottom:12px">${cornerRows}</div>` : ''}
    ${pieces.length ? `<table class="hub-table"><thead><tr><th>Ściana</th><th>Wymiar (dł. × gł. × gr.)</th><th>Narożnik</th><th>Długość</th><th>Głębokość</th><th>Grubość</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <h4>Plan cięcia płyt ${s.stockLength} / ${s.halfLength} mm</h4>
    <p class="hub-sub">Płyty pełne: <b>${plan.fullCount}</b>, połówki: <b>${plan.halfCount}</b>, odpad łącznie: ${Math.round(plan.wasteMm)} mm${plan.oversize.length ? ' — <b>uwaga: kawałek dłuższy niż płyta</b>' : ''}</p>
    <table class="hub-table"><thead><tr><th>Płyta</th><th>Głęb. × gr.</th><th>Kawałki (mm)</th><th class="num">Odpad</th></tr></thead><tbody>${stockRows}</tbody></table>` : '<p class="hub-empty">Brak rzędów szafek dolnych przy ścianach (sprawdź położenie i obrót szafek) albo blaty wyłączone.</p>'}`;
  el.querySelector('#wt-enabled').addEventListener('change', e => { save({ enabled: e.target.checked }); updateSidebar(); });
  el.querySelectorAll('.wt-f').forEach(i => i.addEventListener('change', () => { const v = parseFloat(i.value); if (v >= 0) save({ [i.dataset.k]: v }); updateSidebar(); }));
  el.querySelector('#wt-joint').addEventListener('change', e => save({ joint: e.target.value }));
  el.querySelectorAll('.wt-through').forEach(i => i.addEventListener('change', () => save({ corners: { ...s.corners, [i.dataset.key]: { through: i.value } } })));
  const setOv = (key, patch) => save({ overrides: { ...s.overrides, [key]: { ...(s.overrides[key] || {}), ...patch } } });
  el.querySelectorAll('.wt-ov').forEach(i => i.addEventListener('change', () => setOv(i.dataset.key, { [i.dataset.f]: i.value === '' ? '' : parseFloat(i.value) })));
  el.querySelectorAll('.wt-on').forEach(i => i.addEventListener('change', () => setOv(i.dataset.key, { disabled: false })));
  el.querySelectorAll('.wt-off').forEach(i => i.addEventListener('change', () => setOv(i.dataset.key, { disabled: i.checked })));
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

let showEmptyWalls = false;

// Rzuty ścian pomieszczenia: każda ściana widziana od środka, z szafkami,
// łańcuchem szerokości, poziomami i wymiarami pionowymi (render/wallElevations.js).
function renderSciany(el) {
  const all = generateAllWallSVGs(state.project);
  const shown = all.filter(w => showEmptyWalls || w.wall.items.length > 0);
  el.innerHTML = `
    <div class="hub-bar">
      <div><h3>Rzuty ścian</h3><div class="hub-sub">Widok każdej ściany od środka pokoju: szafki z frontami, szerokości i odstępy w rzędzie pod podłogą, poziomy wysokości oraz wymiary pionowe. Szafka narożna jest pokazana na obu ścianach, przy których stoi.</div></div>
      <div class="hub-actions">
        <label class="hub-sub"><input type="checkbox" id="hub-empty-walls" ${showEmptyWalls ? 'checked' : ''} /> pokaż ściany bez szafek</label>
        <button type="button" id="hub-walls-print" class="btn btn-sm" ${shown.length ? '' : 'disabled'}>Drukuj rzuty ścian</button>
      </div>
    </div>
    ${shown.length === 0 ? '<p class="hub-empty">Żadna szafka nie stoi jeszcze przy ścianie (sprawdź położenie i obrót szafek).</p>' : shown.map(w => `<div class="hub-wall">${w.svg}</div>`).join('')}`;
  el.querySelector('#hub-empty-walls').addEventListener('change', e => { showEmptyWalls = e.target.checked; renderSciany(el); });
  el.querySelector('#hub-walls-print').addEventListener('click', () => {
    const pages = shown.map(w => `<div class="page">${w.svg}</div>`).join('');
    const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Rzuty ścian</title>
      <style>
        @page { size: A3 landscape; margin: 10mm; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; padding: 20px; }
        .bar { margin-bottom: 14px; } .bar button { padding: 10px 20px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .page { page-break-after: always; margin-bottom: 24px; }
        .page:last-child { page-break-after: auto; }
        .page svg { width: 100%; height: auto; max-height: 260mm; }
        @media print { .bar { display: none; } body { padding: 0; } .page { margin: 0; } }
      </style></head><body>
      <div class="bar"><button onclick="window.print()">Drukuj / Zapisz jako PDF</button></div>
      ${pages}</body></html>`;
    window.open(URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), '_blank');
  });
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
  sciany: renderSciany,
  blaty: renderBlaty,
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
