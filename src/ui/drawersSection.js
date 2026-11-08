// src/ui/drawersSection.js
//
// Dział „Szuflady” huba Produkcja i raporty: zestawienie wszystkich szuflad projektu do składania
// (core/drawerAssembly.js) - szafka, system, wysokość, NL, światło wnęki, front, formatki skrzynki,
// czoło systemowe szuflady wewnętrznej MERIVOBOX z docinaniem profili - oraz karta do druku.
// Rysunki skrzynek drewnianych MOVENTO są w tym samym dziale poniżej (ui/productionHub.js).
import { escapeHtml, openHtmlWindow } from "../utils/dom.js";
import { collectDrawers, innerFrontPurchases, MERIVOBOX_INNER, profileKerf } from "../core/drawerAssembly.js";
import { WORKSHOP_CSS } from "./drawerBoxDrawings.js";

const fmt = (v) => String(Math.round((Number(v) || 0) * 10) / 10).replace(".", ",");

function partsCell(d) {
  if (d.woodenBox) return `<span class="hub-sub">skrzynka drewniana – rysunki niżej</span>`;
  return d.parts.map((p) => `${escapeHtml(p.name)} ${fmt(p.length)}×${fmt(p.width)}`).join("<br>");
}

function frontCell(d) {
  if (!d.inner) return `${fmt(d.front.w)}×${fmt(d.front.h)}`;
  if (!d.innerFront) return d.woodenBox ? "czoło z płyty (skrzynka)" : "czoło wewn. – brak danych systemu";
  const f = d.innerFront;
  return `czoło ${f.profile} dociąć na <b>${fmt(f.cut)}</b>` + `<br>mocowanie ${f.fixing}` + (f.rail ? `<br>reling ${f.rail.code} na ${fmt(f.rail.cut)}` : "");
}

function drawersTable(drawers) {
  return `<table class="hub-table">
    <thead><tr><th>Szafka</th><th>Szuflada</th><th>System · wys. · NL</th><th class="num">LW</th><th>Front / czoło</th><th>Formatki skrzynki</th></tr></thead>
    <tbody>${drawers.map((d, i) => `<tr>
      <td>${escapeHtml(d.module)}</td>
      <td>${d.inner ? "wewnętrzna" : "zwykła"} ${i + 1}${d.fits ? "" : ` <span class="badge-warn">nie mieści się</span>`}</td>
      <td>${escapeHtml(d.system)} · ${escapeHtml(d.type)} · NL ${d.nl}</td>
      <td class="num">${fmt(d.lw)}</td>
      <td>${frontCell(d)}</td>
      <td class="hub-sub">${partsCell(d)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function purchasesHtml(drawers, kerf, withInput = false) {
  const { items, profiles, rails } = innerFrontPurchases(drawers, kerf);
  if (!items.length) return "";
  const bars = (list, stock) => list.map((b, i) => `<li>${stock} mm nr ${i + 1}: ${b.cuts.map(fmt).join(" + ")} (zostaje ${fmt(b.rest)} mm)</li>`).join("");
  return `<h3>Czoła szuflad wewnętrznych MERIVOBOX</h3>
    <p class="hub-sub">Czoło to profil Blum ${MERIVOBOX_INNER.profile.code} (${MERIVOBOX_INNER.profile.length} mm, do szafki KB 1200) docinany na LW − ${MERIVOBOX_INNER.profile.deduct} mm i zestaw mocowania wg wysokości (katalog Blum, MERIVOBOX – szuflada wewnętrzna). Krótkie czoła tnie się z jednego profilu po kilka (rzaz piły ${fmt(kerf)} mm między odcinkami). Reling poprzeczny ${MERIVOBOX_INNER.rail.code} docina się na LW − ${MERIVOBOX_INNER.rail.deduct} mm.</p>
    ${withInput ? `<div class="field" style="max-width:220px"><label>Rzaz piły przy docinaniu [mm]</label><input type="number" class="input" id="dr-kerf" value="${kerf}" min="0" step="0.5"></div>` : ""}
    <table class="hub-table"><thead><tr><th>Do kupienia</th><th class="num">Ilość</th></tr></thead>
      <tbody>${items.map((it) => `<tr><td>${escapeHtml(it.name)}</td><td class="num">${it.qty} ${escapeHtml(it.unit)}</td></tr>`).join("")}</tbody></table>
    <div class="hub-sub"><b>Docinanie profili czół:</b><ul>${bars(profiles, MERIVOBOX_INNER.profile.length)}</ul>
    ${rails.length ? `<b>Docinanie relingów:</b><ul>${bars(rails, MERIVOBOX_INNER.rail.length)}</ul>` : ""}</div>`;
}

export function drawersSectionHtml(project) {
  const drawers = collectDrawers(project);
  return `<div class="hub-bar"><div><h3>Szuflady</h3>
      <div class="hub-sub">Wszystkie szuflady projektu do składania: system, wysokość, długość NL, światło wnęki LW, front, formatki skrzynki (dno, tył) i czoła szuflad wewnętrznych z docinaniem profili. Komplety prowadnic są na liście Okucia.</div></div>
      ${drawers.length ? `<button type="button" class="btn btn-primary" id="dr-print"><i class="ti ti-printer" aria-hidden="true"></i> Karta składania (${drawers.length} szt.)</button>` : ""}
    </div>
    ${drawers.length ? drawersTable(drawers) + purchasesHtml(drawers, profileKerf(project), true) : '<p class="hub-empty">Brak szuflad w zwykłych szafkach.</p>'}`;
}

export function bindDrawersSection(el, project, onChange) {
  el.querySelector("#dr-print")?.addEventListener("click", () => openDrawerAssemblySheet(project));
  el.querySelector("#dr-kerf")?.addEventListener("change", (e) => {
    const v = parseFloat(e.target.value);
    if (!(v >= 0)) return;
    project.drawerAssembly = { ...(project.drawerAssembly || {}), kerf: v };
    if (onChange) onChange();
  });
}

export function openDrawerAssemblySheet(project) {
  const drawers = collectDrawers(project);
  const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Szuflady – karta składania${project.name ? ` - ${escapeHtml(project.name)}` : ""}</title>
<style>${WORKSHOP_CSS}
  table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border-bottom: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; } .num { text-align: right; } .hub-sub { color: #475569; }
</style></head><body>
  <div class="toolbar"><h1>Szuflady – karta składania (${drawers.length} szt.)</h1><span class="spacer"></span><button class="pbtn" onclick="window.print()">🖨️ Drukuj</button></div>
  ${drawersTable(drawers)}
  ${purchasesHtml(drawers, profileKerf(project))}
</body></html>`;
  openHtmlWindow(html);
}
