// src/core/priceSearch.js
//
// Strona „Cennik” (ui/priceListPage.js): wyszukiwarka pozycji w katalogach SAS i Heban (z Firestore, core/sasCatalog.js
// i core/hebanCatalog.js) oraz wycena kompletu szuflady MERIVOBOX z obu hurtowni z CSV do koszyków.
// Ceny w katalogach są brutto. Czyste funkcje.
//
// Wiersze katalogów: SAS [indeks, nazwa, jedn., cena, grupa, id produktu, stan Warszawa, stan Stęszew],
// Heban [kod, nazwa, jedn., cena, grupa, id artykułu].

import { sasPricePerM2, sheetAreaM2, sasSuggest } from "./sasCatalog.js";
import { hebanPricePerM2, hebanSheetSize, hebanIsBoard, hebanSuggest } from "./hebanCatalog.js";
import { drawerOptions } from "./blumDrawer.js";

export const PRICE_TYPES = { P: "Płyta", O: "Obrzeże", B: "Blat", A: "Okucia i akcesoria" };

// Tekst do porównań: małe litery, bez polskich znaków.
export function normText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}

const isM2 = (unit) => /^m2$/i.test(unit);

// Typ pozycji: P płyta, O obrzeże, B blat, A okucia i akcesoria.
export function priceType(src, row) {
  const text = `${row[4]} ${row[1]}`;
  if (/obrze[żz]/i.test(text)) return "O";
  if (/blat/i.test(row[4])) return "B";
  if (src === "HEBAN") return hebanIsBoard(row) ? "P" : "A";
  return /p[łl]yt|laminat|sklejk|corian|mdf|hdf/i.test(row[4]) ? "P" : "A";
}

// Wiersz katalogu -> jednolita pozycja do wyświetlenia (cena za m² i za arkusz dla płyt i blatów).
export function toItem(src, row) {
  const type = priceType(src, row);
  const board = type === "P" || type === "B";
  let area = null;
  if (board) {
    if (src === "SAS") area = sheetAreaM2(row[1]);
    else { const s = hebanSheetSize(row); area = s ? (s[0] * s[1]) / 1e6 : null; }
  }
  let perM2 = null, perSheet = null;
  if (board) {
    perM2 = src === "SAS" ? sasPricePerM2(row) : hebanPricePerM2(row);
    if (area) perSheet = isM2(row[2]) ? Math.round(row[3] * area * 100) / 100 : row[3];
  }
  return {
    src, type, code: row[0], name: row[1], unit: row[2], price: row[3], group: row[4],
    area, perM2, perSheet, pid: row[5] || null,
    stock: src === "SAS" && row.length >= 8 && !(row[6] === "" && row[7] === "") ? { waw: row[6] || 0, ste: row[7] || 0 } : null,
    hay: normText(`${row[0]} ${row[1]} ${row[4]} ${src}`),
  };
}

// Pozycje obu katalogów (jednorazowo, potem wyszukiwanie po tablicy).
export function buildItems(sasRows, hebanRows) {
  const out = [];
  for (const r of sasRows || []) out.push(toItem("SAS", r));
  for (const r of hebanRows || []) out.push(toItem("HEBAN", r));
  return out;
}

const keyPrice = (it) => (it.perM2 != null ? it.perM2 : it.price);

// Wyszukiwanie: q = słowa w dowolnej kolejności (bez polskich znaków), src = "" | "SAS" | "HEBAN",
// typ = "" | P | O | B | A, sort = "rel" | "asc" | "desc". Zwraca pozycje (bez limitu).
export function searchItems(items, { q = "", src = "", typ = "", sort = "rel" } = {}) {
  const terms = normText(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of items) {
    if (src && it.src !== src) continue;
    if (typ && it.type !== typ) continue;
    let score = 0, ok = true;
    for (const t of terms) {
      const i = it.hay.indexOf(t);
      if (i < 0) { ok = false; break; }
      score += 1 + (i === 0 ? 3 : 0) + (normText(it.code).includes(t) ? 4 : 0);
    }
    if (ok) out.push({ it, score });
  }
  if (sort === "asc") out.sort((a, b) => keyPrice(a.it) - keyPrice(b.it));
  else if (sort === "desc") out.sort((a, b) => keyPrice(b.it) - keyPrice(a.it));
  else if (terms.length) out.sort((a, b) => b.score - a.score || keyPrice(a.it) - keyPrice(b.it));
  return out.map((o) => o.it);
}

// --- Szuflady MERIVOBOX ---

export const DRAWER_LENGTHS = [270, 300, 350, 400, 450, 500, 550, 600];
export const DRAWER_DEFAULTS = Object.freeze({ H: "E", nl: 500, color: "B", kg: 40, eVariant: "boxcap", fix: "W", n: 1 });

// „merivobox 500 E boxcap biały x6” -> ustawienia (pola, których tekst nie wskazuje, zostają z `base`).
export function parseQuickDrawer(text, base = DRAWER_DEFAULTS) {
  const t = normText(text), c = { ...base, n: 1 };
  const L = t.match(/\b(270|300|350|400|450|500|550|600)\b/); if (L) c.nl = +L[1];
  const H = t.match(/\b([nmke])\b/); if (H) c.H = H[1].toUpperCase();
  if (/boxcap|box cap/.test(t)) c.eVariant = "boxcap";
  if (/reling/.test(t)) c.eVariant = "reling";
  if (/bial|white/.test(t)) c.color = "B";
  if (/szar|indium|grey/.test(t)) c.color = "S";
  if (/antra/.test(t)) c.color = "A";
  if (/\b70\s*kg|\b70\b/.test(t)) c.kg = 70;
  if (/\b40\s*kg|\b40\b/.test(t)) c.kg = 40;
  if (/inserta/.test(t)) c.fix = "I";
  if (/wkret/.test(t)) c.fix = "W";
  const n = t.match(/(?:x|×)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:szt|szuflad)/);
  if (n) c.n = Math.max(1, +(n[1] || n[2]));
  return c;
}

// Lista wierszy katalogu z `.per` (ilość na szufladę) -> pozycje z ilościami i sumą dla n szuflad.
function quoteFromList(list, n) {
  if (!list) return null;
  const lines = list.map((r, i) => {
    const perOne = (list.per && list.per[i]) || 1;
    return { code: r[0], name: r[1], unit: r[2], unitPrice: r[3], perOne, qty: perOne * n, total: Math.round(r[3] * perOne * n * 100) / 100, pid: r[5] || null };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return { lines, total, perDrawer: Math.round((total / n) * 100) / 100, kit: lines.length === 1 };
}

// Wycena kompletu MERIVOBOX z SAS i Heban: { sas, heban } (każde: { lines, total, perDrawer, kit } albo null, gdy
// katalog nie ma wszystkich części). SAS: gotowy zestaw „Szuflada Blum …” albo części; Heban zawsze z części.
export function drawerQuote(sasRows, hebanRows, cfg) {
  const c = { ...DRAWER_DEFAULTS, ...cfg };
  const n = Math.max(1, Math.min(99, Math.round(Number(c.n)) || 1));
  const opts = drawerOptions({ blumDrawer: { color: c.color, kg: c.kg, eVariant: c.eVariant, fix: c.fix } });
  const name = `Komplet szuflady (MERIVOBOX - H:${c.H} L-${c.nl})`;
  return {
    n, opts,
    sas: quoteFromList(sasSuggest(sasRows || [], name, opts), n),
    heban: quoteFromList(hebanSuggest(hebanRows || [], name, opts), n),
  };
}

// CSV do importu koszyka. SAS: „indeks;ilość” bez nagłówka. Heban: „Code;Quantity;Unit” z nagłówkiem, kody dokładnie
// jak w panelu (z wieloma spacjami w środku!). Ilości zaokrąglone w górę do całych sztuk.
const wholeQty = (q) => Math.max(1, Math.ceil(q - 1e-9));
export function csvSas(quote) {
  return quote.lines.map((l) => `${l.code};${wholeQty(l.qty)}`).join("\r\n") + "\r\n";
}
export function csvHeban(quote) {
  return "Code;Quantity;Unit\r\n" + quote.lines.map((l) => `${l.code};${wholeQty(l.qty)};${l.unit}`).join("\r\n") + "\r\n";
}

// Przeliczenie arkuszy na m² płyty Hebanu (Heban liczy płyty w m², nie w arkuszach): 2 × 5,796 = 11,592.
export function sheetsList(item, counts = [0.5, 1, 2, 3, 4, 5]) {
  if (!item.area || item.unit.toLowerCase() !== "m2") return [];
  return counts.map((k) => ({ sheets: k, m2: Math.round(item.area * k * 1000) / 1000, price: Math.round(item.price * item.area * k * 100) / 100 }));
}
