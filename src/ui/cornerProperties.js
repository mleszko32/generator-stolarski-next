// src/ui/cornerProperties.js
//
// Prawy panel szafki narożnej i wydruk wykroju formatki narożnej - wydzielone z
// ui/properties.js (renderCornerModuleProperties zamiast zakładek zwykłego modułu).
import { state, deleteModule } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { getCornerDepths } from "../core/layout.js";
import { escapeHtml } from "../utils/dom.js";
import { fmtMm } from "../utils/math.js";
import { openCornerConfigModal } from "./cornerConfigModal.js";
import { generateCornerBlankSVG, generateCornerPartsDrawings } from "../render/cornerDrawing2d.js";
import { initPropertiesPanel } from "./properties.js";

// Prosty, samodzielny widok do druku wykroju L-kształtnej formatki narożnej
// (Wieniec narożny / Półka narożna, engine/cornerParts.js: getCornerCorpusParts) -
// zgłoszony brak: cut-lista odsyłała do "rysunku 3D", którego jako
// drukowalnego dokumentu nie było (patrz render/viewer2d.js:
// generateCornerBlankSVG). Wzorowany na prostszym (nieinteraktywnym) wydruku
// listy zakupów niżej w tym pliku - nie na złożonym, interaktywnym
// "Drukuj 2D (Rysunek Wykonawczy)" z sidebar.js (pan/zoom/warstwy), żeby nie
// dotykać tamtej, już rozbudowanej logiki.
export function openCornerBlankPrintView(mod) {
  const legA = parseFloat(mod.dimensions.width) || 860;
  const legB = parseFloat(mod.dimensions.legB) || 860;
  const { depthA, depthB } = getCornerDepths(mod);
  const shelfCount = (mod.elements || []).filter(el => el.typ === 'poziom-narozny').length;
  const th = parseFloat(state.project.materials?.boardThickness) || 18;

  const svgContent = generateCornerBlankSVG(legA, legB, depthA, depthB, th, null, {
    title: 'RZUT SZAFKI Z GÓRY', plain: true,
  });

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
        <p>Wspólny wykrój (ten sam prostokątny blank ${fmtMm(legA)}×${fmtMm(legB)} mm z odciętym rogiem) dla:</p>
        <ul>
          <li>Wieniec narożny (dolny) — 1 szt.</li>
          <li>Wieniec narożny (górny) — 1 szt.</li>
          ${shelfCount > 0 ? `<li>Półka narożna — ${shelfCount} szt. (dodatkowo wycięcie 100×${fmtMm(th)} mm w tylnym rogu na listwę narożną)</li>` : ''}
        </ul>
      </div>
      ${svgContent}
      <h2 style="font-size:16px; margin:24px 0 8px;">Formatki</h2>${generateCornerPartsDrawings(mod)}
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
export function renderCornerModuleProperties(rightSidebar, mod) {
  const legA = parseFloat(mod.dimensions.width) || 0;
  const legB = parseFloat(mod.dimensions.legB) || 0;
  const { depthA, depthB } = getCornerDepths(mod);
  const height = parseFloat(mod.dimensions.height) || 0;

  rightSidebar.innerHTML = `
    <h2>Parametry szafki narożnej</h2>
    <div class="property-group prop-box">
      <label style="font-weight: 600;">Nazwa szafki:</label>
      <input type="text" id="input-corner-name" value="${escapeHtml(mod.name)}" style="font-weight: 600;" />
    </div>

    <div style="font-size: 12px; color: #475569; margin: 12px 0 10px; line-height: 1.6;">
      Ramię A: <b>${legA}</b> mm · Ramię B: <b>${legB}</b> mm · Głębokość A/B: <b>${depthA}/${depthB}</b> mm · Wysokość: <b>${height}</b> mm
    </div>
    <button type="button" id="btn-corner-configure" class="btn btn-block btn-primary mb-8"><i class="ti ti-settings" aria-hidden="true"></i> Konfiguruj szafkę narożną</button>
    <button type="button" id="btn-corner-blank-print" class="btn btn-block btn-sm" style="margin-bottom: 15px;"><i class="ti ti-file-text" aria-hidden="true"></i> Wykrój narożny (jak wyciąć wieniec/półkę)</button>

    <hr class="divider">

    <h3>Pozycja w przestrzeni (3D)</h3>
    <div class="property-group prop-box">
      <div class="mb-8"><label class="fs-xs">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="input-corner-pos-x" value="${mod.position.x}" /></div>
      <div class="mb-8"><label class="fs-xs">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="input-corner-pos-z" value="${mod.position.z || 0}" /></div>
      <div><label class="fs-xs">Wysokość od podłogi (Y) [mm]:</label><input type="number" id="input-corner-pos-y" value="${mod.position.y}" /></div>
    </div>

    <h3>Obrót (co 90°)</h3>
    <div class="property-group seg">
      ${[0, 90, 180, 270].map(rot => {
          const active = (mod.rotation || 0) === rot;
          return `<button type="button" class="seg-btn btn-corner-rotate${active ? ' active' : ''}" data-rot="${rot}">${rot}°</button>`;
      }).join('')}
    </div>
    <div class="hint">Ramię A biegnie wzdłuż lokalnej osi X, ramię B wzdłuż lokalnej osi Z (przed obrotem).</div>

    <hr class="divider">
    <button type="button" id="btn-corner-delete" class="btn btn-danger btn-block btn-sm"><i class="ti ti-trash" aria-hidden="true"></i> Usuń szafkę narożną</button>
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
