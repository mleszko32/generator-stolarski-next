// src/core/moduleInfo.js
//
// Szybkie podsumowanie aktywnej szafki do panelu bocznego: wymiary korpusu i wnętrza,
// fronty (drzwi z liczbą zawiasów, szuflady z wymiarami frontu i skrzynki: długość,
// szerokość, wysokość, system), półki. Czysta logika bez DOM - rysuje ją ui/properties.js.
import { recalculateLayout } from "./layout.js";
import { calculateHinges } from "./hingeMath.js";
import { getDrawerBoxInfo } from "./drawerBoxes.js";

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const r1 = (v) => Math.round(v * 10) / 10;

const TYPE_LABELS = {
  base_cabinet: "Szafka dolna",
  upper_cabinet: "Szafka wisząca",
  tall_cabinet: "Słupek",
  corner_cabinet: "Szafka narożna",
};

// Zwraca { type, dims, inner, doors[], drawers[], shelves[], dividers } dla szafki zwykłej.
export function getModuleSummary(mod, project) {
  recalculateLayout(mod);
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const W = num(mod.dimensions.width), H = num(mod.dimensions.height), D = num(mod.dimensions.depth);
  const els = mod.elements || [];
  const legs = mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0;

  const byPosition = (a, b) => num(a.y) - num(b.y) || num(a.x) - num(b.x);
  const fronts = els.filter((e) => e.typ === "front").sort(byPosition);

  const obstacles = els.filter((o) => o.typ === "poziom" || o.subtype === "szuflada-wewnetrzna");
  const doors = fronts
    .filter((f) => (f.subtype || "").includes("drzwi"))
    .map((f, i) => {
      const side = f.subtype === "drzwi-lp" ? (String(f.id).includes("-L-") ? "left" : "right") : (f.openingSide === "right" ? "right" : "left");
      let hinges = 0;
      try { hinges = (calculateHinges(f, th, obstacles, side) || []).length; } catch (e) { hinges = 0; }
      return { label: `Drzwi ${i + 1}`, w: r1(num(f.w)), h: r1(num(f.h)), side, hinges };
    });

  const drawers = fronts
    .filter((f) => (f.subtype || "").includes("szuflada"))
    .map((f, i) => {
      const info = getDrawerBoxInfo(mod, f, project);
      const box = info ? {
        length: r1(info.comps.nominalLength),
        width: r1(info.rect.x1 - info.rect.x0),
        height: r1(info.rect.y1 - info.rect.y0),
        system: info.comps.systemName,
        variant: info.comps.back.variantType,
      } : null;
      return { label: `Szuflada ${i + 1}${f.subtype === "szuflada-wewnetrzna" ? " (wewn.)" : ""}`, w: r1(num(f.w)), h: r1(num(f.h)), box };
    });

  const shelves = els
    .filter((e) => e.typ === "poziom")
    .sort((a, b) => num(a.y) - num(b.y))
    .map((e) => ({ y: r1(num(e.y)), fixed: !!e.isStructural }));

  return {
    type: TYPE_LABELS[mod.type] || "Szafka",
    dims: { w: r1(W), h: r1(H), d: r1(D) },
    inner: { w: r1(W - 2 * th), h: r1(H - 2 * th), d: r1(D) },
    legs,
    doors,
    drawers,
    shelves,
    dividers: els.filter((e) => e.typ === "pion").length,
  };
}
