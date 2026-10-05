// src/ui/slopeProperties.js
//
// Prawy panel dla szafki pod skos (mod.type === 'slope_cabinet'): wymiary, strona
// skosu, kolumny (przegrody) i półki, pozycja. Geometria i formatki: core/slopeCabinet.js.
import { state, deleteModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { escapeHtml } from "../utils/dom.js";
import { round1 } from "../utils/math.js";
import { getSlopeGeometry, getSlopeSettings, getSlopeColumns, getSlopeDividers, getSlopeInnerSpan } from "../core/slopeCabinet.js";

const MIN_COLUMN = 50;

export function renderSlopeModuleProperties(rightSidebar, mod) {
  const th = parseFloat(state.project.materials?.boardThickness) || 18;
  const s = getSlopeSettings(mod, th);
  const g = getSlopeGeometry(mod, th);
  const cols = getSlopeColumns(mod, th);
  const d = mod.dimensions;
  const lastIdx = s.columns.length - 1;
  const slopeIdx = g.lowSide === 'left' ? 0 : lastIdx;
  const skipped = cols.dividers.length - getSlopeDividers(mod, th).length;

  const columnLabel = (i) => {
    if (s.columns.length === 1) return 'Kolumna (całe wnętrze)';
    if (i === slopeIdx) return `Kolumna ${i + 1} — przy skosie`;
    if (i === (slopeIdx === 0 ? lastIdx : 0)) return `Kolumna ${i + 1} — przy wysokim boku`;
    return `Kolumna ${i + 1}`;
  };
  const columnRows = s.columns.map((w, i) => {
    const isAuto = w === null;
    return `
      <div class="row mb-8" style="align-items: flex-end;">
        <div class="property-group grow">
          <label class="fs-xs">${columnLabel(i)} [mm]:</label>
          <input type="number" class="input-slope-column" data-index="${i}" value="${isAuto ? round1(cols.autoWidth) : w}" ${isAuto ? 'disabled' : ''} />
        </div>
        <label class="fs-xs" style="display:flex; align-items:center; gap:4px; margin-bottom:8px;" title="Ta kolumna dostaje resztę szerokości">
          <input type="radio" name="slope-auto" class="input-slope-auto" data-index="${i}" ${isAuto ? 'checked' : ''} /> reszta
        </label>
        ${s.columns.length > 1 ? `<button type="button" class="icon-btn btn-slope-del-column" data-index="${i}" title="Usuń kolumnę" style="margin-bottom:4px;"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}
      </div>`;
  }).join('');

  const shelfRows = (s.shelves || []).map((v, i) => `
      <div class="row mb-8" style="align-items: flex-end;">
        <div class="property-group grow">
          <label class="fs-xs">Półka ${i + 1} — spód od dołu szafki [mm]:</label>
          <input type="number" class="input-slope-shelf" data-index="${i}" value="${v}" />
        </div>
        <button type="button" class="icon-btn btn-slope-del-shelf" data-index="${i}" title="Usuń półkę" style="margin-bottom:4px;"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>`).join('');

  rightSidebar.innerHTML = `
    <h2>Szafka pod skos</h2>
    <div class="property-group prop-box">
      <label style="font-weight: 600;">Nazwa szafki:</label>
      <input type="text" id="input-slope-name" value="${escapeHtml(mod.name)}" style="font-weight: 600;" />
    </div>

    <h3>Wymiary</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Szerokość [mm]:</label><input type="number" id="input-slope-width" value="${d.width}" /></div>
      <div class="mb-8"><label class="fs-xs">Wysokość — wysoka strona [mm]:</label><input type="number" id="input-slope-height" value="${d.height}" /></div>
      <div class="mb-8"><label class="fs-xs">Wysokość — niska strona [mm] (0 = trójkąt):</label><input type="number" id="input-slope-low" value="${s.lowHeight || 0}" /></div>
      <div><label class="fs-xs">Głębokość [mm]:</label><input type="number" id="input-slope-depth" value="${d.depth}" /></div>
    </div>
    ${(parseFloat(s.lowHeight) || 0) > 0 && g.isTriangle ? `<div class="notice-warn fs-xs mb-8">Niska strona jest za niska na bok — szafka liczona jako trójkąt.</div>` : ''}

    <h3>Niska strona skosu</h3>
    <div class="property-group seg">
      <button type="button" class="seg-btn btn-slope-side${g.lowSide === 'left' ? ' active' : ''}" data-side="left">Po lewej</button>
      <button type="button" class="seg-btn btn-slope-side${g.lowSide === 'right' ? ' active' : ''}" data-side="right">Po prawej</button>
    </div>
    <div class="hint">Kąt skosu: <b>${round1(g.angle)}°</b> · ${g.isTriangle ? 'trójkąt' : 'trapez'} · dno nakładane</div>

    <h3>Kolumny (przegrody)</h3>
    <div class="hint mb-8">Szerokości wnęk w świetle, od lewej do prawej. Przegrody stoją między kolumnami, od dna do skosu. Kolumna oznaczona „reszta” dostaje to, co zostanie.${g.isTriangle ? ' Kolumna przy skosie liczona od czubka skosu.' : ''}</div>
    ${columnRows}
    ${cols.autoWidth < MIN_COLUMN ? `<div class="notice-warn fs-xs mb-8">Kolumny się nie mieszczą — na „resztę” zostaje ${round1(cols.autoWidth)} mm. Zmniejsz szerokości albo usuń kolumnę.</div>` : ''}
    ${skipped > 0 ? `<div class="notice-warn fs-xs mb-8">Przegród za nisko pod skosem: ${skipped} — pominięte w formatkach.</div>` : ''}
    <div class="row mb-8">
      <button type="button" class="btn btn-sm" id="btn-slope-add-column"><i class="ti ti-plus" aria-hidden="true"></i> Kolumna</button>
      <input type="number" id="input-slope-col-count" value="${s.columns.length}" min="1" style="width: 60px;" />
      <button type="button" class="btn btn-sm" id="btn-slope-even-columns">Rozłóż równo</button>
    </div>

    <h3>Półki</h3>
    <div class="hint mb-8">Półka jest dzielona przegrodami i docięta do skosu.</div>
    ${shelfRows}
    <div class="row mb-8">
      <button type="button" class="btn btn-sm" id="btn-slope-add-shelf"><i class="ti ti-plus" aria-hidden="true"></i> Półka</button>
      <input type="number" id="input-slope-shelf-count" value="${(s.shelves || []).length || 2}" min="0" style="width: 60px;" />
      <button type="button" class="btn btn-sm" id="btn-slope-even-shelves">Rozłóż równo</button>
    </div>

    <hr class="divider">

    <h3>Pozycja w przestrzeni (3D)</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-slope-pos-x" value="${mod.position.x}" /></div>
      <div class="mb-8"><label class="fs-xs">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-slope-pos-z" value="${mod.position.z || 0}" /></div>
      <div><label class="fs-xs">Wysokość od podłogi (Y) [mm]:</label><input type="number" id="input-slope-pos-y" value="${mod.position.y}" /></div>
    </div>

    <h3>Obrót (co 90°)</h3>
    <div class="property-group seg">
      ${[0, 90, 180, 270].map(rot => `<button type="button" class="seg-btn btn-slope-rotate${(mod.rotation || 0) === rot ? ' active' : ''}" data-rot="${rot}">${rot}°</button>`).join('')}
    </div>

    <hr class="divider">
    <button type="button" id="btn-slope-delete" class="btn btn-danger btn-block btn-sm"><i class="ti ti-trash" aria-hidden="true"></i> Usuń szafkę</button>
  `;

  // Zapis ustawień: kolumny zawsze w nowym formacie (stare "dividers" znikają).
  const save = (patch) => {
    const cur = getSlopeSettings(mod, th);
    const next = { ...(mod.slope || {}), lowSide: cur.lowSide, lowHeight: cur.lowHeight, columns: cur.columns, shelves: cur.shelves, ...patch };
    delete next.dividers;
    mod.slope = next;
  };
  // Zmiana struktury (wymiary, listy) - przerysuj też panel (kąt, ostrzeżenia).
  const refresh = () => { update3D(); updateSidebar(); initPropertiesPanel(); };
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const onChange = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => { apply(e.target.value); refresh(); });
  };
  const onInput = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { apply(e.target.value); update3D(); updateSidebar(); });
  };

  onInput('input-slope-name', (v) => { mod.name = v; });
  onChange('input-slope-width', (v) => { mod.dimensions.width = Math.max(200, num(v)); });
  onChange('input-slope-height', (v) => { mod.dimensions.height = Math.max(200, num(v)); });
  onChange('input-slope-low', (v) => { save({ lowHeight: Math.max(0, Math.min(num(v), num(mod.dimensions.height) - 1)) }); });
  onChange('input-slope-depth', (v) => { mod.dimensions.depth = Math.max(100, num(v)); });
  onInput('input-slope-pos-x', (v) => { mod.position.x = num(v); });
  onInput('input-slope-pos-z', (v) => { mod.position.z = num(v); });
  onInput('input-slope-pos-y', (v) => { mod.position.y = num(v); });

  // Zmiana strony skosu odwraca też kolejność kolumn - układ wnęk idzie za skosem.
  rightSidebar.querySelectorAll('.btn-slope-side').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.side === g.lowSide) return;
    save({ lowSide: btn.dataset.side, columns: [...s.columns].reverse() });
    refresh();
  }));
  rightSidebar.querySelectorAll('.btn-slope-rotate').forEach((btn) => btn.addEventListener('click', () => {
    mod.rotation = parseInt(btn.dataset.rot, 10);
    refresh();
  }));

  // --- Kolumny ---
  rightSidebar.querySelectorAll('.input-slope-column').forEach((inp) => inp.addEventListener('change', (e) => {
    const list = [...s.columns];
    list[parseInt(inp.dataset.index, 10)] = Math.max(0, num(e.target.value));
    save({ columns: list });
    refresh();
  }));
  // Nowa "reszta": poprzednia dostaje swoją aktualną (policzoną) szerokość.
  rightSidebar.querySelectorAll('.input-slope-auto').forEach((radio) => radio.addEventListener('change', () => {
    const list = s.columns.map((w, i) => (w === null ? Math.round(cols.widths[i]) : w));
    list[parseInt(radio.dataset.index, 10)] = null;
    save({ columns: list });
    refresh();
  }));
  rightSidebar.querySelectorAll('.btn-slope-del-column').forEach((btn) => btn.addEventListener('click', () => {
    const list = [...s.columns];
    list.splice(parseInt(btn.dataset.index, 10), 1);
    if (!list.includes(null)) list[g.lowSide === 'left' ? 0 : list.length - 1] = null;
    save({ columns: list });
    refresh();
  }));
  // Nowa kolumna od strony wysokiego boku, zabiera połowę "reszty".
  document.getElementById('btn-slope-add-column')?.addEventListener('click', () => {
    const w = Math.max(MIN_COLUMN, Math.round((cols.autoWidth - th) / 2));
    const list = [...s.columns];
    if (g.lowSide === 'left') list.push(w); else list.unshift(w);
    save({ columns: list });
    refresh();
  });
  // Równe kolumny: "reszta" przy skosie wyrównuje zaokrąglenia.
  document.getElementById('btn-slope-even-columns')?.addEventListener('click', () => {
    const n = Math.max(1, Math.round(num(document.getElementById('input-slope-col-count').value)));
    const { left, right } = getSlopeInnerSpan(mod, th);
    const w = Math.round((right - left - (n - 1) * th) / n);
    const list = Array.from({ length: n }, () => w);
    list[g.lowSide === 'left' ? 0 : n - 1] = null;
    save({ columns: list });
    refresh();
  });

  // --- Półki ---
  rightSidebar.querySelectorAll('.input-slope-shelf').forEach((inp) => inp.addEventListener('change', (e) => {
    const list = [...(s.shelves || [])];
    list[parseInt(inp.dataset.index, 10)] = num(e.target.value);
    save({ shelves: list });
    refresh();
  }));
  rightSidebar.querySelectorAll('.btn-slope-del-shelf').forEach((btn) => btn.addEventListener('click', () => {
    const list = [...(s.shelves || [])];
    list.splice(parseInt(btn.dataset.index, 10), 1);
    save({ shelves: list });
    refresh();
  }));
  document.getElementById('btn-slope-add-shelf')?.addEventListener('click', () => {
    save({ shelves: [...(s.shelves || []), Math.round(num(mod.dimensions.height) / 2)] });
    refresh();
  });
  // Równe półki: równe przerwy w wysokim końcu wnętrza (pod skosem przy wysokim boku).
  document.getElementById('btn-slope-even-shelves')?.addEventListener('click', () => {
    const n = Math.max(0, Math.round(num(document.getElementById('input-slope-shelf-count').value)));
    const inner = g.under(g.W - th) - th;
    const gap = (inner - n * th) / (n + 1);
    save({ shelves: Array.from({ length: n }, (_, i) => Math.round(th + (i + 1) * gap + i * th)) });
    refresh();
  });

  document.getElementById('btn-slope-delete')?.addEventListener('click', () => {
    deleteModule(mod.id);
    refresh();
  });
}
