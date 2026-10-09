// src/core/blindCorner.js
//
// Szafka ślepa (narożnik "blind corner"): zwykła szafka (dolna / wisząca / słupek) z
// polem mod.blindCorner = { active, side, frontWidth, fitting, materialId }. Część
// ślepa (side = 'left'|'right') wchodzi w narożnik pod ciąg szafek z sąsiedniej
// ściany i jest zakryta zaślepką (formatka frontowa), drzwi są tylko na części
// otwieranej o szerokości frontWidth. Wnętrze pozostaje wspólne (pod okucie
// wysuwane, core/cornerFittings.js), więc fronty z mod.elements są po prostu
// przycinane do otworu - po recalculateLayout (core/layout.js wywołuje
// applyBlindCorner). Czysta logika bez DOM/Three.js.
import { num } from "../utils/math.js";
import { checkCornerFitting, getCornerFitting } from "./cornerFittings.js";

export const DEFAULT_BLIND_FRONT = 450;
const MIN_FRONT = 100;

export function getBlindCorner(mod) {
  const b = mod && mod.blindCorner;
  if (!b || !b.active || mod.type === "corner_cabinet" || mod.type === "slope_cabinet") return null;
  return {
    side: b.side === "right" ? "right" : "left",
    frontWidth: num(b.frontWidth, DEFAULT_BLIND_FRONT) || DEFAULT_BLIND_FRONT,
    fitting: getCornerFitting(b.fitting) ? b.fitting : "",
    materialId: b.materialId,
  };
}

function frontContext(mod, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const f = { ...(project.front || {}), ...(mod.front || {}) };
  const fc = { ...((project.front && project.front.clearance) || {}), ...((mod.front && mod.front.clearance) || {}) };
  return {
    th,
    isInset: f.type === "wpuszczane",
    gap: num(f.gap, 3),
    cLeft: num(fc.left ?? fc.sides ?? 1.5),
    cRight: num(fc.right ?? fc.sides ?? 1.5),
    cTop: num(fc.top ?? fc.gora ?? 2),
    cBottom: num(fc.bottom ?? fc.dol ?? 2),
  };
}

// Geometria w lokalnym X szafki: otwór drzwi [doorX0, doorX1], zaślepka
// [panelX0, panelX1] i blindReach = odległość od boku korpusu po stronie ślepej do
// krawędzi frontu drzwi (to musi być >= głębokość ciągu prostopadłego + front +
// blenda, patrz core/wallFill.js). null, gdy szafka nie jest ślepa.
export function blindGeometry(mod, project) {
  const b = getBlindCorner(mod);
  if (!b) return null;
  const c = frontContext(mod, project);
  const W = num(mod.dimensions && mod.dimensions.width, 600);
  const outerL = c.isInset ? c.th + c.cLeft : c.cLeft;
  const outerR = c.isInset ? W - c.th - c.cRight : W - c.cRight;
  const fw = Math.max(MIN_FRONT, Math.min(b.frontWidth, outerR - outerL - c.gap - MIN_FRONT / 5));
  const geo = { ...b, frontWidth: fw, gap: c.gap };
  if (b.side === "left") {
    Object.assign(geo, { doorX0: outerR - fw, doorX1: outerR, panelX0: outerL, panelX1: outerR - fw - c.gap });
    geo.blindReach = geo.doorX0;
  } else {
    Object.assign(geo, { doorX0: outerL, doorX1: outerL + fw, panelX0: outerL + fw + c.gap, panelX1: outerR });
    geo.blindReach = W - geo.doorX1;
  }
  return geo;
}

const isOuterFront = (el) => el.typ === "front" && el.subtype !== "szuflada-wewnetrzna";

// Przycina fronty do otworu drzwi. Wołane na końcu recalculateLayout (po
// wyliczeniu el.x/el.w), więc reszta programu (formatki, zawiasy, 3D) widzi już
// fronty o szerokości frontWidth.
export function applyBlindCorner(mod, project) {
  const g = blindGeometry(mod, project);
  if (!g) return;
  (mod.elements || []).filter(isOuterFront).forEach((el) => {
    const x0 = Math.max(num(el.x), g.doorX0);
    const x1 = Math.min(num(el.x) + num(el.w), g.doorX1);
    el.x = x0;
    el.w = Math.max(0, Math.round((x1 - x0) * 100) / 100);
  });
}

// Zaślepka części ślepej: { x, y, w, h } w lokalnych współrzędnych szafki
// (jak el.x/el.y frontów). Wysokość = zakres frontów (po layoucie); bez frontów
// cała wysokość korpusu jak front nakładany/wpuszczany.
export function getBlindPanel(mod, project) {
  const g = blindGeometry(mod, project);
  if (!g || g.panelX1 - g.panelX0 < 1) return null;
  const fronts = (mod.elements || []).filter(isOuterFront).filter((el) => num(el.h) > 0);
  let y0, y1;
  if (fronts.length) {
    y0 = Math.min(...fronts.map((el) => num(el.y)));
    y1 = Math.max(...fronts.map((el) => num(el.y) + num(el.h)));
  } else {
    const c = frontContext(mod, project);
    const H = num(mod.dimensions && mod.dimensions.height, 720);
    y0 = c.isInset ? c.th + c.cBottom : c.cBottom;
    y1 = c.isInset ? H - c.th - c.cTop : H - c.cTop;
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { x: r(g.panelX0), w: r(g.panelX1 - g.panelX0), y: r(y0), h: r(y1 - y0), materialId: g.materialId };
}

// Wymiary wnętrza do sprawdzenia okucia.
export function innerDims(mod, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const backThick = num(project.materials && project.materials.backThickness, 3);
  const bp = mod.backPanel || {};
  const D = num(mod.dimensions && mod.dimensions.depth, 513);
  const H = num(mod.dimensions && mod.dimensions.height, 720);
  return {
    innerDepth: D - backThick - (bp.type === "nut" ? num(bp.offset) : 0),
    innerHeight: H - 2 * th,
  };
}

// Uwagi do kontroli projektu (core/validate.js).
export function checkBlindCorner(mod, project) {
  const g = blindGeometry(mod, project);
  if (!g) return [];
  const out = [];
  const fronts = (mod.elements || []).filter(isOuterFront);
  if (!fronts.length) out.push("Szafka ślepa nie ma drzwi - dodaj front w Wnętrzu 2D.");
  if (fronts.some((el) => num(el.w) < 1)) out.push("Część frontów leży w całości w części ślepej (zerowa szerokość) - zostaw jedne drzwi na całą wysokość.");
  if (fronts.some((el) => (el.subtype || "").includes("szuflada"))) {
    out.push("Szuflady w szafce ślepej - skrzynka liczona jest na całą szerokość wnętrza, a front tylko na otwór. Lepiej drzwi z okuciem narożnym.");
  }
  if (g.fitting) {
    const W = num(mod.dimensions.width);
    out.push(...checkCornerFitting(g.fitting, { width: W, frontWidth: g.frontWidth, ...innerDims(mod, project) }));
  }
  return out;
}
