// src/ui/sidePanelProperties.js
//
// Prawy panel dla boku dokładanego i blendy (project.sidePanels) - wydzielony z
// ui/properties.js, który woła renderSidePanelProperties() zamiast formularza szafki.
import { state, deleteSidePanel } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { escapeHtml } from "../utils/dom.js";
import { showCustomDialog } from "../core/storage.js";
import { initPropertiesPanel } from "./properties.js";

// Bok dokładany (core/state.js: addSidePanel) - samodzielny obiekt projektu,
// nie właściwość modułu, więc dostaje osobny, krótki formularz zamiast
// całego "Parametry szafki" (zakładki front/szuflady/konstrukcja/zawiasy nie
// mają tu zastosowania - to tylko płaska, dekoracyjna płyta).
// Wspólny wybór materiału (ten sam katalog co front.materialId, patrz
// .input-front-material niżej) dla blendy/boku dokładanego - to zwykle ten
// sam, droższy dekor co fronty, więc korzysta z tego samego cennika zamiast
// dublować go osobno dla "Front" w kosztorysie (engine/cabinet.js:
// resolveFrontMaterial obsługuje panel.materialId tak samo jak front.materialId).
function materialSelectHtml(panel) {
  const mats = state.project.pricing?.frontMaterials || [];
  return `
    <div class="property-group">
      <label>Materiał (cennik frontów):</label>
      <select id="input-side-material">
        ${mats.map((mat, i) => `<option value="${escapeHtml(mat.id)}" ${(panel.materialId ? panel.materialId === mat.id : i === 0) ? 'selected' : ''}>${escapeHtml(mat.name)}</option>`).join('')}
        <option value="__new__">+ Nowy materiał…</option>
      </select>
    </div>
  `;
}

function renderBlendaProperties(rightSidebar, panel) {
  const flanges = [['prawa', 'Z prawej strony czoła'], ['lewa', 'Z lewej strony czoła'], ['gora', 'Przy górnej krawędzi'], ['dol', 'Przy dolnej krawędzi'], ['brak', 'Bez kołnierza']];
  rightSidebar.innerHTML = `
    <h2>Parametry blendy</h2>
    <div class="property-group prop-box">
      <label style="font-weight: 600;">Nazwa:</label>
      <input type="text" id="input-side-name" value="${escapeHtml(panel.name || '')}" style="font-weight: 600;" />
    </div>
    <div class="property-group">
      <label>Dekor (opis do formatki):</label>
      <input type="text" id="input-side-decor" value="${escapeHtml(panel.decor || '')}" placeholder="np. Front biały połysk" />
    </div>
    ${materialSelectHtml(panel)}

    <h3>Wymiary</h3>
    <div class="property-group"><label>Szerokość czoła (mm):</label><input type="number" id="input-side-width" value="${panel.dimensions.width}" /></div>
    <div class="property-group"><label>Wysokość (mm):</label><input type="number" id="input-side-height" value="${panel.dimensions.height}" /></div>
    <div class="property-group"><label>Głębokość z mocowaniem (mm):</label><input type="number" id="input-side-depth" value="${panel.dimensions.depth}" /></div>
    <div class="property-group"><label>Kołnierz mocujący do szafki:</label>
      <select id="input-blenda-flange">${flanges.map(([v, l]) => `<option value="${v}" ${(panel.flange || 'prawa') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="hint">Czoło jest z przodu (dekor frontów), kołnierz to płyta korpusu za nim. Górną blendę zrób szerokością na całą zabudowę i kołnierzem przy dolnej krawędzi.</div>

    <hr class="divider">

    <h3>Pozycja w przestrzeni (3D)</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-side-pos-x" value="${panel.position.x}" /></div>
      <div class="mb-8"><label class="fs-xs">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-side-pos-z" value="${panel.position.z || 0}" /></div>
      <div><label class="fs-xs">Wysokość dołu od podłogi (Y) [mm]:</label><input type="number" id="input-side-pos-y" value="${panel.position.y || 0}" /></div>
    </div>
    <div class="hint">Przeciągnij blendę myszą w widoku 3D - przyciągnie się do boku szafki. Przy szafce na nóżkach dół blendy jest zwykle na wysokości nóżek (Y = 100).</div>

    <h3>Obrót (co 90°)</h3>
    <div class="property-group seg">
      ${[0, 90, 180, 270].map(rot => {
          const active = (panel.rotation || 0) === rot;
          return `<button type="button" class="seg-btn btn-side-rotate${active ? ' active' : ''}" data-rot="${rot}">${rot}°</button>`;
      }).join('')}
    </div>
    <div class="hint">0° = czoło zwrócone do przodu pokoju (jak szafka nieobrócona).</div>

    <hr class="divider">
    <button type="button" id="btn-side-delete" class="btn btn-danger btn-block btn-sm"><i class="ti ti-trash" aria-hidden="true"></i> Usuń blendę</button>
  `;
  bindSidePanelInputs(rightSidebar, panel);
  const flangeSel = document.getElementById('input-blenda-flange');
  if (flangeSel) flangeSel.addEventListener('change', (e) => { panel.flange = e.target.value; update3D(); updateSidebar(); });
}

export function renderSidePanelProperties(rightSidebar, panel) {
  if (panel.kind === 'blenda') { renderBlendaProperties(rightSidebar, panel); return; }
  rightSidebar.innerHTML = `
    <h2>Parametry boku dokładanego</h2>
    <div class="property-group prop-box">
      <label style="font-weight: 600;">Nazwa:</label>
      <input type="text" id="input-side-name" value="${escapeHtml(panel.name || '')}" style="font-weight: 600;" />
    </div>
    <div class="property-group">
      <label>Dekor (opis do formatki):</label>
      <input type="text" id="input-side-decor" value="${escapeHtml(panel.decor || '')}" placeholder="np. Front biały połysk" />
    </div>
    ${materialSelectHtml(panel)}

    <h3>Wymiary</h3>
    <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-side-width" value="${panel.dimensions.width}" /></div>
    <div class="property-group"><label>Wysokość (mm):</label><input type="number" id="input-side-height" value="${panel.dimensions.height}" /></div>
    <div class="property-group"><label>Głębokość (mm):</label><input type="number" id="input-side-depth" value="${panel.dimensions.depth}" /></div>

    <hr class="divider">

    <h3>Pozycja w przestrzeni (3D)</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-side-pos-x" value="${panel.position.x}" /></div>
      <div class="mb-8"><label class="fs-xs">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-side-pos-z" value="${panel.position.z || 0}" /></div>
      <div><label class="fs-xs">Wysokość startu od podłogi (Y) [mm]:</label><input type="number" id="input-side-pos-y" value="${panel.position.y || 0}" /></div>
    </div>
    <div class="hint">Domyślnie Y=0 i wysokość = wysokość pomieszczenia, żeby bok sięgał od podłogi do sufitu niezależnie od modułów za nim.</div>

    <h3>Obrót (co 90°)</h3>
    <div class="property-group seg">
      ${[0, 90, 180, 270].map(rot => {
          const active = (panel.rotation || 0) === rot;
          return `<button type="button" class="seg-btn btn-side-rotate${active ? ' active' : ''}" data-rot="${rot}">${rot}°</button>`;
      }).join('')}
    </div>

    <hr class="divider">
    <button type="button" id="btn-side-delete" class="btn btn-danger btn-block btn-sm"><i class="ti ti-trash" aria-hidden="true"></i> Usuń bok dokładany</button>
  `;

  bindSidePanelInputs(rightSidebar, panel);
}

// Pola wspólne dla boku dokładanego i blendy (nazwa, dekor, wymiary, pozycja, obrót, usuń).
function bindSidePanelInputs(rightSidebar, panel) {
  const bindText = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { apply(e.target.value); update3D(); updateSidebar(); });
  };
  const bindNumber = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { apply(parseFloat(e.target.value) || 0); update3D(); updateSidebar(); });
  };

  bindText('input-side-name', v => panel.name = v);
  bindText('input-side-decor', v => panel.decor = v);
  bindNumber('input-side-width', v => panel.dimensions.width = v);
  bindNumber('input-side-height', v => panel.dimensions.height = v);
  bindNumber('input-side-depth', v => panel.dimensions.depth = v);
  bindNumber('input-side-pos-x', v => panel.position.x = v);
  bindNumber('input-side-pos-z', v => panel.position.z = v);
  bindNumber('input-side-pos-y', v => panel.position.y = v);

  const materialSel = document.getElementById('input-side-material');
  if (materialSel) {
    materialSel.addEventListener('change', async (e) => {
      if (e.target.value === '__new__') {
        const name = await showCustomDialog('prompt', 'Nowy materiał', 'Nazwa materiału (cenę ustawisz w Kosztorysie, gdy już będzie użyty):', '', 'Dodaj');
        if (!name || !name.trim()) { materialSel.value = panel.materialId || (state.project.pricing.frontMaterials[0]?.id ?? ''); return; }
        const id = 'mat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        state.project.pricing.frontMaterials.push({ id, name: name.trim(), pricePerM2: 0 });
        panel.materialId = id;
      } else {
        panel.materialId = e.target.value;
      }
      update3D();
      updateSidebar();
      initPropertiesPanel();
    });
  }

  rightSidebar.querySelectorAll('.btn-side-rotate').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.rotation = parseInt(btn.getAttribute('data-rot'), 10);
      update3D();
      updateSidebar();
      initPropertiesPanel(); // zmiana aktywnego przycisku - wymaga przerysowania formularza
    });
  });

  const delBtn = document.getElementById('btn-side-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
    deleteSidePanel(panel.id);
    update3D();
    updateSidebar();
    initPropertiesPanel();
  });
}
