// src/ui/slopeProperties.js
//
// Prawy panel dla szafki pod skos (mod.type === 'slope_cabinet'): wymiary, strona
// skosu, fronty i szuflady, pozycja. Wnętrze (przegrody, półki, fronty, szuflady)
// ustawia się w zwykłym edytorze "Wnętrze 2D" - tak jak w każdej szafce.
// Geometria i formatki: core/slopeCabinet.js.
import { state, deleteModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { toggleInteriorEditor } from "./interiorEditor.js";
import { escapeHtml } from "../utils/dom.js";
import { round1 } from "../utils/math.js";
import { getSlopeGeometry, getSlopeSettings, getSlopeFronts, getSlopeFrontSettings } from "../core/slopeCabinet.js";
import { recalculateLayout } from "../core/layout.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { openSlopeCutDrawings } from "./slopeCutDrawings.js";

const TYPE_LABELS = { szuflada: 'Szuflada', drzwi: 'Drzwi', blenda: 'Blenda', brak: 'Brak (za mały)' };
const SUBTYPE_LABELS = { szuflada: 'Szuflada', 'szuflada-wewnetrzna': 'Szuflada wewn.', drzwi: 'Drzwi', 'drzwi-lp': 'Drzwi' };

export function renderSlopeModuleProperties(rightSidebar, mod) {
  const th = parseFloat(state.project.materials?.boardThickness) || 18;
  const s = getSlopeSettings(mod);
  const g = getSlopeGeometry(mod, th);
  const d = mod.dimensions;
  const fs = getSlopeFrontSettings(mod, state.project);
  const frontCfg = { ...(state.project.front || {}), ...(mod.front || {}) };
  const sysId = String(frontCfg.drawerSystem || 'merivobox').toLowerCase();
  const system = drawerSystems[sysId];
  const boxType = s.drawerBox === 'B' ? 'B' : 'A';

  // Fronty z wnętrza (po przeliczeniu układu) - od lewej, od dołu.
  recalculateLayout(mod);
  const fronts = getSlopeFronts(mod, state.project)
    .slice().sort((a, b) => (parseFloat(a.el.x) || 0) - (parseFloat(b.el.x) || 0) || (parseFloat(a.el.y) || 0) - (parseFloat(b.el.y) || 0));
  const drawerInfo = (fr) => {
    if (fr.type !== 'szuflada') {
      if (fr.auto === 'blenda' && (fr.subtype || '').includes('szuflada') && fr.shape.kind !== 'trojkat') {
        return '<div class="notice-warn fs-xs">Szuflada się tu nie mieści — liczona jako blenda.</div>';
      }
      return '';
    }
    const dr = fr.drawer;
    if (!dr) return '<div class="notice-warn fs-xs">Nieznany system szuflad.</div>';
    const c = dr.comps;
    const h = dr.boxType === 'B'
      ? `boki ${dr.box.sideLow}/${dr.box.sideHigh} mm`
      : (c.woodenBox ? `bok ${c.sideHeight} mm` : `wariant ${c.back.variantType}`);
    return `<div class="hint">Skrzynka ${dr.boxType}: NL ${c.nominalLength}, ${h}</div>`;
  };
  const frontRows = fronts.map((fr, i) => `
      <div class="prop-box mb-8">
        <div class="fs-xs" style="font-weight:600;">${i + 1}. ${SUBTYPE_LABELS[fr.subtype] || 'Front'} → ${TYPE_LABELS[fr.type]} <span class="hint">· ${escapeHtml(fr.text)}</span></div>
        <select class="input-slope-front-kind" data-front-id="${fr.el.id}">
          <option value="auto" ${!fr.el.slopeBlenda ? 'selected' : ''}>Auto (${TYPE_LABELS[fr.auto]})</option>
          <option value="blenda" ${fr.el.slopeBlenda ? 'selected' : ''}>Blenda (stała maskownica)</option>
        </select>
        ${system && system.woodenBox && fr.type === 'szuflada' && fr.drawer ? `
        <div class="property-group mt-8"><label class="fs-xs">Wysokość boku szuflady [mm]:</label>
          <input type="number" class="input-slope-side-height" data-front-id="${fr.el.id}" placeholder="Auto (maks. ${fr.drawer.maxSide})" value="${fr.el.drawerSideHeight || ''}" />
          ${fr.drawer.clamped ? `<div class="notice-warn fs-xs">Wpisana wysokość się nie mieści — użyto ${fr.drawer.boxType === 'B' ? fr.drawer.box.sideHigh : fr.drawer.comps.sideHeight} mm.</div>` : ''}
        </div>` : ''}
        ${drawerInfo(fr)}
      </div>`).join('');

  rightSidebar.innerHTML = `
    <h2>Szafka pod skos</h2>
    <div class="property-group prop-box">
      <label style="font-weight: 600;">Nazwa szafki:</label>
      <input type="text" id="input-slope-name" value="${escapeHtml(mod.name)}" style="font-weight: 600;" />
    </div>

    <button type="button" id="btn-slope-interior" class="btn btn-block btn-primary mb-8"><i class="ti ti-layout-grid" aria-hidden="true"></i> Edytuj wnętrze (Wnętrze 2D)</button>
    <button type="button" id="btn-slope-cut-drawings" class="btn btn-block btn-sm mb-8"><i class="ti ti-file-text" aria-hidden="true"></i> Rysunki cięcia i nawiertów</button>
    <div class="hint mb-8">Przegrody, półki, szuflady i drzwi dodajesz w edytorze Wnętrze 2D jak w zwykłej szafce. Skos sam przycina półki, przegrody i fronty; front, który wychodzi trójkątem, staje się blendą.</div>

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

    <h3>Fronty</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Typ frontów:</label>
        <select id="input-slope-front-type">
          <option value="nakladane" ${!fs.isInset ? 'selected' : ''}>Nakładane</option>
          <option value="wpuszczane" ${fs.isInset ? 'selected' : ''}>Wpuszczane</option>
        </select>
      </div>
      <div class="mb-8"><label class="fs-xs">Przerwa między frontami [mm]:</label><input type="number" step="0.5" class="input-slope-clr" data-key="gap" value="${fs.gap}" /></div>
      <div class="row mb-8">
        <div class="property-group grow"><label class="fs-xs">Luz lewy [mm]:</label><input type="number" step="0.5" class="input-slope-clr" data-key="left" value="${fs.cLeft}" /></div>
        <div class="property-group grow"><label class="fs-xs">Luz prawy [mm]:</label><input type="number" step="0.5" class="input-slope-clr" data-key="right" value="${fs.cRight}" /></div>
      </div>
      <div class="row">
        <div class="property-group grow"><label class="fs-xs">Luz dół [mm]:</label><input type="number" step="0.5" class="input-slope-clr" data-key="bottom" value="${fs.cBottom}" /></div>
        <div class="property-group grow"><label class="fs-xs">Luz pod skosem [mm]:</label><input type="number" step="0.5" class="input-slope-clr" data-key="slope" value="${fs.cSlope}" /></div>
      </div>
    </div>
    <div class="hint mb-8">Luzy działają jak w zwykłej szafce (${fs.isInset ? 'wpuszczane: od wewnętrznych ścian korpusu' : `nakładane: od zewnętrznej krawędzi korpusu — wpisz ${th}, żeby odsłonić bok`}). Luz pod skosem mierzony prostopadle do skośnej płyty; płyta zostaje widoczna.</div>

    <h3>Szuflady</h3>
    <div class="property-group mb-8">
      <label class="fs-xs">System szuflad:</label>
      <select id="input-slope-drawer-system">
        ${Object.entries(drawerSystems).map(([id, sys]) => `<option value="${id}" ${id === sysId ? 'selected' : ''}>${escapeHtml(sys.name)}</option>`).join('')}
      </select>
    </div>
    <label class="fs-xs">Skrzynka szuflady pod skosem:</label>
    <div class="property-group seg">
      <button type="button" class="seg-btn btn-slope-box${boxType === 'A' ? ' active' : ''}" data-box="A">A — prostokątna</button>
      <button type="button" class="seg-btn btn-slope-box${boxType === 'B' ? ' active' : ''}" data-box="B">B — ścięta pod skos</button>
    </div>
    <div class="hint mb-8">${boxType === 'A'
      ? 'Skrzynka prostokątna, wysokość od niższej strony pod skosem. Działa z każdym systemem.'
      : 'Boki różnej wysokości, tył i czoło wewnętrzne jako trapez — więcej miejsca w szufladzie.'}</div>
    ${boxType === 'B' && !(system && system.woodenBox) ? `<div class="notice-warn fs-xs mb-8">Skrzynka B wymaga szuflady drewnianej (np. Blum MOVENTO). Przy tym systemie liczona jest skrzynka A.</div>` : ''}

    <h3>Fronty we wnętrzu</h3>
    ${frontRows || '<div class="empty-note">Brak frontów — dodaj szuflady albo drzwi w edytorze Wnętrze 2D.</div>'}

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

  const saveSlope = (patch) => { mod.slope = { ...(mod.slope || {}), ...patch }; };
  // Zmiana struktury - przerysuj też panel (kąt, ostrzeżenia, lista frontów).
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
  const findFront = (id) => (mod.elements || []).find((el) => el.id === id);

  document.getElementById('btn-slope-interior')?.addEventListener('click', () => toggleInteriorEditor());
  document.getElementById('btn-slope-cut-drawings')?.addEventListener('click', () => openSlopeCutDrawings(mod));

  onInput('input-slope-name', (v) => { mod.name = v; });
  onChange('input-slope-width', (v) => { mod.dimensions.width = Math.max(200, num(v)); });
  onChange('input-slope-height', (v) => { mod.dimensions.height = Math.max(200, num(v)); });
  onChange('input-slope-low', (v) => { saveSlope({ lowHeight: Math.max(0, Math.min(num(v), num(mod.dimensions.height) - 1)) }); });
  onChange('input-slope-depth', (v) => { mod.dimensions.depth = Math.max(100, num(v)); });
  onInput('input-slope-pos-x', (v) => { mod.position.x = num(v); });
  onInput('input-slope-pos-z', (v) => { mod.position.z = num(v); });
  onInput('input-slope-pos-y', (v) => { mod.position.y = num(v); });

  // Zmiana strony skosu odbija też wnętrze w poziomie, żeby wnęki szły za skosem.
  rightSidebar.querySelectorAll('.btn-slope-side').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.side === g.lowSide) return;
    mirrorSlopeInterior(mod);
    saveSlope({ lowSide: btn.dataset.side });
    refresh();
  }));
  rightSidebar.querySelectorAll('.btn-slope-rotate').forEach((btn) => btn.addEventListener('click', () => {
    mod.rotation = parseInt(btn.dataset.rot, 10);
    refresh();
  }));

  // --- Fronty (luzy jak w zwykłej szafce: mod.front.gap i mod.front.clearance.*) ---
  document.getElementById('input-slope-front-type')?.addEventListener('change', (e) => {
    mod.front = { ...(mod.front || {}), type: e.target.value };
    refresh();
  });
  rightSidebar.querySelectorAll('.input-slope-clr').forEach((inp) => inp.addEventListener('change', (e) => {
    const v = Math.max(0, num(e.target.value));
    mod.front = { ...(mod.front || {}) };
    if (inp.dataset.key === 'gap') mod.front.gap = v;
    else mod.front.clearance = { ...(mod.front.clearance || {}), [inp.dataset.key]: v };
    refresh();
  }));
  rightSidebar.querySelectorAll('.input-slope-front-kind').forEach((sel) => sel.addEventListener('change', (e) => {
    const el = findFront(sel.dataset.frontId);
    if (el) { if (e.target.value === 'blenda') el.slopeBlenda = true; else delete el.slopeBlenda; }
    refresh();
  }));
  rightSidebar.querySelectorAll('.input-slope-side-height').forEach((inp) => inp.addEventListener('change', (e) => {
    const el = findFront(inp.dataset.frontId);
    const v = e.target.value === '' ? null : num(e.target.value);
    if (el) el.drawerSideHeight = v && v > 0 ? v : null;
    refresh();
  }));

  // --- Szuflady ---
  document.getElementById('input-slope-drawer-system')?.addEventListener('change', (e) => {
    mod.front = { ...(mod.front || {}), drawerSystem: e.target.value };
    refresh();
  });
  rightSidebar.querySelectorAll('.btn-slope-box').forEach((btn) => btn.addEventListener('click', () => {
    saveSlope({ drawerBox: btn.dataset.box });
    refresh();
  }));

  document.getElementById('btn-slope-delete')?.addEventListener('click', () => {
    deleteModule(mod.id);
    refresh();
  });
}

// Odbicie wnętrza w poziomie (zmiana strony skosu): przegrody, półki i wnęki
// frontów; lewa/prawa granica cab-* zamieniają się miejscami, drzwi zmieniają stronę zawiasów.
function mirrorSlopeInterior(mod) {
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const W = num(mod.dimensions.width);
  const swap = { 'cab-left': 'cab-right', 'cab-right': 'cab-left' };
  (mod.elements || []).forEach((el) => {
    if (el.typ === 'pion' || el.typ === 'poziom') el.x = W - (num(el.x) + num(el.w));
    const bz = el.baseZone;
    if (bz) {
      const minX = num(bz.minX), maxX = num(bz.maxX);
      bz.minX = W - maxX; bz.maxX = W - minX;
      const l = bz.boundLeft, r = bz.boundRight;
      bz.boundLeft = swap[r] || r; bz.boundRight = swap[l] || l;
    }
    if (el.subtype === 'drzwi') el.openingSide = (el.openingSide || 'left') === 'left' ? 'right' : 'left';
  });
}
