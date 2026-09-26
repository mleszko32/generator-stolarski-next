// src/core/drawerBoxes.js
//
// Położenie i wymiary korpusu ("skrzynki") szuflady w widoku od przodu, w układzie
// modułu (mm, x od lewej krawędzi korpusu, y od dołu korpusu). Te same wzory, co
// rysowanie szuflad w 3D (render/viewer3d.js, tryb przezroczysty) i lista formatek
// (engine/cabinet.js): dno i tył z getDrawerComponents, boki po 16 mm. Używane
// przez edytor wnętrza 2D, gdy fronty są ukryte. Wymaga aktualnego layoutu
// (el.y/el.h po recalculateLayout).
import { getDrawerComponents } from "./drawerMath.js";

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

const SIDE_T = 16;   // grubość boku i dna szuflady

// mod: szafka, el: front szufladowy, project: state.project.
// Zwraca { rect: {x0,x1,y0,y1}, comps, system } (rect = obrys całej skrzynki razem z bokami;
// comps = składniki z getDrawerComponents: długość nominalna, dno, tył) albo null.
export function getDrawerBoxInfo(mod, el, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const W = num(mod.dimensions && mod.dimensions.width);
  const D = num(mod.dimensions && mod.dimensions.depth);
  const H = num(mod.dimensions && mod.dimensions.height);
  const front = { ...(project.front || {}), ...(mod.front || {}) };
  const isInternal = el.subtype === "szuflada-wewnetrzna";
  const isInset = front.type === "wpuszczane";
  const y = num(el.y), h = num(el.h);

  let availableSpace = h;
  if (y < th) availableSpace -= th;
  if (y + h > H - th) availableSpace -= th;

  const innerW = W - th * 2;
  // Głębokość dla doboru długości nominalnej (NL) - TAK SAMO jak lista formatek
  // (engine/cabinet.js: getFrontsAndDrawers): głębokość wieńców korpusu (bez płyty pleców;
  // przy plecach w nucie jeszcze bez cofnięcia), a od niej front wewnętrzny albo grubość
  // frontu wpuszczanego. Wcześniej 3D i ta funkcja odejmowały stałe 19 mm i dobierały o
  // stopień krótszą prowadnicę (450 zamiast 500) niż formatka dna.
  const backThick = num(project.materials && project.materials.backThickness, 3) || 3;
  const backP = mod.backPanel || { type: "nakladane", offset: 16 };
  let depth = backP.type === "nut" ? D - num(backP.offset, 16) - backThick : D - backThick;
  if (isInternal) depth -= num(el.innerFrontThickness, 18) + num(el.innerSetback, 2);
  else if (isInset) depth -= th;
  const forceNL = parseFloat(el.forceNL);
  if (Number.isFinite(forceNL)) depth = forceNL + 10;

  const sys = String(front.drawerSystem || "merivobox").toLowerCase();
  const comps = getDrawerComponents(sys, innerW, depth, availableSpace, el.forceVariant || "auto");
  if (!comps) return null;

  const dw = comps.bottom.width;
  const dh = comps.back.height;
  const isBottomInZone = el.frontIndex === 0;
  const isBottomOuter = !!el.baseZone && num(el.baseZone.minY) <= th + 0.5;
  const y0 = y + (isBottomInZone && isBottomOuter && !isInset ? th : 0);
  const x0 = th + (innerW - dw) / 2 - SIDE_T;
  return { rect: { x0, x1: x0 + dw + 2 * SIDE_T, y0, y1: y0 + SIDE_T + dh }, comps, system: sys };
}

// Sam obrys skrzynki (patrz getDrawerBoxInfo) albo null.
export function getDrawerBoxRect(mod, el, project) {
  const info = getDrawerBoxInfo(mod, el, project);
  return info ? info.rect : null;
}
