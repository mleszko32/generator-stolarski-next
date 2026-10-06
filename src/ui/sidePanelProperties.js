// src/ui/sidePanelProperties.js
//
// Prawy panel dla boku dokładanego i blendy (project.sidePanels) - wydzielony z
// ui/properties.js, który woła renderSidePanelProperties() zamiast formularza szafki.
import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { escapeHtml } from "../utils/dom.js";
import { showCustomDialog } from "../core/storage.js";
import { initPropertiesPanel } from "./properties.js";
import { propHeaderHtml, sectionHtml, bindSections, positionRotationHtml } from "./propertiesShell.js";

// Bok dokładany (core/state.js: addSidePanel) - samodzielny obiekt projektu,
// nie właściwość modułu - zakładki front/szuflady/konstrukcja/zawiasy nie mają tu
// zastosowania (to tylko płaska, dekoracyjna płyta), ale rama panelu (nagłówek,
// zwijane sekcje, pozycja i obrót) jest ta sama co w szafkach (ui/propertiesShell.js).
// Wspólny wybór materiału (ten sam katalog co front.materialId, patrz
// .input-front-material niżej) dla blendy/boku dokładanego - to zwykle ten
// sam, droższy dekor co fronty, więc korzysta z tego samego cennika zamiast
// dublować go osobno dla "Front" w kosztorysie (engine/cabinet.js:
// resolveFrontMaterial obsługuje panel.materialId tak samo jak front.materialId).
function materialSectionHtml(panel) {
  const mats = state.project.pricing?.frontMaterials || [];
  return `
    <h3>Materiał i dekor</h3>
    <div class="property-group">
      <label>Dekor (opis do formatki):</label>
      <input type="text" id="input-side-decor" value="${escapeHtml(panel.decor || '')}" placeholder="np. Front biały połysk" />
    </div>
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
  const d = panel.dimensions;
  rightSidebar.innerHTML = `
    ${propHeaderHtml({ name: panel.name, dims: `${d.width}×${d.height}×${d.depth}`, extra: 'blenda', nameId: 'input-side-name', nameLabel: 'Nazwa:' })}

    ${sectionHtml('wymiary', `
      <h3>Wymiary</h3>
      <div class="property-group"><label>Szerokość czoła (mm):</label><input type="number" id="input-side-width" value="${d.width}" /></div>
      <div class="property-group"><label>Wysokość (mm):</label><input type="number" id="input-side-height" value="${d.height}" /></div>
      <div class="property-group"><label>Głębokość z mocowaniem (mm):</label><input type="number" id="input-side-depth" value="${d.depth}" /></div>
      <div class="property-group"><label>Kołnierz mocujący do szafki:</label>
        <select id="input-blenda-flange">${flanges.map(([v, l]) => `<option value="${v}" ${(panel.flange || 'prawa') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="hint">Czoło jest z przodu (dekor frontów), kołnierz to płyta korpusu za nim. Górną blendę zrób szerokością na całą zabudowę i kołnierzem przy dolnej krawędzi.</div>

      <hr class="divider">

      ${positionRotationHtml({
        prefix: 'input-side-pos', position: panel.position, rotation: panel.rotation, rotClass: 'btn-side-rotate',
        yLabel: 'Wysokość dołu od podłogi (Y) [mm]:',
        hint: 'Przeciągnij blendę myszą w widoku 3D - przyciągnie się do boku szafki. Przy szafce na nóżkach dół blendy jest zwykle na wysokości nóżek (Y = 100). Obrót 0° = czoło zwrócone do przodu pokoju.',
      })}
    `)}

    ${sectionHtml('material', materialSectionHtml(panel))}
  `;
  bindSidePanelInputs(rightSidebar, panel);
  const flangeSel = document.getElementById('input-blenda-flange');
  if (flangeSel) flangeSel.addEventListener('change', (e) => { panel.flange = e.target.value; update3D(); updateSidebar(); });
}

export function renderSidePanelProperties(rightSidebar, panel) {
  if (panel.kind === 'blenda') { renderBlendaProperties(rightSidebar, panel); return; }
  const d = panel.dimensions;
  rightSidebar.innerHTML = `
    ${propHeaderHtml({ name: panel.name, dims: `${d.width}×${d.height}×${d.depth}`, extra: 'bok dokładany', nameId: 'input-side-name', nameLabel: 'Nazwa:' })}

    ${sectionHtml('wymiary', `
      <h3>Wymiary</h3>
      <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-side-width" value="${d.width}" /></div>
      <div class="property-group"><label>Wysokość (mm):</label><input type="number" id="input-side-height" value="${d.height}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="number" id="input-side-depth" value="${d.depth}" /></div>

      <hr class="divider">

      ${positionRotationHtml({
        prefix: 'input-side-pos', position: panel.position, rotation: panel.rotation, rotClass: 'btn-side-rotate',
        yLabel: 'Wysokość startu od podłogi (Y) [mm]:',
        hint: 'Domyślnie Y=0 i wysokość = wysokość pomieszczenia, żeby bok sięgał od podłogi do sufitu niezależnie od modułów za nim.',
      })}
    `)}

    ${sectionHtml('material', materialSectionHtml(panel))}
  `;

  bindSidePanelInputs(rightSidebar, panel);
}

// Pola wspólne dla boku dokładanego i blendy (nazwa, dekor, wymiary, pozycja, obrót).
function bindSidePanelInputs(rightSidebar, panel) {
  const bindText = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { apply(e.target.value); update3D(); updateSidebar(); });
  };
  const bindNumber = (id, apply) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => { apply(parseFloat(e.target.value) || 0); update3D(); updateSidebar(); });
  };

  bindSections(rightSidebar);
  bindText('input-side-name', v => panel.name = v);
  bindText('input-side-decor', v => panel.decor = v);
  bindNumber('input-side-width', v => panel.dimensions.width = v);
  bindNumber('input-side-height', v => panel.dimensions.height = v);
  bindNumber('input-side-depth', v => panel.dimensions.depth = v);
  ['input-side-width', 'input-side-height', 'input-side-depth'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => initPropertiesPanel())); // wymiary w nagłówku
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
}
