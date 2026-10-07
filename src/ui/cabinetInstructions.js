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
import { getRcSettings, rcPanelSetups, rcRearScrew, RC_FRONT_STOP, RC_RAIL_STEP } from "../core/rcSystem.js";

const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
const TYPE = { base_cabinet: "Szafka dolna", upper_cabinet: "Szafka wisząca", tall_cabinet: "Słupek", corner_cabinet: "Szafka narożna", slope_cabinet: "Szafka pod skos" };

// Czy dla szafki da się zrobić instrukcję (narożna i pod skos mają inną geometrię).
export const supportsInstructions = (mod) => mod && mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet";

// Karta wiercenia na stole RC System (core/rcSystem.js): ustawienia stołu dla formatek
// pionowych tej szafki, posortowane wg otworu bazowego (najmniej przestawiania pinów), pary
// co 32 mm jako jedno wiercenie; wieńce / półki stałe / przegrody - otwory w czole (nakładka).
function rcCardHtml(panels) {
  const rc = getRcSettings(state.project);
  if (!rc.enabled) return "";
  const vertical = panels.filter((p) => (p.kind === "bok" || p.kind === "przegroda") && p.holes.length);
  const rows = [];
  vertical.forEach((p) => {
    const sides = p.kind === "przegroda" ? ["lewa", "prawa"] : [null];
    sides.forEach((side) => {
      const sub = side ? { ...p, holes: p.holes.filter((h) => !h.side || h.side === side) } : p;
      rcPanelSetups(sub).forEach((st) => rows.push({ name: side ? `${p.name} (strona ${side})` : p.name, qty: p.qty, depth: p.length, st }));
    });
  });
  if (!rows.length) return "";
  rows.sort((a, b) => a.st.dist - b.st.dist || a.st.ref.localeCompare(b.st.ref));
  const shotText = (row, shot, i, all) => {
    const pos = shot.map((v) => fmt(v)).join(" + ");
    const pair = shot.length === 2 ? " <span class=\"muted\">(1 wiercenie, 2 wrzeciona)</span>" : "";
    if (row.st.alongFrom !== "przód") return `${pos}${pair}`;
    // Łączniki przy dole / górze: przednia wiertarka od zderzaka, tylna wg trybu, środkowe - pin w szynie.
    if (i === 0 && Math.abs(shot[0] - RC_FRONT_STOP) < 0.05) return `${pos}${pair} - przednia wiertarka, przód do zderzaka 37`;
    if (i === all.length - 1 && all.length > 1) {
      const r = rcRearScrew(row.depth, rc);
      if (rc.rearMode === "stop") return `${pos}${pair} - tylna wiertarka zderzakiem do tylnej krawędzi`;
      return r.exact
        ? `${pos}${pair} - tylna wiertarka na pinie w szynie (${fmt(row.depth - r.x)} mm od tyłu)`
        : `${pos}${pair} - tylna wiertarka na najbliższym pinie w stronę formatki: otwór ${RC_FRONT_STOP}–${RC_FRONT_STOP + RC_RAIL_STEP - 1} mm od tyłu - <b>sprawdź pierwszą sztukę</b> (dokładnie po kalibracji w hubie)`;
    }
    return `${pos}${pair} - wiertarka zablokowana pinem w szynie (${fmt(shot[0])} mm od przodu)`;
  };
  const body = rows.map((row) => `<tr>
      <td><b>${escapeHtml(row.st.refLabel)}</b> do pinów<div class="muted">${row.st.baseText ? escapeHtml(row.st.baseText) : `${fmt(row.st.dist)} mm - ustaw na listwie`} = ${fmt(row.st.dist)} mm</div></td>
      <td>${escapeHtml(row.name)} <span class="muted">× ${row.qty}</span></td>
      <td>od ${row.st.alongFrom === "przód" ? "przodu" : "dołu"}: ${row.st.shots.map((s, i, all) => shotText(row, s, i, all)).join("<br>")}</td>
    </tr>`).join("");
  const edgePanels = panels.filter((p) => (p.kind === "poziom" || p.kind === "polka") && p.holes.some((h) => h.edge === "lewe" || h.edge === "prawe"));
  const edgeList = edgePanels.map((p) => {
    const zs = [...new Set(p.holes.filter((h) => h.edge === "lewe").map((h) => h.z))].sort((a, b) => a - b);
    return `<li><b>${escapeHtml(p.name)}</b> × ${p.qty}: czoła lewe i prawe, w osi grubości, od przodu ${zs.map(fmt).join(" / ")} mm</li>`;
  }).join("");
  return `<h3>Wiercenie na stole RC System</h3>
    <p class="muted">Ustawienia posortowane wg otworu bazowego - wierć wszystkie formatki z jednym ustawieniem, zanim przestawisz piny. Wkręt (Ø3) zawsze od strony krawędzi.</p>
    <table class="parts"><thead><tr><th>Ustawienie</th><th>Formatka</th><th>Pozycje wzdłuż krawędzi [mm]</th></tr></thead><tbody>${body}</tbody></table>
    ${edgeList ? `<p class="lead"><b>W czole</b> (nakładka do wiercenia w sztorcu + blaszki):</p><ul class="steps">${edgeList}</ul>` : ""}`;
}

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
    ${rcCardHtml(panels)}
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
