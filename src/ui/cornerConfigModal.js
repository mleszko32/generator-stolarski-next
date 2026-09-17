// src/ui/cornerConfigModal.js
//
// Okno konfiguracji szafki narożnej - zbudowane jako samodzielny DOM-modal na
// wzór openRoomSettingsModal (ui/roomPanel.js). W przeciwieństwie do niego nie
// ma Zapisz/Anuluj - tak jak reszta aplikacji, edycje mutują state.project na
// żywo (patrz CLAUDE.md: "Update flow"), więc "Zamknij" to jedyny przycisk.
//
// Wymiary ramion (legA/legB/depth/height) są bound-based (core/layout.js:
// getCornerArmRect, resolveowane w recalculateLayout) - zmiana wymiaru tu NIE
// wymaga ręcznego przeliczenia zon frontów, tylko update3D() (który i tak
// woła recalculateAllLayouts) + odświeżenie obu edytorów wnętrza poniżej,
// żeby zobaczyć nowy układ.
import { escapeHtml } from "../utils/dom.js";
import { evalDimensionExpr } from "../utils/math.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { createZoneEditor } from "./interiorEditor.js";
import { generateCornerBlankSVG } from "../render/viewer2d.js";

export function openCornerConfigModal(mod) {
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
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Wykrój wieńca/półki narożnej — wpisz wymiary blachy/płyty i wycięcia, tak jak przy realnym docinaniu.</div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
        <div class="property-group" style="flex:1; min-width:150px;"><label>Szerokość wieńca — Ramię A (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-legA" value="${mod.dimensions.width}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Wysokość wieńca — Ramię B (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-legB" value="${mod.dimensions.legB}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Głębokość ramion (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-depth" value="${mod.dimensions.depth}" /></div>
        <div class="property-group" style="flex:1; min-width:150px;"><label>Wysokość korpusu (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-corner-modal-height" value="${mod.dimensions.height}" /></div>
      </div>
      <div id="corner-blank-cutout-info" style="font-size:14px; color:#b91c1c; font-weight:bold; margin-bottom:6px;"></div>
      <div id="corner-blank-preview" style="width:100%; max-width:520px; margin:0 auto;"></div>
    </div>

    <div style="margin-bottom:14px;">
      <h3 style="font-size:13px; color:#1e3a8a; margin:0 0 4px 0;">Półki narożne (kształt L, na całą głębokość obu ramion)</h3>
      <div style="font-size:11px; color:#64748b; margin-bottom:6px;">W realnej szafce narożnej półka jest jedna, w kształcie L (jak wieniec górny/dolny) - nie dwie osobne, proste półki. Dlatego dodaje się je tutaj, wspólnie dla obu ramion, a nie osobno w każdym z nich.</div>
      <div id="corner-shelves-list"></div>
      <button type="button" id="btn-corner-add-shelf" class="btn btn-neutral btn-sm" style="margin-top:6px;">+ Dodaj półkę narożną</button>
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

  // Podgląd wykroju na żywo - te same 3 liczby (legA/legB/depth), które
  // sterują polami wyżej, w pełni określają kształt L (patrz
  // render/viewer2d.js: generateCornerBlankSVG - ten sam generator, którego
  // używa "📄 Wykrój narożny" w ui/properties.js do druku). "Wycięcie" nie
  // jest osobnym, niezależnym polem - to policzony (legA-depth)×(legB-depth)
  // róg, pokazany tu jako informacja zwrotna, żeby było widać efekt wpisanych
  // wymiarów tak samo, jak na wydrukowanym wykroju.
  const blankPreviewEl = modal.querySelector('#corner-blank-preview');
  const cutoutInfoEl = modal.querySelector('#corner-blank-cutout-info');

  function renderBlankPreview() {
    const legA = parseFloat(mod.dimensions.width) || 0;
    const legB = parseFloat(mod.dimensions.legB) || 0;
    const depth = parseFloat(mod.dimensions.depth) || 0;
    blankPreviewEl.innerHTML = generateCornerBlankSVG(legA, legB, depth);
    const cutW = legA - depth;
    const cutH = legB - depth;
    cutoutInfoEl.textContent = (cutW > 0 && cutH > 0)
      ? `Wycięcie (róg do odcięcia): ${Math.round(cutW)} × ${Math.round(cutH)} mm`
      : '';
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
  }

  renderShelvesList();

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
      update3D();
      updateSidebar();
      armAEditor.render();
      armBEditor.render();
      renderBlankPreview();
    });
  };

  bindDim('#input-corner-modal-legA', v => mod.dimensions.width = v);
  bindDim('#input-corner-modal-legB', v => mod.dimensions.legB = v);
  bindDim('#input-corner-modal-depth', v => mod.dimensions.depth = v);
  bindDim('#input-corner-modal-height', v => mod.dimensions.height = v);

  const close = () => {
    document.body.removeChild(overlay);
    update3D();
    updateSidebar();
    initPropertiesPanel();
  };
  modal.querySelector('#btn-corner-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
