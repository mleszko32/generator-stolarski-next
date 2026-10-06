// src/ui/properties.js
import { state, getActiveModule } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { calculateParts } from "../engine/cabinet.js";
import { calculateHinges } from "../core/hingeMath.js";
import { getTraverseConfig, clampModuleToRoom, restModuleOnNeighbors } from "../core/layout.js";
import { getDrawerBoxInfo } from "../core/drawerBoxes.js";
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

function getSelectedMods() {
    if (state.selectedModules && state.selectedModules.size > 0) {
        return Array.from(state.selectedModules).map(id => state.project.modules.find(m => m.id === id)).filter(Boolean);
    }
    const active = getActiveModule();
    return active ? [active] : [];
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
    front: diffKeys(mod.front, proj.front, ['hinges', 'distribution', 'drawerSystem']).length > 0,
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
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8; text-align: center; padding: 20px;">
        <span style="font-size: 40px; margin-bottom: 10px;"><i class="ti ti-settings" aria-hidden="true"></i></span>
        <h3 style="margin: 0; color: #64748b; text-transform: none; letter-spacing: normal; border-bottom: none; font-size: 15px;">Brak aktywnej szafki</h3>
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

  const multiCount = state.selectedModules && state.selectedModules.size > 1 ? state.selectedModules.size : 1;
  if (!activeModule.legs) activeModule.legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(activeModule.construction || {}) };
  const backP = activeModule.backPanel;
  const f = { ...(state.project.front || {}), ...(activeModule.front || {}) };
  const fc = { ...(state.project.front?.clearance || {}), ...(activeModule.front?.clearance || {}) };
  const fh = { topOffset: 100, bottomOffset: 100, margin: 40, forceCount: 0, ...(state.project.front?.hinges || {}), ...(activeModule.front?.hinges || {}) };
  const th = parseFloat(state.project.materials.boardThickness) || 18;

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
      .filter(el => el.typ === 'front' && el.subtype && el.subtype.includes('drzwi'))
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
  const selectedIdsForGroup = state.selectedModules && state.selectedModules.size > 1
      ? Array.from(state.selectedModules)
      : [];
  const canCombineIntoGroup = selectedIdsForGroup.length > 1 && !(() => {
      const first = state.project.modules.find(m => m.id === selectedIdsForGroup[0]);
      return first && first.groupId && selectedIdsForGroup.every(id => {
          const m = state.project.modules.find(md => md.id === id);
          return m && m.groupId === first.groupId;
      });
  })();

  // Sekcje, w których TA szafka ma własne ustawienia nadpisujące domyślne
  // projektu (mod.front / mod.construction są scalane nad ustawieniami projektu).
  const overridden = computeOverridden(activeModule);

  const tabContent = (id, html) => sectionHtml(id, html, overridden[id]);

  rightSidebar.innerHTML = `
    ${propHeaderHtml({
      name: activeModule.name,
      dims: `${activeModule.dimensions.width}×${activeModule.dimensions.height}×${activeModule.dimensions.depth}`,
      extra: multiCount > 1 ? `zaznaczono ${multiCount}` : '',
      nameId: 'input-mod-name',
    })}

    ${moduleInfoHtml(activeModule)}

    ${tabContent("wymiary", `
      <h3>Wymiary Modułu</h3>
      <div class="property-group"><label>Szerokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-width" value="${activeModule.dimensions.width}" /></div>
      <div class="property-group"><label>Wysokość korpusu (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-height" value="${activeModule.dimensions.height}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-depth" value="${activeModule.dimensions.depth}" /></div>

      <hr class="divider">

      ${positionRotationHtml({
        prefix: 'input-pos', position: activeModule.position, rotation: activeModule.rotation,
        rotClass: 'btn-rotate', hint: 'Skrót: klawisz R obraca aktywną szafkę o +90°.',
      })}

      ${(canCombineIntoGroup || activeModule.groupId) ? `
        <h3>Grupowanie</h3>
        <div class="property-group" style="display: flex; flex-direction: column; gap: 6px;">
          ${canCombineIntoGroup ? `<button type="button" id="btn-group-combine" class="btn btn-sm"><i class="ti ti-link" aria-hidden="true"></i> Połącz zaznaczone w grupę</button>` : ''}
          ${activeModule.groupId ? `<button type="button" id="btn-group-split" class="btn btn-sm btn-danger"><i class="ti ti-scissors" aria-hidden="true"></i> Rozbij grupę</button>` : ''}
        </div>
      ` : ''}
    `)}

    ${tabContent("front", `
      <h3>Ustawienia Frontów</h3>
      <div id="group-front-clearance">
        <div class="property-group"><label>Typ frontów:</label><select id="input-front-type"><option value="nakladane" ${(!f.type || f.type === 'nakladane') ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${f.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option></select></div>
        <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" id="input-front-gap" value="${f.gap ?? 3}" step="0.5" /></div>
        <div class="property-group"><label>Luz lewy (mm):</label><input type="number" id="input-front-left" value="${fc.left ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz prawy (mm):</label><input type="number" id="input-front-right" value="${fc.right ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz góra (mm):</label><input type="number" id="input-front-top" value="${fc.top ?? 2}" step="0.5" /></div>
        <div class="property-group"><label>Luz dół (mm):</label><input type="number" id="input-front-bottom" value="${fc.bottom ?? 2}" step="0.5" /></div>
      </div>
      <div class="hint">Powyższe "Luz góra/dół" działają tylko na krawędzi, które dotykają prawdziwej góry/dołu korpusu. Front kończący się na wewnętrznym wieńcu/półce ma nakładanie liczone osobno (patrz niżej).</div>

      ${allFrontsList.length ? `
        <h3>Materiał frontu (per front)</h3>
        <div class="hint" style="margin-bottom: 8px;">Ceny edytujesz w Kosztorysie (Produkcja i raporty) — pokazuje tam tylko materiały faktycznie użyte przez jakiś front. Bez wyboru liczy się pierwszy materiał z listy. "+ Nowy materiał…" dopisuje pozycję do listy i od razu ją przypisuje tu.</div>
        ${allFrontsList.map(({ front, label }) => `
          <div class="property-group mb-8">
            <label class="fs-xs">${escapeHtml(label)} — materiał:</label>
            <select class="input-front-material" data-front-id="${front.id}">
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
              <input type="number" class="input-front-axisgap-top" data-front-id="${front.id}" placeholder="Auto (gap/2)" value="${front.gapFromAxisTop ?? ''}" step="0.5" />
            </div>
            <div class="property-group grow">
              <label class="fs-xs">— od osi dół [mm]:</label>
              <input type="number" class="input-front-axisgap-bottom" data-front-id="${front.id}" placeholder="Auto (gap/2)" value="${front.gapFromAxisBottom ?? ''}" step="0.5" />
            </div>
          </div>
        `).join('')}
      ` : ''}

    `)}

    ${tabContent("szuflady", `
      <h3>Ustawienia Szuflad</h3>
      <div class="property-group"><label>System szuflad:</label><select id="input-drawer-system"><option value="merivobox" ${f.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option><option value="legrabox" ${f.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option><option value="tandembox" ${f.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX</option><option value="antaro" ${f.drawerSystem === 'antaro' ? 'selected' : ''}>Blum TANDEMBOX antaro</option><option value="gtv_axis_16" ${f.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option><option value="gtv_axis_18" ${f.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option><option value="movento_katalog" ${f.drawerSystem === 'movento_katalog' ? 'selected' : ''}>Blum MOVENTO — katalog (bok 16 mm)</option><option value="movento_forum" ${f.drawerSystem === 'movento_forum' ? 'selected' : ''}>Blum MOVENTO — forum (bok 18 mm)</option></select></div>

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
      <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" /></div>
      <div class="property-group"><label>Sposób łączenia:</label><select id="input-join-type"><option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option><option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option></select></div>
      <div class="property-group"><label>Zamknięcie góry:</label><select id="input-top-type"><option value="pelny" ${cons.topType === 'pelny' ? 'selected' : ''}>Pełny wieniec</option><option value="trawersy_poziom" ${cons.topType === 'trawersy_poziom' ? 'selected' : ''}>Trawersy poziome</option><option value="trawersy_pion" ${cons.topType === 'trawersy_pion' ? 'selected' : ''}>Trawersy pionowe</option></select></div>
      <div class="prop-box" id="traverse-options" style="display: ${cons.topType !== 'pelny' ? 'block' : 'none'};"><div class="property-group mb-0"><label class="fs-xs">Szerokość trawersu (mm):</label><input type="number" id="input-traverse-width" value="${cons.traverseWidth}" /></div></div>

      ${cons.topType !== 'pelny' ? (() => {
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
            <div style="font-size: 10px; color: #94a3b8;">Odznaczenie obu naraz nie jest możliwe — korpus musi mieć choć jeden trawers.</div>
          </div>
        `;
      })() : ''}

      <div class="property-group"><label>Plecy (Tylko dla szafki):</label><select id="input-back-type"><option value="nut" ${backP.type === 'nut' ? 'selected' : ''}>W nucie</option><option value="nakladane" ${backP.type === 'nakladane' ? 'selected' : ''}>Nakładane</option></select></div>
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
        <div class="property-group mb-0"><label style="font-size: 11px;">Cofnięcie cokołu (mm):</label><input type="number" id="input-plinth-offset" value="${activeModule.legs.plinthOffset}" /></div>
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

    ${tabContent("zawiasy", `
      <div class="prop-box">
        <h3>Wymiary Osi Zawiasów (Lokalne)</h3>
        <div class="property-group" style="margin-bottom: ${actualTopText ? '12px' : '8px'};"><label class="fs-xs">Od góry do środka puszki (mm):</label><input type="number" id="input-hinge-top" value="${fh.topOffset}" step="0.5" />${actualTopText}</div>
        <div class="property-group" style="margin-bottom: ${actualBottomText ? '12px' : '8px'};"><label class="fs-xs">Od dołu do środka puszki (mm):</label><input type="number" id="input-hinge-bottom" value="${fh.bottomOffset}" step="0.5" />${actualBottomText}</div>
        <div class="property-group"><label class="fs-xs">Bezpieczny margines od półki (mm):</label><input type="number" id="input-hinge-margin" value="${fh.margin}" step="0.5" /></div>
        <div class="property-group" style="margin-top: 8px; margin-bottom: 0;"><label style="font-size: 11px; font-weight: 600;">Wymuś ilość zawiasów (0 = Auto):</label><input type="number" id="input-hinge-count" value="${fh.forceCount || 0}" step="0.5" style="border-color: #34d399; background-color: #d1fae5;" /></div>
      </div>

      <h3>Zawiasy — pozycje ręczne</h3>
      ${doorHingeGroups.length === 0 ? `
        <div class="hint">Ta szafka nie ma jeszcze żadnych drzwi.</div>
      ` : doorHingeGroups.map(group => `
        <div class="prop-box">
          <div class="prop-box-title">
            <i class="ti ti-door" aria-hidden="true"></i> ${escapeHtml(group.label)}
            <span style="font-weight: normal; color: #94a3b8;">(wys. ${fmtMm(group.front.h)}mm, start ${fmtMm(group.front.y)}mm od dołu szafki)</span>
          </div>
          ${group.hinges.map((h, i) => {
              const overridden = group.front.hingeOverrides && group.front.hingeOverrides[i] !== undefined && group.front.hingeOverrides[i] !== null;
              return `
              <div class="row-center tight">
                <span style="width: 52px; flex-shrink: 0; font-size: 11px; font-weight: 600;">Zawias ${i + 1}:</span>
                <input type="number" class="input-hinge-override flex-1 minw-0${overridden ? ' is-overridden' : ''}" data-front-id="${group.front.id}" data-hinge-index="${i}" value="${h.y}" step="0.5" />
                <span class="hint no-shrink">mm</span>
                ${overridden
                    ? `<button type="button" class="btn-hinge-reset btn-reset" data-front-id="${group.front.id}" data-hinge-index="${i}" title="Wróć do automatycznej pozycji">↺</button>`
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
    'pos-x', 'pos-y', 'pos-z', 'traverse-width', 'board-thick', 'width', 'height', 'depth',
    'front-gap', 'front-left', 'front-right', 'front-top', 'front-bottom', 'back-offset', 'back-groove',
    'legs-height', 'plinth-offset', 'hinge-top', 'hinge-bottom', 'hinge-margin', 'hinge-count',
    'filler-left-w', 'filler-left-h', 'filler-left-d', 'filler-left-y',
    'filler-right-w', 'filler-right-h', 'filler-right-d', 'filler-right-y',
    'filler-top-h', 'filler-top-w', 'filler-top-d', 'filler-top-y'
  ];

  const updateAll = () => { update3D(); updateSidebar(); };
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

  const plinthActiveInput = document.getElementById('input-plinth-active');
  if (plinthActiveInput) {
    plinthActiveInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.legs.plinth = e.target.checked; });
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
      getSelectedMods().forEach(mod => { mod.construction = mod.construction || {}; mod.construction.topType = e.target.value; });
      updateAll();
      initPropertiesPanel(); // odsłania/chowa sekcję "Trawersy — ustawienia ręczne", nie tylko #traverse-options
  });
  const typeInput = document.getElementById('input-front-type');
  if (typeInput) typeInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.type = e.target.value; }); updateAll();
  });
  const drawerSysInput = document.getElementById('input-drawer-system');
  if(drawerSysInput) drawerSysInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.drawerSystem = e.target.value; }); updateAll();
      // Lista szuflad zależy od systemu (warianty boku albo wysokość boku MOVENTO).
      initPropertiesPanel();
  });
  const backType = document.getElementById('input-back-type');
  const nutOptions = document.getElementById('nut-options');
  if (backType && nutOptions) {
    backType.addEventListener('change', (e) => {
        getSelectedMods().forEach(mod => { mod.backPanel.type = e.target.value; });
        nutOptions.style.display = e.target.value === 'nut' ? 'block' : 'none'; updateAll();
    });
  }
  const nutBuildInput = document.getElementById('input-nut-build');
  if (nutBuildInput) nutBuildInput.addEventListener('change', (e) => { getSelectedMods().forEach(mod => { mod.backPanel.nutBuild = e.target.value; }); updateAll(); });

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
            if (id === 'board-thick') state.project.materials.boardThickness = val;

            if (id === 'width') {
              if (val < 50) return;
              const oldWidth = parseFloat(mod.dimensions.width) || 0;
              const delta = val - oldWidth;
              const th = parseFloat(state.project.materials.boardThickness) || 18;
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
              mod.dimensions.width = val;
              state.project.modules.forEach(otherMod => {
                if (otherMod.id !== mod.id && otherMod.position.x >= (mod.position.x + oldWidth - 1)) otherMod.position.x += delta;
              });
            }

            if (id === 'height') {
              if (val < 50) return;
              const oldHeight = parseFloat(mod.dimensions.height) || 0;
              const th = parseFloat(state.project.materials.boardThickness) || 18;
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
            if (id === 'front-left') mod.front.clearance.left = val;
            if (id === 'front-right') mod.front.clearance.right = val;
            if (id === 'front-top') mod.front.clearance.top = val;
            if (id === 'front-bottom') mod.front.clearance.bottom = val;
            if (id === 'back-offset') mod.backPanel.offset = val;
            if (id === 'back-groove') mod.backPanel.grooveDepth = val;
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

  const btnGroupCombine = document.getElementById('btn-group-combine');
  if (btnGroupCombine) {
    btnGroupCombine.addEventListener('click', () => {
      const newGroupId = 'group-' + Date.now();
      state.selectedModules.forEach(id => {
        const m = state.project.modules.find(md => md.id === id);
        if (m) m.groupId = newGroupId;
      });
      updateAll();
      initPropertiesPanel();
    });
  }
  const btnGroupSplit = document.getElementById('btn-group-split');
  if (btnGroupSplit) {
    btnGroupSplit.addEventListener('click', () => {
      const mod = getActiveModule();
      if (!mod || !mod.groupId) return;
      const gId = mod.groupId;
      state.project.modules.forEach(m => {
        if (m.groupId === gId) delete m.groupId;
      });
      state.selectedModules = new Set([mod.id]);
      updateAll();
      initPropertiesPanel();
    });
  }
}
