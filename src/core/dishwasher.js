// src/core/dishwasher.js
//
// Zmywarka do zabudowy: samodzielny element projektu (wpis w project.sidePanels z kind: 'zmywarka',
// jak blenda i panel poziomy - przeciąganie, lista, właściwości i grupy są wspólne). Bez korpusu:
// we wnęce między szafkami jest tylko urządzenie, opcjonalny wieniec górny (płyta korpusu pod blatem,
// spina sąsiednie szafki), front w materiale frontów i cokół w biegu cokołu sąsiednich szafek.
//
// Pola: dimensions { width: 450 | 600 (szerokość wnęki = urządzenia), height: od podłogi do spodu blatu,
// depth: głębokość korpusów obok }, plinthHeight (nóżki szafek obok), plinthOffset, topBoard (wieniec),
// decor (dekor wieńca, pusty = korpus projektu), materialId (front z cennika frontów).
// Układ lokalny: x wzdłuż szerokości, y od position.y w górę, z od tyłu (0) do czoła korpusu (depth),
// front przed czołem o front.bodyGap - jak w szafkach.

import { projectBoardThickness, decorThickness } from "./boardThickness.js";
import { korpusCategory } from "./materialCatalog.js";
import { frontBodyGap } from "./state.js";

export const DISHWASHER_WIDTHS = [450, 600];
export const DISHWASHER_DEFAULTS = { height: 820, depth: 560, plinthHeight: 100, plinthOffset: 40 };

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// Nowa zmywarka; `ref` = szafka dolna, z której bierze wysokość (korpus + nóżki), głębokość,
// nóżki/cokół, dekor korpusu i materiał frontów (zwykle zaznaczona szafka obok wnęki).
export function createDishwasher(width = 600, ref = null, count = 0) {
  const w = DISHWASHER_WIDTHS.includes(Number(width)) ? Number(width) : 600;
  const legs = ref && ref.legs && ref.legs.active ? ref.legs : null;
  const plinthHeight = legs ? num(legs.height, 100) : DISHWASHER_DEFAULTS.plinthHeight;
  const frontMat = ref && (ref.elements || []).find((e) => e.typ === "front" && e.materialId);
  return {
    id: "zmywarka-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    kind: "zmywarka",
    name: `Zmywarka ${w / 10}` + (count ? ` (${count + 1})` : ""),
    decor: (ref && ref.materials && ref.materials.korpusDecor) || "",
    materialId: frontMat ? frontMat.materialId : undefined,
    topBoard: true,
    plinthHeight,
    plinthOffset: legs ? num(legs.plinthOffset, 40) : DISHWASHER_DEFAULTS.plinthOffset,
    position: { x: 0, y: 0, z: 0 },
    rotation: ref ? num(ref.rotation, 0) : 0,
    dimensions: {
      width: w,
      height: ref ? num(ref.dimensions && ref.dimensions.height, 720) + plinthHeight : DISHWASHER_DEFAULTS.height,
      depth: ref ? num(ref.dimensions && ref.dimensions.depth, 560) : DISHWASHER_DEFAULTS.depth,
    },
  };
}

// Geometria w układzie lokalnym (mm): wieniec, front, urządzenie, cokół.
export function dishwasherGeometry(panel, project) {
  const W = num(panel.dimensions && panel.dimensions.width, 600);
  const H = num(panel.dimensions && panel.dimensions.height, DISHWASHER_DEFAULTS.height);
  const D = num(panel.dimensions && panel.dimensions.depth, DISHWASHER_DEFAULTS.depth);
  const th = decorThickness(panel.decor) || projectBoardThickness(project);
  const plinthH = Math.max(0, num(panel.plinthHeight, DISHWASHER_DEFAULTS.plinthHeight));
  const plinthOffset = num(panel.plinthOffset, DISHWASHER_DEFAULTS.plinthOffset);
  const fc = (project && project.front && project.front.clearance) || {};
  const cLeft = num(fc.left ?? fc.sides, 1.5), cRight = num(fc.right ?? fc.sides, 1.5);
  const cTop = num(fc.top ?? fc.gora, 2), cBottom = num(fc.bottom ?? fc.dol, 2);
  const top = panel.topBoard !== false ? { y: H - th, h: th, w: W, d: D } : null;
  // front jak front szafki obok: od spodu korpusu (nad cokołem) z luzem dolnym do luzu pod blatem
  const front = { x: cLeft, w: W - cLeft - cRight, y: plinthH + cBottom, h: H - cTop - plinthH - cBottom, z: D + frontBodyGap(project && project.front), th };
  const appliance = { x: 1, w: W - 2, y: plinthH, h: (top ? top.y : H) - plinthH, z: 0, d: D - 10 };
  const plinth = plinthH > 0 ? { x: 0, w: W, y: 0, h: plinthH, z: D - plinthOffset - th, th } : null;
  return { W, H, D, th, top, front, appliance, plinth };
}

// Formatki: front (cennik frontów) i wieniec nad zmywarką (płyta korpusu w dekorze).
// Cokół liczy wspólny bieg cokołu (engine/cabinet.js) przez dishwasherPlinthModule.
export function getDishwasherParts(panel, project) {
  const g = dishwasherGeometry(panel, project);
  const parts = [{ name: `Front zmywarki ${g.W / 10}`, length: g.front.h, width: g.front.w, qty: 1, category: "Front", materialId: panel.materialId }];
  if (g.top) parts.push({ name: "Wieniec nad zmywarką", length: g.W, width: g.D, qty: 1, category: korpusCategory(panel.decor), defaultEdges: [true, false, false, false] });
  return parts;
}

// Zastępcza „szafka” do biegu cokołu: zmywarka między szafkami nie przerywa cokołu, a jej
// odcinek ma materiał frontu zmywarki (jak cokół szafki z jej frontów).
export function dishwasherPlinthModule(panel) {
  const plinthH = num(panel.plinthHeight, DISHWASHER_DEFAULTS.plinthHeight);
  return {
    id: panel.id,
    type: "dishwasher",
    name: panel.name,
    position: { ...(panel.position || {}) },
    rotation: panel.rotation || 0,
    dimensions: { width: num(panel.dimensions && panel.dimensions.width, 600), height: num(panel.dimensions && panel.dimensions.height, DISHWASHER_DEFAULTS.height) - plinthH, depth: num(panel.dimensions && panel.dimensions.depth, DISHWASHER_DEFAULTS.depth) },
    legs: { active: plinthH > 0, height: plinthH, plinth: plinthH > 0 && panel.plinth !== false, plinthOffset: num(panel.plinthOffset, DISHWASHER_DEFAULTS.plinthOffset), plinthMaterial: panel.plinthMaterial || "" },
    materials: {},
    elements: [{ typ: "front", subtype: "drzwi", materialId: panel.materialId }],
  };
}
