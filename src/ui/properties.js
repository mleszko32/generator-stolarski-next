// src/ui/properties.js
import { setModuleKorpusDecor, refitInterior } from "../core/korpusDecorChange.js";
import { moduleBoardThickness, decorThickness } from "../core/boardThickness.js";
import { TOP_TYPES } from "../core/topType.js";
import { state, getActiveModule, frontBodyGap } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { calculateParts } from "../engine/cabinet.js";
import { calculateHinges } from "../core/hingeMath.js";
import { getTraverseConfig, clampModuleToRoom, restModuleOnNeighbors, shiftRowAfterResize } from "../core/layout.js";
import { getDrawerBoxInfo } from "../core/drawerBoxes.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { escapeHtml } from "../utils/dom.js";
import { evalDimensionExpr, fmtMm } from "../utils/math.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";
import { buildZoneTree, rescaleSubtree } from "../core/zoneTree.js";
import { moduleInfoHtml } from "./moduleInfoPanel.js";
import { showCustomDialog } from "../core/storage.js";
import { renderSidePanelProperties } from "./sidePanelProperties.js";
import { renderCornerModuleProperties } from "./cornerProperties.js";
import { renderSlopeModuleProperties } from "./slopeProperties.js";
import { drawerCardsHtml, bindDrawerCards } from "./drawerSettings.js";
import { propHeaderHtml, sectionHtml, bindSections, setSectionDots, positionRotationHtml } from "./propertiesShell.js";
import { blindCornerSectionHtml, bindBlindCornerSection } from "./blindCornerProperties.js";
import { findRowAround } from "../core/wallFill.js";
import { isAutoClearance, describeClearance, frontClearance } from "../core/autoClearance.js";
import { frontRoundingHints, roundingHintText } from "../core/frontRounding.js";
import { editTargets } from "../core/groupSelection.js";
import { getStiffenerSettings } from "../core/shelfStiffener.js";
import { findKitchenRunAround } from "../core/kitchenRun.js";
import { openWallFillModal } from "./wallFillModal.js";
import { BOARD_BACK_MIN, resolveBackPanel } from "../core/backPanel.js";
import { catalogLabels, assignFrontMaterialByName, frontMaterialSuggestions, addCatalogDecor } from "../core/materialCatalog.js";
import { moduleFrontMaterialId, PLINTH_KORPUS } from "../core/plinthMaterial.js";
import { groupButtonsHtml, bindGroupButtons } from "./groupButtons.js";

// Wybór materiału cokołu (mod.legs.plinthMaterial, core/plinthMaterial.js).
function plinthMaterialHtml(mod) {
  const list = state.project.pricing?.frontMaterials || [];
  const cur = String(mod.legs?.plinthMaterial || '');
  const isDecor = cur.startsWith('decor:');
  const frontName = (list.find(m => m.id === moduleFrontMaterialId(mod, state.project)) || {}).name || 'fronty';
  const opts = [['', `Jak fronty (${frontName})`], [PLINTH_KORPUS, 'Jak korpus'],
    ...list.map(m => [`front:${m.id}`, `Front: ${m.name}`]), ['decor', 'Dekor płyty…']];
  const sel = isDecor ? 'decor' : cur;
  return `
        <div class="property-group mb-8"><label style="font-size: 11px;">Materiał cokołu:</label><select id="input-plinth-material">${opts.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === sel ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></div>
        <div class="property-group mb-8" style="display: ${isDecor ? '' : 'none'};"><label style="font-size: 11px;">Dekor cokołu:</label><input type="text" id="input-plinth-decor" list="plinth-decor-catalog" value="${escapeHtml(isDecor ? cur.slice(6) : '')}" placeholder="np. Egger W1000 ST9"><datalist id="plinth-decor-catalog">${catalogLabels(state.project).map(l => `<option value="${escapeHtml(l)}">`).join('')}</datalist></div>`;
}

// Szafki, których dotyczą zmiany w panelu: kliknięta szafka, a kilka naraz tylko po dobraniu
// ich Shift/Ctrl - sama grupa zaznaczona kliknięciem nie liczy się (core/groupSelection.js).
function getSelectedMods() {
    const ids = editTargets(state.project, { moduleIds: state.selectedModules, panelIds: state.selectedSidePanels }, state.activeModuleId);
    return ids.map(id => state.project.modules.find(m => m.id === id)).filter(Boolean);
}

// Sekcje panelu (zwijane, kilka może być otwartych naraz) i ich stan otwarcia są
// wspólne dla wszystkich rodzajów szafek - patrz ui/propertiesShell.js.

// Nadpisaniem jest klucz, którego wartość w szafce RÓŻNI SIĘ od ustawienia
// projektu (samo istnienie klucza nic nie znaczy - szafki dostają np.
// front.hinges już przy tworzeniu). Plecy nie mają ustawienia projektu, więc
// nie biorą udziału w porównaniu.
export function computeOverridden(mod) {
  const diffKeys = (local, base, skip = []) => Object.keys(local || {})
    .filter(k => !skip.includes(k) && JSON.stringify(local[k]) !== JSON.stringify((base || {})[k]));
  const proj = state.project;
  return {
    front: diffKeys(mod.front, proj.front, ['hinges', 'distribution', 'drawerSystem', 'clearanceAuto']).length > 0,
    szuflady: diffKeys(mod.front, proj.front, Object.keys(mod.front || {}).filter(k => k !== 'drawerSystem')).length > 0,
    konstrukcja: diffKeys(mod.construction, proj.construction).length > 0,
  };
}

function refreshOverrideDots() {
  const mod = getActiveModule();
  const rs = document.querySelector('.sidebar-right');
  if (!mod || !rs) return;
  setSectionDots(rs, computeOverridden(mod));
}

// Luzy frontów w sekcji Front. Tryb Auto (core/autoClearance.js): cztery luzy liczą się z
// sąsiadów szafki - panel pokazuje wynik z powodem, a pola ręczne (puste = Auto) są schowane
// pod "Ręczne nadpisanie". Tryb ręczny: cztery pola jak dotąd. Id pól te same w obu trybach
// (input-front-left...), więc obsługuje je ta sama pętla numberInputs.
const CLEARANCE_EDGES = [['left', 'Lewy'], ['right', 'Prawy'], ['top', 'Góra'], ['bottom', 'Dół']];
function clearanceBlockHtml(mod, f, fc) {
  const inset = f.type === 'wpuszczane';
  const auto = isAutoClearance(mod, state.project);
  const toggle = inset ? '' : `<div class="property-group row-center">
        <input type="checkbox" id="input-clearance-auto" ${auto ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
        <label for="input-clearance-auto" style="cursor: pointer; margin: 0; font-weight: bold;" title="Luzy liczą się same z tego, co stoi przy szafce: szafka obok, blenda, bok dokładany, zmywarka, szafka wyżej, blat, sufit, cokół">Luzy automatyczne (wg sąsiadów)</label>
      </div>`;
  if (!auto) {
    const manual = { left: fc.left ?? fc.sides ?? 1.5, right: fc.right ?? fc.sides ?? 1.5, top: fc.top ?? 2, bottom: fc.bottom ?? 2 };
    return `<h3>Luzy frontów</h3>${toggle}
      ${CLEARANCE_EDGES.map(([k, label]) => `<div class="property-group"><label>Luz ${label.toLowerCase()} (mm):</label><input type="number" id="input-front-${k}" value="${manual[k]}" step="0.5" /></div>`).join('')}
      <div class="hint">Luzy dotyczą zewnętrznych krawędzi korpusu.</div>`;
  }
  const d = describeClearance(mod, state.project);
  const anyManual = CLEARANCE_EDGES.some(([k]) => d[k].manual);
  return `<h3>Luzy frontów</h3>${toggle}
      <div class="prop-box">
        ${CLEARANCE_EDGES.map(([k, label]) => `<div class="info-row"><span class="info-k">${label}</span><span class="info-v"><b>${fmtMm(d[k].value)} mm</b> · ${d[k].manual ? `wpisany ręcznie (Auto: ${fmtMm(d[k].auto)})` : escapeHtml(d[k].reason)}</span></div>`).join('')}
      </div>
      <details class="prop-info" ${anyManual ? 'open' : ''}>
        <summary>Ręczne nadpisanie</summary>
        <div class="info-body">
          ${CLEARANCE_EDGES.map(([k, label]) => `<div class="property-group"><label class="fs-xs">Luz ${label.toLowerCase()} (mm, puste = Auto):</label><input type="number" id="input-front-${k}" value="${d[k].manual ? d[k].value : ''}" placeholder="Auto: ${fmtMm(d[k].auto)}" step="0.5" /></div>`).join('')}
        </div>
      </details>`;
}

// Podpowiedź równych wymiarów (core/frontRounding.js): fronty z ułamkiem milimetra i o ile
// zmienić luz, żeby wyszły w pełnych mm. Liczone po calculateParts() (aktualny layout).
function roundingHintsHtml(mod, th, f, frontsList) {
  const hints = frontRoundingHints(mod, th, { inset: f.type === 'wpuszczane' });
  if (!hints.length) return '';
  const labelOf = (id) => (frontsList.find(x => x.front.id === id) || {}).label || 'Front';
  return `<div class="notice-warn fs-xs" style="margin-top: 8px;"><b>Fronty z ułamkiem milimetra</b>
      ${hints.map(h => `<div style="margin-top: 4px;">${escapeHtml(h.frontIds.map(labelOf).join(', '))} — ${escapeHtml(roundingHintText(h))}</div>`).join('')}
    </div>`;
}

// Kolejność i znaczenie indeksów 0-3 MUSI się zgadzać z kolejnością addBox()
// dla nóżek w render/viewer3d.js oraz z pętlą w engine/cabinet.js
// (calculateProjectHardware) — wszystkie trzy miejsca czytają
// mod.legs.heightOverrides[i] pod tym samym indeksem.
const LEG_LABELS = ["Tył lewa", "Tył prawa", "Przód lewa", "Przód prawa"];

// side ("front"/"rear") <-> etykieta w UI, patrz też core/layout.js (getTraverseConfig).
const TRAVERSE_LABELS = { front: "Przedni", rear: "Tylny" };

export function initPropertiesPanel() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible();
  const rightSidebar = document.querySelector(".sidebar-right");

  const activeSidePanel = state.project.sidePanels.find(p => p.id === state.activeSidePanelId);
  if (activeSidePanel) {
    renderSidePanelProperties(rightSidebar, activeSidePanel);
    return;
  }

  const activeModule = getActiveModule();

  if (!activeModule) {
    rightSidebar.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--border-strong); text-align: center; padding: 20px;">
        <span style="font-size: 40px; margin-bottom: 10px;"><i class="ti ti-settings" aria-hidden="true"></i></span>
        <h3 style="margin: 0; color: var(--text-secondary); text-transform: none; letter-spacing: normal; border-bottom: none; font-size: 15px;">Brak aktywnej szafki</h3>
      </div>
    `;
    return;
  }

  if (activeModule.type === 'corner_cabinet') {
    renderCornerModuleProperties(rightSidebar, activeModule);
    return;
  }
  if (activeModule.type === 'slope_cabinet') {
    renderSlopeModuleProperties(rightSidebar, activeModule);
    return;
  }

  const multiCount = Math.max(1, getSelectedMods().length);
  if (!activeModule.legs) activeModule.legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(activeModule.construction || {}) };
  const backP = activeModule.backPanel;
  const f = { ...(state.project.front || {}), ...(activeModule.front || {}) };
  const fc = { ...(state.project.front?.clearance || {}), ...(activeModule.front?.clearance || {}) };
  const fh = { topOffset: 100, bottomOffset: 100, margin: 40, forceCount: 0, ...(state.project.front?.hinges || {}), ...(activeModule.front?.hinges || {}) };
  const th = moduleBoardThickness(activeModule, state.project);

  let actualBottomText = "";
  let actualTopText = "";
  try {
      const { mountingData } = calculateParts();
      const activeDoor = mountingData.find(d => d.type === 'door');
      if (activeDoor && activeDoor.hinges && activeDoor.hinges.length >= 2) {
          const hinges = activeDoor.hinges;
          const front = activeModule.elements.find(e => e.id === activeDoor.frontId);
          if (front) {
              const bottomHinge = hinges[0];
              const topHinge = hinges[hinges.length - 1];
              if (bottomHinge.isAdjusted) actualBottomText = `<div class="hint-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Zmieniono na: <b>${bottomHinge.relY} mm</b> (Kolizja)</div>`;
              if (topHinge.isAdjusted) actualTopText = `<div class="hint-warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Zmieniono na: <b>${fmtMm(front.h - topHinge.relY)} mm</b> (Kolizja)</div>`;
          }
      }
  } catch(e) {}

  // Lista drzwi aktywnej szafki z policzonymi zawiasami — do ręcznej korekty pozycji
  // każdego z osobna (patrz zakładka "Zawiasy"). Liczone PO calculateParts() wyżej,
  // które już przeliczyło layout (el.x/y/w/h frontów) dla tego renderu. hingeOverrides
  // żyje na elemencie frontu, więc działa wszędzie tam, gdzie ten sam front jest
  // odczytywany (3D, lista nawiertów, okucia) — nie tylko tutaj.
  const doorHingeGroups = (activeModule.elements || [])
      .filter(el => el.typ === 'front' && el.subtype && el.subtype.includes('drzwi') && el.openingSide !== 'top')
      .map(front => {
          const obstacles = (activeModule.elements || []).filter(el => el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna');
          const side = front.subtype === 'drzwi-lp' ? (front.id.includes('-L-') ? 'left' : 'right') : (front.openingSide || 'left');
          const hinges = calculateHinges(front, th, obstacles, side);
          const label = front.subtype === 'drzwi-lp' ? `Drzwi ${side === 'left' ? 'Lewe' : 'Prawe'}` : 'Drzwi';
          return { front, side, label, hinges };
      })
      .sort((a, b) => (parseFloat(a.front.y) || 0) - (parseFloat(b.front.y) || 0));

  // Lista WSZYSTKICH frontów (drzwi i szuflady) do ręcznego "luzu od osi wieńca"
  // (core/layout.js: el.gapFromAxisTop/Bottom) - nadpisuje domyślny symetryczny
  // podział szczeliny `gap` na krawędzi stykającej się z wewnętrznym wieńcem/
  // półką, per front z osobna (np. gdy dwa fronty z sąsiednich kolumn mają się
  // zejść dokładnie na osi wspólnego wieńca, a nie automatycznie po połowie
  // `gap`). Pole ma sens tylko na granicy wewnętrznej - na krawędzi korpusu
  // albo obok innego frontu jest po prostu ignorowane (patrz layout.js).
  const AXIS_GAP_SUBTYPE_LABELS = { drzwi: 'Drzwi', szuflada: 'Szuflada', 'szuflada-wewnetrzna': 'Szuflada wewn.' };
  const allFrontsList = (activeModule.elements || [])
      .filter(el => el.typ === 'front' && el.subtype)
      .sort((a, b) => (parseFloat(a.y) || 0) - (parseFloat(b.y) || 0))
      .map((front, idx) => ({
          front,
          label: front.subtype === 'drzwi-lp'
              ? `Drzwi ${front.id.includes('-L-') ? 'Lewe' : 'Prawe'}`
              : `${AXIS_GAP_SUBTYPE_LABELS[front.subtype] || front.subtype} ${idx + 1}`,
      }));

  // Grupowanie modułów — dotąd edytowalne tylko z menu kontekstowego 3D
  // (render/viewer3d.js), teraz też tutaj (patrz plan przeniesienia okienek 3D
  // do panelu bocznego). "Można połączyć w grupę" tylko gdy zaznaczenie ma
  // >1 element i NIE są już wszystkie w tej samej grupie.
  // (blok przycisków wspólny z panelem blendy/boku - ui/groupButtons.js)

  // Sekcje, w których TA szafka ma własne ustawienia nadpisujące domyślne
  // projektu (mod.front / mod.construction są scalane nad ustawieniami projektu).
  const overridden = computeOverridden(activeModule);

  const tabContent = (id, html) => sectionHtml(id, html, overridden[id]);

  // Rząd szafek przy ścianie, do którego należy ta szafka (core/wallFill.js) -
  // przycisk "Zmień podział rzędu" otwiera okno rozmieszczania w trybie edycji.
  const wallRow = findRowAround(state.project, activeModule.id);
  // Kuchnia L/U (ściany połączone narożnikami) - przycisk "Zmień podział kuchni L/U".
  const kitchenRun = findKitchenRunAround(state.project, activeModule.id);

  rightSidebar.innerHTML = `
    ${propHeaderHtml({
      name: activeModule.name,
      dims: `${activeModule.dimensions.width}×${activeModule.dimensions.height}×${activeModule.dimensions.depth}`,
      extra: multiCount > 1 ? `zaznaczono ${multiCount}` : '',
      nameId: 'input-mod-name',
    })}

    ${multiCount > 1 ? `<div class="notice-warn fs-xs" style="margin-bottom: 8px;">Zmiany w tym panelu dotyczą <b>${multiCount} zaznaczonych szafek</b>.
      <button type="button" id="btn-only-this" class="btn btn-sm" style="margin-top: 6px;">Tylko ta szafka</button></div>` : ''}

    ${moduleInfoHtml(activeModule)}

    ${tabContent("wymiary", `
      <h3>Wymiary Modułu</h3>
      <div class="property-group"><label>Szerokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-width" value="${escapeHtml(activeModule.dimensions.width)}" /></div>
      <div class="property-group"><label>Wysokość korpusu (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-height" value="${escapeHtml(activeModule.dimensions.height)}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-depth" value="${escapeHtml(activeModule.dimensions.depth)}" /></div>

      <hr class="divider">

      ${positionRotationHtml({
        prefix: 'input-pos', position: activeModule.position, rotation: activeModule.rotation,
        rotClass: 'btn-rotate', hint: 'Skrót: klawisz R obraca aktywną szafkę o +90°.',
      })}

      ${wallRow || kitchenRun ? `
        <h3>Rząd przy ścianie</h3>
        <div class="property-group" style="display: flex; flex-direction: column; gap: 6px;">
          ${wallRow ? `<button type="button" id="btn-edit-wall-row" class="btn btn-sm btn-block" title="Podziel na nowo cały rząd, w którym stoi ta szafka (inny wariant, szerokości, blenda) - bez usuwania szafek"><i class="ti ti-layout-columns" aria-hidden="true"></i> Zmień podział rzędu (${wallRow.moduleIds.length} szt.)</button>` : ''}
          ${kitchenRun ? `<button type="button" id="btn-edit-kitchen-run" class="btn btn-sm btn-block" title="Podziel na nowo całą kuchnię razem z narożnikami - bez usuwania szafek"><i class="ti ti-layout-board" aria-hidden="true"></i> Zmień podział kuchni ${kitchenRun.walls.length === 2 ? 'L' : 'U'} (${kitchenRun.moduleIds.length} szt.)</button>` : ''}
        </div>
      ` : ''}

      ${groupButtonsHtml(activeModule.groupId)}
    `)}

    ${tabContent("front", `
      <h3>Ustawienia Frontów</h3>
      <div id="group-front-clearance">
        <div class="property-group"><label>Typ frontów:</label><select id="input-front-type"><option value="nakladane" ${(!f.type || f.type === 'nakladane') ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${f.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option></select></div>
        <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" id="input-front-gap" value="${f.gap ?? 3}" step="0.5" /></div>
        <div class="property-group"><label title="Odstęp tyłu frontu nakładanego od czoła korpusu (miejsce na domknięcie drzwi). Wliczany do lica frontów przy rozmieszczaniu szafek i w narożnikach.">Odsunięcie frontu od korpusu (mm):</label><input type="number" id="input-front-body-gap" value="${frontBodyGap(f)}" step="0.5" min="0" /></div>
      </div>
      ${clearanceBlockHtml(activeModule, f, fc)}
      ${roundingHintsHtml(activeModule, th, f, allFrontsList)}

      ${allFrontsList.length ? `
        <h3>Materiał frontów szafki</h3>
        <div class="property-group mb-8">
          <label class="fs-xs">Wszystkie fronty ${getSelectedMods().length > 1 ? `zaznaczonych szafek (${getSelectedMods().length})` : 'tej szafki'} — wpisz albo wybierz z listy:</label>
          <input type="text" id="input-fronts-material-all" list="fronts-material-catalog" placeholder="np. Lakier RAL 9016, NCS S 0502-Y albo Egger W1000" autocomplete="off" />
          <datalist id="fronts-material-catalog">${frontMaterialSuggestions(state.project).map(l => `<option value="${escapeHtml(l)}"></option>`).join('')}</datalist>
          <div class="hint">Materiał z cennika frontów, lakier w kolorze RAL / NCS albo dekor z bazy płyt — nowy dopisze się do cennika (cenę ustawisz w Kosztorysie; lakier bierze cenę istniejącego lakieru).</div>
        </div>

        <h3>Materiał frontu (per front)</h3>
        <div class="hint" style="margin-bottom: 8px;">Ceny edytujesz w Kosztorysie (Produkcja i raporty) — pokazuje tam tylko materiały faktycznie użyte przez jakiś front. Bez wyboru liczy się pierwszy materiał z listy. "+ Nowy materiał…" dopisuje pozycję do listy i od razu ją przypisuje tu.</div>
        ${allFrontsList.map(({ front, label }) => `
          <div class="property-group mb-8">
            <label class="fs-xs">${escapeHtml(label)} — materiał:</label>
            <select class="input-front-material" data-front-id="${escapeHtml(front.id)}">
              ${(state.project.pricing?.frontMaterials || []).map((mat, i) => `<option value="${escapeHtml(mat.id)}" ${(front.materialId ? front.materialId === mat.id : i === 0) ? 'selected' : ''}>${escapeHtml(mat.name)}</option>`).join('')}
              <option value="__new__">+ Nowy materiał…</option>
            </select>
          </div>
        `).join('')}

        <h3>Luz od osi wieńca (per front)</h3>
        <div class="hint" style="margin-bottom: 8px;">Tylko dla krawędzi stykającej się z WEWNĘTRZNYM wieńcem/półką (nie krawędzią korpusu ani innym frontem) — domyślnie taki front dzieli szczelinę "Przerwa między frontami" po połowie z obu stron osi wieńca. Wpisz tu wprost żądaną odległość krawędzi TEGO frontu od osi (środka grubości) wieńca, żeby to nadpisać niezależnie od "Przerwa między frontami".</div>
        ${allFrontsList.map(({ front, label }) => `
          <div class="row mb-8">
            <div class="property-group grow">
              <label class="fs-xs">${escapeHtml(label)} — od osi góra [mm]:</label>
              <input type="number" class="input-front-axisgap-top" data-front-id="${escapeHtml(front.id)}" placeholder="Auto (gap/2)" value="${front.gapFromAxisTop ?? ''}" step="0.5" />
            </div>
            <div class="property-group grow">
              <label class="fs-xs">— od osi dół [mm]:</label>
              <input type="number" class="input-front-axisgap-bottom" data-front-id="${escapeHtml(front.id)}" placeholder="Auto (gap/2)" value="${front.gapFromAxisBottom ?? ''}" step="0.5" />
            </div>
          </div>
        `).join('')}
      ` : ''}

    `)}

    ${tabContent("szuflady", `
      <h3>Ustawienia Szuflad</h3>
      <div class="property-group"><label>System szuflad:</label><select id="input-drawer-system"><option value="merivobox" ${f.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option><option value="legrabox" ${f.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option><option value="tandembox" ${f.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX</option><option value="antaro" ${f.drawerSystem === 'antaro' ? 'selected' : ''}>Blum TANDEMBOX antaro</option><option value="gtv_axis_16" ${f.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option><option value="gtv_axis_18" ${f.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option><option value="movento_katalog" ${f.drawerSystem === 'movento_katalog' ? 'selected' : ''}>Blum MOVENTO — katalog (bok 16 mm)</option><option value="movento_forum" ${f.drawerSystem === 'movento_forum' ? 'selected' : ''}>Blum MOVENTO — forum (bok 18 mm)</option><option value="tandem_560f" ${f.drawerSystem === 'tandem_560f' ? 'selected' : ''}>Blum TANDEM 560F (bok 17-19 mm)</option></select></div>
      ${drawerSystems[f.drawerSystem || '']?.woodenBox ? `<div class="property-group"><label><input type="checkbox" id="input-drawerbox-korpus" ${f.drawerBoxFromKorpus ? 'checked' : ''} /> Skrzynki szuflad z płyty korpusu tej szafki (w jego dekorze)</label></div>` : ''}

      <h3>Szuflady — ustawienia ręczne</h3>
      ${drawerCardsHtml(activeModule, {
        // MOVENTO: podpowiedź największej wysokości boku i ostrzeżenia (core/drawerBoxes.js).
        sideInfo: (front) => {
          const autoInfo = getDrawerBoxInfo(activeModule, { ...front, drawerSideHeight: null }, state.project);
          const curInfo = getDrawerBoxInfo(activeModule, front, state.project);
          const maxH = autoInfo ? autoInfo.comps.sideHeight : '';
          const warn = curInfo && !curInfo.comps.fits
            ? `<div class="notice-warn fs-xs">Za mało miejsca na szufladę MOVENTO w tej wnęce.</div>`
            : (curInfo && curInfo.comps.clamped ? `<div class="notice-warn fs-xs">Wpisana wysokość się nie mieści — użyto ${maxH} mm.</div>` : '');
          return { maxH, warn };
        },
      })}
    `)}

    ${tabContent("konstrukcja", `
      <h3>Konstrukcja Korpusu</h3>
      <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" />${decorThickness(activeModule.materials?.korpusDecor) ? `<div class="hint">Ta szafka: ${decorThickness(activeModule.materials.korpusDecor)} mm z nazwy dekoru korpusu (pole niżej). Ta wartość dotyczy szafek bez grubości w dekorze.</div>` : ''}</div>
      <div class="property-group"><label>Dekor korpusu (puste = z projektu):</label><input type="text" id="input-korpus-decor" list="korpus-decor-catalog" value="${escapeHtml(activeModule.materials?.korpusDecor || '')}" placeholder="np. Egger U740 PM" title="Formatki z płyty korpusu tej szafki (i zaznaczonych) dostaną materiał „Korpus: dekor” - osobna pozycja w kosztorysie i osobne arkusze w rozkroju." /><datalist id="korpus-decor-catalog">${catalogLabels(state.project).map(l => `<option value="${escapeHtml(l)}"></option>`).join('')}</datalist></div>
      <div class="property-group"><label>Sposób łączenia:</label><select id="input-join-type"><option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option><option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option></select></div>
      <div class="property-group"><label>Zamknięcie góry:</label><select id="input-top-type">${TOP_TYPES.map(([v, label]) => `<option value="${v}" ${cons.topType === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="prop-box" id="traverse-options" style="display: ${cons.topType.includes('trawersy') ? 'block' : 'none'};"><div class="property-group mb-0"><label class="fs-xs">Szerokość trawersu (mm):</label><input type="number" id="input-traverse-width" value="${cons.traverseWidth}" /></div></div>
      <div class="property-group"><label>Wieniec dolny cofnięty o (mm):</label><input type="number" id="input-bottom-setback" value="${cons.bottomSetback ?? 0}" min="0" step="1" title="Wieniec dolny płytszy i cofnięty od przodu - np. szufladki pod blatem biurka: front zachodzi niżej i daje chwyt od spodu. 0 = zwykły wieniec." /></div>
      <div class="property-group"><label>Maks. rozstaw łączników kołek + wkręt (mm):</label><input type="number" id="input-joint-spacing" value="${cons.jointSpacing ?? 250}" min="64" step="1" title="Wieńce, półki stałe i przegrody: skrajne zestawy 37 mm od przodu i tyłu, środkowe dokładane, gdy odstęp przekracza ten rozstaw (w rastrze 32 mm)" /></div>
      ${(() => {
        const st = getStiffenerSettings(activeModule, state.project);
        return `<div class="property-group"><label><input type="checkbox" id="input-stiffener-active" ${st.active ? 'checked' : ''} /> Listwa usztywniająca pod długimi półkami</label></div>
      <div class="prop-box" title="Listwa z płyty korpusu na sztorc pod półką, przy tylnej krawędzi (profil L) - dla półek stałych i ruchomych dłuższych niż próg"><div class="property-group"><label class="fs-xs">Dla półek dłuższych niż (mm):</label><input type="number" id="input-stiffener-min" value="${st.minLength}" min="1" step="1" /></div><div class="property-group mb-0"><label class="fs-xs">Wysokość listwy (mm):</label><input type="number" id="input-stiffener-height" value="${st.height}" min="1" step="1" /></div></div>`;
      })()}

      ${cons.topType.includes('trawersy') ? (() => {
          const trav = getTraverseConfig(cons);
          const travRaw = cons.traverses || {};
          return `
          <h3>Trawersy — ustawienia ręczne</h3>
          <div class="prop-box">
            ${['front', 'rear'].map(side => {
                const raw = travRaw[side] || {};
                const widthOverridden = raw.width !== undefined && raw.width !== null && raw.width !== '';
                const active = trav[side].active;
                const displayWidth = widthOverridden ? raw.width : trav[side].width;
                return `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <input type="checkbox" class="input-traverse-active" data-side="${side}" ${active ? 'checked' : ''} title="Czy ten trawers ma w ogóle istnieć" style="width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;" />
                  <span style="width: 52px; flex-shrink: 0; font-size: 11px; font-weight: bold;">${TRAVERSE_LABELS[side]}:</span>
                  <input type="number" class="input-traverse-width-override flex-1 minw-0${widthOverridden ? ' is-overridden' : ''}" data-side="${side}" value="${displayWidth}" step="0.5" ${active ? '' : 'disabled'} />
                  <span class="hint no-shrink">mm</span>
                  ${widthOverridden
                      ? `<button type="button" class="btn-traverse-reset btn-reset" data-side="${side}" title="Wróć do wspólnej szerokości">↺</button>`
                      : '<span style="width: 24px; flex-shrink: 0;"></span>'
                  }
                </div>
              `;
            }).join('')}
            <div style="font-size: 10px; color: var(--border-strong);">Odznaczenie obu naraz nie jest możliwe — korpus musi mieć choć jeden trawers.</div>
          </div>
        `;
      })() : ''}

      <div class="property-group"><label>Plecy (Tylko dla szafki):</label><select id="input-back-type"><option value="nut" ${backP.type === 'nut' ? 'selected' : ''}>W nucie</option><option value="nakladane" ${backP.type === 'nakladane' ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${backP.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane (płyta między bokami)</option></select></div>
      <div class="property-group" id="back-decor-group" style="display: ${backP.type === 'wpuszczane' ? 'none' : 'block'};"><label class="fs-xs">Materiał pleców HDF (puste = jak w projekcie):</label>
        <input type="text" class="input" id="input-back-decor" list="back-decor-catalog" value="${escapeHtml((backP && backP.decor) || '')}" placeholder="np. HDF Woodeco HU1506 Kaszmirowy Beż 3mm" />
        <datalist id="back-decor-catalog">${catalogLabels(state.project).filter(l => /hdf/i.test(l)).map(l => `<option value="${escapeHtml(l)}"></option>`).join('')}</datalist></div>
      <div class="prop-box" id="inset-back-options" style="display: ${backP.type === 'wpuszczane' ? 'block' : 'none'};">
        <div class="property-group mb-0"><label class="fs-xs">Grubość pleców (mm):</label><input type="number" id="input-back-thickness" value="${resolveBackPanel(activeModule, state.project).thickness}" /></div>
        <div class="property-group mb-0"><label class="fs-xs">Cofnięcie od tyłu boków (mm):</label><input type="number" id="input-back-inset-offset" value="${backP.insetOffset || 0}" /></div>
      </div>
      <div class="prop-box" id="overlay-back-options" style="display: ${backP.type === 'nakladane' ? 'block' : 'none'};">
        <div class="property-group mb-0"><label class="fs-xs">Grubość pleców nakładanych (mm, puste = z projektu):</label><input type="number" id="input-back-overlay-thickness" value="${backP.overlayThickness > 0 ? backP.overlayThickness : ''}" placeholder="HDF" /></div>
        <div class="hint">Od ${BOARD_BACK_MIN} mm plecy są z płyty korpusu na pełny wymiar szafki (zakrywają tył boków).</div>
      </div>
      <div class="prop-box" id="nut-options" style="display: ${backP.type === 'nut' ? 'block' : 'none'};">
        <div class="property-group mb-8"><label style="font-size: 11px; font-weight: bold;">Konstrukcja nutu:</label><select id="input-nut-build"><option value="all" ${(!backP.nutBuild || backP.nutBuild === 'all') ? 'selected' : ''}>Boki i wieńce nutowane</option><option value="sides" ${backP.nutBuild === 'sides' ? 'selected' : ''}>Boki nutowane, wieńce skracane</option><option value="top_bottom" ${backP.nutBuild === 'top_bottom' ? 'selected' : ''}>Wieńce nutowane, boki skracane</option></select></div>
        <div class="property-group mb-8"><label class="fs-xs">Odsunięcie nutu (mm):</label><input type="number" id="input-back-offset" value="${backP.offset !== undefined ? backP.offset : 16}" /></div>
        <div class="property-group mb-0"><label class="fs-xs">Głębokość nutu (mm):</label><input type="number" id="input-back-groove" value="${backP.grooveDepth !== undefined ? backP.grooveDepth : 6}" /></div>
      </div>
    `)}

    ${tabContent("nogi", `
      <h3>Nóżki i Cokół</h3>
      <div class="property-group row-center">
        <input type="checkbox" id="input-legs-active" ${activeModule.legs.active ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
        <label for="input-legs-active" style="cursor: pointer; margin: 0; font-weight: bold;">Szafka stoi na nóżkach</label>
      </div>
      <div class="prop-box" id="legs-options" style="display: ${activeModule.legs.active ? 'block' : 'none'};">
        <div class="property-group mb-8"><label style="font-size: 11px;">Wysokość nóżek (mm):</label><input type="number" id="input-legs-height" value="${activeModule.legs.height}" /></div>
        <div class="property-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><input type="checkbox" id="input-plinth-active" ${activeModule.legs.plinth ? 'checked' : ''} style="width: 14px; height: 14px;" /><label style="font-size: 12px;">Generuj cokół przedni</label></div>
        ${plinthMaterialHtml(activeModule)}
        <div class="property-group mb-8"><label style="font-size: 11px;">Cofnięcie cokołu (mm):</label><input type="number" id="input-plinth-offset" value="${activeModule.legs.plinthOffset}" /></div>
        <div class="property-group mb-0"><label style="font-size: 11px;">Boki do podłogi:</label><select id="input-sides-to-floor">${[['none', 'Nie (boki na nóżkach)'], ['left', 'Lewy bok'], ['right', 'Prawy bok'], ['both', 'Oba boki']].map(([v, l]) => `<option value="${v}" ${(activeModule.legs.sidesToFloor || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>

      ${activeModule.legs.active ? `
        <h3>Nóżki — wysokości ręczne</h3>
        <div class="prop-box">
          ${LEG_LABELS.map((label, i) => {
              const overrideVal = activeModule.legs.heightOverrides ? activeModule.legs.heightOverrides[i] : undefined;
              const overridden = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
              const shownVal = overridden ? overrideVal : activeModule.legs.height;
              return `
              <div class="row-center tight">
                <span style="width: 76px; flex-shrink: 0; font-size: 11px; font-weight: 600;">${label}:</span>
                <input type="number" class="input-leg-height-override flex-1 minw-0${overridden ? ' is-overridden' : ''}" data-leg-index="${i}" value="${shownVal}" step="0.5" />
                <span style="font-size: 10px; flex-shrink: 0;">mm</span>
                ${overridden
                    ? `<button type="button" class="btn-leg-reset btn-reset" data-leg-index="${i}" title="Wróć do wspólnej wysokości">↺</button>`
                    : '<span style="width: 24px; flex-shrink: 0;"></span>'
                }
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

    `)}

    ${blindCornerSectionHtml(activeModule)}

    ${tabContent("zawiasy", `
      <div class="prop-box">
        <h3>Wymiary Osi Zawiasów (Lokalne)</h3>
        <div class="property-group" style="margin-bottom: ${actualTopText ? '12px' : '8px'};"><label class="fs-xs">Od góry do środka puszki (mm):</label><input type="number" id="input-hinge-top" value="${fh.topOffset}" step="0.5" />${actualTopText}</div>
        <div class="property-group" style="margin-bottom: ${actualBottomText ? '12px' : '8px'};"><label class="fs-xs">Od dołu do środka puszki (mm):</label><input type="number" id="input-hinge-bottom" value="${fh.bottomOffset}" step="0.5" />${actualBottomText}</div>
        <div class="property-group"><label class="fs-xs">Bezpieczny margines od półki (mm):</label><input type="number" id="input-hinge-margin" value="${fh.margin}" step="0.5" /></div>
        <div class="property-group" style="margin-top: 8px; margin-bottom: 0;"><label style="font-size: 11px; font-weight: 600;">Wymuś ilość zawiasów (0 = Auto):</label><input type="number" id="input-hinge-count" value="${fh.forceCount || 0}" step="0.5" style="border-color: var(--tone-emerald); background-color: var(--tint-emerald);" /></div>
      </div>

      <h3>Zawiasy — pozycje ręczne</h3>
      ${doorHingeGroups.length === 0 ? `
        <div class="hint">Ta szafka nie ma jeszcze żadnych drzwi.</div>
      ` : doorHingeGroups.map(group => `
        <div class="prop-box">
          <div class="prop-box-title">
            <i class="ti ti-door" aria-hidden="true"></i> ${escapeHtml(group.label)}
            <span style="font-weight: normal; color: var(--border-strong);">(wys. ${fmtMm(group.front.h)}mm, start ${fmtMm(group.front.y)}mm od dołu szafki)</span>
          </div>
          ${group.hinges.map((h, i) => {
              const overridden = group.front.hingeOverrides && group.front.hingeOverrides[i] !== undefined && group.front.hingeOverrides[i] !== null;
              return `
              <div class="row-center tight">
                <span style="width: 52px; flex-shrink: 0; font-size: 11px; font-weight: 600;">Zawias ${i + 1}:</span>
                <input type="number" class="input-hinge-override flex-1 minw-0${overridden ? ' is-overridden' : ''}" data-front-id="${escapeHtml(group.front.id)}" data-hinge-index="${i}" value="${h.y}" step="0.5" />
                <span class="hint no-shrink">mm</span>
                ${overridden
                    ? `<button type="button" class="btn-hinge-reset btn-reset" data-front-id="${escapeHtml(group.front.id)}" data-hinge-index="${i}" title="Wróć do automatycznej pozycji">↺</button>`
                    : (h.isAdjusted ? `<span title="Automatycznie odsunięty, żeby ominąć półkę/przeszkodę" style="flex-shrink: 0;"><i class="ti ti-alert-triangle" aria-hidden="true"></i></span>` : '<span style="width: 24px; flex-shrink: 0;"></span>')
                }
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
    `)}
  `;

  setupEventListeners();
}

function setupEventListeners() {
  if(!getActiveModule()) return;

  // Delegowane: po zmianie dowolnego pola odśwież kropki "własne ustawienia".
  const rs = document.querySelector('.sidebar-right');
  if (rs && !rs.dataset.dotsBound) {
    rs.dataset.dotsBound = '1';
    ['input', 'change'].forEach(ev => rs.addEventListener(ev, () => setTimeout(refreshOverrideDots, 0)));
  }

  bindSections(rs);

  const numberInputs = [
    'pos-x', 'pos-y', 'pos-z', 'traverse-width', 'joint-spacing', 'bottom-setback', 'board-thick', 'width', 'height', 'depth',
    'front-gap', 'front-body-gap', 'front-left', 'front-right', 'front-top', 'front-bottom', 'back-offset', 'back-groove', 'back-thickness', 'back-inset-offset', 'back-overlay-thickness',
    'legs-height', 'plinth-offset', 'hinge-top', 'hinge-bottom', 'hinge-margin', 'hinge-count',
    'filler-left-w', 'filler-left-h', 'filler-left-d', 'filler-left-y',
    'filler-right-w', 'filler-right-h', 'filler-right-d', 'filler-right-y',
    'filler-top-h', 'filler-top-w', 'filler-top-d', 'filler-top-y'
  ];

  const updateAll = () => { update3D(); updateSidebar(); };
  bindBlindCornerSection(rs, getActiveModule(), { refresh: updateAll, rerender: initPropertiesPanel });
  let typingTimer;

  // POPRAWKA: W trakcie wpisywania odświeża się tylko widok 3D, panel nie znika!
  const debouncedUpdateAll = () => { clearTimeout(typingTimer); typingTimer = setTimeout(() => { updateAll(); }, 50); };

  const nameInput = document.getElementById('input-mod-name');
  if (nameInput) {
      nameInput.addEventListener('input', (e) => {
          getSelectedMods().forEach(mod => { mod.name = e.target.value; });
          debouncedUpdateAll();
      });
      nameInput.addEventListener('change', () => initPropertiesPanel());
  }

  const legsActiveInput = document.getElementById('input-legs-active');
  const legsOptions = document.getElementById('legs-options');
  if (legsActiveInput && legsOptions) {
    legsActiveInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.active = e.target.checked; });
      legsOptions.style.display = e.target.checked ? 'block' : 'none';
      updateAll();
    });
  }

  // Listwa usztywniająca półki (core/shelfStiffener.js) - ustawienia szafki w mod.construction.shelfStiffener.
  const setStiffener = (key, value) => {
    getSelectedMods().forEach(mod => {
      mod.construction = mod.construction || {};
      mod.construction.shelfStiffener = { ...(mod.construction.shelfStiffener || {}), [key]: value };
    });
    updateAll();
  };
  const stiffActive = document.getElementById('input-stiffener-active');
  if (stiffActive) stiffActive.addEventListener('change', (e) => setStiffener('active', e.target.checked));
  [['input-stiffener-min', 'minLength'], ['input-stiffener-height', 'height']].forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (input) input.addEventListener('change', (e) => { const v = Number(e.target.value); if (v > 0) setStiffener(key, v); });
  });

  const plinthActiveInput = document.getElementById('input-plinth-active');
  if (plinthActiveInput) {
    plinthActiveInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.plinth = e.target.checked; });
      updateAll();
    });
  }

  // Materiał cokołu (core/plinthMaterial.js): select + pole dekoru dla „Dekor płyty”.
  const plinthMatSel = document.getElementById('input-plinth-material');
  const plinthDecorInput = document.getElementById('input-plinth-decor');
  const savePlinthMaterial = () => {
    let v = plinthMatSel.value;
    plinthDecorInput.parentElement.style.display = v === 'decor' ? '' : 'none';
    if (v === 'decor') {
      const d = plinthDecorInput.value.trim();
      if (!d) return; // czeka na wpisanie dekoru
      v = 'decor:' + d;
    }
    getSelectedMods().forEach(mod => {
      if (!mod.legs) return;
      if (v) mod.legs.plinthMaterial = v; else delete mod.legs.plinthMaterial;
    });
    updateAll();
  };
  if (plinthMatSel) plinthMatSel.addEventListener('change', savePlinthMaterial);
  if (plinthDecorInput) plinthDecorInput.addEventListener('change', savePlinthMaterial);

  const sidesToFloorInput = document.getElementById('input-sides-to-floor');
  if (sidesToFloorInput) {
    sidesToFloorInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.sidesToFloor = e.target.value; });
      updateAll();
    });
  }

  const joinTypeInput = document.getElementById('input-join-type');
  if (joinTypeInput) joinTypeInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.construction = mod.construction || {}; mod.construction.joinType = e.target.value; }); updateAll();
  });
  const topTypeInput = document.getElementById('input-top-type');
  const traverseOptions = document.getElementById('traverse-options');
  if (topTypeInput && traverseOptions) topTypeInput.addEventListener('change', (e) => {
      // „bez wieńca górnego” zmienia światło korpusu - wnętrze się dopasowuje
      getSelectedMods().forEach(mod => refitInterior(mod, () => { mod.construction = mod.construction || {}; mod.construction.topType = e.target.value; }));
      updateAll();
      initPropertiesPanel(); // odsłania/chowa sekcję "Trawersy — ustawienia ręczne", nie tylko #traverse-options
  });
  const typeInput = document.getElementById('input-front-type');
  if (typeInput) typeInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.type = e.target.value; }); updateAll();
      initPropertiesPanel(); // luzy Auto są tylko dla frontów nakładanych - blok luzów się zmienia
  });
  document.getElementById('input-drawerbox-korpus')?.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.drawerBoxFromKorpus = e.target.checked; }); updateAll();
  });
  const drawerSysInput = document.getElementById('input-drawer-system');
  if(drawerSysInput) drawerSysInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.drawerSystem = e.target.value; }); updateAll();
      // Lista szuflad zależy od systemu (warianty boku albo wysokość boku MOVENTO).
      initPropertiesPanel();
  });
  // Przełącznik luzów Auto / ręcznych. Włączenie kasuje luzy wpisane w szafce (inaczej
  // miałyby pierwszeństwo przed Auto); wyłączenie wpisuje do szafki obecnie obowiązujące
  // wartości, żeby fronty nie zmieniły wymiaru od samego przełączenia.
  document.getElementById('input-clearance-auto')?.addEventListener('change', (e) => {
    getSelectedMods().forEach(mod => {
      if (mod.type === 'corner_cabinet' || mod.type === 'slope_cabinet') return;
      mod.front = mod.front || {};
      if (e.target.checked) {
        mod.front.clearanceAuto = true;
        delete mod.front.clearance;
      } else {
        const now = frontClearance(mod, state.project);
        mod.front.clearanceAuto = false;
        mod.front.clearance = { left: now.left ?? now.sides ?? 1.5, right: now.right ?? now.sides ?? 1.5, top: now.top ?? 2, bottom: now.bottom ?? 2 };
      }
    });
    updateAll();
    initPropertiesPanel();
  });
  const backType = document.getElementById('input-back-type');
  const nutOptions = document.getElementById('nut-options');
  if (backType && nutOptions) {
    backType.addEventListener('change', (e) => {
        getSelectedMods().forEach(mod => { mod.backPanel = mod.backPanel || {}; mod.backPanel.type = e.target.value; });
        nutOptions.style.display = e.target.value === 'nut' ? 'block' : 'none';
        const insetOptions = document.getElementById('inset-back-options');
        if (insetOptions) insetOptions.style.display = e.target.value === 'wpuszczane' ? 'block' : 'none';
        const overlayOptions = document.getElementById('overlay-back-options');
        if (overlayOptions) overlayOptions.style.display = e.target.value === 'nakladane' ? 'block' : 'none';
        const decorGroup = document.getElementById('back-decor-group');
        if (decorGroup) decorGroup.style.display = e.target.value === 'wpuszczane' ? 'none' : 'block';
        updateAll();
    });
  }
  // Materiał pleców HDF (np. kaszmir do korpusu U702) - formatki „Plecy: <dekor>”, osobna cena i rozkrój.
  const backDecor = document.getElementById('input-back-decor');
  if (backDecor) backDecor.addEventListener('change', (e) => {
    const v = e.target.value.trim();
    getSelectedMods().forEach(mod => {
      mod.backPanel = mod.backPanel || {};
      if (v) mod.backPanel.decor = v; else delete mod.backPanel.decor;
    });
    if (v) addCatalogDecor(state.project, { name: v });
    updateAll();
  });
  const nutBuildInput = document.getElementById('input-nut-build');
  if (nutBuildInput) nutBuildInput.addEventListener('change', (e) => { getSelectedMods().forEach(mod => { mod.backPanel = mod.backPanel || {}; mod.backPanel.nutBuild = e.target.value; }); updateAll(); });

  const findFront = (frontId) => {
    const mod = getActiveModule();
    return mod?.elements?.find(el => el.id === frontId);
  };
  document.querySelectorAll('.input-hinge-override').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      const idx = parseInt(inp.dataset.hingeIndex, 10);
      if (front) {
        const val = e.target.value === '' ? null : Number(e.target.value);
        if (val === null || isNaN(val)) {
          if (front.hingeOverrides) delete front.hingeOverrides[idx];
        } else {
          if (!front.hingeOverrides) front.hingeOverrides = {};
          front.hingeOverrides[idx] = val;
        }
      }
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.btn-hinge-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const front = findFront(btn.dataset.frontId);
      const idx = parseInt(btn.dataset.hingeIndex, 10);
      if (front && front.hingeOverrides) delete front.hingeOverrides[idx];
      updateAll();
      initPropertiesPanel();
    });
  });

  // Dekor korpusu per szafka (core/materialCatalog.js: moduleKorpusDecor) - dla wszystkich zaznaczonych.
  document.getElementById('input-korpus-decor')?.addEventListener('change', (e) => {
    const v = e.target.value.trim();
    getSelectedMods().forEach(mod => setModuleKorpusDecor(mod, v, state.project)); // grubość z dekoru dopasowuje wnętrze
    updateAll();
    initPropertiesPanel(); // podpowiedź grubości płyty z dekoru
  });

  document.querySelectorAll('.input-leg-height-override').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = parseInt(inp.dataset.legIndex, 10);
      getSelectedMods().forEach(mod => {
        if (!mod.legs) return;
        const val = e.target.value === '' ? null : Number(e.target.value);
        if (val === null || isNaN(val)) {
          if (mod.legs.heightOverrides) delete mod.legs.heightOverrides[idx];
        } else {
          if (!mod.legs.heightOverrides) mod.legs.heightOverrides = {};
          mod.legs.heightOverrides[idx] = val;
        }
      });
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.btn-leg-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.legIndex, 10);
      getSelectedMods().forEach(mod => {
        if (mod.legs && mod.legs.heightOverrides) delete mod.legs.heightOverrides[idx];
      });
      updateAll();
      initPropertiesPanel();
    });
  });

  const mergedConstruction = (mod) => ({ joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(mod.construction || {}) });
  document.querySelectorAll('.input-traverse-active').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const side = chk.dataset.side;
      const otherSide = side === 'front' ? 'rear' : 'front';
      const wantActive = e.target.checked;
      getSelectedMods().forEach(mod => {
        mod.construction = mod.construction || {};
        // Nie pozwól wyłączyć obu trawersów naraz — korpus zostałby otwarty od góry.
        if (!wantActive && !getTraverseConfig(mergedConstruction(mod))[otherSide].active) return;
        mod.construction.traverses = mod.construction.traverses || {};
        mod.construction.traverses[side] = { ...(mod.construction.traverses[side] || {}), active: wantActive };
      });
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.input-traverse-width-override').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const side = inp.dataset.side;
      const val = e.target.value === '' ? null : Number(e.target.value);
      getSelectedMods().forEach(mod => {
        mod.construction = mod.construction || {};
        mod.construction.traverses = mod.construction.traverses || {};
        const sideCfg = { ...(mod.construction.traverses[side] || {}) };
        if (val === null || isNaN(val)) delete sideCfg.width;
        else sideCfg.width = val;
        mod.construction.traverses[side] = sideCfg;
      });
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.btn-traverse-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.side;
      getSelectedMods().forEach(mod => {
        if (mod.construction?.traverses?.[side]) delete mod.construction.traverses[side].width;
      });
      updateAll();
      initPropertiesPanel();
    });
  });

  // Luz od osi wieńca per front (pola w sekcji Front).
  const wireFrontNumberOverride = (className, field) => {
    document.querySelectorAll(`.${className}`).forEach(inp => {
      inp.addEventListener('change', (e) => {
        const front = findFront(inp.dataset.frontId);
        if (front) {
          const val = e.target.value === '' ? null : Number(e.target.value);
          front[field] = (val === null || isNaN(val)) ? (field.startsWith('forceOffset') ? 0 : null) : val;
        }
        updateAll();
        initPropertiesPanel();
      });
    });
  };
  wireFrontNumberOverride('input-front-axisgap-top', 'gapFromAxisTop');
  wireFrontNumberOverride('input-front-axisgap-bottom', 'gapFromAxisBottom');
  document.getElementById('input-fronts-material-all')?.addEventListener('change', (e) => {
    if (!assignFrontMaterialByName(getSelectedMods(), e.target.value, state.project)) return;
    updateAll();
    initPropertiesPanel();
  });
  document.querySelectorAll('.input-front-material').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const front = findFront(sel.dataset.frontId);
      if (!front) return;
      if (e.target.value === '__new__') {
        // Nowy materiał powstaje TUTAJ (nie w Kosztorysie) - Kosztorys pokazuje
        // tylko materiały faktycznie użyte (zgłoszona uwaga), więc pusty,
        // jeszcze nieprzypisany wpis tam by się nie pojawił i nie dało by się
        // go w ogóle stworzyć.
        const name = await showCustomDialog('prompt', 'Nowy materiał frontu', 'Nazwa materiału (cenę ustawisz w Kosztorysie, gdy już będzie użyty):', '', 'Dodaj');
        if (!name || !name.trim()) { sel.value = front.materialId || (state.project.pricing.frontMaterials[0]?.id ?? ''); return; }
        const id = 'mat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        state.project.pricing.frontMaterials.push({ id, name: name.trim(), pricePerM2: 0 });
        front.materialId = id;
      } else {
        front.materialId = e.target.value;
      }
      updateAll();
      initPropertiesPanel();
    });
  });

  bindDrawerCards(document.querySelector('.sidebar-right'), getActiveModule(), () => { updateAll(); initPropertiesPanel(); });

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        // width/height/depth to pola tekstowe (nie number) - pozwalają wpisać
        // działanie, np. "400+18" (patrz utils/math.js: evalDimensionExpr).
        // Reszta (pozycje, luzy, marginesy...) zostaje przy zwykłym Number(),
        // to wciąż są input[type=number].
        const isExprField = id === 'width' || id === 'height' || id === 'depth';
        const val = isExprField ? evalDimensionExpr(e.target.value) : (e.target.value === '' ? null : Number(e.target.value));
        // Wyrażenie bywa chwilowo niepoprawne w trakcie pisania (np. samo
        // "400+") - wtedy nie aktualizujemy wymiaru, żeby nie nadpisać go
        // zerem/NaN w połowie wpisywania.
        if (isExprField && Number.isNaN(val)) return;
        getSelectedMods().forEach(mod => {

            if (['hinge-top', 'hinge-bottom', 'hinge-margin', 'hinge-count'].includes(id)) {
                if (!mod.front) mod.front = {};
                if (!mod.front.hinges) mod.front.hinges = { topOffset: 100, bottomOffset: 100, margin: 40, forceCount: 0 };
                if (id === 'hinge-top') mod.front.hinges.topOffset = val;
                if (id === 'hinge-bottom') mod.front.hinges.bottomOffset = val;
                if (id === 'hinge-margin') mod.front.hinges.margin = val;
                if (id === 'hinge-count') mod.front.hinges.forceCount = val;
            }

            if (id === 'pos-x') mod.position.x = val;
            if (id === 'pos-y') mod.position.y = val;
            if (id === 'pos-z') mod.position.z = val;
            if (id === 'legs-height') {
              if (!mod.legs) mod.legs = { active: true, height: 100, plinth: true, plinthOffset: 40 };
              mod.legs.height = val;
            }
            if (id === 'plinth-offset') {
              if (!mod.legs) mod.legs = { active: true, height: 100, plinth: true, plinthOffset: 40 };
              mod.legs.plinthOffset = val === null ? 0 : val;
            }
            if (id === 'traverse-width') { mod.construction = mod.construction || {}; mod.construction.traverseWidth = val; }
            if (id === 'bottom-setback') { mod.construction = mod.construction || {}; mod.construction.bottomSetback = Math.max(0, val || 0); }
            if (id === 'joint-spacing' && val >= 64) { mod.construction = mod.construction || {}; mod.construction.jointSpacing = val; }
            if (id === 'board-thick') state.project.materials.boardThickness = val;

            if (id === 'width') {
              if (val < 50) return;
              const oldWidth = parseFloat(mod.dimensions.width) || 0;
              const th = moduleBoardThickness(mod, state.project);
              const innerOldX = oldWidth - 2 * th;
              const innerNewX = val - 2 * th;
              if (innerOldX > 0 && innerNewX > 0 && mod.elements) {
                  // Drzewo wnęk PRZED zmianą szerokości (core/zoneTree.js) - rescaleSubtree
                  // przelicza piony/poziomy z poszanowaniem zablokowanych wymiarów (kłódka w
                  // edytorze wnętrza). Wcześniej ten kod przeliczał wszystko proporcjonalnie
                  // wprost po współrzędnych, ignorując blokadę - zgłoszony błąd: zablokowana
                  // przestrzeń między półkami zmieniała się przy zmianie innego wymiaru.
                  const tree = buildZoneTree(mod);
                  rescaleSubtree(tree, 'x', th, th + innerOldX, th, th + innerNewX);
                  mod.elements.forEach(el => {
                      if (el.typ === 'front' && el.baseZone && !el.baseZone.boundLeft) {
                          el.baseZone.minX = th + (((parseFloat(el.baseZone.minX) - th) / innerOldX) * innerNewX);
                          el.baseZone.maxX = th + (((parseFloat(el.baseZone.maxX) - th) / innerOldX) * innerNewX);
                      }
                  });
              }
              shiftRowAfterResize(mod, val);
              mod.dimensions.width = val;
            }

            if (id === 'height') {
              if (val < 50) return;
              const oldHeight = parseFloat(mod.dimensions.height) || 0;
              const th = moduleBoardThickness(mod, state.project);
              const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(mod.construction || {}) };
              let topZoneH = (cons.topType === 'trawersy_pion') ? (parseFloat(cons.traverseWidth) || 100) : th;
              const innerOldY = oldHeight - th - topZoneH;
              const innerNewY = val - th - topZoneH;
              if (innerOldY > 0 && innerNewY > 0 && mod.elements) {
                  // Jak przy szerokości wyżej - rescaleSubtree z core/zoneTree.js respektuje
                  // zablokowane wymiary zamiast przeliczać wszystko proporcjonalnie na ślepo.
                  const tree = buildZoneTree(mod);
                  rescaleSubtree(tree, 'y', th, th + innerOldY, th, th + innerNewY);
                  mod.elements.forEach(el => {
                      if (el.typ === 'front' && el.baseZone && !el.baseZone.boundBottom) {
                          el.baseZone.minY = th + (((parseFloat(el.baseZone.minY) - th) / innerOldY) * innerNewY);
                          el.baseZone.maxY = th + (((parseFloat(el.baseZone.maxY) - th) / innerOldY) * innerNewY);
                      }
                  });
              }
              mod.dimensions.height = val;
            }
            if (id === 'depth') mod.dimensions.depth = val;

            if (!mod.front) mod.front = {};
            if (!mod.front.clearance) mod.front.clearance = {};
            if (id === 'front-gap') mod.front.gap = val;
            if (id === 'front-body-gap') {
              if (val === null) delete mod.front.bodyGap;
              else mod.front.bodyGap = Math.max(0, val);
            }
            if (id === 'front-left') mod.front.clearance.left = val;
            if (id === 'front-right') mod.front.clearance.right = val;
            if (id === 'front-top') mod.front.clearance.top = val;
            if (id === 'front-bottom') mod.front.clearance.bottom = val;
            if ((id === "back-offset" || id === "back-groove" || id === "back-thickness" || id === "back-inset-offset" || id === "back-overlay-thickness") && !mod.backPanel) mod.backPanel = {};
            if (id === 'back-overlay-thickness') {
              if (val > 0) mod.backPanel.overlayThickness = val;
              else delete mod.backPanel.overlayThickness;
            }
            if (id === 'back-offset') mod.backPanel.offset = val;
            if (id === 'back-groove') mod.backPanel.grooveDepth = val;
            if (id === 'back-thickness' && val > 0) {
              // grubość taka jak płyta korpusu = bez własnego wpisu (zmiana dekoru ją zmieni)
              delete mod.backPanel.thickness;
              if (resolveBackPanel(mod, state.project).thickness !== val) mod.backPanel.thickness = val;
            }
            if (id === 'back-inset-offset') mod.backPanel.insetOffset = Math.max(0, val || 0);
        });
        debouncedUpdateAll();
      });

      // POPRAWKA: Po zakończeniu wpisywania, zaktualizuj pełen panel boczny
      el.addEventListener('change', () => {
        // Ręczne wpisanie pozycji/wymiaru mogło wystawić szafkę poza pokój - dopiero
        // po skończeniu wpisywania (nie na każdy znak), żeby nie "walczyć" z użytkownikiem.
        if (['pos-x', 'pos-z', 'width', 'depth', 'filler-left-w', 'filler-right-w'].includes(id)) {
          getSelectedMods().forEach(mod => clampModuleToRoom(mod));
        }
        // Budowanie szafy z dwóch modułów jeden na drugim - wpisanie wysokości
        // "na oko" (np. o kilka mm za mało) zostawiało moduł zatopiony w
        // sąsiadującym, z którym akurat nachodzi w pionie (patrz
        // core/layout.js: restModuleOnNeighbors - to ta sama poprawka, co przy
        // przeciąganiu w 3D, tylko dla wpisania wartości ręcznie w to pole).
        if (id === 'pos-y') {
          getSelectedMods().forEach(mod => restModuleOnNeighbors(mod));
        }
        initPropertiesPanel();
      });
    }
  });

  document.querySelectorAll('.btn-rotate').forEach(btn => {
    btn.addEventListener('click', () => {
      const rot = parseInt(btn.dataset.rot, 10);
      getSelectedMods().forEach(mod => {
        mod.rotation = rot;
        clampModuleToRoom(mod); // obrót zamienia W/D odcisku - szafka przy ścianie mogła by teraz z niej wystawać
      });
      updateAll();
      initPropertiesPanel();
    });
  });

  document.getElementById('btn-edit-wall-row')?.addEventListener('click', () => {
    const mod = getActiveModule();
    if (mod) openWallFillModal(() => { initPropertiesPanel(); updateAll(); }, { editModuleId: mod.id });
  });
  document.getElementById('btn-edit-kitchen-run')?.addEventListener('click', () => {
    const mod = getActiveModule();
    if (mod) openWallFillModal(() => { initPropertiesPanel(); updateAll(); }, { editKitchenId: mod.id });
  });

  bindGroupButtons(getActiveModule()?.groupId, () => { updateAll(); initPropertiesPanel(); });

  document.getElementById('btn-only-this')?.addEventListener('click', () => {
    state.selectedModules = new Set(state.activeModuleId ? [state.activeModuleId] : []);
    state.selectedSidePanels = new Set();
    updateAll();
    initPropertiesPanel();
  });
}
