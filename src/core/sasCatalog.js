// src/core/sasCatalog.js
//
// Katalog SAS (cały asortyment z panelu kontrahenta, ceny po rabacie brutto) do podpowiedzi w Kosztorysie.
// Dane NIE są w repozytorium (repo jest publiczne, a ceny po rabacie są poufne): leżą w Firestore
// (kolekcja sasCatalog, reguły jak dla projektów), wgrywane z pliku sasCatalog.json, który buduje skrypt
// scripts/sas/buduj.js. Ładowane dopiero przy pierwszym użyciu. Wiersz: [indeks, nazwa, jednostka, cena, grupa,
// nr produktu w sklepie (do koszyka), stan Warszawa, stan Stęszew] - trzy ostatnie od cennika z 08.11.2026.
// Powiązania pozycji kosztorysu z SAS: project.pricing.sas = { hardware: { nazwa okucia: "indeks+indeks" },
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
  const rows = d.rows.filter((r) => Array.isArray(r) && (r.length === 5 || r.length === 8) && typeof r[0] === "string" && typeof r[1] === "string"
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

// --- Dopasowanie pozycji listy okuć (engine/hardware.js) do indeksów SAS ---

// Wiersz katalogu po pełnym napisie (np. kod Blum) z preferencją wykończenia: niklowany / jedwabiście biały,
// bez czarnych / antracytowych / złotych; przy remisie najtańszy.
function pickRow(rows, test) {
  const score = (r) => (/czarn|antracyt|onyx|złot|indium|grafit|stal szlach/i.test(r[1]) ? 2 : 0)
    + (/niklowan|jedwabi[sś]cie bia|bia[łl]y/i.test(r[1]) ? 0 : 1);
  return rows.filter(test).sort((a, b) => score(a) - score(b) || a[3] - b[3])[0] || null;
}

const DRAWER_SET_NAMES = { ANTARO: "TANDEMBOX ANTARO", MERIVOBOX: "MERIVOBOX", LEGRABOX: "LEGRABOX" };
const HINGE_STD = "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)";

// Pozycje SAS na JEDNĄ sztukę / komplet okucia z listy: [wiersz, ...] (każdy × 1) albo null, gdy brak reguły
// lub czegoś w katalogu. Nazwy okuć: engine/hardware.js, drawerHardwareKey, moventoRunnerName.
export function sasSuggest(rows, hwName) {
  const name = String(hwName);
  const all = (list) => (list.every(Boolean) ? list : null);
  const word = (s) => new RegExp(`(^|[\\s(])${s}([\\s,)]|$)`);

  // Komplet szuflady metalowej -> gotowy zestaw SAS „Szuflada Blum <system> <kolor> <NL> <wys.> …”
  let m = name.match(/^Komplet szuflady \(([A-Z_0-9]+) - H:([A-Z]) L-(\d+)\)/);
  if (m) {
    const sys = DRAWER_SET_NAMES[m[1]];
    if (!sys) return null;
    // domyślnie: zwykła (nie wewnętrzna), bez TIP-ON, na wkręty, 40 kg; wysokość E w MERIVOBOX z relingiem
    const penalty = (r) => [/Wewn[eę]trzn/i, /TIP-ON/i, /Inserta/i, /70\s?kg/i, /Boxcap/i, /Boxcover/i, /szk[łl]/i]
      .reduce((s, re) => s + (re.test(r[1]) ? 1 : 0), 0);
    const cand = rows.filter((r) => /^Szuflada Blum /i.test(r[1]) && r[1].toUpperCase().includes(sys)
      && (sys !== "TANDEMBOX" || !/ANTARO/i.test(r[1])) && word(m[3]).test(r[1]) && word(m[2]).test(r[1]));
    const best = cand.sort((a, b) => penalty(a) - penalty(b) || ((/bia[łl]/i.test(a[1]) ? 0 : 1) - (/bia[łl]/i.test(b[1]) ? 0 : 1)) || a[3] - b[3])[0];
    return best ? [best] : null;
  }
  // Prowadnice MOVENTO (para) + sprzęgła lewe i prawe
  m = name.match(/^Prowadnice Blum MOVENTO (76\dH) .*NL-(\d+)/);
  if (m) {
    const code = `${m[1]}${Number(m[2]) * 10}`;
    return all([
      pickRow(rows, (r) => r[1].includes(code)),
      pickRow(rows, (r) => r[1].includes("T51.7601") && /\blewe\b/i.test(r[1])),
      pickRow(rows, (r) => r[1].includes("T51.7601") && /\bprawe\b/i.test(r[1])),
    ]);
  }
  if (name === HINGE_STD) {
    return all([pickRow(rows, (r) => r[1].includes("71B3550")), pickRow(rows, (r) => r[1].includes("173L6100"))]);
  }
  m = name.match(/^Nóżka regulowana H-(\d+)/);
  if (m) {
    const r = pickRow(rows, (x) => /^N[óo]żka do mebli/i.test(x[1]) && x[1].includes(`H-${m[1]} `));
    return r ? [r] : null;
  }
  // Kod katalogowy Blum w nazwie, np. „(Blum 79T8500)”, „(79B9950)”
  m = name.match(/\bBlum\s+([0-9]{2}[A-Z][0-9]{4}[A-Z0-9.]*|[A-Z]{1,3}[0-9]\.[0-9A-Z.]+)/i) || name.match(/\(([0-9]{2}[A-Z][0-9]{4})\)/);
  if (m) {
    const r = pickRow(rows, (x) => x[1].includes(m[1]));
    return r ? [r] : null;
  }
  return null;
}

// Powiązanie zapisane w pricing.sas.hardware: indeksy połączone „+” (każdy × 1 na sztukę okucia).
export function linkFromRows(list) {
  return list.map((r) => r[0]).join("+");
}

export function rowsFromLink(rows, link) {
  if (!link) return null;
  const list = String(link).split("+").map((i) => sasByIndex(rows, i));
  return list.every(Boolean) ? list : null;
}

// Cena jednej sztuki okucia z powiązanych pozycji (suma, zaokrąglona do grosza).
export function linkPrice(list) {
  return Math.round(list.reduce((s, r) => s + r[3], 0) * 100) / 100;
}

// Opis pozycji w polu: pojedyncza pozycja - jak sasLabel, kilka - „idx + idx · suma zł”.
export function linkLabel(list) {
  if (list.length === 1) return sasLabel(list[0]);
  return `${list.map((r) => r[0]).join(" + ")} · ${list.map((r) => r[1].slice(0, 40)).join(" + ")} · ${fmt(linkPrice(list))} zł`;
}

// Stan magazynowy (Warszawa / Stęszew) z wiersza katalogu z 8 polami; "" gdy brak danych.
export function stockLabel(row) {
  if (!row || row.length < 8 || (row[6] === "" && row[7] === "")) return "";
  return `stan: Warszawa ${row[6] || 0}, Stęszew ${row[7] || 0}`;
}
