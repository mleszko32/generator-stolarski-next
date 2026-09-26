// src/ui/moduleInfoPanel.js
// Zwijana karta "Informacje o szafce" na górze prawego panelu: wymiary korpusu i
// wnętrza, fronty, szuflady (front i skrzynka) i półki - żeby nie trzeba było
// szukać liczb po zakładkach. Dane z core/moduleInfo.js.
import { getModuleSummary } from "../core/moduleInfo.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";

const OPEN_KEY = "moduleInfoOpen";

function isOpen() {
  try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch (e) { return true; }
}

// Zwraca HTML karty (string); stan zwinięcia pamięta localStorage (inline ontoggle).
export function moduleInfoHtml(mod) {
  let s;
  try { s = getModuleSummary(mod, state.project); } catch (e) { return ""; }

  const row = (k, v) => `<div class="info-row"><span class="info-k">${k}</span><span class="info-v">${v}</span></div>`;
  const rows = [];
  rows.push(row("Rodzaj", `${escapeHtml(s.type)}${s.legs ? `, nóżki ${s.legs} mm` : ""}`));
  rows.push(row("Wymiary", `${s.dims.w} × ${s.dims.h} × ${s.dims.d} mm`));
  rows.push(row("Wnętrze", `${s.inner.w} × ${s.inner.h} mm, głęb. ${s.inner.d} mm`));

  if (s.doors.length) {
    rows.push(`<div class="info-sub">Drzwi</div>`);
    s.doors.forEach((d) => rows.push(row(escapeHtml(d.label), `${d.w} × ${d.h} mm · zawiasy z ${d.side === "left" ? "lewej" : "prawej"} (${d.hinges} szt.)`)));
  }

  if (s.drawers.length) {
    // Krótko: system, typ i długość szuflady; takie same szuflady zliczamy razem.
    const groups = new Map();
    s.drawers.forEach((d) => {
      const spec = d.box
        ? `${escapeHtml(d.box.system || "")}${d.box.variant ? " typ " + escapeHtml(d.box.variant) : ""}, dł. ${d.box.length}`
        : "brak danych systemu";
      const key = spec + (d.label.includes("wewn.") ? " (wewn.)" : "");
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    rows.push(`<div class="info-sub">Szuflady</div>`);
    groups.forEach((count, spec) => rows.push(`<div class="info-row"><span class="info-v" style="text-align:left">${count > 1 ? count + "× " : ""}${spec}</span></div>`));
  }

  if (s.shelves.length || s.dividers) {
    const movable = s.shelves.filter((p) => !p.fixed).length;
    const fixed = s.shelves.length - movable;
    const parts = [];
    if (movable) parts.push(`${movable} ruchomych`);
    if (fixed) parts.push(`${fixed} stałych`);
    if (s.shelves.length) rows.push(row("Półki", `${parts.join(", ")} (wys. ${s.shelves.map((p) => Math.round(p.y)).join(", ")} mm)`));
    if (s.dividers) rows.push(row("Przegrody pionowe", String(s.dividers)));
  }

  if (!s.doors.length && !s.drawers.length) rows.push(`<div class="hint">Brak frontów - dodaj drzwi lub szuflady w Wnętrzu 2D.</div>`);

  return `<details class="prop-info" ${isOpen() ? "open" : ""} ontoggle="try{localStorage.setItem('moduleInfoOpen',this.open?'1':'0')}catch(e){}">
    <summary><i class="ti ti-info-circle" aria-hidden="true"></i> Informacje o szafce</summary>
    <div class="info-body">${rows.join("")}</div>
  </details>`;
}
