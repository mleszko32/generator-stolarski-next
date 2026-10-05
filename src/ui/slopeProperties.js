// src/ui/slopeProperties.js
//
// Prawy panel dla szafki pod skos (mod.type === 'slope_cabinet'): wymiary, strona
// skosu, przegrody i półki, pozycja. Geometria i formatki: core/slopeCabinet.js.
import { state, deleteModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { escapeHtml } from "../utils/dom.js";
import { round1 } from "../utils/math.js";
import { getSlopeGeometry, getSlopeSettings, getSlopeDividers } from "../core/slopeCabinet.js";

export function renderSlopeModuleProperties(rightSidebar, mod) {
  const th = parseFloat(state.project.materials?.boardThickness) || 18;
  const s = getSlopeSettings(mod);
  const g = getSlopeGeometry(mod, th);
  const d = mod.dimensions;
  const validDividers = new Set(getSlopeDividers(mod, th).map((x) => x.index));

  const listRows = (key, values, label) => values.map((v, i) => `
      <div class="row mb-8">
        <div class="property-group grow">
          <label class="fs-xs">${label} ${i + 1} [mm]:</label>
          <input type="number" class="input-slope-${key}" data-index="${i}" value="${v}" />
        </div>
        <button type="button" class="icon-btn btn-slope-del-${key}" data-index="${i}" title="Usuń"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>
      ${key === 'divider' && !validDividers.has(i) ? `<div class="notice-warn fs-xs mb-8">Ta przegroda jest poza wnętrzem albo za nisko pod skosem — pominięta.</div>` : ''}`).join('');

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
    <div class="hint">Kąt skosu: <b>${round1(g.angle)}°</b> · ${g.isTriangle ? 'trójkąt' : 'trapez'}</div>

    <h3>Przegrody pionowe</h3>
    <div class="hint mb-8">Położenie lewej ściany przegrody, od lewej krawędzi szafki. Przegroda idzie od wieńca dolnego do skosu.</div>
    ${listRows('divider', s.dividers || [], 'Przegroda')}
    <div class="row mb-8">
      <button type="button" class="btn btn-sm" id="btn-slope-add-divider"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj</button>
      <input type="number" id="input-slope-div-count" value="${(s.dividers || []).length || 2}" min="0" style="width: 60px;" />
      <button type="button" class="btn btn-sm" id="btn-slope-even-dividers">Rozłóż równo</button>
    </div>

    <h3>Półki</h3>
    <div class="hint mb-8">Wysokość spodu półki od dołu szafki. Półka jest dzielona przegrodami i docięta do skosu.</div>
    ${listRows('shelf', s.shelves || [], 'Półka')}
    <div class="row mb-8">
      <button type="button" class="btn btn-sm" id="btn-slope-add-shelf"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj</button>
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

  const slope = () => { mod.slope = { ...getSlopeSettings(mod), ...(mod.slope || {}) }; return mod.slope; };
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
  onChange('input-slope-low', (v) => { slope().lowHeight = Math.max(0, Math.min(num(v), num(mod.dimensions.height) - 1)); });
  onChange('input-slope-depth', (v) => { mod.dimensions.depth = Math.max(100, num(v)); });
  onInput('input-slope-pos-x', (v) => { mod.position.x = num(v); });
  onInput('input-slope-pos-z', (v) => { mod.position.z = num(v); });
  onInput('input-slope-pos-y', (v) => { mod.position.y = num(v); });

  rightSidebar.querySelectorAll('.btn-slope-side').forEach((btn) => btn.addEventListener('click', () => {
    slope().lowSide = btn.dataset.side;
    refresh();
  }));
  rightSidebar.querySelectorAll('.btn-slope-rotate').forEach((btn) => btn.addEventListener('click', () => {
    mod.rotation = parseInt(btn.dataset.rot, 10);
    refresh();
  }));

  const bindList = (key, field) => {
    rightSidebar.querySelectorAll(`.input-slope-${key}`).forEach((inp) => inp.addEventListener('change', (e) => {
      const list = [...(slope()[field] || [])];
      list[parseInt(inp.dataset.index, 10)] = num(e.target.value);
      slope()[field] = list;
      refresh();
    }));
    rightSidebar.querySelectorAll(`.btn-slope-del-${key}`).forEach((btn) => btn.addEventListener('click', () => {
      const list = [...(slope()[field] || [])];
      list.splice(parseInt(btn.dataset.index, 10), 1);
      slope()[field] = list;
      refresh();
    }));
  };
  bindList('divider', 'dividers');
  bindList('shelf', 'shelves');

  const W = num(mod.dimensions.width);
  const H = num(mod.dimensions.height);
  // Równe przegrody: kolumny tej samej szerokości na całej szerokości szafki.
  const evenDividers = (n) => Array.from({ length: n }, (_, i) => Math.round((W * (i + 1)) / (n + 1) - th / 2));
  // Równe półki: równe przerwy w wysokim końcu wnętrza (pod skosem przy wysokim boku).
  const evenShelves = (n) => {
    const inner = g.under(W - th) - th;
    const gap = (inner - n * th) / (n + 1);
    return Array.from({ length: n }, (_, i) => Math.round(th + (i + 1) * gap + i * th));
  };

  document.getElementById('btn-slope-add-divider')?.addEventListener('click', () => {
    const list = [...(slope().dividers || [])];
    list.push(Math.round(W / 2 - th / 2));
    slope().dividers = list;
    refresh();
  });
  document.getElementById('btn-slope-add-shelf')?.addEventListener('click', () => {
    const list = [...(slope().shelves || [])];
    list.push(Math.round(H / 2));
    slope().shelves = list;
    refresh();
  });
  document.getElementById('btn-slope-even-dividers')?.addEventListener('click', () => {
    slope().dividers = evenDividers(Math.max(0, Math.round(num(document.getElementById('input-slope-div-count').value))));
    refresh();
  });
  document.getElementById('btn-slope-even-shelves')?.addEventListener('click', () => {
    slope().shelves = evenShelves(Math.max(0, Math.round(num(document.getElementById('input-slope-shelf-count').value))));
    refresh();
  });

  document.getElementById('btn-slope-delete')?.addEventListener('click', () => {
    deleteModule(mod.id);
    refresh();
  });
}
