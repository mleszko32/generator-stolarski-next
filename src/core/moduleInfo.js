// src/core/moduleInfo.js
//
// Szybkie podsumowanie aktywnej szafki do panelu bocznego: wymiary korpusu i wnętrza,
// fronty (drzwi z liczbą zawiasów, szuflady z wymiarami frontu i skrzynki: długość,
// szerokość, wysokość, system), półki. Czysta logika bez DOM - rysuje ją ui/properties.js.
import { recalculateLayout } from "./layout.js";
import { calculateHinges } from "./hingeMath.js";
import { getDrawerBoxInfo } from "./drawerBoxes.js";
import { num, round1 } from "../utils/math.js";

const TYPE_LABELS = {
  base_cabinet: "Szafka dolna",
  upper_cabinet: "Szafka wisząca",
  tall_cabinet: "Słupek",
  corner_cabinet: "Szafka narożna",
  slope_cabinet: "Szafka pod skos",
};

// Zwraca { type, dims, inner, doors[], drawers[], shelves[], dividers } dla szafki zwykłej.
export function getModuleSummary(mod, project) {
  recalculateLayout(mod);
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const W = num(mod.dimensions.width), H = num(mod.dimensions.height), D = num(mod.dimensions.depth);
  const els = mod.elements || [];
  // Głębokość wnętrza BEZ pleców (tak jak głębokość wieńców w liście formatek): przy plecach
  // nakładanych D - grubość HDF, przy plecach w nucie D - cofnięcie - grubość HDF.
  const backThick = num(project.materials && project.materials.backThickness, 3) || 3;
  const backP = mod.backPanel || { type: "nakladane", offset: 16 };
  const innerD = backP.type === "nut" ? D - num(backP.offset, 16) - backThick : D - backThick;
  const legs = mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0;

  const byPosition = (a, b) => num(a.y) - num(b.y) || num(a.x) - num(b.x);
  const fronts = els.filter((e) => e.typ === "front").sort(byPosition);

  const obstacles = els.filter((o) => o.typ === "poziom" || o.subtype === "szuflada-wewnetrzna");
  const doors = fronts
    .filter((f) => (f.subtype || "").includes("drzwi"))
    .map((f, i) => {
      const side = f.subtype === "drzwi-lp" ? (String(f.id).includes("-L-") ? "left" : "right") : (f.openingSide === "right" ? "right" : "left");
      let hinges;
      try { hinges = (calculateHinges(f, th, obstacles, side) || []).length; } catch (e) { hinges = 0; }
      return { label: `Drzwi ${i + 1}`, w: round1(num(f.w)), h: round1(num(f.h)), side, hinges };
    });

  const drawers = fronts
    .filter((f) => (f.subtype || "").includes("szuflada"))
    .map((f, i) => {
      const info = getDrawerBoxInfo(mod, f, project);
      const box = info ? {
        length: round1(info.comps.nominalLength),
        width: round1(info.rect.x1 - info.rect.x0),
        height: round1(info.rect.y1 - info.rect.y0),
        system: info.comps.systemName,
        variant: info.comps.back.variantType,
        openingW: round1(info.openingW),
        openingH: round1(info.openingH),
      } : null;
      return { label: `Szuflada ${i + 1}${f.subtype === "szuflada-wewnetrzna" ? " (wewn.)" : ""}`, w: round1(num(f.w)), h: round1(num(f.h)), box };
    });

  const shelves = els
    .filter((e) => e.typ === "poziom")
    .sort((a, b) => num(a.y) - num(b.y))
    .map((e) => ({ y: round1(num(e.y)), fixed: !!e.isStructural }));

  return {
    type: TYPE_LABELS[mod.type] || "Szafka",
    dims: { w: round1(W), h: round1(H), d: round1(D) },
    inner: { w: round1(W - 2 * th), h: round1(H - 2 * th), d: round1(innerD) },
    legs,
    doors,
    drawers,
    shelves,
    dividers: els.filter((e) => e.typ === "pion").length,
  };
}
