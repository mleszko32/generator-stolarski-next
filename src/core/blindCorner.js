// src/core/blindCorner.js
//
// Szafka ślepa (narożnik "blind corner"): zwykła szafka (dolna / wisząca / słupek) z
// polem mod.blindCorner = { active, side, frontWidth, fitting, materialId, mount, stileWidth }. Część
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

// Mocowanie drzwi (mount):
//   'listwa'  - pionowa listwa z płyty między wieńcami przy krawędzi otworu po stronie
//               ślepej, lico równo z czołem korpusu; drzwi nakładają się na nią jak na
//               bok i wiszą na zawiasie równoległym nakładanym (Blum 79B9950, prowadnik
//               na tylnej płaszczyźnie listwy); zaślepka nakłada się na listwę z drugiej
//               strony i jest do niej przykręcona. Zawiasy od strony narożnika - jak
//               w kartach LeMans / Cornerstone (drzwi otwierają się min. 85°).
//   'zaslepka'- bez listwy: zawias równoległy wpuszczany (Blum 79B9550) na tylnej
//               stronie zaślepki, drzwi obok zaślepki w jednej płaszczyźnie.
//   'bok'     - zwykły zawias na boku korpusu z dala od narożnika (Magic Corner -
//               kosze jadą razem z drzwiami, więc drzwi otwierają się od części ślepej).
export const BLIND_MOUNTS = {
  listwa: { label: "Listwa między wieńcami (zawias równoległy nakładany)", hingeSide: "blind",
    hwName: "Zawias Blum CLIP top BLUMOTION 95° do drzwi równoległych, nakładany (79B9950) + prowadnik 3 mm" },
  zaslepka: { label: "Na zaślepce (zawias równoległy wpuszczany)", hingeSide: "blind",
    hwName: "Zawias Blum CLIP top BLUMOTION 95° do drzwi równoległych, wpuszczany (79B9550) + prowadnik 3 mm" },
  bok: { label: "Na boku korpusu z dala od narożnika (zwykły zawias)", hingeSide: "away", hwName: null },
};
export const DEFAULT_BLIND_MOUNT = "listwa";
export const DEFAULT_STILE_WIDTH = 100;
// Otwory prowadnika zawiasu równoległego od krawędzi listwy / zaślepki po stronie drzwi
// (karta Blum blind corner: płytka przesunięta o 15,5 mm, 21,5 mm zamiast 37 mm).
export const PARALLEL_PLATE_INSET = 21.5;

export function getBlindCorner(mod) {
  const b = mod && mod.blindCorner;
  if (!b || !b.active || mod.type === "corner_cabinet" || mod.type === "slope_cabinet") return null;
  return {
    side: b.side === "right" ? "right" : "left",
    frontWidth: num(b.frontWidth, DEFAULT_BLIND_FRONT) || DEFAULT_BLIND_FRONT,
    fitting: getCornerFitting(b.fitting) ? b.fitting : "",
    materialId: b.materialId,
    mount: BLIND_MOUNTS[b.mount] ? b.mount : DEFAULT_BLIND_MOUNT,
    stileWidth: Math.max(30, num(b.stileWidth, DEFAULT_STILE_WIDTH) || DEFAULT_STILE_WIDTH),
  };
}

// Strona zawiasów drzwi szafki ślepej ('left'|'right' jak el.openingSide): od strony
// narożnika przy mocowaniu na listwie / zaślepce, z dala od narożnika przy 'bok'.
// null, gdy szafka nie jest ślepa.
export function blindHingeSide(mod) {
  const b = getBlindCorner(mod);
  if (!b) return null;
  if (BLIND_MOUNTS[b.mount].hingeSide === "blind") return b.side;
  return b.side === "left" ? "right" : "left";
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
  const geo = { ...b, frontWidth: fw, gap: c.gap, hingeSide: blindHingeSide(mod) };
  if (b.side === "left") {
    Object.assign(geo, { doorX0: outerR - fw, doorX1: outerR, panelX0: outerL, panelX1: outerR - fw - c.gap });
    geo.blindReach = geo.doorX0;
  } else {
    Object.assign(geo, { doorX0: outerL, doorX1: outerL + fw, panelX0: outerL + fw + c.gap, panelX1: outerR });
    geo.blindReach = W - geo.doorX1;
  }
  // Listwa: drzwi nakładają się na nią tak jak na bok (grubość płyty - luz przy krawędzi),
  // front wpuszczany siedzi obok niej. Otwór w świetle = od listwy (albo od krawędzi
  // zaślepki) do boku po drugiej stronie.
  if (b.mount === "listwa") {
    if (b.side === "left") {
      const x1 = c.isInset ? geo.doorX0 - c.cLeft : geo.doorX0 + c.th - c.cLeft;
      geo.stileX1 = Math.min(W - c.th, x1);
      geo.stileX0 = Math.max(c.th, geo.stileX1 - b.stileWidth);
    } else {
      const x0 = c.isInset ? geo.doorX1 + c.cRight : geo.doorX1 - c.th + c.cRight;
      geo.stileX0 = Math.max(c.th, x0);
      geo.stileX1 = Math.min(W - c.th, geo.stileX0 + b.stileWidth);
    }
    geo.clearOpening = b.side === "left" ? W - c.th - geo.stileX1 : geo.stileX0 - c.th;
  } else {
    geo.clearOpening = b.side === "left" ? W - c.th - geo.doorX0 : geo.doorX1 - c.th;
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
    // Strona zawiasów wynika z mocowania drzwi (listwa / zaślepka / bok).
    if (el.subtype === "drzwi") el.openingSide = g.hingeSide;
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

// Listwa szafki ślepej (mount 'listwa'): { x, w, y, h, thickness } w lokalnych
// współrzędnych szafki - między wieńcem dolnym a górnym, lico równo z czołem korpusu.
export function getBlindStile(mod, project) {
  const g = blindGeometry(mod, project);
  if (!g || g.mount !== "listwa" || g.stileX1 - g.stileX0 < 1) return null;
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const H = num(mod.dimensions && mod.dimensions.height, 720);
  const r = (v) => Math.round(v * 10) / 10;
  return { x: r(g.stileX0), w: r(g.stileX1 - g.stileX0), y: th, h: r(H - 2 * th), thickness: th };
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
  if (g.mount !== "bok" && fronts.some((el) => el.subtype === "drzwi-lp")) {
    out.push("Drzwi dwuskrzydłowe w szafce ślepej - skrzydło przy części ślepej nie ma na czym wisieć. Zostaw jedne drzwi.");
  }
  if (g.fitting) {
    const W = num(mod.dimensions.width);
    out.push(...checkCornerFitting(g.fitting, { width: W, frontWidth: g.frontWidth, clearOpening: g.clearOpening, mount: g.mount, ...innerDims(mod, project) }));
  }
  return out;
}
