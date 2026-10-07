// src/ui/cabinetInstructions.js
//
// Okno "Instrukcja montażu" szafek (otwierane z huba Produkcja i raporty, sekcja "Instrukcje
// montażu") - w tym samym układzie co instrukcja skrzynek szuflad (ui/drawerBoxDrawings.js):
// gdzie w projekcie, tabela formatek, montaż w izometrii z kolejnością kroków, formatki z
// ponumerowanymi otworami w jednej skali i tabela otworów. Jedna szafka na stronę wydruku.
// Dane: engine/cabinetDrillings.js, rysunki: render/cabinetDrawing2d.js.
import { escapeHtml } from "../utils/dom.js";
import { state } from "../core/state.js";
import { computeWallLayouts } from "../core/walls.js";
import { getCabinetPanels, getCabinetConstruction } from "../engine/cabinetDrillings.js";
import {
  cabinetDrawingScale, panelSVGs, cabinetLegendHtml,
  cabinetAssemblySVG, cabinetStepsHtml, projectLocatorSVG,
} from "../render/cabinetDrawing2d.js";
import { WORKSHOP_CSS } from "./drawerBoxDrawings.js";

const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const TYPE = { base_cabinet: "Szafka dolna", upper_cabinet: "Szafka wisząca", tall_cabinet: "Słupek", corner_cabinet: "Szafka narożna", slope_cabinet: "Szafka pod skos" };

// Czy dla szafki da się zrobić instrukcję (narożna i pod skos mają inną geometrię).
export const supportsInstructions = (mod) => mod && mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet";

function cabinetCard(mod, idx, layouts) {
  const project = state.project;
  const d = mod.dimensions;
  const panels = getCabinetPanels(mod, project);
  const cons = getCabinetConstruction(mod, project);
  const th = panels[0] ? panels[0].thickness : 18;
  const scale = cabinetDrawingScale(panels);
  const consText = [
    cons.isFull ? "wieńce pełne (boki między wieńcami)" : "boki do ziemi (wieńce między bokami)",
    cons.topType === "pelny" ? "wieniec górny" : cons.topType === "trawersy_poziom" ? "trawersy poziome" : "trawersy pionowe",
    cons.backType === "nut" ? "plecy w nucie" : "plecy nakładane",
    cons.legs ? `nóżki ${cons.legsHeight} mm${cons.plinth ? " + cokół" : ""}` : "bez nóżek",
  ].join(" · ");
  const partsRows = panels.map((p, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(p.name)}</b>${p.note ? `<div class="muted">${escapeHtml(p.note)}</div>` : ""}</td><td>${p.qty}</td><td>${fmt(p.length)} × ${fmt(p.width)} × ${fmt(p.thickness)}</td></tr>`).join("");
  const svgs = panelSVGs(panels, scale);
  return `<section class="box" id="szafka-${idx}">
    <h2>${idx + 1}. ${escapeHtml(mod.name)} <span class="qty">${fmt(d.width)} × ${fmt(d.height)} × ${fmt(d.depth)}</span></h2>
    <p class="lead">${escapeHtml(TYPE[mod.type] || "Szafka")} · ${escapeHtml(consText)} · płyta ${fmt(th)} mm${cons.drawers ? ` · szuflady: ${cons.drawers}` : ""}${cons.doors ? ` · drzwi: ${cons.doors}` : ""}</p>
    <h3>Gdzie w projekcie</h3>
    <div class="locators"><div class="card">${projectLocatorSVG(layouts, project.modules, mod.id, mod.name)}</div></div>
    <div class="cols">
      <table class="parts"><thead><tr><th>Nr</th><th>Formatka</th><th>Szt.</th><th>Wymiar [mm]</th></tr></thead><tbody>${partsRows}</tbody></table>
      <div class="notes">
        <div>Numery formatek są takie same na rysunku montażu, w tabeli otworów i na rysunkach formatek.</div>
        <div>Fronty, skrzynki szuflad i okucia: lista formatek, sekcja „Skrzynki szuflad” i „Okucia” w hubie Produkcja.</div>
        <div>Otwory w tych samych miejscach co na „Rysunkach 2D” (rysunek boku z wierceniami).</div>
      </div>
    </div>
    <div class="assembly"><div class="card">${cabinetAssemblySVG(mod, panels, project)}</div><div><h3>Kolejność montażu</h3>${cabinetStepsHtml(cons, panels)}</div></div>
    ${cabinetLegendHtml(panels, th)}
    <p class="muted">Na ekranie rysunki formatek są powiększone do okna. Na wydruku są w skali <b>1:${scale}</b> (wszystkie tak samo) - ustaw skalę 100% / „Rzeczywisty rozmiar”, wtedy 1 cm na papierze = ${scale} cm formatki.</p>
    <div class="grid">${svgs.map((s) => `<div class="card">${s}</div>`).join("")}</div>
  </section>`;
}

export function openCabinetInstructions(modules, projectName = "") {
  const list = modules.filter(supportsInstructions);
  const layouts = computeWallLayouts(state.project);
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Instrukcja montażu${projectName ? ` - ${escapeHtml(projectName)}` : ""}</title>
  <style>
${WORKSHOP_CSS}  </style>
</head>
<body>
  <div class="toolbar"><h1>Instrukcja montażu (${list.length} ${list.length === 1 ? "szafka" : list.length < 5 ? "szafki" : "szafek"})</h1><span class="spacer"></span><button class="pbtn" onclick="window.print()">🖨️ Drukuj</button></div>
  <div class="index">${list.map((m, i) => `<a href="#szafka-${i}">${i + 1}. ${escapeHtml(m.name)}</a>`).join("")}</div>
  ${list.map((m, i) => cabinetCard(m, i, layouts)).join("")}
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}
