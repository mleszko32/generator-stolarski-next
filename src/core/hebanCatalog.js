// src/core/hebanCatalog.js
//
// Katalog hurtowni Heban (panel kontrahenta Comarch B2B) - cały asortyment z cenami kontrahenta brutto, do podpowiedzi
// w Kosztorysie i porównania z SAS. Jak katalog SAS (core/sasCatalog.js) NIE jest w repozytorium (repo publiczne, ceny
// poufne): leży w Firestore (kolekcja hebanCatalog), wgrywany w Kosztorysie z pliku hebanCatalog.json, który buduje
// skrypt scripts/heban/buduj.js. Ładowany dopiero przy pierwszym użyciu.
// Wiersz: [kod towaru, nazwa, jednostka, cena brutto, grupa towarów, id artykułu w panelu].
// Ceny w panelu Hebanu są już cenami kontrahenta (bez osobnych rabatów jak w SAS). Płyty laminowane, MDF, HDF itd.
// Heban sprzedaje na m² (jednostka „m2”) - w zamówieniu wpisuje się powierzchnię, nie liczbę arkuszy.
// Czyste funkcje (poza loadHebanCatalog / resetHebanCatalog).

import { axiloCodes } from "./axilo.js";
import { BLUM_DRAWER_DEFAULTS, parseDrawerKit, merivoboxRecipe } from "./blumDrawer.js";

let cache = null;

// { date, rows } z chmury (raz pobrane - z pamięci); rows puste, gdy katalogu brak albo brak dostępu.
export async function loadHebanCatalog() {
  if (!cache) {
    cache = import("./storage.js").then((m) => m.loadHebanCatalogFromCloud()).then((c) => c || { date: null, rows: [] });
    cache.then((c) => { if (!c.rows.length) cache = null; }); // po zalogowaniu / wgraniu spróbuj ponownie
  }
  return cache;
}

export function resetHebanCatalog() {
  cache = null;
}

// Plik hebanCatalog.json ze skryptu -> { date, rows } albo null, gdy to nie katalog Hebanu.
export function parseHebanCatalog(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return null; }
  if (!d || d.format !== "gsn-heban-catalog" || !Array.isArray(d.rows) || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return null;
  const rows = d.rows.filter((r) => Array.isArray(r) && r.length === 6 && typeof r[0] === "string" && r[0] !== ""
    && typeof r[1] === "string" && typeof r[2] === "string" && Number.isFinite(r[3]) && typeof r[4] === "string");
  return rows.length ? { date: d.date, rows } : null;
}

const fmt = (v) => v.toFixed(2).replace(".", ",");

// Napis podpowiedzi: „18.U8685/SM-2800X2070 · nazwa · 28,98 zł/m2”.
export function hebanLabel(row) {
  return `${row[0]} · ${row[1]} · ${fmt(row[3])} zł/${row[2]}`;
}

// Wiersz katalogu z wpisanego / wybranego napisu podpowiedzi (kod przed „ · ”) albo null. Kody Hebanu mają w środku
// spacje (np. „470M5002S  Z LI   V20SW-M”), dlatego porównanie po kodzie ze ściśniętymi odstępami.
const squeeze = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
export function hebanFromText(rows, text) {
  const code = squeeze(String(text || "").split(" · ")[0]);
  if (!code) return null;
  return rows.find((r) => squeeze(r[0]) === code) || null;
}

export function hebanByCode(rows, code) {
  return code ? rows.find((r) => r[0] === code) || null : null;
}

// Wymiary arkusza / płyty z nazwy albo kodu („2800x2070”, „2800 X 2070”, „(280X207)” = 2800 × 2070) -> [dł, szer] w mm.
export function hebanSheetSize(row) {
  for (const s of [row[1], row[0]]) {
    const m = String(s).match(/(\d{3,4})\s*[xX]\s*(\d{3,4})/);
    if (!m) continue;
    let a = +m[1], b = +m[2];
    if (a < 1000 && b < 1000 && a >= 200 && b >= 100) { a *= 10; b *= 10; } // zapis w cm: „280X207”
    if (a >= 500 && b >= 300) return [a, b];
  }
  return null;
}

// Cena za m² płyty: Heban podaje płyty wprost w m²; pozycja na sztuki (pasy, formatki) dzieli się przez powierzchnię
// z nazwy. null, gdy nie da się policzyć.
export function hebanPricePerM2(row) {
  if (!row) return null;
  if (/^m2$/i.test(row[2])) return row[3];
  const s = hebanSheetSize(row);
  return s ? Math.round((row[3] / ((s[0] * s[1]) / 1e6)) * 100) / 100 : null;
}

// Ilość do zamówienia płyty w Hebanie: arkusze × powierzchnia arkusza w m², zaokrąglone do 0,001 m² (tak wystawia
// faktury: 2 × 5,796 = 11,592 m2). Połówka arkusza = 0,5. null, gdy nie znamy wymiaru arkusza.
export function hebanSheetsToM2(row, sheets) {
  const s = hebanSheetSize(row);
  if (!s) return null;
  return Math.round(sheets * (s[0] * s[1]) / 1000) / 1000;
}

// Kod katalogowy Blum i kolor z kodu towaru Hebanu: „470M5002S  Z LI   V20SW-M” -> { code: "470M5002S", color: "B",
// side: "L" }. Kolory Blum w kodach: SW = jedwabiście biały (B), IG = szary indium (S), OG = szary orion / antracyt (A).
// Strona: LI = lewy, RE = prawy, R+L = para. null, gdy kod nie wygląda na okucie Blum.
const BLUM_CODE = /^(\d{3}[A-Z]\d{4}[A-Z0-9]*|\d{3}\.\d{4}[A-Z]*|[A-Z]{1,3}\d?\.\d{3,4}[A-Z0-9.]*|Z[A-Z]\d[A-Z0-9.]+|T\d{2}[A-Z0-9.]+|\d{2}[A-Z]\d{4}[A-Z0-9.]*)$/;
const COLORS = { SW: "B", IG: "S", OG: "A" };
export function hebanBlumCode(row) {
  const raw = String(row[0]).replace(/\u00a0/g, " ").trim();
  const first = raw.split(/\s+/)[0].toUpperCase();
  if (!BLUM_CODE.test(first)) return null;
  const code = first.replace(/\.BTABD$/, "");
  const c = raw.match(/(SW|IG|OG)-M\s*$/);
  const side = /\bR\+L\b/.test(raw) ? "LP" : /\bLI\b/.test(raw) ? "L" : /\bRE\b/.test(raw) ? "P" : "";
  return { code, color: c ? COLORS[c[1]] : "", side };
}

// --- Dobór pozycji Hebanu do okuć z listy (engine/hardware.js) ---

// Grupy z płytami / blatami / frontami (podpowiedzi przy materiałach płytowych): płyty na m² i grupy z nazwą płyt.
const BOARD_GROUP = /PŁYT|PŁMDF|MDF|HDF|BLAT|LAMINAT|SKLEJ|FORN|AKRYL|FRONT/i;
export function hebanIsBoard(row) {
  return /^m2$/i.test(row[2]) || BOARD_GROUP.test(row[4]);
}

// Indeks kod Blum -> wiersze (z kolorem i stroną), liczony raz na tablicę wierszy katalogu.
const indexCache = new WeakMap();
function blumIndex(rows) {
  let idx = indexCache.get(rows);
  if (!idx) {
    idx = new Map();
    for (const r of rows) {
      const b = hebanBlumCode(r);
      if (!b) continue;
      // „70T3550.TLMB” - wariant kodu z przyrostkiem po kropce: zapasowo także pod „~70T3550”
      const base = /^\d{2,3}[A-Z]\d{4}\./.test(b.code) ? "~" + b.code.split(".")[0] : null;
      for (const k of base ? [b.code, base] : [b.code]) {
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push({ row: r, ...b });
      }
    }
    indexCache.set(rows, idx);
  }
  return idx;
}

// Pozycje promocyjne / zestawy z gratisami / inne wykończenie odkładane na koniec, potem najtańsza.
const ODD = /ZEST|PROM|WIERT|ONYX|BITY/i;
// Wiersz Hebanu dla kodu Blum: color "" = bez koloru (albo dowolny, gdy towar ma tylko warianty kolorów - wtedy null),
// side "L" / "P" / "LP" / "" (bez filtra), test = dodatkowy warunek na surowym kodzie.
function pickBlum(rows, code, { color = "", side = null, test = null } = {}) {
  const idx = blumIndex(rows);
  let c = (idx.get(code) || idx.get("~" + code) || []).filter((x) => (side == null || x.side === side) && (!test || test(String(x.row[0]))));
  if (color && c.some((x) => x.color === color)) c = c.filter((x) => x.color === color);
  else if (c.some((x) => x.color === "")) c = c.filter((x) => x.color === "");
  else if (color) return null;
  const odd = (x) => (ODD.test(x.row[0]) || ODD.test(x.row[1]) ? 1 : 0);
  const best = c.sort((a, b) => odd(a) - odd(b) || a.row[3] - b.row[3])[0];
  return best ? best.row : null;
}

// Para lewy + prawy: jedna pozycja „R+L”, inaczej lewy i prawy osobno, inaczej pozycja bez strony.
function pickPair(rows, code, color) {
  const lp = pickBlum(rows, code, { color, side: "LP" });
  if (lp) return [lp];
  const l = pickBlum(rows, code, { color, side: "L" }), p = pickBlum(rows, code, { color, side: "P" });
  if (l && p) return [l, p];
  const any = pickBlum(rows, code, { color, side: "" });
  return any ? [any] : null;
}

const one = (r) => (r ? [r] : null);

// Lista wierszy z ilością na sztukę okucia (list.per) albo null, gdy czegoś brak.
function withQty(parts) {
  if (!parts.every((p) => p.rows)) return null;
  const list = [], per = [];
  for (const p of parts) for (const r of p.rows) { list.push(r); per.push(p.qty); }
  list.per = per;
  return list;
}

// Pozycje Hebanu na JEDNĄ sztukę / komplet okucia z listy: wiersze z list.per (ilość każdego) albo null.
// opts = opcje szuflad Blum (core/blumDrawer.js: drawerOptions). Komplet MERIVOBOX liczony z części (Heban nie ma
// zestawów z ceną), zawias = 71B3550 + 173L6100, MOVENTO = prowadnice B (BLUMOTION) + sprzęgła T51.7601 L i R,
// kody Blum w nazwie (też części czoła szuflady wewn. MERIVOBOX w kolorze szuflady).
export function hebanSuggest(rows, hwName, opts = BLUM_DRAWER_DEFAULTS) {
  const name = String(hwName);
  const kit = parseDrawerKit(name);
  if (kit) {
    if (kit.system !== "MERIVOBOX") return null;
    return withQty(merivoboxRecipe(kit.height, kit.nl, opts).map((it) => ({
      qty: it.qty,
      rows: it.pair ? pickPair(rows, it.code, it.colored ? opts.color : "") : one(pickBlum(rows, it.code, { color: it.colored ? opts.color : "" })),
    })));
  }
  let m = name.match(/^Prowadnice Blum MOVENTO (76\dH) .*NL-(\d+)/);
  if (m) {
    return withQty([
      { qty: 1, rows: one(pickBlum(rows, `${m[1]}${Number(m[2]) * 10}B`)) },
      { qty: 1, rows: one(pickBlum(rows, "T51.7601", { test: (s) => /\sL\s/.test(s) })) },
      { qty: 1, rows: one(pickBlum(rows, "T51.7601", { test: (s) => /\sR\s/.test(s) })) },
    ]);
  }
  if (name === "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)") {
    return withQty([{ qty: 1, rows: one(pickBlum(rows, "71B3550")) }, { qty: 1, rows: one(pickBlum(rows, "173L6100")) }]);
  }
  // Nóżka = Häfele Axilo: stopka regulacji cokołu + główka stopki (cena = suma obu).
  m = name.match(/^Nóżka regulowana H-(\d+)/);
  if (m) {
    const ax = axiloCodes(m[1]);
    if (!ax) return null;
    const byCode = (code) => one(rows.filter((x) => String(x[0]).trim() === code || String(x[0]).startsWith(code + " ")).sort((p, q) => p[3] - q[3])[0]);
    return withQty([{ qty: 1, rows: byCode(ax.stalk) }, { qty: 1, rows: byCode(ax.base) }]);
  }
  // Części czoła szuflady wewn. MERIVOBOX (core/drawerAssembly.js): kod po „MERIVOBOX”, w kolorze szuflady.
  m = name.match(/MERIVOBOX (Z[A-Z]\d\.[0-9A-Z]+)/);
  if (m) {
    return withQty([{ qty: 1, rows: one(pickBlum(rows, m[1], { color: opts.color })) }]);
  }
  // Kody Blum w nazwie: „20K5101”, „70T3550 + prowadnik 173L6100”, „(Blum 79T8500)”, „956.1004”.
  const codes = name.match(/\b(\d{2,3}[A-Z]\d{4}[A-Z0-9]*|\d{3}\.\d{4}[A-Z]*)\b/g);
  if (codes) {
    return withQty(codes.map((c) => ({ qty: 1, rows: one(pickBlum(rows, c, { color: opts.color })) })));
  }
  return null;
}

// Powiązanie pozycji kosztorysu z Hebanem (pricing.heban.hardware): „kod×ilość|kod×ilość” - kody Hebanu mają w środku
// spacje i „+”, więc inny separator niż w SAS.
export function hebanLinkFromRows(list) {
  return list.map((r, i) => `${r[0]}×${(list.per && list.per[i]) || 1}`).join("|");
}

export function hebanRowsFromLink(rows, link) {
  if (!link) return null;
  const list = [], per = [];
  for (const part of String(link).split("|")) {
    const m = part.match(/^(.*)×([\d.]+)$/);
    const r = hebanByCode(rows, m ? m[1] : part);
    if (!r) return null;
    list.push(r);
    per.push(m ? Number(m[2]) : 1);
  }
  list.per = per;
  return list;
}

// Cena jednej sztuki okucia z pozycji Hebanu (suma z ilościami, do grosza).
export function hebanLinkPrice(list) {
  return Math.round(list.reduce((s, r, i) => s + r[3] * ((list.per && list.per[i]) || 1), 0) * 100) / 100;
}

// Opis w polu: jedna pozycja - jak hebanLabel, kilka - „kod ×2 + kod · suma zł”.
export function hebanLinkLabel(list) {
  if (list.length === 1 && !(list.per && list.per[0] > 1)) return hebanLabel(list[0]);
  const q = (i) => ((list.per && list.per[i] > 1) ? ` ×${list.per[i]}` : "");
  return `${list.map((r, i) => String(r[0]).trim().replace(/\s+/g, " ") + q(i)).join(" + ")} · ${fmt(hebanLinkPrice(list))} zł`;
}

// Pozycje Hebanu dla okucia: powiązanie z Kosztorysu ma pierwszeństwo, inaczej automatyczny dobór.
export function hardwareHebanRows(rows, links, hwName, opts) {
  return hebanRowsFromLink(rows, (links || {})[hwName]) || hebanSuggest(rows, hwName, opts);
}
