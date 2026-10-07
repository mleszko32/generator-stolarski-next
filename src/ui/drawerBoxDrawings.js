// src/ui/drawerBoxDrawings.js
//
// Okno "Skrzynki szuflad" (otwierane z huba Produkcja i raporty): dla każdej skrzynki
// drewnianej (MOVENTO) - nagłówek ze wzorami Blum, tabela formatek, rysunki boku, dna,
// tyłu i czoła wewnętrznego z ponumerowanymi otworami i tabela otworów. Jedna skrzynka
// na stronę wydruku. Dane: core/drawerBoxBuild.js, rysunki: render/drawerBoxDrawing2d.js.
import { escapeHtml } from "../utils/dom.js";
import { JOIN_METHODS } from "../core/drawerBoxBuild.js";
import { sideSVG, bottomSVG, plateSVG, legendHtml, holeTableHtml, panelStartNumbers, assemblySVG, assemblyStepsHtml } from "../render/drawerBoxDrawing2d.js";

const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

function boxCard(box, settings, idx) {
  const starts = panelStartNumbers(box);
  const svgs = box.panels.map((p, i) => {
    if (p.kind === "bok") return sideSVG(box, p, starts[i]);
    if (p.kind === "dno") return bottomSVG(box, p, starts[i]);
    return plateSVG(box, p, starts[i]);
  });
  const partsRows = box.panels.map((p) => `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${p.qty}</td><td>${fmt(p.length)} × ${fmt(p.width)} × ${fmt(p.thickness)}</td></tr>`).join("");
  return `<section class="box" id="box-${idx}">
    <h2>${idx + 1}. ${escapeHtml(box.name)} <span class="qty">× ${box.qty}</span></h2>
    <p class="lead">${escapeHtml(box.system)} · NL ${box.nl} · światło korpusu LW ${fmt(box.lw)} → szerokość skrzynki SKW = LW − ${fmt(box.lw - box.skw)} = <b>${fmt(box.skw)}</b> · długość SKL = NL − 10 = <b>${fmt(box.skl)}</b> · płyta ${fmt(box.t)} mm, dno podniesione o ${fmt(box.recess)} mm · łączenie: <b>${escapeHtml(JOIN_METHODS[box.join])}</b></p>
    <p class="muted">Szafki: ${box.modules.map(escapeHtml).join(", ")}</p>
    <div class="cols">
      <table class="parts"><thead><tr><th>Formatka</th><th>Szt.</th><th>Wymiar [mm]</th></tr></thead><tbody>${partsRows}</tbody></table>
      <div class="notes">
        <div>Tył i czoło wewnętrzne stoją <b>na dnie</b>, między bokami; dno między bokami na całą długość (wariant Blum bez wycięcia w tyle).</div>
        <div><b>Sprzęgła T51.7601</b> (przód, pod dnem): wkręty pod kątem 75°, otwory Ø2,5 × 10 — położenie wg szablonu Blum <b>T65.1000.02</b> (Blum nie podaje wymiarów).</div>
        <div><b>Zaczep tylny</b> Ø6 × 10 w tylnej krawędzi dna, 7 mm od boku, 11 mm nad spodem dna (Blum TD-132/1 str. 5 — dla wariantu z wycięciem w tyle; tu przeniesione na dno). Można wiercić szablonem T65.1000.02.</div>
      </div>
    </div>
    <div class="assembly"><div class="card">${assemblySVG(box)}</div><div><h3>Kolejność montażu</h3>${assemblyStepsHtml(box)}</div></div>
    ${legendHtml(box)}
    <div class="grid">${svgs.map((s) => `<div class="card">${s}</div>`).join("")}</div>
    <h3>Otwory</h3>
    ${holeTableHtml(box, settings)}
  </section>`;
}

export function openDrawerBoxDrawings(boxes, settings, projectName = "") {
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Skrzynki szuflad${projectName ? ` - ${escapeHtml(projectName)}` : ""}</title>
  <style>
    :root { color-scheme: light; }
    html { background: #fff; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0 30px 30px; color: #1e293b; max-width: 1200px; margin: 0 auto; background: #fff; }
    .toolbar { position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 2px solid #cbd5e1; display: flex; gap: 8px; align-items: center; padding: 10px 0; flex-wrap: wrap; }
    .toolbar h1 { font-size: 20px; margin: 0; color: #0f172a; }
    .spacer { flex: 1; }
    .pbtn { padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; background: #059669; color: #fff; }
    .index { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
    .index a { font-size: 12px; padding: 4px 10px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; text-decoration: none; border: 1px solid #bfdbfe; }
    .box { padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: 14px; }
    .box h2 { font-size: 18px; color: #1e3a8a; margin: 8px 0 4px; }
    .box h2 .qty { color: #059669; }
    h3 { font-size: 15px; margin: 18px 0 6px; color: #1e3a8a; }
    .lead { font-size: 13px; color: #334155; line-height: 1.5; margin: 4px 0; }
    .muted { color: #64748b; font-size: 12px; margin: 2px 0 8px; }
    .cols { display: grid; grid-template-columns: minmax(260px, 1fr) 2fr; gap: 14px; align-items: start; }
    .notes { font-size: 12px; color: #475569; line-height: 1.5; display: grid; gap: 6px; }
    .notes div { background: #f8fafc; border-left: 3px solid #93c5fd; padding: 6px 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 12px; align-items: start; }
    .card { border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; break-inside: avoid; }
    svg { width: 100%; height: auto; display: block; }
    table.parts { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
    table.parts th { text-align: left; background: #f1f5f9; padding: 5px 8px; border-bottom: 2px solid #cbd5e1; }
    table.parts td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    table.holes td:first-child { font-weight: bold; width: 32px; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .assembly { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; align-items: start; margin: 12px 0; }
    .assembly h3 { margin-top: 0; }
    .steps { font-size: 13px; color: #334155; line-height: 1.5; padding-left: 20px; margin: 0; }
    .steps li { margin-bottom: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #475569; margin: 10px 0; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
    .legend i.open { background: #fff; border: 1.5px solid; }
    @media print {
      .toolbar, .index { display: none !important; }
      body { padding: 0; max-width: 100%; }
      .box { page-break-before: always; border-top: none; margin-top: 0; }
      .box:first-of-type { page-break-before: auto; }
      .grid { grid-template-columns: 1fr 1fr; }
      .assembly { grid-template-columns: 3fr 2fr; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><h1>Skrzynki szuflad (${boxes.reduce((n, b) => n + b.qty, 0)} szt.)</h1><span class="spacer"></span><button class="pbtn" onclick="window.print()">🖨️ Drukuj</button></div>
  <div class="index">${boxes.map((b, i) => `<a href="#box-${i}">${i + 1}. ${escapeHtml(b.name)} × ${b.qty}</a>`).join("")}</div>
  ${boxes.map((b, i) => boxCard(b, settings, i)).join("")}
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  window.open(URL.createObjectURL(blob), "_blank");
}
