// src/core/sasCatalog.js
//
// Katalog SAS (cały asortyment z panelu kontrahenta, ceny po rabacie brutto) do podpowiedzi w Kosztorysie.
// Dane NIE są w repozytorium (repo jest publiczne, a ceny po rabacie są poufne): leżą w Firestore
// (kolekcja sasCatalog, reguły jak dla projektów), wgrywane z pliku sasCatalog.json, który buduje skrypt
// scripts/sas/buduj.js. Ładowane dopiero przy pierwszym użyciu. Wiersz: [indeks, nazwa, jednostka, cena, grupa].
// Powiązania pozycji kosztorysu z SAS: project.pricing.sas = { hardware: { nazwa okucia: indeks },
// materials: { kategoria płyty: indeks } } - cena przepisana do pola, powiązanie tylko do podpowiedzi.
// Czyste funkcje (poza loadSasCatalog / resetSasCatalog).

let cache = null;

// { date, rows } z chmury (raz pobrane - z pamięci); rows puste, gdy katalogu brak albo brak dostępu.
export async function loadSasCatalog() {
  if (!cache) {
    cache = import("./storage.js").then((m) => m.loadSasCatalogFromCloud()).then((c) => c || { date: null, rows: [] });
    cache.then((c) => { if (!c.rows.length) cache = null; }); // po zalogowaniu / wgraniu spróbuj ponownie
  }
  return cache;
}

export function resetSasCatalog() {
  cache = null;
}

// Plik sasCatalog.json ze skryptu -> { date, rows } albo null, gdy to nie katalog SAS.
export function parseSasCatalog(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return null; }
  if (!d || d.format !== "gsn-sas-catalog" || !Array.isArray(d.rows) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return null;
  const rows = d.rows.filter((r) => Array.isArray(r) && r.length === 5 && typeof r[0] === "string" && typeof r[1] === "string"
    && typeof r[2] === "string" && Number.isFinite(r[3]) && typeof r[4] === "string");
  return rows.length ? { date: d.date, rows } : null;
}

const fmt = (v) => v.toFixed(2).replace(".", ",");

// Grupy towarów, w których są płyty / blaty (podpowiedzi przy materiałach płytowych).
export const SAS_BOARD_GROUPS = ["Płyty", "Blaty robocze i panele wnękowe", "Laminaty", "Sklejki", "Corian® Solid Surface"];

// Napis podpowiedzi: „B09048-274 · nazwa · 1,60 zł/szt”.
export function sasLabel(row) {
  return `${row[0]} · ${row[1]} · ${fmt(row[3])} zł/${row[2]}`;
}

// Wiersz katalogu z wpisanego / wybranego tekstu (indeks na początku napisu) albo null.
export function sasFromText(rows, text) {
  const m = String(text || "").trim().match(/^([A-Z0-9]+-[A-Z0-9]+)/i);
  if (!m) return null;
  const idx = m[1].toUpperCase();
  return rows.find((r) => r[0].toUpperCase() === idx) || null;
}

export function sasByIndex(rows, idx) {
  return idx ? rows.find((r) => r[0] === idx) || null : null;
}

// Powierzchnia arkusza z nazwy płyty („… 2800x2070 …”) w m² albo null.
export function sheetAreaM2(name) {
  const m = String(name).match(/(\d{3,4})\s*x\s*(\d{3,4})/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return a >= 500 && b >= 500 ? (a * b) / 1e6 : null;
}

// Cena za m² płyty z katalogu: cena za m² wprost albo cena arkusza / jego powierzchnia. Gdy nazwa nie podaje
// wymiaru arkusza (większość płyt w sklepie SAS), dzieli przez fallbackArea (arkusz z planu rozkroju).
// null gdy nie da się policzyć.
export function sasPricePerM2(row, fallbackArea = null) {
  if (!row) return null;
  if (/^m2$/i.test(row[2])) return row[3];
  const area = sheetAreaM2(row[1]) || fallbackArea;
  return area ? Math.round((row[3] / area) * 100) / 100 : null;
}
