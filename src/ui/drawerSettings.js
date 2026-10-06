// src/ui/drawerSettings.js
//
// Karty "Szuflady — ustawienia ręczne" w sekcji Szuflady prawego panelu - wspólne dla
// zwykłej szafki (ui/properties.js) i szafki pod skos (ui/slopeProperties.js), żeby obie
// miały te same pola: wariant boku albo wysokość boku (MOVENTO), wymuszona głębokość NL,
// wymuszone wymiary i przesunięcie frontu, ustawienia szuflady wewnętrznej, dodanie
// szuflady wewnętrznej i usunięcie szuflady. front.forceVariant/forceNL istniały wcześniej
// w danych i były edytowalne tylko z prawoklik-menu w widoku 3D (render/viewer3d.js).
import { state } from "../core/state.js";
import { drawerSystems, DRAWER_VARIANT_ORDER, DRAWER_VARIANT_LABELS } from "../core/drawerSystems.js";
import { getDrawerVariant } from "../core/drawerMath.js";
import { escapeHtml } from "../utils/dom.js";
import { showAlert } from "../utils/modal.js";

// Szuflady szafki (zewn. i wewn.) od dołu, z etykietami.
export function drawerFrontsOf(mod) {
  return (mod.elements || [])
    .filter(el => el.typ === 'front' && el.subtype && el.subtype.includes('szuflada'))
    .sort((a, b) => (parseFloat(a.y) || 0) - (parseFloat(b.y) || 0))
    .map((front, idx) => ({
      front,
      label: `Szuflada ${idx + 1}${front.subtype === 'szuflada-wewnetrzna' ? ' (wewn.)' : ''}`,
    }));
}

// sideInfo(front) -> { maxH, warn } dla szuflad drewnianych (MOVENTO): największa wysokość
// boku, jaka się mieści (podpowiedź "Auto"), i ewentualne ostrzeżenie. Każdy rodzaj szafki
// liczy to po swojemu (zwykła - core/drawerBoxes.js, skos - core/slopeCabinet.js).
// extraHtml(front) - dodatkowa treść na górze karty (np. informacja o skrzynce).
export function drawerCardsHtml(mod, { sideInfo, extraHtml = () => '' }) {
  const f = { ...(state.project.front || {}), ...(mod.front || {}) };
  const sysName = (f.drawerSystem || 'merivobox').toLowerCase();
  const system = drawerSystems[sysName] || drawerSystems.merivobox;
  const isWooden = !!system.woodenBox;
  const list = drawerFrontsOf(mod);
  if (list.length === 0) return `<div class="hint">Ta szafka nie ma jeszcze żadnych szuflad.</div>`;

  return list.map(({ front, label }) => {
    const isInner = front.subtype === 'szuflada-wewnetrzna';
    const bz = front.baseZone || {};
    let sizeHtml;
    if (isWooden) {
      // MOVENTO (skrzynka drewniana): zamiast wariantów - wysokość boku wpisywana ręcznie.
      const { maxH = '', warn = '' } = sideInfo(front) || {};
      sizeHtml = `
            <div class="property-group mb-8">
              <label class="fs-xs">Wysokość boku szuflady [mm]:</label>
              <input type="number" class="input-drawer-side-height" data-front-id="${front.id}" placeholder="Auto (maks. ${maxH})" value="${front.drawerSideHeight || ''}" />
              ${warn}
            </div>`;
    } else {
      const variantOptionsHtml = DRAWER_VARIANT_ORDER.filter(k => system.variants[k]).map(k =>
        `<option value="${k}" ${front.forceVariant === k ? 'selected' : ''}>${DRAWER_VARIANT_LABELS[k]} (${system.variants[k].type}, ${system.variants[k].height}mm)</option>`
      ).join('');
      sizeHtml = `
            <div class="property-group mb-8">
              <label class="fs-xs">Wymuszony wariant boku:</label>
              <select class="input-drawer-force-variant" data-front-id="${front.id}">
                <option value="auto" ${(!front.forceVariant || front.forceVariant === 'auto') ? 'selected' : ''}>Auto (maksymalny)</option>
                ${variantOptionsHtml}
              </select>
            </div>`;
    }
    return `
          <div class="prop-box">
            <div class="prop-box-title"><i class="ti ti-box" aria-hidden="true"></i> ${escapeHtml(label)}</div>
            ${extraHtml(front)}
            ${sizeHtml}
            <div class="property-group mb-8">
              <label class="fs-xs">Wymuszona głębokość (NL, mm):</label>
              <input type="number" class="input-drawer-force-nl" data-front-id="${front.id}" placeholder="Auto" value="${front.forceNL || ''}" />
            </div>

            <div class="row mb-8">
              <div class="property-group grow">
                <label class="fs-xs">Wymuś wys. [mm]:</label>
                <input type="number" class="input-front-force-h" data-front-id="${front.id}" placeholder="Auto" value="${front.forceH || ''}" />
              </div>
              <div class="property-group grow">
                <label class="fs-xs">Wymuś szer. [mm]:</label>
                <input type="number" class="input-front-force-w" data-front-id="${front.id}" placeholder="Auto" value="${front.forceW || ''}" />
              </div>
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: ${isInner ? '8px' : '0'};">
              <div class="property-group grow">
                <label class="fs-xs">Przesuń Y ↕ [mm]:</label>
                <input type="number" class="input-front-force-offset-y" data-front-id="${front.id}" value="${front.forceOffsetY || 0}" />
              </div>
              <div class="property-group grow">
                <label class="fs-xs">Przesuń X ↔ [mm]:</label>
                <input type="number" class="input-front-force-offset-x" data-front-id="${front.id}" value="${front.forceOffsetX || 0}" />
              </div>
            </div>

            ${isInner ? `
              <hr class="divider">
              <div class="row mb-8">
                <div class="property-group grow">
                  <label class="fs-xs">Grubość frontu wewn. [mm]:</label>
                  <input type="number" class="input-inner-front-thickness" data-front-id="${front.id}" value="${front.innerFrontThickness ?? 18}" />
                </div>
                <div class="property-group grow">
                  <label class="fs-xs">Luz do krawędzi [mm]:</label>
                  <input type="number" class="input-inner-front-setback" data-front-id="${front.id}" value="${front.innerSetback ?? 2}" />
                </div>
              </div>
              <div class="row mb-8">
                <div class="property-group grow">
                  <label class="fs-xs">Wolne miejsce od dołu:</label>
                  <input type="number" class="input-inner-basezone-bottom" data-front-id="${front.id}" value="${bz.offsetBottom || 0}" />
                </div>
                <div class="property-group grow">
                  <label class="fs-xs">Wolne miejsce od góry:</label>
                  <input type="number" class="input-inner-basezone-top" data-front-id="${front.id}" value="${bz.offsetTop || 0}" />
                </div>
              </div>
            ` : `
              <button type="button" class="btn btn-sm btn-block btn-add-inner-drawer" data-front-id="${front.id}"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj szufladę wewnętrzną nad tą</button>
            `}
            <button type="button" class="btn btn-sm btn-block btn-danger btn-delete-front" data-front-id="${front.id}"><i class="ti ti-trash" aria-hidden="true"></i> Usuń tę szufladę</button>
          </div>
        `;
  }).join('');
}

// Obsługa pól z drawerCardsHtml. `refresh` = odświeżenie sceny, listy i panelu.
export function bindDrawerCards(root, mod, refresh) {
  const findFront = (id) => (mod.elements || []).find(el => el.id === id);
  const onChange = (cls, apply) => root.querySelectorAll(`.${cls}`).forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front) apply(front, e.target.value);
      refresh();
    });
  });
  const numOrNull = (v) => { const n = v === '' ? null : Number(v); return n === null || isNaN(n) ? null : n; };

  onChange('input-drawer-force-variant', (front, v) => { front.forceVariant = v; });
  onChange('input-drawer-side-height', (front, v) => { const n = numOrNull(v); front.drawerSideHeight = n !== null && n > 0 ? n : null; });
  onChange('input-drawer-force-nl', (front, v) => { front.forceNL = numOrNull(v); });
  // Korekta ręczna frontu (dawniej tylko w menu kontekstowym 3D) - wysokość/szerokość/przesunięcie.
  onChange('input-front-force-h', (front, v) => { front.forceH = numOrNull(v); });
  onChange('input-front-force-w', (front, v) => { front.forceW = numOrNull(v); });
  onChange('input-front-force-offset-y', (front, v) => { front.forceOffsetY = numOrNull(v) ?? 0; });
  onChange('input-front-force-offset-x', (front, v) => { front.forceOffsetX = numOrNull(v) ?? 0; });
  onChange('input-inner-front-thickness', (front, v) => { front.innerFrontThickness = parseFloat(v) || 18; });
  onChange('input-inner-front-setback', (front, v) => { front.innerSetback = parseFloat(v) || 0; });
  onChange('input-inner-basezone-bottom', (front, v) => { if (front.baseZone) front.baseZone.offsetBottom = parseFloat(v) || 0; });
  onChange('input-inner-basezone-top', (front, v) => { if (front.baseZone) front.baseZone.offsetTop = parseFloat(v) || 0; });

  root.querySelectorAll('.btn-delete-front').forEach(btn => btn.addEventListener('click', () => {
    mod.elements = mod.elements.filter(e => e.id !== btn.dataset.frontId);
    refresh();
  }));

  // "Dodaj szufladę wewnętrzną nad tą" - port 1:1 z menu kontekstowego 3D
  // (render/viewer3d.js), żeby liczyć dokładnie to samo boxHeight/baseZone.
  root.querySelectorAll('.btn-add-inner-drawer').forEach(btn => btn.addEventListener('click', () => {
    const front = findFront(btn.dataset.frontId);
    if (!front || !front.baseZone) return;

    const fMerged = { ...(state.project.front || {}), ...(mod.front || {}) };
    const sysName = (fMerged.drawerSystem || 'merivobox').toLowerCase();

    // NAPRAWA: w oryginale (menu 3D) boxHeight w trybie "Auto" zakładał całą
    // wysokość frontu (front.h), więc "za mało miejsca nad pudłem" wychodziło
    // prawie zawsze - silnik szuflad w praktyce dobiera dużo niższy wariant.
    // Liczymy tu dokładnie to, co dobrałby getDrawerComponents (core/drawerMath.js),
    // żeby sprawdzać miejsce nad RZECZYWISTYM, a nie zawyżonym, pudłem.
    // MOVENTO: boxHeight to luz pod szufladą + bok (getDrawerVariant), nie sam tył.
    const variantInfo = getDrawerVariant(front.h, sysName, front.forceVariant || 'auto', front.drawerSideHeight);
    const boxHeight = variantInfo.boxHeight ?? variantInfo.backHeight;

    const newInnerBottomY = front.y + boxHeight + 5;
    const newInnerTopY = front.y + front.h;

    if (newInnerBottomY + 40 > newInnerTopY) {
      showAlert("Za mało miejsca nad pudłem! Zmniejsz wariant boku tej szuflady (np. na M lub K) i zapisz, aby zrobić miejsce.");
      return;
    }

    const baseMinY = parseFloat(front.baseZone.minY) || 18;
    const baseMaxY = parseFloat(front.baseZone.maxY) || parseFloat(mod.dimensions.height);

    mod.elements.push({
      id: 'front-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      typ: 'front',
      subtype: 'szuflada-wewnetrzna',
      baseZone: {
        ...front.baseZone,
        offsetBottom: Math.max(0, newInnerBottomY - baseMinY),
        offsetTop: Math.max(0, baseMaxY - newInnerTopY)
      },
      frontCount: 1, distribution: "1", frontIndex: 0, gap: parseFloat(state.project.front?.gap || 3),
      intGapX: 15, intGapY: 5, forceVariant: 'auto', forceNL: null,
      innerFrontThickness: 18, innerSetback: 2
    });

    refresh();
  }));
}
