// src/ui/cornerConfigModal.js
//
// Okno konfiguracji szafki narożnej - zbudowane jako samodzielny DOM-modal na
// wzór openRoomSettingsModal (ui/roomPanel.js). W przeciwieństwie do niego nie
// ma Zapisz/Anuluj - tak jak reszta aplikacji, edycje mutują state.project na
// żywo (patrz CLAUDE.md: "Update flow"), więc "Zamknij" to jedyny przycisk.
//
// Wymiary ramion (legA/legB/depthA/depthB/height, core/layout.js:
// getCornerDepths - depthA/depthB niezależne per ramię) są bound-based
// (core/layout.js: getCornerArmRect, resolveowane w recalculateLayout) -
// zmiana wymiaru tu NIE wymaga ręcznego przeliczenia zon frontów, tylko
// update3D() (który i tak woła recalculateAllLayouts) + odświeżenie obu
// edytorów wnętrza poniżej, żeby zobaczyć nowy układ.
import { escapeHtml } from "../utils/dom.js";
import { evalDimensionExpr } from "../utils/math.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { createZoneEditor } from "./interiorEditor.js";
import { generateCornerBlankSVG, generateCornerPartsDrawings } from "../render/viewer2d.js";
import { autoDistributeShelves } from "../core/shelfMath.js";
import { getCornerDepths } from "../core/layout.js";
import { state } from "../core/state.js";

export function openCornerConfigModal(mod) {
  const cornerFrontGap = parseFloat(mod.front?.gap ?? state.project.front?.gap) || 3;
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: '#fff', width: '95%', maxWidth: '900px', maxHeight: '92vh',
    overflowY: 'auto', borderRadius: '8px', padding: '20px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'sans-serif',
  });

  modal.innerHTML = `
    <h2 style="margin:0 0 4px 0; color:#1e293b; font-size:16px;">📐 Konfigurator szafki narożnej: <span style="color:#2563eb;">${escapeHtml(mod.name)}</span></h2>
    <div style="font-size:11px; color:#64748b; margin-bottom:14px;">Kąt prosty 90°, dwa ramiona. Kliknij wnękę w ramieniu, żeby ją podzielić albo obsadzić frontem - tak samo jak w edytorze wnętrza zwykłej szafki.</div>

    <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:12px; margin-bottom:14px;">
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Wykrój wieńca/półki narożnej — konfigurujesz głębokość każdego ramienia i wycięcie w rogu, tak jak przy realnym docinaniu na miejscu. Ramię A/B (wielkość wieńca) wylicza się z tych czterech liczb.</div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
        <div class="property-group" style="flex:1; min-width:150px;"><label>Głębokość ramienia A (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-depthA" value="${getCornerDepths(mod).depthA}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Głębokość ramienia B (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-depthB" value="${getCornerDepths(mod).depthB}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Wycięcie A (mm):</label><input type="text" inputmode="decimal" title="O tyle krótsze jest Ramię A przez narożnik. Można wpisać działanie, np. 400+18" id="input-corner-modal-cutA" value="${Math.round((parseFloat(mod.dimensions.width) || 0) - getCornerDepths(mod).depthB)}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Wycięcie B (mm):</label><input type="text" inputmode="decimal" title="O tyle krótsze jest Ramię B przez narożnik. Można wpisać działanie, np. 400+18" id="input-corner-modal-cutB" value="${Math.round((parseFloat(mod.dimensions.legB) || 0) - getCornerDepths(mod).depthA)}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Wysokość korpusu (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-height" value="${mod.dimensions.height}" /></div>
      </div>
      <div id="corner-blank-cutout-info" style="font-size:14px; color:#1e3a8a; font-weight:bold; margin-bottom:6px;"></div>
      <div id="corner-blank-preview" style="width:100%; max-width:520px; margin:0 auto;"></div>
    </div>

    <div style="margin-bottom:14px;">
      <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 4px 0;">Fronty w rogu — zakładka</h3>
      <div class="property-group" style="max-width:420px;"><label>Rodzaj frontów narożnika:</label><select id="input-corner-front-mode"><option value="separate" ${mod.cornerFrontMode !== 'bifold' ? 'selected' : ''}>Dwa oddzielne fronty (każdy na własnych zawiasach)</option><option value="bifold" ${mod.cornerFrontMode === 'bifold' ? 'selected' : ''}>Front łamany (dwa skrzydła, zawias 60°)</option></select></div>
      <div id="corner-front-mode-hint" style="font-size:11px; color:#64748b; margin-bottom:6px;"></div>
      <div id="corner-bifold-options" class="property-group" style="max-width:340px; display:${mod.cornerFrontMode === 'bifold' ? 'block' : 'none'};"><label>Luz w miejscu łamania (mm):</label><input type="number" step="0.5" id="input-corner-bifold-gap" value="${mod.cornerBifold?.breakGap ?? 2}" /></div>
      <div class="property-group" style="max-width:340px;"><label id="corner-front-primary-label">Który front zamyka się jako pierwszy (sięga do rogu):</label><select id="input-corner-front-primary"><option value="A" ${(!mod.cornerFrontOverlap || mod.cornerFrontOverlap.primaryArm !== 'B') ? 'selected' : ''}>Ramię A</option><option value="B" ${(mod.cornerFrontOverlap && mod.cornerFrontOverlap.primaryArm === 'B') ? 'selected' : ''}>Ramię B</option></select></div>
    </div>

    <div style="margin-bottom:14px;">
      <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 4px 0;">Plecy</h3>
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">Te same zasady co w zwykłej szafce - dotychczas narożnik zawsze liczył jak "nakładane", ignorując ten wybór.</div>
      <div class="property-group" style="max-width:300px;"><label>Typ pleców:</label><select id="input-corner-back-type"><option value="nakladane" ${(!mod.backPanel || mod.backPanel.type !== 'nut') ? 'selected' : ''}>Nakładane</option><option value="nut" ${(mod.backPanel && mod.backPanel.type === 'nut') ? 'selected' : ''}>W nucie</option></select></div>
      <div id="corner-nut-options" style="display:${(mod.backPanel && mod.backPanel.type === 'nut') ? 'block' : 'none'}; background:#f8fafc; padding:10px; border:1px dashed #cbd5e1; border-radius:4px; margin-top:6px; max-width:300px;">
        <div class="property-group" style="margin-bottom:8px;"><label style="font-size:11px; font-weight:bold;">Konstrukcja nutu:</label><select id="input-corner-nut-build"><option value="all" ${(!mod.backPanel?.nutBuild || mod.backPanel.nutBuild === 'all') ? 'selected' : ''}>Boki i wieńce nutowane</option><option value="sides" ${mod.backPanel?.nutBuild === 'sides' ? 'selected' : ''}>Boki nutowane, wieńce skracane</option><option value="top_bottom" ${mod.backPanel?.nutBuild === 'top_bottom' ? 'selected' : ''}>Wieńce nutowane, boki skracane</option></select></div>
        <div class="property-group" style="margin-bottom:0;"><label style="font-size:11px;">Głębokość nutu (mm):</label><input type="number" id="input-corner-nut-groove" value="${mod.backPanel?.grooveDepth ?? 6}" /></div>
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 4px 0;">Półki narożne (kształt L, na całą głębokość obu ramion)</h3>
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">W realnej szafce narożnej półka jest jedna, w kształcie L (jak wieniec górny/dolny) - nie dwie osobne, proste półki. Dlatego dodaje się je tutaj, wspólnie dla obu ramion, a nie osobno w każdym z nich.</div>
      <div id="corner-shelves-list"></div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;">
        <button type="button" id="btn-corner-add-shelf" class="btn btn-neutral btn-sm">+ Dodaj półkę narożną</button>
        <span style="font-size:11px; color:#475569;">lub rozmieść równo:</span>
        <input type="number" id="input-corner-even-count" min="1" max="10" value="3" style="width:60px;" />
        <button type="button" id="btn-corner-even-shelves" class="btn btn-neutral btn-sm">Rozmieść równo</button>
      </div>
      <div id="corner-shelf-holes" style="margin-top:10px;"></div>
    </div>

    <div style="display:flex; gap:14px; flex-wrap:wrap;">
      <div style="flex:1; min-width:280px;">
        <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 6px 0;">Ramię A</h3>
        <div id="corner-arm-a-container" style="position:relative; height:380px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; overflow:hidden;"></div>
      </div>
      <div style="flex:1; min-width:280px;">
        <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 6px 0;">Ramię B</h3>
        <div id="corner-arm-b-container" style="position:relative; height:380px; border:1px solid #cbd5e1; border-radius:6px; background:#f1f5f9; overflow:hidden;"></div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-top:16px;">
      <button type="button" id="btn-corner-modal-close" class="btn btn-primary btn-sm">Zamknij</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const armAContainer = modal.querySelector('#corner-arm-a-container');
  const armBContainer = modal.querySelector('#corner-arm-b-container');

  const armAEditor = createZoneEditor({ getContainer: () => armAContainer, getMod: () => mod, cornerArm: 'A' });
  const armBEditor = createZoneEditor({ getContainer: () => armBContainer, getMod: () => mod, cornerArm: 'B' });

  armAEditor.render();
  armBEditor.render();

  // Podgląd wykroju na żywo. Zgłoszona zmiana kierunku konfiguracji: zamiast
  // wpisywać Ramię A/B wprost i patrzeć na wyliczone wycięcie (jak wcześniej),
  // teraz KONFIGUROWALNE są głębokość + wycięcie każdego ramienia, a Ramię A/B
  // (rozmiar wieńca) jest WYNIKOWE - liczone jako suma:
  //   legA (Ramię A) = głębokość B + wycięcie A
  //   legB (Ramię B) = głębokość A + wycięcie B
  // (legA zależy od depthB, nie depthA - to drugie ramię fizycznie wyznacza,
  // gdzie zaczyna się wolny bieg ramienia A, patrz core/layout.js:
  // getCornerArmRect, komentarz przy otherDepth). mod.dimensions.width/legB
  // zostają jedynym źródłem prawdy dla reszty aplikacji (pozycjonowanie w
  // pokoju, lista modułów itd.) - tu tylko piszemy do nich wyliczoną wartość
  // zamiast czytać wprost z pola.
  const blankPreviewEl = modal.querySelector('#corner-blank-preview');
  const cutoutInfoEl = modal.querySelector('#corner-blank-cutout-info');

  function recomputeLegsFromDepthsAndCutouts() {
    const cutA = parseFloat(modal.querySelector('#input-corner-modal-cutA').value) || 0;
    const cutB = parseFloat(modal.querySelector('#input-corner-modal-cutB').value) || 0;
    const { depthA, depthB } = getCornerDepths(mod);
    mod.dimensions.width = Math.max(50, depthB + cutA);
    mod.dimensions.legB = Math.max(50, depthA + cutB);
  }

  function renderBlankPreview() {
    const legA = parseFloat(mod.dimensions.width) || 0;
    const legB = parseFloat(mod.dimensions.legB) || 0;
    const { depthA, depthB } = getCornerDepths(mod);
    const th = parseFloat(state.project.materials?.boardThickness) || 18;
    blankPreviewEl.innerHTML = generateCornerBlankSVG(legA, legB, depthA, depthB, th, null, {
      title: 'RZUT SZAFKI Z GÓRY', plain: true,
    });
    cutoutInfoEl.textContent = `Wynikowo: Ramię A = ${Math.round(legA)} mm, Ramię B = ${Math.round(legB)} mm`;
  }

  renderBlankPreview();

  // Półki narożne (typ:'poziom-narozny') - lista wysokości, wspólna dla obu
  // ramion (patrz komentarz w markupie wyżej i engine/cabinet.js:
  // getCornerCorpusParts / render/viewer3d.js: renderCornerCabinet). Nie
  // dotykają drzew BSP ramion (core/zoneTree.js filtruje po typ:'pion'/
  // 'poziom', więc ten typ jest dla nich niewidoczny) - dlatego zmiana tej
  // listy NIE wymaga odświeżenia armAEditor/armBEditor, tylko update3D().
  const shelvesListEl = modal.querySelector('#corner-shelves-list');
  const randomSuffix = () => Math.random().toString(36).slice(2, 6);

  function renderShelvesList() {
    const shelves = (mod.elements || [])
      .filter(el => el.typ === 'poziom-narozny')
      .sort((a, b) => (parseFloat(a.y) || 0) - (parseFloat(b.y) || 0));

    shelvesListEl.innerHTML = shelves.length === 0
      ? `<div style="font-size:11px; color:#94a3b8; font-style:italic;">Brak półek narożnych.</div>`
      : '';

    shelves.forEach(shelf => {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' });
      row.innerHTML = `
        <span style="font-size:11px; color:#475569; min-width:70px;">Wysokość od dołu:</span>
        <input type="number" step="1" value="${Math.round(parseFloat(shelf.y) || 0)}" style="width:90px;" />
        <span style="font-size:11px; color:#94a3b8;">mm</span>
        <button type="button" class="btn btn-danger btn-sm" style="padding:2px 8px;">🗑️</button>
      `;
      const input = row.querySelector('input');
      const delBtn = row.querySelector('button');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        shelf.y = v;
        update3D();
        updateSidebar();
      });
      delBtn.addEventListener('click', () => {
        mod.elements = mod.elements.filter(el => el !== shelf);
        update3D();
        updateSidebar();
        renderShelvesList();
      });
      shelvesListEl.appendChild(row);
    });
    renderShelfHoles();
  }

  const holesEl = modal.querySelector('#corner-shelf-holes');
  function renderShelfHoles() {
    holesEl.innerHTML = `<div style="font-size:12px; color:#475569; margin-bottom:2px;">Rysunki formatek szafki (widok z góry / z boku) - wymiary i nawierty jak w rysunkach zwykłych szafek.</div>${generateCornerPartsDrawings(mod)}`;
  }
  renderShelvesList();

  modal.querySelector('#btn-corner-even-shelves').addEventListener('click', () => {
    const count = Math.max(1, Math.min(10, parseInt(modal.querySelector('#input-corner-even-count').value, 10) || 1));
    const th = parseFloat(state.project.materials?.boardThickness) || 18;
    const height = parseFloat(mod.dimensions.height) || 720;
    // Zastępuje dotychczasowe półki narożne - "rozmieść równo N" ma dać
    // dokładnie N, nie doklejać do istniejących.
    mod.elements = (mod.elements || []).filter(el => el.typ !== 'poziom-narozny');
    autoDistributeShelves(height - th * 2, th, count).forEach(o => {
      mod.elements.push({
        id: 'poziom-narozny-' + Date.now() + '-' + randomSuffix(),
        typ: 'poziom-narozny',
        y: th + o.y,
        isStructural: false,
      });
    });
    update3D();
    updateSidebar();
    renderShelvesList();
  });

  modal.querySelector('#btn-corner-add-shelf').addEventListener('click', () => {
    const height = parseFloat(mod.dimensions.height) || 720;
    mod.elements.push({
      id: 'poziom-narozny-' + Date.now() + '-' + randomSuffix(),
      typ: 'poziom-narozny',
      y: Math.round(height / 2),
      isStructural: false,
    });
    update3D();
    updateSidebar();
    renderShelvesList();
  });

  const bindDim = (id, apply) => {
    const el = modal.querySelector(id);
    if (!el) return;
    // Pole tekstowe (nie number) - pozwala wpisać działanie, np. "400+18"
    // (patrz utils/math.js: evalDimensionExpr), tak samo jak reszta wymiarów
    // w aplikacji. Podczas pisania wyrażenie bywa chwilowo niepoprawne (np.
    // samo "400+") - wtedy NIE aktualizujemy wymiaru.
    el.addEventListener('input', e => {
      const val = evalDimensionExpr(e.target.value);
      if (val === null || Number.isNaN(val)) return;
      apply(val);
      recomputeLegsFromDepthsAndCutouts();
      update3D();
      updateSidebar();
      armAEditor.render();
      armBEditor.render();
      renderBlankPreview();
      renderShelfHoles();
    });
  };

  bindDim('#input-corner-modal-depthA', v => mod.dimensions.depth = v);
  bindDim('#input-corner-modal-depthB', v => mod.dimensions.depthB = v);
  bindDim('#input-corner-modal-cutA', () => {}); // legA przeliczany w recomputeLegsFromDepthsAndCutouts()
  bindDim('#input-corner-modal-cutB', () => {}); // legB przeliczany w recomputeLegsFromDepthsAndCutouts()

  const heightEl = modal.querySelector('#input-corner-modal-height');
  if (heightEl) heightEl.addEventListener('input', e => {
    const val = evalDimensionExpr(e.target.value);
    if (val === null || Number.isNaN(val)) return;
    mod.dimensions.height = val;
    update3D();
    updateSidebar();
    armAEditor.render();
    armBEditor.render();
    renderBlankPreview();
  });

  // Fronty w rogu - który front zamyka się jako pierwszy (core/layout.js:
  // applyCornerFrontOverlap, wołane automatycznie z recalculateLayout dla
  // każdego modułu narożnego).
  const frontModeEl = modal.querySelector('#input-corner-front-mode');
  const frontModeHintEl = modal.querySelector('#corner-front-mode-hint');
  const frontPrimaryLabelEl = modal.querySelector('#corner-front-primary-label');
  function renderFrontModeHint() {
    if (mod.cornerFrontMode === 'bifold') {
      const cR = parseFloat((mod.front?.clearance ?? state.project.front?.clearance ?? {}).right ?? (mod.front?.clearance ?? state.project.front?.clearance ?? {}).sides ?? 1.5) || 1.5;
      frontModeHintEl.textContent = `Front łamany: dwa skrzydła (po jednym na ramię) połączone zawiasem uzupełniającym CLIP top 60° (Blum 79T8500) - otwierają się razem. Skrzydło przy korpusie wisi na zawiasie 155°/170°, drugie tylko na zawiasie 60°. Wnęka = długość ramienia - głębokość drugiego ramienia - grubość płyty. Skrzydło przy korpusie = wnęka - ${cR} mm (luz od korpusu) - luz łamania; drugie skrzydło = wnęka - ${cR} mm - grubość frontu (chowa się za pierwszym).`;
      frontPrimaryLabelEl.textContent = 'Które skrzydło wisi na korpusie (sięga do rogu):';
    } else {
      frontModeHintEl.textContent = `Dwa oddzielne fronty nie mogą sięgać do samego naroża naraz (zderzyłyby się przy otwieraniu pod kątem 90°) - jeden zamyka się jako pierwszy i sięga niemal do rogu (luz ${cornerFrontGap} mm), drugi jako drugi i chowa się za nim (dodatkowo skrócony o grubość płyty).`;
      frontPrimaryLabelEl.textContent = 'Który front zamyka się jako pierwszy (sięga do rogu):';
    }
  }
  renderFrontModeHint();
  frontModeEl.addEventListener('change', e => {
    mod.cornerFrontMode = e.target.value === 'bifold' ? 'bifold' : 'separate';
    renderFrontModeHint();
    modal.querySelector('#corner-bifold-options').style.display = mod.cornerFrontMode === 'bifold' ? 'block' : 'none';
    update3D();
    updateSidebar();
    armAEditor.render();
    armBEditor.render();
  });
  modal.querySelector('#input-corner-bifold-gap').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    mod.cornerBifold = { breakGap: v };
    update3D();
    updateSidebar();
    armAEditor.render();
    armBEditor.render();
  });

  const frontPrimaryEl = modal.querySelector('#input-corner-front-primary');
  if (frontPrimaryEl) frontPrimaryEl.addEventListener('change', e => {
    mod.cornerFrontOverlap = { primaryArm: e.target.value };
    update3D();
    updateSidebar();
    armAEditor.render();
    armBEditor.render();
  });

  // Plecy: nakładane/nut - te same pola co w zwykłej szafce (ui/properties.js,
  // zakładka Konstrukcja), tylko bez "Odsunięcia nutu" (backP.offset) - to
  // pole steruje wyłącznie pozycją Z płyty w podglądzie 3D zwykłego modułu
  // (render/viewer3d.js), a szafka narożna na razie zawsze rysuje plecy
  // płasko/nakładane w 3D niezależnie od tego wyboru (dotyczy tylko
  // wymiarów formatki na liście, patrz engine/cabinet.js: getCornerCorpusParts).
  if (!mod.backPanel) mod.backPanel = { type: 'nakladane', grooveDepth: 6, clearance: 2, nutBuild: 'all' };
  const backTypeEl = modal.querySelector('#input-corner-back-type');
  const nutOptionsEl = modal.querySelector('#corner-nut-options');
  if (backTypeEl) backTypeEl.addEventListener('change', e => {
    mod.backPanel.type = e.target.value;
    if (nutOptionsEl) nutOptionsEl.style.display = e.target.value === 'nut' ? 'block' : 'none';
    update3D();
    updateSidebar();
  });
  const nutBuildEl = modal.querySelector('#input-corner-nut-build');
  if (nutBuildEl) nutBuildEl.addEventListener('change', e => {
    mod.backPanel.nutBuild = e.target.value;
    update3D();
    updateSidebar();
  });
  const nutGrooveEl = modal.querySelector('#input-corner-nut-groove');
  if (nutGrooveEl) nutGrooveEl.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;
    mod.backPanel.grooveDepth = val;
    update3D();
    updateSidebar();
  });

  const close = () => {
    document.body.removeChild(overlay);
    update3D();
    updateSidebar();
    initPropertiesPanel();
  };
  modal.querySelector('#btn-corner-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
