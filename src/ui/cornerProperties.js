// src/ui/cornerProperties.js
//
// Prawy panel szafki narożnej i wydruk wykroju formatki narożnej - wydzielone z
// ui/properties.js (renderCornerModuleProperties zamiast zakładek zwykłego modułu).
import { state } from "../core/state.js";
import { updateSidebar } from "./sidebar.js";
import { update3D } from "../render/viewer3d.js";
import { getCornerDepths } from "../core/layout.js";
import { escapeHtml } from "../utils/dom.js";
import { fmtMm } from "../utils/math.js";
import { openCornerConfigModal } from "./cornerConfigModal.js";
import { generateCornerBlankSVG, generateCornerPartsDrawings } from "../render/cornerDrawing2d.js";
import { initPropertiesPanel } from "./properties.js";
import { propHeaderHtml, sectionHtml, bindSections, positionRotationHtml, bindModulePosition } from "./propertiesShell.js";
import { cornerFittingSectionHtml, bindCornerFittingSection } from "./blindCornerProperties.js";

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
// state.js: addCornerModule) - nieprostokątny moduł, więc zamiast zakładek
// Front/Szuflady/Konstrukcja/Zawiasy zwykłej szafki (zakładają jeden prostokątny
// korpus) wymiary ramion i fronty/półki per ramię ustawia się w osobnym oknie
// (ui/cornerConfigModal.js). Panel ma tę samą ramę co zwykła szafka
// (ui/propertiesShell.js): nagłówek z nazwą, sekcja Wymiary z pozycją i obrotem.
export function renderCornerModuleProperties(rightSidebar, mod) {
  const legA = parseFloat(mod.dimensions.width) || 0;
  const legB = parseFloat(mod.dimensions.legB) || 0;
  const { depthA, depthB } = getCornerDepths(mod);
  const height = parseFloat(mod.dimensions.height) || 0;

  rightSidebar.innerHTML = `
    ${propHeaderHtml({ name: mod.name, dims: `${legA}×${legB}×${height}`, extra: 'narożna', nameId: 'input-corner-name' })}

    <button type="button" id="btn-corner-configure" class="btn btn-block btn-primary mb-8"><i class="ti ti-settings" aria-hidden="true"></i> Konfiguruj szafkę narożną</button>
    <button type="button" id="btn-corner-blank-print" class="btn btn-block btn-sm mb-8"><i class="ti ti-file-text" aria-hidden="true"></i> Wykrój narożny (jak wyciąć wieniec/półkę)</button>

    ${sectionHtml('wymiary', `
      <h3>Wymiary Modułu</h3>
      <div class="prop-info"><div class="info-body">
        <div class="info-row"><span class="info-k">Ramię A</span><span class="info-v">${legA} mm</span></div>
        <div class="info-row"><span class="info-k">Ramię B</span><span class="info-v">${legB} mm</span></div>
        <div class="info-row"><span class="info-k">Głębokość A / B</span><span class="info-v">${depthA} / ${depthB} mm</span></div>
        <div class="info-row"><span class="info-k">Wysokość</span><span class="info-v">${height} mm</span></div>
      </div></div>
      <div class="hint mb-8">Wymiary ramion, fronty i półki zmieniasz w oknie „Konfiguruj szafkę narożną”.</div>

      <hr class="divider">

      ${positionRotationHtml({
        prefix: 'input-corner-pos', position: mod.position, rotation: mod.rotation, rotClass: 'btn-corner-rotate',
        hint: 'Ramię A biegnie wzdłuż lokalnej osi X, ramię B wzdłuż lokalnej osi Z (przed obrotem).',
      })}
    `)}

    ${cornerFittingSectionHtml(mod)}
  `;

  const refresh = () => { update3D(); updateSidebar(); };
  bindCornerFittingSection(rightSidebar, mod, { refresh, rerender: initPropertiesPanel });
  bindSections(rightSidebar);
  document.getElementById('input-corner-name')?.addEventListener('input', e => { mod.name = e.target.value; refresh(); });
  bindModulePosition(rightSidebar, mod, { prefix: 'input-corner-pos', rotClass: 'btn-corner-rotate', onChange: refresh, rerender: initPropertiesPanel });

  document.getElementById('btn-corner-configure')?.addEventListener('click', () => openCornerConfigModal(mod));
  document.getElementById('btn-corner-blank-print')?.addEventListener('click', () => openCornerBlankPrintView(mod));
}
