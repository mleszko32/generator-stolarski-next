// src/core/korpusDecorChange.js
//
// Zmiana dekoru korpusu szafki. Dekor z grubością w nazwie („19mm”) zmienia grubość płyty
// szafki (core/boardThickness.js), a wnętrze (półki, przegrody, wnęki frontów) jest zapisane
// w mm względem korpusu - więc przy zmianie grubości dopasowujemy je do nowego światła:
// drzewo wnęk skalowane jak przy zmianie szerokości/wysokości (rescaleSubtree, z blokadami),
// grubość półek/przegród = nowa grubość płyty. Szafka narożna i skos - bez dopasowania.
import { buildZoneTree, rescaleSubtree, getCabinetInnerRect } from "./zoneTree.js";
import { moduleBoardThickness } from "./boardThickness.js";

const near = (a, b) => Math.abs(a - b) < 0.01;

// Zmiana, która przesuwa światło korpusu (wymiary, zamknięcie góry): `change()` modyfikuje szafkę,
// a półki / przegrody / wolne wnęki frontów dopasowują się do nowego światła jak przy zmianie dekoru.
export function refitInterior(mod, change) {
  const refit = mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet" && Array.isArray(mod.elements) && mod.elements.length > 0;
  const oldRect = refit ? getCabinetInnerRect(mod) : null;
  const tree = refit ? buildZoneTree(mod) : null;
  change();
  if (!refit) return;
  const r = getCabinetInnerRect(mod);
  if (near(r.minX, oldRect.minX) && near(r.maxX, oldRect.maxX) && near(r.minY, oldRect.minY) && near(r.maxY, oldRect.maxY)) return;
  rescaleSubtree(tree, "x", oldRect.minX, oldRect.maxX, r.minX, r.maxX);
  rescaleSubtree(tree, "y", oldRect.minY, oldRect.maxY, r.minY, r.maxY);
}

export function setModuleKorpusDecor(mod, decor, project) {
  const v = String(decor || "").trim();
  const oldTh = moduleBoardThickness(mod, project);
  const refit = mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet" && Array.isArray(mod.elements) && mod.elements.length > 0;
  const oldRect = refit ? getCabinetInnerRect(mod) : null;
  const tree = refit ? buildZoneTree(mod) : null;

  if (v) mod.materials = { ...(mod.materials || {}), korpusDecor: v };
  else if (mod.materials) {
    delete mod.materials.korpusDecor;
    if (!Object.keys(mod.materials).length) delete mod.materials;
  }

  const newTh = moduleBoardThickness(mod, project);
  // plecy wpuszczane z płyty korpusu: wpis równy staremu korpusowi idzie za nowym dekorem
  if (!near(oldTh, newTh) && mod.backPanel && near(parseFloat(mod.backPanel.thickness), oldTh)) delete mod.backPanel.thickness;
  if (!refit || near(oldTh, newTh)) return;
  const r = getCabinetInnerRect(mod);
  rescaleSubtree(tree, "x", oldRect.minX, oldRect.maxX, r.minX, r.maxX);
  rescaleSubtree(tree, "y", oldRect.minY, oldRect.maxY, r.minY, r.maxY);
  const remap = (val, o0, o1, n0, n1) => n0 + ((val - o0) / (o1 - o0)) * (n1 - n0);
  mod.elements.forEach((el) => {
    if (el.typ === "poziom" && near(parseFloat(el.h), oldTh)) el.h = newTh;
    if (el.typ === "pion" && near(parseFloat(el.w), oldTh)) el.w = newTh;
    const z = el.typ === "front" && el.baseZone;
    if (!z) return;
    // wnęki przypięte do krawędzi korpusu / innych elementów przelicza layout; wolne - jak wnętrze
    if (!z.boundLeft && z.minX != null) z.minX = remap(parseFloat(z.minX), oldRect.minX, oldRect.maxX, r.minX, r.maxX);
    if (!z.boundRight && z.maxX != null) z.maxX = remap(parseFloat(z.maxX), oldRect.minX, oldRect.maxX, r.minX, r.maxX);
    if (!z.boundBottom && z.minY != null) z.minY = remap(parseFloat(z.minY), oldRect.minY, oldRect.maxY, r.minY, r.maxY);
    if (!z.boundTop && z.maxY != null) z.maxY = remap(parseFloat(z.maxY), oldRect.minY, oldRect.maxY, r.minY, r.maxY);
  });
}
