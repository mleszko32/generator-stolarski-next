// src/ui/properties.js
import { state, getActiveModule } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { calculateParts } from "../engine/cabinet.js";
import { calculateHinges } from "../core/hingeMath.js";
import { escapeHtml } from "../utils/dom.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";

function getSelectedMods() {
    if (state.selectedModules && state.selectedModules.size > 0) {
        return Array.from(state.selectedModules).map(id => state.project.modules.find(m => m.id === id)).filter(Boolean);
    }
    const active = getActiveModule();
    return active ? [active] : [];
}

// Panel jest odświeżany po każdej zmianie (patrz setupEventListeners -> 'change'),
// więc żeby klik w zakładkę "Front" nie wracał do "Wymiary" po każdej edycji,
// aktywna zakładka żyje w module-level zmiennej, nie w DOM.
const TABS = [
  { id: "wymiary", label: "📐 Wymiary" },
  { id: "front", label: "🚪 Front" },
  { id: "konstrukcja", label: "🧱 Konstrukcja" },
  { id: "nogi", label: "🦵 Nóżki / Blendy" },
  { id: "zawiasy", label: "🔩 Zawiasy" },
];
let activeTab = "wymiary";

export function initPropertiesPanel() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible();
  const rightSidebar = document.querySelector(".sidebar-right");
  const activeModule = getActiveModule();

  if (!activeModule) {
    rightSidebar.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8; text-align: center; padding: 20px;">
        <span style="font-size: 40px; margin-bottom: 10px;">⚙️</span>
        <h3 style="margin: 0; color: #64748b; text-transform: none; letter-spacing: normal; border-bottom: none; font-size: 15px;">Brak aktywnej szafki</h3>
      </div>
    `;
    return;
  }

  const multiCount = state.selectedModules && state.selectedModules.size > 1 ? state.selectedModules.size : 1;
  if (!activeModule.legs) activeModule.legs = { active: false, height: 100, plinth: false, plinthOffset: 40 };

  // Inicjalizacja struktury blend z dodanym parametrem "offsetY" (Przesunięcie pionowe)
  if (!activeModule.fillers) {
      activeModule.fillers = {
          left: { active: false, width: 50, depth: 80, height: null, offsetY: 0 },
          right: { active: false, width: 50, depth: 80, height: null, offsetY: 0 },
          top: { active: false, height: 50, depth: 80, width: null, offsetY: 0 }
      };
  } else {
      // Zabezpieczenie dla wcześniej zapisanych szafek
      if (activeModule.fillers.left.offsetY === undefined) activeModule.fillers.left.offsetY = 0;
      if (activeModule.fillers.right.offsetY === undefined) activeModule.fillers.right.offsetY = 0;
      if (activeModule.fillers.top.offsetY === undefined) activeModule.fillers.top.offsetY = 0;
  }

  const cons = { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100, ...(state.project.construction || {}), ...(activeModule.construction || {}) };
  const backP = activeModule.backPanel;
  const f = { ...(state.project.front || {}), ...(activeModule.front || {}) };
  const fc = { ...(state.project.front?.clearance || {}), ...(activeModule.front?.clearance || {}) };
  const fh = { topOffset: 100, bottomOffset: 100, margin: 40, forceCount: 0, ...(state.project.front?.hinges || {}), ...(activeModule.front?.hinges || {}) };
  const fill = activeModule.fillers;
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
              if (bottomHinge.isAdjusted) actualBottomText = `<div style="color: #c2410c; font-size: 10px; margin-top: 4px; padding: 4px 6px; background: #ffedd5; border-left: 3px solid #ea580c; border-radius: 2px;">⚠️ Zmieniono na: <b>${bottomHinge.relY} mm</b> (Kolizja)</div>`;
              if (topHinge.isAdjusted) actualTopText = `<div style="color: #c2410c; font-size: 10px; margin-top: 4px; padding: 4px 6px; background: #ffedd5; border-left: 3px solid #ea580c; border-radius: 2px;">⚠️ Zmieniono na: <b>${Math.round(front.h - topHinge.relY)} mm</b> (Kolizja)</div>`;
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

  if (!TABS.some(t => t.id === activeTab)) activeTab = "wymiary";

  const tabBar = TABS.map(t => `
    <button type="button" class="ptab-btn${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>
  `).join("");

  const tabContent = (id, html) => `<div class="ptab-panel" data-tab="${id}" style="display:${id === activeTab ? 'block' : 'none'};">${html}</div>`;

  rightSidebar.innerHTML = `
    <style>
      .ptabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid #cbd5e1; margin-bottom: 14px; }
      .ptab-btn { flex: 1 1 auto; padding: 7px 6px; font-size: 11px; font-weight: bold; color: #64748b; background: #f1f5f9; border: 1px solid #e2e8f0; border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer; white-space: nowrap; }
      .ptab-btn:hover { background: #e2e8f0; color: #1e293b; }
      .ptab-btn.active { background: #fff; color: #1d4ed8; border-color: #cbd5e1; box-shadow: inset 0 2px 0 #2563eb; }
    </style>

    <h2>Parametry szafki ${multiCount > 1 ? `<span style="color:#2563eb;">(Edytujesz ${multiCount} obiekty)</span>` : ''}</h2>

    <div class="property-group" style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
      <label style="font-weight: bold; color: #0f172a;">Nazwa szafki:</label>
      <input type="text" id="input-mod-name" value="${escapeHtml(activeModule.name)}" style="font-weight: bold; color: #1e293b;" />
    </div>

    <div class="ptabs">${tabBar}</div>

    ${tabContent("wymiary", `
      <h3>Wymiary Modułu</h3>
      <div class="property-group"><label>Szerokość (mm):</label><input type="number" id="input-width" value="${activeModule.dimensions.width}" /></div>
      <div class="property-group"><label>Wysokość korpusu (mm):</label><input type="number" id="input-height" value="${activeModule.dimensions.height}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="number" id="input-depth" value="${activeModule.dimensions.depth}" /></div>

      <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

      <h3 style="color: #2563eb;">Pozycja w przestrzeni (3D)</h3>
      <div class="property-group" style="background: #eff6ff; padding: 10px; border-radius: 4px; border: 1px dashed #93c5fd;">
        <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od lewej (X) [mm]:</label><input type="number" id="input-pos-x" value="${activeModule.position.x}" style="border-color: #bfdbfe;" /></div>
        <div><label style="font-size: 11px; color: #1e3a8a;">Wysokość od podłogi (Y) [mm]:</label><input type="number" id="input-pos-y" value="${activeModule.position.y}" style="border-color: #bfdbfe;" /></div>
      </div>
    `)}

    ${tabContent("front", `
      <h3 style="color: #059669;">Ustawienia Frontów i Szuflad</h3>
      <div id="group-front-clearance">
        <div class="property-group"><label>Typ frontów:</label><select id="input-front-type"><option value="nakladane" ${(!f.type || f.type === 'nakladane') ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${f.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option></select></div>
        <div class="property-group"><label>System szuflad:</label><select id="input-drawer-system"><option value="merivobox" ${f.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option><option value="legrabox" ${f.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option><option value="tandembox" ${f.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX</option><option value="antaro" ${f.drawerSystem === 'antaro' ? 'selected' : ''}>Blum TANDEMBOX antaro</option><option value="gtv_axis_16" ${f.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option><option value="gtv_axis_18" ${f.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option></select></div>
        <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" id="input-front-gap" value="${f.gap ?? 3}" step="0.5" /></div>
        <div class="property-group"><label>Luz lewy (mm):</label><input type="number" id="input-front-left" value="${fc.left ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz prawy (mm):</label><input type="number" id="input-front-right" value="${fc.right ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz góra (mm):</label><input type="number" id="input-front-top" value="${fc.top ?? 2}" step="0.5" /></div>
        <div class="property-group"><label>Luz dół (mm):</label><input type="number" id="input-front-bottom" value="${fc.bottom ?? 2}" step="0.5" /></div>
      </div>
    `)}

    ${tabContent("konstrukcja", `
      <h3>Konstrukcja Korpusu</h3>
      <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" /></div>
      <div class="property-group"><label>Sposób łączenia:</label><select id="input-join-type"><option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option><option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option></select></div>
      <div class="property-group"><label>Zamknięcie góry:</label><select id="input-top-type"><option value="pelny" ${cons.topType === 'pelny' ? 'selected' : ''}>Pełny wieniec</option><option value="trawersy_poziom" ${cons.topType === 'trawersy_poziom' ? 'selected' : ''}>Trawersy poziome</option><option value="trawersy_pion" ${cons.topType === 'trawersy_pion' ? 'selected' : ''}>Trawersy pionowe</option></select></div>
      <div id="traverse-options" style="display: ${cons.topType !== 'pelny' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;"><div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px;">Szerokość trawersu (mm):</label><input type="number" id="input-traverse-width" value="${cons.traverseWidth}" /></div></div>

      <div class="property-group"><label>Plecy (Tylko dla szafki):</label><select id="input-back-type"><option value="nut" ${backP.type === 'nut' ? 'selected' : ''}>W nucie</option><option value="nakladane" ${backP.type === 'nakladane' ? 'selected' : ''}>Nakładane</option></select></div>
      <div id="nut-options" style="display: ${backP.type === 'nut' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;">
        <div class="property-group" style="margin-bottom: 8px;"><label style="font-size: 11px; font-weight: bold;">Konstrukcja nutu:</label><select id="input-nut-build"><option value="all" ${(!backP.nutBuild || backP.nutBuild === 'all') ? 'selected' : ''}>Boki i wieńce nutowane</option><option value="sides" ${backP.nutBuild === 'sides' ? 'selected' : ''}>Boki nutowane, wieńce skracane</option><option value="top_bottom" ${backP.nutBuild === 'top_bottom' ? 'selected' : ''}>Wieńce nutowane, boki skracane</option></select></div>
        <div class="property-group" style="margin-bottom: 8px;"><label style="font-size: 11px;">Odsunięcie nutu (mm):</label><input type="number" id="input-back-offset" value="${backP.offset !== undefined ? backP.offset : 16}" /></div>
        <div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px;">Głębokość nutu (mm):</label><input type="number" id="input-back-groove" value="${backP.grooveDepth !== undefined ? backP.grooveDepth : 6}" /></div>
      </div>
    `)}

    ${tabContent("nogi", `
      <h3 style="color: #ea580c;">Nóżki i Cokół</h3>
      <div class="property-group" style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="input-legs-active" ${activeModule.legs.active ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
        <label for="input-legs-active" style="cursor: pointer; margin: 0; font-weight: bold;">Szafka stoi na nóżkach</label>
      </div>
      <div id="legs-options" style="display: ${activeModule.legs.active ? 'block' : 'none'}; background: #fff7ed; padding: 10px; border: 1px dashed #fdba74; border-radius: 4px; margin-bottom: 15px;">
        <div class="property-group" style="margin-bottom: 8px;"><label style="font-size: 11px; color: #9a3412;">Wysokość nóżek (mm):</label><input type="number" id="input-legs-height" value="${activeModule.legs.height}" style="border-color: #fed7aa;" /></div>
        <div class="property-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><input type="checkbox" id="input-plinth-active" ${activeModule.legs.plinth ? 'checked' : ''} style="width: 14px; height: 14px;" /><label style="font-size: 12px; color: #9a3412;">Generuj cokół przedni</label></div>
        <div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px; color: #9a3412;">Cofnięcie cokołu (mm):</label><input type="number" id="input-plinth-offset" value="${activeModule.legs.plinthOffset}" style="border-color: #fed7aa;" /></div>
      </div>

      <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

      <h3 style="color: #64748b;">Blendy maskujące (L-kształtne)</h3>
      <div style="background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px;">

        <div style="margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="input-filler-left-active" ${fill.left.active ? 'checked' : ''} style="cursor: pointer;" />
              <label for="input-filler-left-active" style="cursor: pointer; font-weight: bold; color: #334155;">Blenda Lewa</label>
          </div>
          <div id="filler-left-opts" style="display: ${fill.left.active ? 'block' : 'none'}; padding-left: 24px; margin-top: 8px;">
              <div class="property-group"><label style="font-size: 11px;">Szerokość czoła (mm):</label><input type="number" id="input-filler-left-w" value="${fill.left.width}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Wysokość (puste = szafka):</label><input type="number" id="input-filler-left-h" placeholder="${activeModule.dimensions.height}" value="${fill.left.height || ''}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Przesunięcie w pionie Y (mm):</label><input type="number" id="input-filler-left-y" value="${fill.left.offsetY ?? 0}" /></div>
              <div class="property-group" style="margin-bottom:0;"><label style="font-size: 11px;">Głęb. mocowania (mm):</label><input type="number" id="input-filler-left-d" value="${fill.left.depth}" /></div>
          </div>
        </div>

        <div style="margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="input-filler-right-active" ${fill.right.active ? 'checked' : ''} style="cursor: pointer;" />
              <label for="input-filler-right-active" style="cursor: pointer; font-weight: bold; color: #334155;">Blenda Prawa</label>
          </div>
          <div id="filler-right-opts" style="display: ${fill.right.active ? 'block' : 'none'}; padding-left: 24px; margin-top: 8px;">
              <div class="property-group"><label style="font-size: 11px;">Szerokość czoła (mm):</label><input type="number" id="input-filler-right-w" value="${fill.right.width}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Wysokość (puste = szafka):</label><input type="number" id="input-filler-right-h" placeholder="${activeModule.dimensions.height}" value="${fill.right.height || ''}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Przesunięcie w pionie Y (mm):</label><input type="number" id="input-filler-right-y" value="${fill.right.offsetY ?? 0}" /></div>
              <div class="property-group" style="margin-bottom:0;"><label style="font-size: 11px;">Głęb. mocowania (mm):</label><input type="number" id="input-filler-right-d" value="${fill.right.depth}" /></div>
          </div>
        </div>

        <div style="margin-bottom: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="input-filler-top-active" ${fill.top.active ? 'checked' : ''} style="cursor: pointer;" />
              <label for="input-filler-top-active" style="cursor: pointer; font-weight: bold; color: #334155;">Blenda Górna (Sufitowa)</label>
          </div>
          <div id="filler-top-opts" style="display: ${fill.top.active ? 'block' : 'none'}; padding-left: 24px; margin-top: 8px;">
              <div class="property-group"><label style="font-size: 11px;">Wysokość czoła (mm):</label><input type="number" id="input-filler-top-h" value="${fill.top.height}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Szerokość (puste = zabudowa):</label><input type="number" id="input-filler-top-w" placeholder="Całkowita" value="${fill.top.width || ''}" /></div>
              <div class="property-group"><label style="font-size: 11px;">Przesunięcie w pionie Y (mm):</label><input type="number" id="input-filler-top-y" value="${fill.top.offsetY ?? 0}" /></div>
              <div class="property-group" style="margin-bottom:0;"><label style="font-size: 11px;">Głęb. mocowania (mm):</label><input type="number" id="input-filler-top-d" value="${fill.top.depth}" /></div>
          </div>
        </div>
      </div>
    `)}

    ${tabContent("zawiasy", `
      <div style="background: #ecfdf5; padding: 10px; border: 1px dashed #6ee7b7; border-radius: 4px;">
        <h3 style="color: #047857;">Wymiary Osi Zawiasów (Lokalne)</h3>
        <div class="property-group" style="margin-bottom: ${actualTopText ? '12px' : '8px'};"><label style="font-size: 11px;">Od góry do środka puszki (mm):</label><input type="number" id="input-hinge-top" value="${fh.topOffset}" step="1" />${actualTopText}</div>
        <div class="property-group" style="margin-bottom: ${actualBottomText ? '12px' : '8px'};"><label style="font-size: 11px;">Od dołu do środka puszki (mm):</label><input type="number" id="input-hinge-bottom" value="${fh.bottomOffset}" step="1" />${actualBottomText}</div>
        <div class="property-group"><label style="font-size: 11px;">Bezpieczny margines od półki (mm):</label><input type="number" id="input-hinge-margin" value="${fh.margin}" step="1" /></div>
        <div class="property-group" style="margin-top: 8px; margin-bottom: 0;"><label style="font-size: 11px; font-weight: bold; color: #065f46;">Wymuś ilość zawiasów (0 = Auto):</label><input type="number" id="input-hinge-count" value="${fh.forceCount || 0}" step="1" style="border-color: #34d399; background-color: #d1fae5;" /></div>
      </div>

      <h3 style="color: #7c3aed;">Zawiasy — pozycje ręczne</h3>
      ${doorHingeGroups.length === 0 ? `
        <div style="font-size: 11px; color: #94a3b8;">Ta szafka nie ma jeszcze żadnych drzwi.</div>
      ` : doorHingeGroups.map(group => `
        <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
          <div style="font-weight: bold; font-size: 12px; color: #6d28d9; margin-bottom: 8px;">
            🚪 ${escapeHtml(group.label)}
            <span style="font-weight: normal; color: #94a3b8;">(wys. ${Math.round(group.front.h)}mm, start ${Math.round(group.front.y)}mm od dołu szafki)</span>
          </div>
          ${group.hinges.map((h, i) => {
              const overridden = group.front.hingeOverrides && group.front.hingeOverrides[i] !== undefined && group.front.hingeOverrides[i] !== null;
              return `
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                <span style="width: 52px; flex-shrink: 0; font-size: 11px; color: #6d28d9; font-weight: bold;">Zawias ${i + 1}:</span>
                <input type="number" class="input-hinge-override" data-front-id="${group.front.id}" data-hinge-index="${i}" value="${h.y}" step="1" style="flex: 1; min-width: 0;${overridden ? ' border-color:#a855f7; background:#f3e8ff;' : ''}" />
                <span style="font-size: 10px; color: #94a3b8; flex-shrink: 0;">mm</span>
                ${overridden
                    ? `<button type="button" class="btn-hinge-reset" data-front-id="${group.front.id}" data-hinge-index="${i}" title="Wróć do automatycznej pozycji" style="border: none; background: #ede9fe; color: #6d28d9; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-weight: bold; flex-shrink: 0;">↺</button>`
                    : (h.isAdjusted ? `<span title="Automatycznie odsunięty, żeby ominąć półkę/przeszkodę" style="flex-shrink: 0;">⚠️</span>` : '<span style="width: 24px; flex-shrink: 0;"></span>')
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

  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.ptab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.ptab-panel').forEach(p => { p.style.display = p.dataset.tab === activeTab ? 'block' : 'none'; });
    });
  });

  const numberInputs = [
    'pos-x', 'pos-y', 'traverse-width', 'board-thick', 'width', 'height', 'depth',
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

  ['left', 'right', 'top'].forEach(side => {
      const chk = document.getElementById(`input-filler-${side}-active`);
      const opts = document.getElementById(`filler-${side}-opts`);
      if (chk && opts) {
          chk.addEventListener('change', (e) => {
              getSelectedMods().forEach(mod => {
                  mod.fillers[side].active = e.target.checked;
                  if (side === 'left') {
                      const fillerW = parseFloat(mod.fillers.left.width) || 50;
                      if (e.target.checked) {
                          mod.position.x = (parseFloat(mod.position.x) || 0) + fillerW;
                      } else {
                          mod.position.x = Math.max(0, (parseFloat(mod.position.x) || 0) - fillerW);
                      }
                      const inpX = document.getElementById('input-pos-x');
                      if (inpX) inpX.value = mod.position.x;
                  }
              });
              opts.style.display = e.target.checked ? 'block' : 'none';
              updateAll();
          });
      }
  });

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
      traverseOptions.style.display = e.target.value !== 'pelny' ? 'block' : 'none'; updateAll();
  });
  const typeInput = document.getElementById('input-front-type');
  if (typeInput) typeInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.type = e.target.value; }); updateAll();
  });
  const drawerSysInput = document.getElementById('input-drawer-system');
  if(drawerSysInput) drawerSysInput.addEventListener('change', (e) => {
      getSelectedMods().forEach(mod => { mod.front = mod.front || {}; mod.front.drawerSystem = e.target.value; }); updateAll();
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

  numberInputs.forEach(id => {
    const el = document.getElementById(`input-${id}`);
    if(el) {
      el.addEventListener('input', (e) => {
        const val = e.target.value === '' ? null : Number(e.target.value);
        getSelectedMods().forEach(mod => {

            if (id === 'filler-left-w') mod.fillers.left.width = val;
            if (id === 'filler-left-h') mod.fillers.left.height = val;
            if (id === 'filler-left-d') mod.fillers.left.depth = val;
            if (id === 'filler-left-y') mod.fillers.left.offsetY = val;

            if (id === 'filler-right-w') mod.fillers.right.width = val;
            if (id === 'filler-right-h') mod.fillers.right.height = val;
            if (id === 'filler-right-d') mod.fillers.right.depth = val;
            if (id === 'filler-right-y') mod.fillers.right.offsetY = val;

            if (id === 'filler-top-h') mod.fillers.top.height = val;
            if (id === 'filler-top-w') mod.fillers.top.width = val;
            if (id === 'filler-top-d') mod.fillers.top.depth = val;
            if (id === 'filler-top-y') mod.fillers.top.offsetY = val;

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
                  mod.elements.forEach(el => {
                      if (el.typ === 'poziom') {
                          el.x = th + ((el.x - th) / innerOldX * innerNewX);
                          el.w = (el.w / innerOldX) * innerNewX;
                      } else if (el.typ === 'pion') {
                          el.x = th + ((el.x - th) / innerOldX * innerNewX);
                      } else if (el.typ === 'front' && el.baseZone && !el.baseZone.boundLeft) {
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
                  mod.elements.forEach(el => {
                      if (el.typ === 'poziom') {
                          el.y = th + ((el.y - th) / innerOldY * innerNewY);
                      } else if (el.typ === 'pion') {
                          el.y = th + ((el.y - th) / innerOldY * innerNewY);
                          el.h = (el.h / innerOldY) * innerNewY;
                      } else if (el.typ === 'front' && el.baseZone && !el.baseZone.boundBottom) {
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
      el.addEventListener('change', () => { initPropertiesPanel(); });
    }
  });
}
