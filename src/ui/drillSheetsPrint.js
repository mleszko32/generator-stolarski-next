// src/ui/drillSheetsPrint.js
// Wydruk arkuszy nawierceń całych mebli (hub „Produkcja i raporty” → Rysunki 2D): wybór grup
// (ten sam co w Menedżerze formatek i planie rozkroju, ui/furnitureFilter.js), potem okno
// wydruku - strona tytułowa z legendą mebli i spisem, dalej każda formatka z otworami na
// osobnej kartce A4 (rysunek na całą stronę), z nazwą jak w SAS („M1 Bok (L/P)”) i liczbą
// „DO NAWIERCENIA: N szt.”. Dane: engine/drillSheets.js, rysunki: render/cabinetDrawing2d.js.
import { state } from "../core/state.js";
import { collectProjectParts } from "../engine/cabinet.js";
import { drillSheets } from "../engine/drillSheets.js";
import { verticalPanelSVG, horizontalPanelSVG } from "../render/cabinetDrawing2d.js";
import { C, FONT } from "../render/drawingPalette.js";
import { escapeHtml, openHtmlWindow } from "../utils/dom.js";
import { openModal, showAlert } from "../utils/modal.js";
import { furnitureFilterHtml, bindFurnitureFilter, currentExcluded } from "./furnitureFilter.js";
import { fmtMm } from "../utils/math.js";

const isVertical = (p) => ["bok", "przegroda", "trawers-pion", "listwa", "front"].includes(p.kind);

// Rysunki jednej formatki - przegroda ma dwie strony (dwie kartki).
function sheetSvgs(panel) {
  if (panel.kind === "przegroda") return [verticalPanelSVG(panel, 1, null, "lewa"), verticalPanelSVG(panel, 1, null, "prawa")];
  return [isVertical(panel) ? verticalPanelSVG(panel) : horizontalPanelSVG(panel)];
}

// Proporcje rysunku z viewBox - do wyboru orientacji kartki.
function aspect(svg) {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? parseFloat(m[3]) / parseFloat(m[4]) : 1;
}

function buildHtml(result) {
  const { sheets, skipped } = result;
  const project = state.project.name || "Projekt";
  const date = new Date().toLocaleDateString("pl-PL");
  const pages = [];
  sheets.forEach((s) => {
    const svgs = sheetSvgs({ ...s.panel, name: s.name, qty: s.qty });
    svgs.forEach((svg, i) => pages.push({ s, svg, side: svgs.length > 1 ? (i === 0 ? "strona lewa" : "strona prawa") : "" }));
  });
  const total = pages.length;
  const legend = [...new Map(sheets.filter((s) => s.code).map((s) => [s.code, s.furniture])).entries()];

  const cover = `
    <section class="page portrait">
      <h1>Arkusze nawierceń</h1>
      <div class="sub">${escapeHtml(project)} · ${escapeHtml(date)} · ${total} ${total === 1 ? "kartka" : "kartek"} z rysunkami</div>
      ${legend.length ? `<h2>Legenda mebli</h2><table>${legend.map(([c, l]) => `<tr><td class="code">${escapeHtml(c)}</td><td>${escapeHtml(l)}</td></tr>`).join("")}</table>` : ""}
      <h2>Formatki do nawiercenia</h2>
      <table class="list"><tr><th>Mebel</th><th>Formatka</th><th>Wymiar (mm)</th><th>Szt.</th></tr>
        ${sheets.map((s) => `<tr><td class="code">${escapeHtml(s.code)}</td><td><b>${escapeHtml(s.listName)}</b> <span class="muted">${escapeHtml(s.name)}</span></td><td>${fmtMm(s.length)} × ${fmtMm(s.width)} × ${fmtMm(s.thickness)}</td><td class="qty">${s.qty}</td></tr>`).join("")}
      </table>
      ${skipped.length ? `<p class="muted">Bez arkuszy (szafka narożna / pod skos - własne rysunki w „Rysunki 2D”): ${escapeHtml(skipped.join(", "))}</p>` : ""}
    </section>`;

  const body = pages.map((p, i) => {
    const land = aspect(p.svg) > 1.15;
    const svg = p.svg.replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
    return `
    <section class="page ${land ? "landscape" : "portrait"}">
      <div class="head">
        <div>
          <div class="title">${escapeHtml([p.s.code, p.s.listName].filter(Boolean).join(" "))}${p.side ? ` <span class="side">(${p.side})</span>` : ""}</div>
          <div class="sub">${escapeHtml(p.s.name)} · ${fmtMm(p.s.length)} × ${fmtMm(p.s.width)} × ${fmtMm(p.s.thickness)} mm${p.s.furniture ? ` · ${escapeHtml(p.s.code)} = ${escapeHtml(p.s.furniture)}` : ""}</div>
        </div>
        <div class="qty"><span>do nawiercenia</span><b>${p.s.qty} szt.</b></div>
      </div>
      <div class="draw">${svg}</div>
      <div class="foot"><span>${escapeHtml(project)} · szafki: ${escapeHtml(p.s.modules.join(", "))}</span><span>${i + 1} / ${total}</span></div>
    </section>`;
  }).join("");

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Arkusze nawierceń - ${escapeHtml(project)}</title>
  <style>
    @page por { size: A4 portrait; margin: 8mm; }
    @page lan { size: A4 landscape; margin: 8mm; }
    body { margin: 0; font-family: ${FONT}; color: ${C.slate800}; background: ${C.slate100}; }
    .page { box-sizing: border-box; background: ${C.white}; margin: 10px auto; padding: 0; display: flex; flex-direction: column; break-after: page; page-break-after: always; overflow: hidden; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .portrait { width: 194mm; height: 281mm; page: por; }
    .landscape { width: 281mm; height: 194mm; page: lan; }
    h1 { margin: 0 0 2mm; font-size: 9mm; }
    h2 { margin: 6mm 0 2mm; font-size: 5mm; }
    table { border-collapse: collapse; font-size: 3.6mm; }
    td, th { padding: 1.2mm 3mm; border-bottom: 0.2mm solid ${C.slate300}; text-align: left; }
    .code { font-weight: 800; color: ${C.blue900}; }
    .qty { text-align: right; font-weight: 700; }
    .muted { color: ${C.slate500}; font-weight: 400; }
    .sub { font-size: 3.4mm; color: ${C.slate600}; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 4mm; border-bottom: 0.5mm solid ${C.slate800}; padding-bottom: 2mm; }
    .title { font-size: 7.5mm; font-weight: 800; line-height: 1.1; }
    .title .side { font-size: 5mm; font-weight: 600; color: ${C.slate600}; }
    .head .qty { border: 0.6mm solid ${C.slate800}; border-radius: 2mm; padding: 1.5mm 4mm; text-align: center; white-space: nowrap; }
    .head .qty span { display: block; font-size: 3mm; text-transform: uppercase; color: ${C.slate600}; font-weight: 600; }
    .head .qty b { font-size: 8mm; }
    .draw { flex: 1; min-height: 0; display: flex; }
    .draw svg { width: 100%; height: 100%; }
    .foot { display: flex; justify-content: space-between; font-size: 3mm; color: ${C.slate600}; border-top: 0.2mm solid ${C.slate300}; padding-top: 1mm; }
    .bar { position: sticky; top: 0; background: ${C.white}; padding: 8px 16px; border-bottom: 1px solid ${C.slate300}; text-align: center; }
    .bar button { font: inherit; font-weight: 700; padding: 6px 16px; cursor: pointer; }
    @media print { body { background: ${C.white}; } .page { margin: 0; } .bar { display: none; } }
  </style></head><body>
  <div class="bar"><button onclick="window.print()">Drukuj (${total + 1} kartek A4, skala 100%)</button></div>
  ${cover}${body}
  </body></html>`;
}

export function openDrillSheetsDialog() {
  const parts = collectProjectParts();
  const count = () => drillSheets(state.project, currentExcluded(parts));
  const summary = (r) => r.sheets.length
    ? `${r.sheets.length} różnych formatek z nawiertami, razem ${r.sheets.reduce((a, s) => a + s.qty, 0)} szt.${r.skipped.length ? ` · bez arkuszy: ${r.skipped.join(", ")}` : ""}`
    : "Brak formatek z nawiertami w wybranych grupach.";
  const dlg = openModal({
    title: "Arkusze nawierceń",
    subtitle: "Każda formatka z otworami na osobnej kartce A4, jednakowe formatki razem z liczbą sztuk do nawiercenia.",
    width: 620,
    body: `${furnitureFilterHtml(parts)}<div class="notice-info" id="ds-summary" style="margin-top:8px"></div>`,
    footer: [
      { label: "Anuluj" },
      { label: "Otwórz wydruk", kind: "primary", icon: "printer", onClick: (close) => {
        const r = count();
        if (!r.sheets.length) { showAlert("Brak formatek z nawiertami w wybranych grupach."); return; }
        openHtmlWindow(buildHtml(r));
        close();
      } },
    ],
  });
  const root = dlg.modal;
  const refresh = () => { root.querySelector("#ds-summary").textContent = summary(count()); };
  bindFurnitureFilter(root, parts, refresh);
  refresh();
}
