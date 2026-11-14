// src/core/boardMatch.js
//
// Automatyczny dobór płyty z cennika hurtowni do dekoru z projektu („Egger U702 ST9 18mm”, „HDF Woodeco HD3037 Dąb
// olejowany II 3mm”, „Swiss Krono D3025 OW Dąb Sonoma”). Hurtownia wg producenta: Egger / Woodeco / Kronospan - SAS,
// Swiss Krono - Heban (tam użytkownik je kupuje); gdy jej tam nie ma - druga hurtownia; producent nieznany - tańsza
// z tych, które ją mają. Nie ma w żadnej - null (cena zostaje do wpisania ręcznie).
// Dopasowanie: kod dekoru (U702, W1000, HD3037, D3025, K101, przy HDF też sam numer „110”), grubość, rodzaj (HDF / MDF /
// płyta wiórowa) i struktura (ST9, SM, PE…) jako preferencja; bez II gatunku, płyt trudnopalnych / wilgocioodpornych /
// PerfectSense, laminatów, blatów, obrzeży, próbek - chyba że dekor je wymienia. Czyste funkcje.
import { sasPricePerM2 } from "./sasCatalog.js";
import { hebanPricePerM2 } from "./hebanCatalog.js";
import { baseCategory } from "./materialCatalog.js";

const STRUCTURES = /^(ST\d{1,2}|TM\d{1,2}|SM|PE|OW|VL|BS|PM|SE|SO|MA|PU|VT|D-PE|MP|SN)$/;
const SPECIAL = ["II GAT", "GAT. II", "GAT II", "GATUNEK", "BACKSPLASH", "LAMINAT", "BLAT", "PANEL", "OBRZE", "ZAŚLEP",
  "KOMÓRK", "KOMURK", "WZORNIK", "PRÓBK", "STOP FIRE", "STOP FORE", "OGNIO", "FLAMMEX", "TRUDNOPAL", "WILGOCI",
  "PERFECTSENSE", "PERFECT SENSE", "DF/", "AKRYL", "POŁYSK"];

const upper = (s) => String(s || "").toUpperCase().replace(/ /g, " ");
const word = (s) => new RegExp(`(^|[^A-Z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`);

// Dekor -> { code, structure, thickness, kind: "hdf" | "mdf" | "board", producer, text } albo null bez kodu.
export function parseBoardDecor(label) {
  const text = upper(label);
  const kind = /\bHDF\b/.test(text) ? "hdf" : /\bMDF\b/.test(text) ? "mdf" : "board";
  const tokens = text.split(/[\s/(),]+/).filter(Boolean);
  let i = tokens.findIndex((t) => /^[A-Z]{1,2}\d{3,5}$/.test(t));
  if (i < 0 && kind === "hdf") i = tokens.findIndex((t) => /^\d{3}$/.test(t));
  if (i < 0) return null;
  const structure = tokens.slice(i + 1).find((t) => STRUCTURES.test(t)) || "";
  const th = text.match(/(\d+(?:[.,]\d+)?)\s*MM\b/);
  const producer = /SWISS\s*KRONO/.test(text) ? "swisskrono" : /EGGER/.test(text) ? "egger" : /WOODECO/.test(text) ? "woodeco"
    : /KRONOSPAN/.test(text) ? "kronospan" : "";
  return { code: tokens[i], structure, thickness: th ? Number(th[1].replace(",", ".")) : null, kind, producer, text };
}

// Grubość płyty z wiersza cennika: „gr.18”, „18mm”, kod Hebanu „18.U8685/SM…”.
export function rowThickness(row) {
  const t = upper(`${row[1]} ${row[0]}`);
  const m = t.match(/GR\.?\s*(\d+(?:[.,]\d+)?)/) || t.match(/(?:^|[^0-9X])(\d+(?:[.,]\d+)?)\s*MM\b/) || upper(row[0]).match(/^(\d{1,2})\./);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Najlepszy wiersz jednej hurtowni dla dekoru: { row, pricePerM2 } albo null. priceOf(row) -> cena za m² albo null.
export function matchBoardRow(rows, decor, priceOf) {
  if (!decor || !rows || !rows.length) return null;
  const codeRe = word(decor.code), structRe = decor.structure ? word(decor.structure) : null;
  let best = null;
  for (const row of rows) {
    const t = upper(`${row[0]} ${row[1]}`);
    if (!codeRe.test(t)) continue;
    if (!/^m2$/i.test(row[2]) && !/P[ŁL]YT|HDF|MDF/.test(t)) continue;
    const hdf = /\bHDF\b/.test(t), mdf = /\bMDF\b/.test(t);
    if ((decor.kind === "hdf") !== hdf) continue;
    if (decor.kind === "mdf" && !mdf) continue;
    if (SPECIAL.some((w) => t.includes(w) && !decor.text.includes(w))) continue;
    const th = rowThickness(row);
    if (decor.thickness != null && th != null && th !== decor.thickness) continue;
    const price = priceOf(row);
    if (price == null || !(price > 0)) continue;
    const penalty = (structRe && !structRe.test(t) ? 2 : 0) + (decor.thickness != null && th == null ? 1 : 0)
      + (decor.thickness == null && th != null && th !== 18 && decor.kind !== "hdf" ? 1 : 0) + (/^Z\./i.test(row[1]) ? 1 : 0);
    if (!best || penalty < best.penalty || (penalty === best.penalty && price < best.pricePerM2)) best = { row, pricePerM2: price, penalty };
  }
  return best && { row: best.row, pricePerM2: best.pricePerM2 };
}

// Dobór z obu hurtowni: { src: "sas" | "heban", row, pricePerM2 } albo null. sheetArea = arkusz z planu rozkroju (m²) dla płyt
// SAS bez wymiaru w nazwie.
export function pickBoard(sasRows, hebanRows, label, { sheetArea = 5.796 } = {}) {
  const decor = parseBoardDecor(label);
  if (!decor) return null;
  const sas = matchBoardRow(sasRows, decor, (r) => sasPricePerM2(r, sheetArea));
  const heb = matchBoardRow(hebanRows, decor, hebanPricePerM2);
  const s = sas && { src: "sas", ...sas }, h = heb && { src: "heban", ...heb };
  if (decor.producer === "swisskrono") return h || s;
  if (decor.producer) return s || h;
  if (s && h) return h.pricePerM2 < s.pricePerM2 ? h : s;
  return s || h;
}

// Dekor płyty wiersza kosztorysu: „Korpus: <dekor>” / „Plecy: <dekor>” -> dekor; Korpus / Plecy / Szuflada -> dekor
// kategorii z projektu (project.materials.decors); inne - "".
export function categoryDecor(category, project) {
  const c = String(category || "");
  const base = baseCategory(c);
  if (base !== c) return c.slice(base.length + 2).trim();
  const decors = (project && project.materials && project.materials.decors) || {};
  return String(decors[c] || "").trim();
}

// Oferty obu hurtowni dla dekoru (do porównania w Kosztorysie): { sas: { row, pricePerM2 } | null, heban: … | null }.
export function boardOffers(sasRows, hebanRows, label, { sheetArea = 5.796 } = {}) {
  const decor = parseBoardDecor(label);
  if (!decor) return { sas: null, heban: null };
  return {
    sas: matchBoardRow(sasRows, decor, (r) => sasPricePerM2(r, sheetArea)),
    heban: matchBoardRow(hebanRows, decor, hebanPricePerM2),
  };
}
