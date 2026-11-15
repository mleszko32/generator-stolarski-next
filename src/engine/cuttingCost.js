// src/engine/cuttingCost.js
//
// Koszt cięcia płyt w hurtowni (etap 2b cennika). Czyste funkcje, bez DOM.
// - SAS liczy cięcie za metr bieżący: mb z rozkroju (engine/nesting.js) × 1,5 × stawka (współczynnik z zamówienia
//   SAS 55246: 397 mb zafakturowane przy 264,6 mb sumy półobwodów formatek w rozkroju = 1,50; jedna próba); płyty PREMIUM
//   (PerfectSense, „PM/” w nazwie dekoru) mają wyższą stawkę i okleinowanie PREMIUM za metr. Express ×1,5.
// - Heban liczy za formatkę; express ×1,5 (7,38 zł zamiast 4,92 zł).
// Ceny brutto, jak w pozostałych katalogach. Mb cięcia to oszacowanie: suma półobwodów formatek na arkuszach
// (wspólne cięcia policzone raz) - dokładniej nie da się bez układu cięć pilarki.
import { nestParts } from "./nesting.js";
import { getPartEdges } from "./edgeBanding.js";
import { baseCategory } from "../core/materialCatalog.js";

export const CUT_RATES = {
  sas: { perMbStandard: 2.84, perMbPremium: 5.42, edgingPremiumPerM: 8.34, palletFee: 64.58, mbFactor: 1.5 },
  heban: { perPiece: 4.92, perPieceExpress: 7.38 },
  expressFactor: 1.5,
};

export const CUT_MODES = ["manual", "sas", "heban"];
export const CUT_PLAN_DEFAULTS = { sheetW: 2800, sheetH: 2070, kerf: 3, trim: 10 };

// Kategorie cięte w hurtowni (blat docina się na miejscu).
const CUT_CATEGORIES = ["Korpus", "Front", "Szuflada", "Plecy"];

export const isPremiumBoard = (category) => /perfect\s*sense|\bPM\//i.test(String(category || ""));

const round2 = (v) => Math.round(v * 100) / 100;

// parts: zagregowana lista formatek (calculateAllProjectParts). Zwraca grupy po kategorii (osobne arkusze dla dekorów)
// z liczbą arkuszy, szacunkowym mb cięcia i metrami okleiny.
export function cutGroups(parts, cutPlan = {}, edgeRules = null) {
  const s = { ...CUT_PLAN_DEFAULTS, ...(cutPlan || {}) };
  const byCat = new Map();
  for (const p of parts || []) {
    if (!CUT_CATEGORIES.includes(baseCategory(p.category))) continue;
    // fronty z różnych materiałów (osobne płyty / MDF lakierowany) układają się na osobnych arkuszach
    const cat = p.category === "Front" && p.materialId ? `Front::${p.materialId}` : (p.category || "Inne");
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p);
  }
  return [...byCat.entries()].map(([key, list]) => {
    const category = key.startsWith("Front::") ? "Front" : key;
    const pieces = [];
    let edgeMm = 0, count = 0;
    list.forEach((p) => {
      const qty = Math.max(0, Math.round(parseFloat(p.qty) || 0));
      const length = parseFloat(p.length) || 0, width = parseFloat(p.width) || 0;
      const [l1, l2, s1, s2] = getPartEdges(p, edgeRules);
      const edge = (l1 ? length : 0) + (l2 ? length : 0) + (s1 ? width : 0) + (s2 ? width : 0);
      for (let i = 0; i < qty; i++) {
        pieces.push({ id: pieces.length, w: length, h: width, canRotate: category !== "Front" });
      }
      edgeMm += edge * qty;
      count += qty;
    });
    const result = pieces.length ? nestParts(pieces, { sheetW: s.sheetW, sheetH: s.sheetH, kerf: s.kerf, trim: s.trim }) : { sheets: [], sheetCount: 0 };
    const halfPerimeterMm = result.sheets.reduce((sum, sh) => sum + sh.placements.reduce((a, pl) => a + pl.w + pl.h, 0), 0);
    return { category, premium: isPremiumBoard(category), pieces: count, sheets: result.sheetCount, cutMb: halfPerimeterMm / 1000, edgeM: edgeMm / 1000 };
  });
}

// Wycena cięcia w obu hurtowniach. opts: { express, pallet } (pallet = doliczyć paletę SAS).
export function cuttingQuote(groups, opts = {}) {
  const k = opts.express ? CUT_RATES.expressFactor : 1;
  const r = CUT_RATES.sas;
  let sasCut = 0, sasEdging = 0, cutMb = 0, pieces = 0, premiumPieces = 0;
  for (const g of groups) {
    cutMb += g.cutMb; pieces += g.pieces;
    sasCut += g.cutMb * r.mbFactor * (g.premium ? r.perMbPremium : r.perMbStandard) * k;
    if (g.premium) { sasEdging += g.edgeM * r.edgingPremiumPerM; premiumPieces += g.pieces; }
  }
  const pallet = opts.pallet ? r.palletFee : 0;
  const sasTotal = round2(sasCut + sasEdging + pallet);
  const hebanTotal = round2(pieces * (opts.express ? CUT_RATES.heban.perPieceExpress : CUT_RATES.heban.perPiece));
  return {
    pieces, premiumPieces, cutMb: round2(cutMb),
    sas: { cut: round2(sasCut), edging: round2(sasEdging), pallet, total: sasTotal },
    heban: { total: hebanTotal },
  };
}

// Koszt cięcia do kosztorysu: mode 'sas' | 'heban' (manual obsługuje cost.js, zł/szt. ręcznie).
export function cuttingCostFor(mode, parts, pricing, cutPlan, edgeRules) {
  const cfg = (pricing && pricing.cutting) || {};
  const quote = cuttingQuote(cutGroups(parts, cutPlan, edgeRules), { express: !!cfg.express, pallet: !!cfg.pallet });
  return mode === "sas" ? quote.sas.total : quote.heban.total;
}
