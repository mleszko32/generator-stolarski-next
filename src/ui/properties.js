// src/ui/properties.js
import { state, getActiveModule, deleteSidePanel, deleteModule } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { calculateParts } from "../engine/cabinet.js";
import { calculateHinges } from "../core/hingeMath.js";
import { getTraverseConfig, clampModuleToRoom, restModuleOnNeighbors, getCornerDepths } from "../core/layout.js";
import { drawerSystems, DRAWER_VARIANT_ORDER, DRAWER_VARIANT_LABELS } from "../core/drawerSystems.js";
import { getDrawerVariant } from "../core/drawerMath.js";
import { escapeHtml } from "../utils/dom.js";
import { evalDimensionExpr } from "../utils/math.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";
import { openCornerConfigModal } from "./cornerConfigModal.js";
import { generateCornerBlankSVG, generateCornerSidesHolesSVG } from "../render/viewer2d.js";
import { getCornerShelfHoles } from "../engine/cabinet.js";

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
  { id: "szuflady", label: "📦 Szuflady" },
  { id: "konstrukcja", label: "🧱 Konstrukcja" },
  { id: "nogi", label: "🦵 Nóżki / Blendy" },
  { id: "zawiasy", label: "🔩 Zawiasy" },
];
let activeTab = "wymiary";

// Kolejność i znaczenie indeksów 0-3 MUSI się zgadzać z kolejnością addBox()
// dla nóżek w render/viewer3d.js oraz z pętlą w engine/cabinet.js
// (calculateProjectHardware) — wszystkie trzy miejsca czytają
// mod.legs.heightOverrides[i] pod tym samym indeksem.
const LEG_LABELS = ["Tył lewa", "Tył prawa", "Przód lewa", "Przód prawa"];

// side ("front"/"rear") <-> etykieta w UI, patrz też core/layout.js (getTraverseConfig).
const TRAVERSE_LABELS = { front: "Przedni", rear: "Tylny" };

// Bok dokładany (core/state.js: addSidePanel) - samodzielny obiekt projektu,
// nie właściwość modułu, więc dostaje osobny, krótki formularz zamiast
// całego "Parametry szafki" (zakładki front/szuflady/konstrukcja/zawiasy nie
// mają tu zastosowania - to tylko płaska, dekoracyjna płyta).
function renderSidePanelProperties(rightSidebar, panel) {
  rightSidebar.innerHTML = `
    <h2>Parametry boku dokładanego</h2>
    <div class="property-group" style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
      <label style="font-weight: bold; color: #0f172a;">Nazwa:</label>
      <input type="text" id="input-side-name" value="${escapeHtml(panel.name || '')}" style="font-weight: bold; color: #1e293b;" />
    </div>
    <div class="property-group">
      <label>Dekor (opis do formatki):</label>
      <input type="text" id="input-side-decor" value="${escapeHtml(panel.decor || '')}" placeholder="np. Front biały połysk" />
    </div>

    <h3>Wymiary</h3>
    <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-side-width" value="${panel.dimensions.width}" /></div>
    <div class="property-group"><label>Wysokość (mm):</label><input type="number" id="input-side-height" value="${panel.dimensions.height}" /></div>
    <div class="property-group"><label>Głębokość (mm):</label><input type="number" id="input-side-depth" value="${panel.dimensions.depth}" /></div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <h3 style="color: #2563eb;">Pozycja w przestrzeni (3D)</h3>
    <div class="property-group" style="background: #eff6ff; padding: 10px; border-radius: 4px; border: 1px dashed #93c5fd;">
      <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-side-pos-x" value="${panel.position.x}" style="border-color: #bfdbfe;" /></div>
      <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-side-pos-z" value="${panel.position.z || 0}" style="border-color: #bfdbfe;" /></div>
      <div><label style="font-size: 11px; color: #1e3a8a;">Wysokość startu od podłogi (Y) [mm]:</label><input type="number" id="input-side-pos-y" value="${panel.position.y || 0}" style="border-color: #bfdbfe;" /></div>
    </div>
    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Domyślnie Y=0 i wysokość = wysokość pomieszczenia, żeby bok sięgał od podłogi do sufitu niezależnie od modułów za nim.</div>

    <h3 style="color: #2563eb; margin-top: 15px;">Obrót (co 90°)</h3>
    <div class="property-group" style="display: flex; flex-direction: row; gap: 4px;">
      ${[0, 90, 180, 270].map(rot => {
          const active = (panel.rotation || 0) === rot;
          return `<button type="button" class="btn-side-rotate${active ? ' active' : ''}" data-rot="${rot}" style="flex: 1; padding: 8px 4px; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; border: 1px solid ${active ? '#2563eb' : '#93c5fd'}; background: ${active ? '#2563eb' : '#eff6ff'}; color: ${active ? '#fff' : '#1e3a8a'};">${rot}°</button>`;
      }).join('')}
    </div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    <button type="button" id="btn-side-delete" class="btn btn-danger btn-block btn-sm">🗑️ Usuń bok dokładany</button>
  `;

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

// Prosty, samodzielny widok do druku wykroju L-kształtnej formatki narożnej
// (Wieniec narożny / Półka narożna, engine/cabinet.js: getCornerCorpusParts) -
// zgłoszony brak: cut-lista odsyłała do "rysunku 3D", którego jako
// drukowalnego dokumentu nie było (patrz render/viewer2d.js:
// generateCornerBlankSVG). Wzorowany na prostszym (nieinteraktywnym) wydruku
// listy zakupów niżej w tym pliku - nie na złożonym, interaktywnym
// "Drukuj 2D (Rysunek Wykonawczy)" z sidebar.js (pan/zoom/warstwy), żeby nie
// dotykać tamtej, już rozbudowanej logiki.
function openCornerBlankPrintView(mod) {
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const shelfCount = (mod.elements || []).filter(el => el.typ === 'poziom-narozny').length;
  const th = parseFloat(state.project.materials?.boardThickness) || 18;

  const svgContent = generateCornerBlankSVG(legA, legB, depthA, depthB, th);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <title>Wykrój narożny - ${escapeHtml(mod.name)}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1e293b; max-width: 900px; margin: 0 auto; }
        .header { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 16px; }
        .header h1 { margin: 0; color: #0f172a; font-size: 22px; }
        .header p { margin: 5px 0 0 0; color: #64748b; font-size: 13px; }
        ul { font-size: 13px; color: #334155; }
        svg { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
        @media print { .no-print { display: none !important; } body { padding: 0; max-width: 100%; } }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
        <button onclick="window.print()" style="padding: 12px 24px; background-color: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">🖨️ Drukuj / Zapisz jako PDF</button>
      </div>
      <div class="header">
        <h1>Wykrój narożny: ${escapeHtml(mod.name)}</h1>
        <p>Wspólny wykrój (ten sam prostokątny blank ${Math.round(legA)}×${Math.round(legB)} mm z odciętym rogiem) dla:</p>
        <ul>
          <li>Wieniec narożny (dolny) — 1 szt.</li>
          <li>Wieniec narożny (górny) — 1 szt.</li>
          ${shelfCount > 0 ? `<li>Półka narożna — ${shelfCount} szt.</li>` : ''}
        </ul>
      </div>
      ${svgContent}
      ${shelfCount > 0 ? `<h2 style="font-size:16px; margin:24px 0 8px;">Nawierty pod podpórki półek (System 32)</h2>${generateCornerSidesHolesSVG(getCornerShelfHoles(mod))}` : ''}
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}

// Szafka narożna z frontem łamanym (mod.type === 'corner_cabinet', core/
// state.js: addCornerModule) - PIERWSZY nieprostokątny moduł w aplikacji,
// więc dostaje osobny, krótki formularz zamiast pełnych zakładek Wymiary/
// Front/Szuflady/Konstrukcja/Zawiasy (te zakładają jeden prostokątny
// korpus - nie mają tu zastosowania). Wymiary ramion i konfiguracja
// frontów/półek per ramię przeniosły się do osobnego okna
// (ui/cornerConfigModal.js) - tu zostają tylko częste, szybkie edycje
// (nazwa/pozycja/obrót), tak jak w prawym panelu zwykłego modułu.
function renderCornerModuleProperties(rightSidebar, mod) {
  const legA = parseFloat(mod.dimensions.width) || 0;
  const legB = parseFloat(mod.dimensions.legB) || 0;
  const { depthA, depthB } = getCornerDepths(mod);
  const height = parseFloat(mod.dimensions.height) || 0;

  rightSidebar.innerHTML = `
    <h2>Parametry szafki narożnej</h2>
    <div class="property-group" style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 15px;">
      <label style="font-weight: bold; color: #0f172a;">Nazwa szafki:</label>
      <input type="text" id="input-corner-name" value="${escapeHtml(mod.name)}" style="font-weight: bold; color: #1e293b;" />
    </div>

    <div class="property-group" style="font-size: 12px; color: #475569; margin-bottom: 10px;">
      Ramię A: <b>${legA}</b> mm · Ramię B: <b>${legB}</b> mm · Głębokość A/B: <b>${depthA}/${depthB}</b> mm · Wysokość: <b>${height}</b> mm
    </div>
    <button type="button" id="btn-corner-configure" class="btn btn-block" style="background:#2563eb; color:#fff; margin-bottom: 8px;">⚙️ Konfiguruj szafkę narożną</button>
    <button type="button" id="btn-corner-blank-print" class="btn btn-block btn-sm" style="margin-bottom: 15px;">📄 Wykrój narożny (jak wyciąć wieniec/półkę)</button>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

    <h3 style="color: #2563eb;">Pozycja w przestrzeni (3D)</h3>
    <div class="property-group" style="background: #eff6ff; padding: 10px; border-radius: 4px; border: 1px dashed #93c5fd;">
      <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-corner-pos-x" value="${mod.position.x}" style="border-color: #bfdbfe;" /></div>
      <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-corner-pos-z" value="${mod.position.z || 0}" style="border-color: #bfdbfe;" /></div>
      <div><label style="font-size: 11px; color: #1e3a8a;">Wysokość od podłogi (Y) [mm]:</label><input type="number" id="input-corner-pos-y" value="${mod.position.y}" style="border-color: #bfdbfe;" /></div>
    </div>

    <h3 style="color: #2563eb; margin-top: 15px;">Obrót (co 90°)</h3>
    <div class="property-group" style="display: flex; flex-direction: row; gap: 4px;">
      ${[0, 90, 180, 270].map(rot => {
          const active = (mod.rotation || 0) === rot;
          return `<button type="button" class="btn-corner-rotate${active ? ' active' : ''}" data-rot="${rot}" style="flex: 1; padding: 8px 4px; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; border: 1px solid ${active ? '#2563eb' : '#93c5fd'}; background: ${active ? '#2563eb' : '#eff6ff'}; color: ${active ? '#fff' : '#1e3a8a'};">${rot}°</button>`;
      }).join('')}
    </div>
    <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Ramię A biegnie wzdłuż lokalnej osi X, ramię B wzdłuż lokalnej osi Z (przed obrotem).</div>

    <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">
    <button type="button" id="btn-corner-delete" class="btn btn-danger btn-block btn-sm">🗑️ Usuń szafkę narożną</button>
  `;

  const bindText = (id, apply) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', e => { apply(e.target.value); update3D(); updateSidebar(); });
  };
  const bindPos = (id, apply) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', e => { apply(parseFloat(e.target.value) || 0); update3D(); updateSidebar(); });
  };

  bindText('input-corner-name', v => mod.name = v);
  bindPos('input-corner-pos-x', v => mod.position.x = v);
  bindPos('input-corner-pos-z', v => mod.position.z = v);
  bindPos('input-corner-pos-y', v => mod.position.y = v);

  const configBtn = document.getElementById('btn-corner-configure');
  if (configBtn) configBtn.addEventListener('click', () => openCornerConfigModal(mod));

  const blankPrintBtn = document.getElementById('btn-corner-blank-print');
  if (blankPrintBtn) blankPrintBtn.addEventListener('click', () => openCornerBlankPrintView(mod));

  rightSidebar.querySelectorAll('.btn-corner-rotate').forEach(btn => {
      btn.addEventListener('click', () => {
          mod.rotation = parseInt(btn.getAttribute('data-rot'), 10);
          update3D();
          updateSidebar();
          initPropertiesPanel();
      });
  });

  const delBtn = document.getElementById('btn-corner-delete');
  if (delBtn) delBtn.addEventListener('click', () => {
      deleteModule(mod.id);
      initPropertiesPanel();
      update3D();
      updateSidebar();
  });
}

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
        <span style="font-size: 40px; margin-bottom: 10px;">⚙️</span>
        <h3 style="margin: 0; color: #64748b; text-transform: none; letter-spacing: normal; border-bottom: none; font-size: 15px;">Brak aktywnej szafki</h3>
      </div>
    `;
    return;
  }

  if (activeModule.type === 'corner_cabinet') {
    renderCornerModuleProperties(rightSidebar, activeModule);
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

  // Lista szuflad aktywnej szafki (zewn. i wewn.) — do ręcznego wymuszenia wariantu
  // wysokości boku i/lub głębokości (NL) dla konkretnej sztuki, zamiast tylko dla
  // całej szafki naraz (patrz zakładka "Szuflady"). front.forceVariant/forceNL
  // istniały już wcześniej w danych i były edytowalne tylko z prawoklik-menu w
  // widoku 3D (render/viewer3d.js) — to jest ten sam mechanizm, tylko widoczny
  // też w panelu właściwości.
  const drawerSysName = (f.drawerSystem || 'merivobox').toLowerCase();
  const drawerSysVariants = (drawerSystems[drawerSysName] || drawerSystems.merivobox).variants;
  const drawerFrontsList = (activeModule.elements || [])
      .filter(el => el.typ === 'front' && el.subtype && el.subtype.includes('szuflada'))
      .sort((a, b) => (parseFloat(a.y) || 0) - (parseFloat(b.y) || 0))
      .map((front, idx) => ({
          front,
          label: `Szuflada ${idx + 1}${front.subtype === 'szuflada-wewnetrzna' ? ' (wewn.)' : ''}`,
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
      <div class="property-group"><label>Szerokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-width" value="${activeModule.dimensions.width}" /></div>
      <div class="property-group"><label>Wysokość korpusu (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-height" value="${activeModule.dimensions.height}" /></div>
      <div class="property-group"><label>Głębokość (mm):</label><input type="text" inputmode="decimal" title="Można wpisać działanie, np. 400+18" id="input-depth" value="${activeModule.dimensions.depth}" /></div>

      <hr style="margin: 15px 0; border: 0; border-top: 1px solid #ccc;">

      <h3 style="color: #2563eb;">Pozycja w przestrzeni (3D)</h3>
      <div class="property-group" style="background: #eff6ff; padding: 10px; border-radius: 4px; border: 1px dashed #93c5fd;">
        <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-pos-x" value="${activeModule.position.x}" style="border-color: #bfdbfe;" /></div>
        <div style="margin-bottom: 8px;"><label style="font-size: 11px; color: #1e3a8a;">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-pos-z" value="${activeModule.position.z || 0}" style="border-color: #bfdbfe;" /></div>
        <div><label style="font-size: 11px; color: #1e3a8a;">Wysokość od podłogi (Y) [mm]:</label><input type="number" id="input-pos-y" value="${activeModule.position.y}" style="border-color: #bfdbfe;" /></div>
      </div>

      <h3 style="color: #2563eb;">Obrót (co 90°)</h3>
      <div class="property-group" style="display: flex; flex-direction: row; gap: 4px;">
        ${[0, 90, 180, 270].map(rot => {
            const active = (activeModule.rotation || 0) === rot;
            return `<button type="button" class="btn-rotate${active ? ' active' : ''}" data-rot="${rot}" style="flex: 1; padding: 8px 4px; font-size: 12px; font-weight: bold; border-radius: 4px; cursor: pointer; border: 1px solid ${active ? '#2563eb' : '#93c5fd'}; background: ${active ? '#2563eb' : '#eff6ff'}; color: ${active ? '#fff' : '#1e3a8a'};">${rot}°</button>`;
        }).join('')}
      </div>
      <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Skrót: klawisz R obraca aktywną szafkę o +90°.</div>

      ${(canCombineIntoGroup || activeModule.groupId) ? `
        <h3 style="color: #0284c7;">Grupowanie</h3>
        <div class="property-group" style="display: flex; flex-direction: column; gap: 6px;">
          ${canCombineIntoGroup ? `<button type="button" id="btn-group-combine" class="btn btn-sm" style="background: #e0f2fe; color: #0284c7; border: 1px solid #7dd3fc; font-weight: bold; cursor: pointer; padding: 8px; border-radius: 4px;">🔗 Połącz zaznaczone w grupę</button>` : ''}
          ${activeModule.groupId ? `<button type="button" id="btn-group-split" class="btn btn-sm" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-weight: bold; cursor: pointer; padding: 8px; border-radius: 4px;">✂️ Rozbij grupę</button>` : ''}
        </div>
      ` : ''}
    `)}

    ${tabContent("front", `
      <h3 style="color: #059669;">Ustawienia Frontów</h3>
      <div id="group-front-clearance">
        <div class="property-group"><label>Typ frontów:</label><select id="input-front-type"><option value="nakladane" ${(!f.type || f.type === 'nakladane') ? 'selected' : ''}>Nakładane</option><option value="wpuszczane" ${f.type === 'wpuszczane' ? 'selected' : ''}>Wpuszczane</option></select></div>
        <div class="property-group"><label>Przerwa między frontami (mm):</label><input type="number" id="input-front-gap" value="${f.gap ?? 3}" step="0.5" /></div>
        <div class="property-group"><label>Luz lewy (mm):</label><input type="number" id="input-front-left" value="${fc.left ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz prawy (mm):</label><input type="number" id="input-front-right" value="${fc.right ?? 1.5}" step="0.5" /></div>
        <div class="property-group"><label>Luz góra (mm):</label><input type="number" id="input-front-top" value="${fc.top ?? 2}" step="0.5" /></div>
        <div class="property-group"><label>Luz dół (mm):</label><input type="number" id="input-front-bottom" value="${fc.bottom ?? 2}" step="0.5" /></div>
      </div>
    `)}

    ${tabContent("szuflady", `
      <h3 style="color: #b45309;">Ustawienia Szuflad</h3>
      <div class="property-group"><label>System szuflad:</label><select id="input-drawer-system"><option value="merivobox" ${f.drawerSystem === 'merivobox' ? 'selected' : ''}>Blum Merivobox</option><option value="legrabox" ${f.drawerSystem === 'legrabox' ? 'selected' : ''}>Blum Legrabox</option><option value="tandembox" ${f.drawerSystem === 'tandembox' ? 'selected' : ''}>Blum TANDEMBOX</option><option value="antaro" ${f.drawerSystem === 'antaro' ? 'selected' : ''}>Blum TANDEMBOX antaro</option><option value="gtv_axis_16" ${f.drawerSystem === 'gtv_axis_16' ? 'selected' : ''}>GTV Axis Pro (płyta 16mm)</option><option value="gtv_axis_18" ${f.drawerSystem === 'gtv_axis_18' ? 'selected' : ''}>GTV Axis Pro (płyta 18mm)</option></select></div>

      <h3 style="color: #b45309;">Szuflady — ustawienia ręczne</h3>
      ${drawerFrontsList.length === 0 ? `
        <div style="font-size: 11px; color: #94a3b8;">Ta szafka nie ma jeszcze żadnych szuflad.</div>
      ` : drawerFrontsList.map(({ front, label }) => {
          const variantOptionsHtml = DRAWER_VARIANT_ORDER.filter(k => drawerSysVariants[k]).map(k =>
              `<option value="${k}" ${front.forceVariant === k ? 'selected' : ''}>${DRAWER_VARIANT_LABELS[k]} (${drawerSysVariants[k].type}, ${drawerSysVariants[k].height}mm)</option>`
          ).join('');
          const isInner = front.subtype === 'szuflada-wewnetrzna';
          const bz = front.baseZone || {};
          return `
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
            <div style="font-weight: bold; font-size: 12px; color: #b45309; margin-bottom: 8px;">📦 ${escapeHtml(label)}</div>
            <div class="property-group" style="margin-bottom: 8px;">
              <label style="font-size: 11px;">Wymuszony wariant boku:</label>
              <select class="input-drawer-force-variant" data-front-id="${front.id}">
                <option value="auto" ${(!front.forceVariant || front.forceVariant === 'auto') ? 'selected' : ''}>Auto (maksymalny)</option>
                ${variantOptionsHtml}
              </select>
            </div>
            <div class="property-group" style="margin-bottom: 8px;">
              <label style="font-size: 11px;">Wymuszona głębokość (NL, mm):</label>
              <input type="number" class="input-drawer-force-nl" data-front-id="${front.id}" placeholder="Auto" value="${front.forceNL || ''}" />
            </div>

            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <div class="property-group" style="flex: 1; margin-bottom: 0;">
                <label style="font-size: 11px;">Wymuś wys. [mm]:</label>
                <input type="number" class="input-front-force-h" data-front-id="${front.id}" placeholder="Auto" value="${front.forceH || ''}" />
              </div>
              <div class="property-group" style="flex: 1; margin-bottom: 0;">
                <label style="font-size: 11px;">Wymuś szer. [mm]:</label>
                <input type="number" class="input-front-force-w" data-front-id="${front.id}" placeholder="Auto" value="${front.forceW || ''}" />
              </div>
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: ${isInner ? '8px' : '0'};">
              <div class="property-group" style="flex: 1; margin-bottom: 0;">
                <label style="font-size: 11px;">Przesuń Y ↕ [mm]:</label>
                <input type="number" class="input-front-force-offset-y" data-front-id="${front.id}" value="${front.forceOffsetY || 0}" />
              </div>
              <div class="property-group" style="flex: 1; margin-bottom: 0;">
                <label style="font-size: 11px;">Przesuń X ↔ [mm]:</label>
                <input type="number" class="input-front-force-offset-x" data-front-id="${front.id}" value="${front.forceOffsetX || 0}" />
              </div>
            </div>

            ${isInner ? `
              <hr style="margin: 8px 0; border: 0; border-top: 1px dashed #fde68a;">
              <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                <div class="property-group" style="flex: 1; margin-bottom: 0;">
                  <label style="font-size: 11px;">Grubość frontu wewn. [mm]:</label>
                  <input type="number" class="input-inner-front-thickness" data-front-id="${front.id}" value="${front.innerFrontThickness ?? 18}" />
                </div>
                <div class="property-group" style="flex: 1; margin-bottom: 0;">
                  <label style="font-size: 11px;">Luz do krawędzi [mm]:</label>
                  <input type="number" class="input-inner-front-setback" data-front-id="${front.id}" value="${front.innerSetback ?? 2}" />
                </div>
              </div>
              <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                <div class="property-group" style="flex: 1; margin-bottom: 0;">
                  <label style="font-size: 11px;">Wolne miejsce od dołu:</label>
                  <input type="number" class="input-inner-basezone-bottom" data-front-id="${front.id}" value="${bz.offsetBottom || 0}" />
                </div>
                <div class="property-group" style="flex: 1; margin-bottom: 0;">
                  <label style="font-size: 11px;">Wolne miejsce od góry:</label>
                  <input type="number" class="input-inner-basezone-top" data-front-id="${front.id}" value="${bz.offsetTop || 0}" />
                </div>
              </div>
            ` : `
              <button type="button" class="btn-add-inner-drawer" data-front-id="${front.id}" style="width: 100%; padding: 6px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; margin-top: 4px;">➕ Dodaj szufladę wewnętrzną nad tą</button>
            `}
            <button type="button" class="btn-delete-front" data-front-id="${front.id}" style="width: 100%; padding: 6px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; margin-top: 6px;">🗑️ Usuń tę szufladę</button>
          </div>
        `;
      }).join('')}
    `)}

    ${tabContent("konstrukcja", `
      <h3>Konstrukcja Korpusu</h3>
      <div class="property-group"><label>Grubość płyty (mm):</label><input type="number" id="input-board-thick" value="${state.project.materials.boardThickness}" step="0.1" /></div>
      <div class="property-group"><label>Sposób łączenia:</label><select id="input-join-type"><option value="boki_przelotowe" ${cons.joinType === 'boki_przelotowe' ? 'selected' : ''}>Boki do ziemi (wieńce wpuszczane)</option><option value="wience_przelotowe" ${cons.joinType === 'wience_przelotowe' ? 'selected' : ''}>Wieńce pełne (boki wpuszczane)</option></select></div>
      <div class="property-group"><label>Zamknięcie góry:</label><select id="input-top-type"><option value="pelny" ${cons.topType === 'pelny' ? 'selected' : ''}>Pełny wieniec</option><option value="trawersy_poziom" ${cons.topType === 'trawersy_poziom' ? 'selected' : ''}>Trawersy poziome</option><option value="trawersy_pion" ${cons.topType === 'trawersy_pion' ? 'selected' : ''}>Trawersy pionowe</option></select></div>
      <div id="traverse-options" style="display: ${cons.topType !== 'pelny' ? 'block' : 'none'}; background: #f8fafc; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 4px; margin-bottom: 15px;"><div class="property-group" style="margin-bottom: 0;"><label style="font-size: 11px;">Szerokość trawersu (mm):</label><input type="number" id="input-traverse-width" value="${cons.traverseWidth}" /></div></div>

      ${cons.topType !== 'pelny' ? (() => {
          const trav = getTraverseConfig(cons);
          const travRaw = cons.traverses || {};
          return `
          <h3>Trawersy — ustawienia ręczne</h3>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
            ${['front', 'rear'].map(side => {
                const raw = travRaw[side] || {};
                const widthOverridden = raw.width !== undefined && raw.width !== null && raw.width !== '';
                const active = trav[side].active;
                const displayWidth = widthOverridden ? raw.width : trav[side].width;
                return `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <input type="checkbox" class="input-traverse-active" data-side="${side}" ${active ? 'checked' : ''} title="Czy ten trawers ma w ogóle istnieć" style="width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;" />
                  <span style="width: 52px; flex-shrink: 0; font-size: 11px; font-weight: bold;">${TRAVERSE_LABELS[side]}:</span>
                  <input type="number" class="input-traverse-width-override" data-side="${side}" value="${displayWidth}" step="1" ${active ? '' : 'disabled'} style="flex: 1; min-width: 0;${widthOverridden ? ' border-color:#3b82f6; background:#eff6ff;' : ''}" />
                  <span style="font-size: 10px; color: #94a3b8; flex-shrink: 0;">mm</span>
                  ${widthOverridden
                      ? `<button type="button" class="btn-traverse-reset" data-side="${side}" title="Wróć do wspólnej szerokości" style="border: none; background: #eff6ff; color: #1d4ed8; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-weight: bold; flex-shrink: 0;">↺</button>`
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

      ${activeModule.legs.active ? `
        <h3 style="color: #ea580c;">Nóżki — wysokości ręczne</h3>
        <div style="background: #fff7ed; border: 1px solid #fdba74; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
          ${LEG_LABELS.map((label, i) => {
              const overrideVal = activeModule.legs.heightOverrides ? activeModule.legs.heightOverrides[i] : undefined;
              const overridden = overrideVal !== undefined && overrideVal !== null && overrideVal !== '';
              const shownVal = overridden ? overrideVal : activeModule.legs.height;
              return `
              <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                <span style="width: 76px; flex-shrink: 0; font-size: 11px; color: #9a3412; font-weight: bold;">${label}:</span>
                <input type="number" class="input-leg-height-override" data-leg-index="${i}" value="${shownVal}" step="1" style="flex: 1; min-width: 0;${overridden ? ' border-color:#f97316; background:#ffedd5;' : ' border-color:#fed7aa;'}" />
                <span style="font-size: 10px; color: #9a3412; flex-shrink: 0;">mm</span>
                ${overridden
                    ? `<button type="button" class="btn-leg-reset" data-leg-index="${i}" title="Wróć do wspólnej wysokości" style="border: none; background: #ffedd5; color: #9a3412; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-weight: bold; flex-shrink: 0;">↺</button>`
                    : '<span style="width: 24px; flex-shrink: 0;"></span>'
                }
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

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
                  }
                  // Zabezpieczenie dla PRAWEJ blendy (i domknięcie lewej) -
                  // clampModuleToRoom teraz sam wie o aktywnych blendach
                  // (patrz core/layout.js) - bez tego blenda dostawiona do
                  // szafki dosuniętej do ściany przenikała przez nią.
                  clampModuleToRoom(mod);
                  const inpX = document.getElementById('input-pos-x');
                  if (inpX) inpX.value = mod.position.x;
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

  document.querySelectorAll('.input-drawer-force-variant').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const front = findFront(sel.dataset.frontId);
      if (front) front.forceVariant = e.target.value;
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.input-drawer-force-nl').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front) {
        const val = e.target.value === '' ? null : Number(e.target.value);
        front.forceNL = (val === null || isNaN(val)) ? null : val;
      }
      updateAll();
      initPropertiesPanel();
    });
  });

  // Korekta ręczna frontu (dawniej tylko w menu kontekstowym 3D, patrz
  // render/viewer3d.js) - wysokość/szerokość/przesunięcie wymuszone per front.
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
  wireFrontNumberOverride('input-front-force-h', 'forceH');
  wireFrontNumberOverride('input-front-force-w', 'forceW');
  wireFrontNumberOverride('input-front-force-offset-y', 'forceOffsetY');
  wireFrontNumberOverride('input-front-force-offset-x', 'forceOffsetX');

  document.querySelectorAll('.input-inner-front-thickness').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front) front.innerFrontThickness = parseFloat(e.target.value) || 18;
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.input-inner-front-setback').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front) front.innerSetback = parseFloat(e.target.value) || 0;
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.input-inner-basezone-bottom').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front && front.baseZone) front.baseZone.offsetBottom = parseFloat(e.target.value) || 0;
      updateAll();
      initPropertiesPanel();
    });
  });
  document.querySelectorAll('.input-inner-basezone-top').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const front = findFront(inp.dataset.frontId);
      if (front && front.baseZone) front.baseZone.offsetTop = parseFloat(e.target.value) || 0;
      updateAll();
      initPropertiesPanel();
    });
  });

  document.querySelectorAll('.btn-delete-front').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = getActiveModule();
      if (!mod) return;
      mod.elements = mod.elements.filter(e => e.id !== btn.dataset.frontId);
      updateAll();
      initPropertiesPanel();
    });
  });

  // "Dodaj szufladę wewnętrzną nad tą" - port 1:1 z menu kontekstowego 3D
  // (render/viewer3d.js), żeby liczyć dokładnie to samo boxHeight/baseZone.
  document.querySelectorAll('.btn-add-inner-drawer').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = getActiveModule();
      const front = findFront(btn.dataset.frontId);
      if (!mod || !front || !front.baseZone) return;

      const fMerged = { ...(state.project.front || {}), ...(mod.front || {}) };
      const sysName = (fMerged.drawerSystem || 'merivobox').toLowerCase();

      // NAPRAWA: w oryginale (menu 3D) boxHeight w trybie "Auto" zakładał całą
      // wysokość frontu (front.h), więc "za mało miejsca nad pudłem" wychodziło
      // prawie zawsze - silnik szuflad w praktyce dobiera dużo niższy wariant.
      // Liczymy tu dokładnie to, co dobrałby getDrawerComponents (core/drawerMath.js),
      // żeby sprawdzać miejsce nad RZECZYWISTYM, a nie zawyżonym, pudłem.
      const { backHeight } = getDrawerVariant(front.h, sysName, front.forceVariant || 'auto');
      const boxHeight = backHeight;

      const newInnerBottomY = front.y + boxHeight + 5;
      const newInnerTopY = front.y + front.h;

      if (newInnerBottomY + 40 > newInnerTopY) {
        alert("Za mało miejsca nad pudłem! Zmniejsz wariant boku tej szuflady (np. na M lub K) i zapisz, aby zrobić miejsce.");
        return;
      }

      const baseMinY = parseFloat(front.baseZone.minY) || 18;
      const baseMaxY = parseFloat(front.baseZone.maxY) || parseFloat(mod.dimensions.height);

      const newOffsetBottom = newInnerBottomY - baseMinY;
      const newOffsetTop = baseMaxY - newInnerTopY;

      mod.elements.push({
        id: 'front-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        typ: 'front',
        subtype: 'szuflada-wewnetrzna',
        baseZone: {
          ...front.baseZone,
          offsetBottom: Math.max(0, newOffsetBottom),
          offsetTop: Math.max(0, newOffsetTop)
        },
        frontCount: 1, distribution: "1", frontIndex: 0, gap: parseFloat(state.project.front?.gap || 3),
        intGapX: 15, intGapY: 5, forceVariant: 'auto', forceNL: null,
        innerFrontThickness: 18, innerSetback: 2
      });

      updateAll();
      initPropertiesPanel();
    });
  });

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
