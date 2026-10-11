// src/core/drawerBoxes.js
//
// Położenie i wymiary korpusu ("skrzynki") szuflady w widoku od przodu, w układzie
// modułu (mm, x od lewej krawędzi korpusu, y od dołu korpusu). Te same wzory, co
// rysowanie szuflad w 3D (render/viewer3d.js, tryb przezroczysty) i lista formatek
// (engine/cabinet.js): dno i tył z core/drawerSpec.js, boki po 16 mm. Używane
// przez edytor wnętrza 2D, gdy fronty są ukryte. Wymaga aktualnego layoutu
// (el.y/el.h po recalculateLayout).
import { drawerSpec } from "./drawerSpec.js";
import { num } from "../utils/math.js";
import { getSlopeFronts, getSlopeGeometry } from "./slopeCabinet.js";

const SIDE_T = 16;   // grubość boku i dna szuflady

// mod: szafka, el: front szufladowy, project: state.project.
// Zwraca { rect: {x0,x1,y0,y1}, comps, system } (rect = obrys całej skrzynki razem z bokami;
// comps = składniki z getDrawerComponents: długość nominalna, dno, tył) albo null.
export function getDrawerBoxInfo(mod, el, project) {
  // Wnęka, głębokość (NL) i skrzynka - TAK SAMO jak lista formatek i okuć
  // (core/drawerSpec.js). Skrzynka wyśrodkowana we wnęce w świetle (kolumna za przegrodą).
  const spec = drawerSpec(mod, el, project);
  const comps = spec.comps;
  if (!comps) return null;
  const { th, isInset, availableSpace, openingX0, openingW, system: sys } = spec;
  const y = num(el.y);

  const dw = comps.bottom.width;
  const dh = comps.back.height;
  const isBottomInZone = el.frontIndex === 0;
  const isBottomOuter = !!el.baseZone && num(el.baseZone.minY) <= th + 0.5;
  const y0 = y + (isBottomInZone && isBottomOuter && !isInset ? th : 0);
  if (comps.woodenBox) {
    // MOVENTO: boki z płyty, skrzynka zaczyna się luz nad dołem wnęki.
    const t = comps.sideThickness;
    const x0 = openingX0 + (openingW - dw) / 2 - t;
    const yb = y0 + comps.bottomClearance;
    return { rect: { x0, x1: x0 + dw + 2 * t, y0: yb, y1: yb + comps.sideHeight }, comps, system: sys, openingW, openingH: availableSpace };
  }
  const x0 = openingX0 + (openingW - dw) / 2 - SIDE_T;
  return { rect: { x0, x1: x0 + dw + 2 * SIDE_T, y0, y1: y0 + SIDE_T + dh }, comps, system: sys, openingW, openingH: availableSpace };
}

// Sam obrys skrzynki (patrz getDrawerBoxInfo) albo null.
export function getDrawerBoxRect(mod, el, project) {
  if (mod.type === "slope_cabinet") return slopeDrawerBoxRect(mod, el, project);
  const info = getDrawerBoxInfo(mod, el, project);
  return info ? info.rect : null;
}

// Szafka pod skos: skrzynka liczona pod skosem (core/slopeCabinet.js); front,
// który stał się blendą (trójkąt albo szuflada się nie mieści), nie ma skrzynki.
function slopeDrawerBoxRect(mod, el, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const fr = getSlopeFronts(mod, project).find((f) => f.el.id === el.id);
  if (!fr || fr.type !== "szuflada" || !fr.drawer) return null;
  const d = fr.drawer, c = d.comps;
  const g = getSlopeGeometry(mod, th);
  const yBase = d.boxType === "B" ? d.box.yBase : d.yBase;
  const h = d.boxType === "B" ? Math.max(d.box.sideLow, d.box.sideHigh) : (c.woodenBox ? c.sideHeight : 16 + c.back.height);
  const x0 = g.normX(d.ox0, d.ox1 - d.ox0);
  return { x0, x1: x0 + (d.ox1 - d.ox0), y0: yBase, y1: yBase + h };
}
