// src/ui/slopeProperties.js
//
// Prawy panel dla szafki pod skos (mod.type === 'slope_cabinet'): wymiary, strona
// skosu, fronty i szuflady, pozycja - w tych samych zwijanych sekcjach co zwykła
// szafka (ui/propertiesShell.js). Wnętrze (przegrody, półki, fronty, szuflady)
// ustawia się w zwykłym edytorze "Wnętrze 2D" - tak jak w każdej szafce.
// Geometria i formatki: core/slopeCabinet.js.
import { state } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel, computeOverridden } from "./properties.js";
import { propHeaderHtml, sectionHtml, bindSections, positionRotationHtml, bindModulePosition } from "./propertiesShell.js";
import { toggleInteriorEditor } from "./interiorEditor.js";
import { escapeHtml } from "../utils/dom.js";
import { round1, evalDimensionExpr } from "../utils/math.js";
import { getSlopeGeometry, getSlopeSettings, getSlopeFronts, getSlopeFrontSettings } from "../core/slopeCabinet.js";
import { recalculateLayout } from "../core/layout.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { openSlopeCutDrawings } from "./slopeCutDrawings.js";
import { drawerCardsHtml, bindDrawerCards } from "./drawerSettings.js";

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
  const overridden = computeOverridden(mod);

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
  const frontById = (id) => fronts.find((fr) => fr.el.id === id);
  const frontRows = fronts.map((fr, i) => `
      <div class="prop-box mb-8">
        <div class="fs-xs" style="font-weight:600;">${i + 1}. ${SUBTYPE_LABELS[fr.subtype] || 'Front'} → ${TYPE_LABELS[fr.type]} <span class="hint">· ${escapeHtml(fr.text)}</span></div>
        <select class="input-slope-front-kind" data-front-id="${fr.el.id}">
          <option value="auto" ${!fr.el.slopeBlenda ? 'selected' : ''}>Auto (${TYPE_LABELS[fr.auto]})</option>
          <option value="blenda" ${fr.el.slopeBlenda ? 'selected' : ''}>Blenda (stała maskownica)</option>
        </select>
        ${drawerInfo(fr)}
      </div>`).join('');

  rightSidebar.innerHTML = `
    ${propHeaderHtml({ name: mod.name, dims: `${d.width}×${d.height}×${d.depth}`, extra: 'pod skos', nameId: 'input-slope-name' })}

    <button type="button" id="btn-slope-interior" class="btn btn-block btn-primary mb-8"><i class="ti ti-layout-grid" aria-hidden="true"></i> Edytuj wnętrze (Wnętrze 2D)</button>
    <button type="button" id="btn-slope-cut-drawings" class="btn btn-block btn-sm mb-8"><i class="ti ti-file-text" aria-hidden="true"></i> Rysunki cięcia i nawiertów</button>
    <div class="hint mb-8">Przegrody, półki, szuflady i drzwi dodajesz w edytorze Wnętrze 2D jak w zwykłej szafce. Skos sam przycina półki, przegrody i fronty; front, który wychodzi trójkątem, staje się blendą.</div>

    ${sectionHtml('wymiary', `
      <h3>Wymiary Modułu</h3>
      <div class="property-group"><label>Szerokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-slope-width" value="${d.width}" /></div>
      <div class="property-group"><label>Wysokość — wysoka strona (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-slope-height" value="${d.height}" /></div>
      <div class="property-group"><label>Wysokość — niska strona (mm, 0 = trójkąt):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-slope-low" value="${s.lowHeight || 0}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-slope-depth" value="${d.depth}" /></div>
      ${(parseFloat(s.lowHeight) || 0) > 0 && g.isTriangle ? `<div class="notice-warn fs-xs mb-8">Niska strona jest za niska na bok — szafka liczona jako trójkąt.</div>` : ''}

      <h3>Niska strona skosu</h3>
      <div class="property-group seg">
        <button type="button" class="seg-btn btn-slope-side${g.lowSide === 'left' ? ' active' : ''}" data-side="left">Po lewej</button>
        <button type="button" class="seg-btn btn-slope-side${g.lowSide === 'right' ? ' active' : ''}" data-side="right">Po prawej</button>
      </div>
      <div class="hint">Kąt skosu: <b>${round1(g.angle)}°</b> · ${g.isTriangle ? 'trójkąt' : 'trapez'} · dno nakładane</div>

      <hr class="divider">

      ${positionRotationHtml({ prefix: 'input-slope-pos', position: mod.position, rotation: mod.rotation, rotClass: 'btn-slope-rotate' })}
    `)}

    ${sectionHtml('front', `
      <h3>Ustawienia Frontów</h3>
      <div class="property-group"><label>Typ frontów:</label>
        <select id="input-slope-front-type">
          <option value="nakladane" ${!fs.isInset ? 'selected' : ''}>Nakładane</option>
          <option value="wpuszczane" ${fs.isInset ? 'selected' : ''}>Wpuszczane</option>
        </select>
      </div>
      <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" step="0.5" class="input-slope-clr" data-key="gap" value="${fs.gap}" /></div>
      <div class="property-group"><label>Luz lewy (mm):</label><input type="number" step="0.5" class="input-slope-clr" data-key="left" value="${fs.cLeft}" /></div>
      <div class="property-group"><label>Luz prawy (mm):</label><input type="number" step="0.5" class="input-slope-clr" data-key="right" value="${fs.cRight}" /></div>
      <div class="property-group"><label>Luz dół (mm):</label><input type="number" step="0.5" class="input-slope-clr" data-key="bottom" value="${fs.cBottom}" /></div>
      <div class="property-group"><label>Luz pod skosem (mm):</label><input type="number" step="0.5" class="input-slope-clr" data-key="slope" value="${fs.cSlope}" /></div>
      <div class="hint mb-8">Luzy działają jak w zwykłej szafce (${fs.isInset ? 'wpuszczane: od wewnętrznych ścian korpusu' : `nakładane: od zewnętrznej krawędzi korpusu — wpisz ${th}, żeby odsłonić bok`}). Luz pod skosem mierzony prostopadle do skośnej płyty; płyta zostaje widoczna.</div>

      <h3>Fronty we wnętrzu</h3>
      ${frontRows || '<div class="empty-note">Brak frontów — dodaj szuflady albo drzwi w edytorze Wnętrze 2D.</div>'}
    `, overridden.front)}

    ${sectionHtml('szuflady', `
      <h3>Ustawienia Szuflad</h3>
      <div class="property-group">
        <label>System szuflad:</label>
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

      <h3>Szuflady — ustawienia ręczne</h3>
      ${drawerCardsHtml(mod, {
        // Skrzynka liczona pod skosem (core/slopeCabinet.js), nie jak w prostokątnej szafce.
        sideInfo: (front) => {
          const dr = frontById(front.id)?.drawer;
          if (!dr) return { maxH: '' };
          const warn = !dr.fits
            ? '<div class="notice-warn fs-xs">Za mało miejsca na szufladę MOVENTO w tej wnęce.</div>'
            : (dr.clamped ? `<div class="notice-warn fs-xs">Wpisana wysokość się nie mieści — użyto ${dr.boxType === 'B' ? dr.box.sideHigh : dr.comps.sideHeight} mm.</div>` : '');
          return { maxH: dr.maxSide ?? '', warn };
        },
        extraHtml: (front) => {
          const fr = frontById(front.id);
          if (!fr) return '';
          if (fr.type !== 'szuflada') return `<div class="notice-warn fs-xs mb-8">Ten front liczony jest jako ${TYPE_LABELS[fr.type].toLowerCase()} — skrzynki tu nie ma.</div>`;
          return `<div class="mb-8">${drawerInfo(fr)}</div>`;
        },
      })}
    `, overridden.szuflady)}
  `;
  bindSections(rightSidebar);
  bindDrawerCards(rightSidebar, mod, () => { update3D(); updateSidebar(); initPropertiesPanel(); });

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
  // Wymiary jak w zwykłej szafce: można wpisać działanie (np. 400+18); niepoprawne pomija.
  const onDim = (id, apply) => onChange(id, (v) => { const n = evalDimensionExpr(v); if (Number.isFinite(n)) apply(n); });
  onDim('input-slope-width', (v) => { mod.dimensions.width = Math.max(200, v); });
  onDim('input-slope-height', (v) => { mod.dimensions.height = Math.max(200, v); });
  onDim('input-slope-low', (v) => { saveSlope({ lowHeight: Math.max(0, Math.min(v, num(mod.dimensions.height) - 1)) }); });
  onDim('input-slope-depth', (v) => { mod.dimensions.depth = Math.max(100, v); });
  bindModulePosition(rightSidebar, mod, {
    prefix: 'input-slope-pos', rotClass: 'btn-slope-rotate',
    onChange: () => { update3D(); updateSidebar(); }, rerender: initPropertiesPanel,
  });

  // Zmiana strony skosu odbija też wnętrze w poziomie, żeby wnęki szły za skosem.
  rightSidebar.querySelectorAll('.btn-slope-side').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.side === g.lowSide) return;
    mirrorSlopeInterior(mod);
    saveSlope({ lowSide: btn.dataset.side });
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

  // --- Szuflady ---
  document.getElementById('input-slope-drawer-system')?.addEventListener('change', (e) => {
    mod.front = { ...(mod.front || {}), drawerSystem: e.target.value };
    refresh();
  });
  rightSidebar.querySelectorAll('.btn-slope-box').forEach((btn) => btn.addEventListener('click', () => {
    saveSlope({ drawerBox: btn.dataset.box });
    refresh();
  }));
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
