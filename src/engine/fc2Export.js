// src/engine/fc2Export.js
//
// Eksport listy formatek do pliku importu FC2 (program do rozkroju w hurtowni):
// bez nagłówka, separator ";", kolumny:
//   1 symbol materiału, 2 długość, 3 szerokość, 4 ilość, 5 opis (maks. 50 znaków),
//   6-9 okleina lewa / prawa / góra / dół (symbol okleiny albo puste),
//   10-11 pliki CNC (puste), 12 pogrubienie (0/1).
// Format SAS (eSAS / FastCut) ma te same kolumny 1-9, potem 10 struktura (0/1),
//   11-12 kody kreskowe (puste), 13 pogrubianie (0/1).
// Krawędzie z engine/edgeBanding.js ([dł.1, dł.2, szer.1, szer.2]): dłuższe = góra/dół
// (wzdłuż kolumny „długość”), krótsze = lewa/prawa.
// Symbole materiałów wpisuje użytkownik (project.fc2Export.symbols) - osobno dla kategorii
// formatek, a fronty osobno dla każdego materiału z cennika frontów.

import { EGGER_SAS_DECORS } from "../core/data/eggerSasDecors.js";
import { frontMaterialBoard, LACQUER_BOARD } from "../core/materialCatalog.js";

export const FC2_DEFAULTS = Object.freeze({ edgeSymbol: "PCV_2", bolding: false });

const MAX_TEXT = 50;
const PL = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z", Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z" };

// Tekst do pola FC2: bez polskich liter i znaków rozdzielających, maks. 50 znaków.
export function fc2Text(s) {
  return String(s ?? "")
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL[c])
    .replace(/[—–]/g, "-")
    .replace(/[;\t\r\n"]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

// Klucz symbolu materiału formatki: fronty po materiale z cennika, reszta po kategorii.
export function fc2SymbolKey(part, project) {
  if (part.category !== "Front") return part.category || "Inne";
  const mats = (project && project.pricing && project.pricing.frontMaterials) || [];
  const id = mats.some((m) => m.id === part.materialId) ? part.materialId : mats[0] && mats[0].id;
  return `Front:${id || "default"}`;
}

// Pozycje do wpisania symboli dla podanych formatek: [{ key, label, auto }] w kolejności kategorii
// (auto = symbol z projektu użyty, gdy pole puste).
export function fc2SymbolSlots(parts, project) {
  const mats = (project && project.pricing && project.pricing.frontMaterials) || [];
  const seen = new Map();
  parts.forEach((p) => {
    const key = fc2SymbolKey(p, project);
    if (seen.has(key)) return;
    const mat = key.startsWith("Front:") && mats.find((m) => `Front:${m.id}` === key);
    seen.set(key, { label: mat ? `Front - ${mat.name}` : key.replace(/^Front:.*/, "Front"), auto: autoSymbol(p, project) });
  });
  const order = ["Korpus", "Front", "Szuflada", "Plecy"];
  const rank = (k) => { const i = order.indexOf(k.split(":")[0]); return i < 0 ? order.length : i; };
  return [...seen.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([key, s]) => ({ key, ...s }));
}

// Płyta formatki z projektu: front - płyta z cennika frontów (lakier -> MDF) albo nazwa materiału,
// „Korpus: <dekor>” / „Plecy: <dekor>” - dekor, zwykła kategoria - dekor kategorii projektu.
export function partBoardName(part, project) {
  const category = String((part && part.category) || "");
  if (category === "Front") {
    const mats = (project && project.pricing && project.pricing.frontMaterials) || [];
    const m = mats.find((x) => x.id === part.materialId) || mats[0];
    return m ? (frontMaterialBoard(m) || String(m.name || "").trim()) : "";
  }
  const own = category.match(/^[^:]+:\s*(.+)$/);
  const decors = (project && project.materials && project.materials.decors) || {};
  const name = own ? own[1].trim() : String(decors[category] || "").trim();
  // lakier (np. bok dokładany „Lakier NCS …”) tnie się z MDF - jak fronty
  return /lakier/i.test(name) ? LACQUER_BOARD : name;
}

// Płyty HDF z bazy (core/materialCatalog.js) -> symbol w eSAS (z katalogu materiałów eSAS, 11.2026).
const HDF_ESAS = {
  "hdf biały 3 mm": "HDF110PE-BIALA_JEDNOSTRONN_GR_3/HDF000-001",
  "hdf 110 d-pe biały korpusowy 3mm": "HDF110PE-BIALA_JEDNOSTRONN_GR_3/HDF000-001",
  "hdf kronospan 112 pe jasny szary 3mm": "HDF112PE_SZARY_GR3/HDF000-002",
  "hdf kronospan 164 pe antracyt 3mm": "PLYTA_HDF_KRONOSPAN_164_PE_ANTRACYT_2/HDF164-000",
  "hdf kronospan 190 pe czarny 3mm": "HDF190PE_CZARNA_GR3/HDF000-003",
  "hdf woodeco hd3000 dąb sonoma 3mm": "PLYTA_HDF_WOODECO_HD3000_DAB_SONOMA_2/346586-930",
  "hdf woodeco hd3016 dąb artisan ii 3mm": "PLYTA_HDF_WOODECO_HD3016_DAB_ARTISAN/348634-340",
  // ten sam indeks ma w katalogu dwa symbole - „PLYTA_HDF_WOODECO_HU1506…” eSAS odrzuca
  "hdf woodeco hu1506 kaszmirowy beż 3mm": "HDF_HU1506_2850*2070_GR_3MM-KASZMIROW/348647-270",
};

// Symbol płyty w eSAS („symbol/indeks”) dla nazwy z bazy dekorów (z „Egger ” albo bez); brak = "".
const ESAS = new Map(EGGER_SAS_DECORS.filter((d) => d.esas).map((d) => [d.name.toLowerCase(), d.esas]));
export function esasSymbol(boardName) {
  const key = String(boardName || "").trim().replace(/^Egger\s+/i, "").toLowerCase();
  return ESAS.get(key) || HDF_ESAS[key] || "";
}

// Symbol płyty bez ręcznego wpisu: symbol eSAS z bazy, inaczej nazwa płyty z projektu.
export function autoSymbol(part, project) {
  const board = partBoardName(part, project);
  return esasSymbol(board) || board;
}

export function getFc2Settings(project) {
  const s = (project && project.fc2Export) || {};
  return {
    symbols: { ...(s.symbols || {}) },
    edges: { ...(s.edges || {}) },
    edgeSymbol: s.edgeSymbol ?? FC2_DEFAULTS.edgeSymbol,
    bolding: !!s.bolding,
    grain: !!s.grain,
  };
}

// rows: [{ category, name, length, width, qty, materialId?, edges: [dł.1, dł.2, szer.1, szer.2] }]
// Symbol bez wpisu = indeks SAS płyty z projektu, potem nazwa płyty, na końcu nazwa pozycji
// (np. „Korpus”), żeby żadna formatka nie zginęła.
// format "sas" = import formatek w eSAS (sassc.erozkroje.pl, „Import danych” → wklej ze schowka).
export function buildFc2Csv(rows, project, settings = getFc2Settings(project), format = "fc2") {
  const slots = new Map(fc2SymbolSlots(rows, project).map((s) => [s.key, s.label]));  // zapas, gdy brak płyty
  // „Korpus” bez dekoru (np. listwy montażowe blend) - płyta korpusu najczęstsza w tym zestawieniu
  const korpusCount = new Map();
  rows.forEach((r) => {
    if (!String(r.category || "").startsWith("Korpus: ")) return;
    const s = autoSymbol(r, project);
    if (s) korpusCount.set(s, (korpusCount.get(s) || 0) + (parseInt(r.qty, 10) || 0));
  });
  const mainKorpus = [...korpusCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const lines = rows
    .filter((r) => (parseFloat(r.length) || 0) > 0 && (parseFloat(r.width) || 0) > 0 && (parseInt(r.qty, 10) || 0) > 0)
    .map((r) => {
      const key = fc2SymbolKey(r, project);
      const fallback = r.category === "Korpus" && mainKorpus ? mainKorpus[0] : "";
      const symbol = fc2Text(settings.symbols[key] || autoSymbol(r, project) || fallback || slots.get(key) || key);
      // okleina: osobna dla płyty (settings.edges[klucz]), inaczej wspólna
      const edge = fc2Text((settings.edges && settings.edges[key]) || settings.edgeSymbol);
      const [l1, l2, w1, w2] = r.edges || [false, false, false, false];
      // SAS: bez oklejania (oklejamy u siebie) - kolumny okleiny puste
      const e = (on) => (on && format !== "sas" ? edge : "");
      const head = [
        symbol, Math.round(parseFloat(r.length) * 10) / 10, Math.round(parseFloat(r.width) * 10) / 10, parseInt(r.qty, 10),
        fc2Text(r.name), e(w1), e(w2), e(l1), e(l2),
      ];
      const bold = settings.bolding ? 1 : 0;
      // SAS (eSAS, import FastCut): 10 struktura (0/1), 11-12 kody kreskowe, 13 pogrubianie.
      const tail = format === "sas" ? [settings.grain ? 1 : 0, "", "", bold] : ["", "", bold];
      return [...head, ...tail].join(";");
    });
  return lines.join("\r\n") + "\r\n";
}
