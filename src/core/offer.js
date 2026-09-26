// src/core/offer.js
//
// Oferta dla klienta: czysta logika (ustawienia, opis zakresu, HTML do wydruku).
// Kosztorys wewnętrzny (koszty, marża) zostaje w engine/cabinet.js - oferta
// pokazuje klientowi tylko zakres zabudowy i cenę (wartość, rabat, netto, VAT,
// brutto), bez rozbicia na koszty i marżę.
import { escapeHtml } from "../utils/dom.js";

export const OFFER_DEFAULTS = {
  company: "",
  contact: "",
  clientName: "",
  number: "",
  validDays: 14,
  notes: "",
};

export function getOfferSettings(project) {
  return { ...OFFER_DEFAULTS, ...(project.offer || {}) };
}

const MODULE_TYPE_LABELS = {
  base_cabinet: "Szafka dolna",
  upper_cabinet: "Szafka wisząca",
  tall_cabinet: "Słupek",
  corner_cabinet: "Szafka narożna",
};

// Polska odmiana: 1 szuflada, 2-4 szuflady, 5+ szuflad (z wyjątkiem 12-14).
export function plural(n, one, few, many) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const last = abs % 10, lastTwo = abs % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

const dim = (v) => Math.round((parseFloat(v) || 0) * 10) / 10;
const pln = (n) => (Number(n) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

// Krótki opis wyposażenia szafki: "3 szuflady, 2 drzwi, 4 półki".
export function describeModuleContents(mod) {
  const els = mod.elements || [];
  const drawers = els.filter((e) => e.typ === "front" && e.subtype === "szuflada").length;
  const innerDrawers = els.filter((e) => e.typ === "front" && e.subtype === "szuflada-wewnetrzna").length;
  const doors = els.filter((e) => e.typ === "front" && (e.subtype === "drzwi" || e.subtype === "drzwi-lp")).length;
  const shelves = els.filter((e) => e.typ === "poziom" && !e.isStructural).length;
  const parts = [];
  if (drawers) parts.push(`${drawers} ${plural(drawers, "szuflada", "szuflady", "szuflad")}`);
  if (innerDrawers) parts.push(`${innerDrawers} ${plural(innerDrawers, "szuflada wewnętrzna", "szuflady wewnętrzne", "szuflad wewnętrznych")}`);
  if (doors) parts.push(`${doors} ${plural(doors, "skrzydło drzwi", "skrzydła drzwi", "skrzydeł drzwi")}`);
  if (shelves) parts.push(`${shelves} ${plural(shelves, "półka", "półki", "półek")}`);
  return parts.join(", ");
}

// data: { project, cost (wynik calculateProjectCost), snapshot (data URL albo null), now (Date) }
export function buildOfferHtml({ project, cost, snapshot, now = new Date() }) {
  const s = getOfferSettings(project);
  const dateStr = now.toLocaleDateString("pl-PL");
  const validUntil = new Date(now.getTime() + (parseFloat(s.validDays) || 0) * 86400000).toLocaleDateString("pl-PL");
  const modules = project.modules || [];

  const rows = modules.map((m) => {
    const d = m.dimensions || {};
    const size = m.type === "corner_cabinet"
      ? `ramię A ${dim(d.width)} · ramię B ${dim(d.legB)} · wys. ${dim(d.height)} mm`
      : `${dim(d.width)} × ${dim(d.height)} × ${dim(d.depth)} mm`;
    return `<tr>
      <td>${escapeHtml((m.name || "").trim() || MODULE_TYPE_LABELS[m.type] || "Szafka")}</td>
      <td>${escapeHtml(MODULE_TYPE_LABELS[m.type] || "Szafka")}</td>
      <td>${escapeHtml(size)}</td>
      <td>${escapeHtml(describeModuleContents(m) || "—")}</td>
    </tr>`;
  }).join("");

  const extras = [];
  if (project.worktop && project.worktop.enabled) extras.push("blat roboczy");
  const boks = (project.sidePanels || []).filter((p) => p.kind !== "blenda").length;
  const blendy = (project.sidePanels || []).filter((p) => p.kind === "blenda").length;
  if (boks) extras.push(`${boks} ${plural(boks, "bok dokładany", "boki dokładane", "boków dokładanych")}`);
  if (blendy) extras.push(`${blendy} ${plural(blendy, "blenda", "blendy", "blend")}`);
  const pricing = project.pricing || {};
  if ((pricing.assembly && pricing.assembly.hours > 0)) extras.push("montaż");
  if (pricing.transport > 0) extras.push("transport");

  const discountRow = cost.discountPercent > 0
    ? `<tr><td>Rabat (${cost.discountPercent}%)</td><td class="num">−${pln(cost.discountAmount)}</td></tr>` : "";
  const valueRow = cost.discountPercent > 0
    ? `<tr><td>Wartość zabudowy</td><td class="num">${pln(cost.priceBeforeDiscount)}</td></tr>` : "";

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Oferta - ${escapeHtml(project.name || "projekt")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1e293b; margin: 0; padding: 24px; max-width: 820px; margin: 0 auto; }
  .bar { margin-bottom: 18px; text-align: right; }
  .bar button { padding: 10px 20px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 18px; }
  .head h1 { margin: 0; font-size: 26px; color: #0f172a; }
  .head .meta { text-align: right; font-size: 13px; color: #475569; line-height: 1.5; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .05em; color: #475569; margin: 22px 0 8px; }
  .snap { width: 100%; max-height: 380px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; color: #334155; border-bottom: 2px solid #cbd5e1; }
  .price { width: 60%; margin-left: auto; margin-top: 10px; }
  .price td.num { text-align: right; white-space: nowrap; }
  .price tr.total td { font-size: 18px; font-weight: 800; border-top: 2px solid #0f172a; border-bottom: none; padding-top: 10px; }
  .notes { font-size: 13px; color: #334155; white-space: pre-wrap; }
  .foot { margin-top: 26px; font-size: 12px; color: #64748b; }
  @media print { .bar { display: none; } body { padding: 0; } }
</style></head><body>
  <div class="bar"><button onclick="window.print()">Drukuj / Zapisz jako PDF</button></div>
  <div class="head">
    <div><h1>${escapeHtml(s.company || "Oferta")}</h1><div style="font-size:13px;color:#475569;white-space:pre-line;margin-top:4px">${escapeHtml(s.contact)}</div></div>
    <div class="meta">Oferta${s.number ? ` nr <b>${escapeHtml(s.number)}</b>` : ""}<br>Data: <b>${dateStr}</b>${(parseFloat(s.validDays) || 0) > 0 ? `<br>Ważna do: <b>${validUntil}</b>` : ""}</div>
  </div>
  <div style="font-size:15px"><b>${escapeHtml(project.name || "Zabudowa")}</b>${s.clientName ? `<br><span style="color:#475569;font-size:13px">Dla: ${escapeHtml(s.clientName)}</span>` : ""}</div>
  ${snapshot ? `<h2>Wizualizacja</h2><img class="snap" src="${snapshot}" alt="Wizualizacja zabudowy">` : ""}
  <h2>Zakres zabudowy</h2>
  ${modules.length === 0 ? '<p style="color:#64748b">Projekt nie zawiera jeszcze szafek.</p>' : `<table><thead><tr><th>Element</th><th>Rodzaj</th><th>Wymiary</th><th>Wyposażenie</th></tr></thead><tbody>${rows}</tbody></table>`}
  ${extras.length ? `<p style="font-size:13px;color:#475569">W cenie także: ${escapeHtml(extras.join(", "))}.</p>` : ""}
  <h2>Cena</h2>
  <table class="price"><tbody>
    ${valueRow}${discountRow}
    <tr><td>Cena netto</td><td class="num">${pln(cost.net)}</td></tr>
    <tr><td>VAT (${cost.vatPercent}%)</td><td class="num">${pln(cost.vatAmount)}</td></tr>
    <tr class="total"><td>Cena brutto</td><td class="num">${pln(cost.gross)}</td></tr>
  </tbody></table>
  ${s.notes ? `<h2>Uwagi</h2><div class="notes">${escapeHtml(s.notes)}</div>` : ""}
  <div class="foot">Wizualizacja ma charakter poglądowy. Ostateczne wymiary i wykończenie ustalane są przy realizacji.</div>
</body></html>`;
}
