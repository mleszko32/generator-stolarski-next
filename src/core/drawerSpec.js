// src/core/drawerSpec.js
//
// Jedyne miejsce wyliczania parametrów szuflady zwykłej szafki: system, wysokość i szerokość
// wnęki, głębokość dla doboru prowadnicy (NL) i składniki skrzynki (getDrawerComponents).
// Wcześniej liczyły to osobno lista formatek (engine/cabinet.js), lista okuć
// (engine/hardware.js), obrys skrzynki (core/drawerBoxes.js) i render 3D - i się rozjeżdżały:
// okucia nie odejmowały frontu wpuszczanego ani czoła szuflady wewnętrznej (prowadnica L-500
// do dna pod NL450), inaczej liczyły wysokość wnęki (inny wariant H), a formatki brały
// szerokość całej szafki także dla szuflady w kolumnie za przegrodą.
// Wymaga aktualnego layoutu (el.y/el.h/baseZone po recalculateLayout). Szafka pod skos ma
// własne liczenie (core/slopeCabinet.js).
import { getDrawerComponents, calculateNominalLength } from "./drawerMath.js";
import { drawerSystems } from "./drawerSystems.js";
import { corpusInnerDepth } from "./backPanel.js";
import { num } from "../utils/math.js";

// Zapas za prowadnicą (jak w calculateNominalLength, core/drawerMath.js).
const NL_SAFETY = 5;

// mod: szafka, el: front szufladowy, project: state.project.
export function drawerSpec(mod, el, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const W = num(mod.dimensions && mod.dimensions.width);
  const H = num(mod.dimensions && mod.dimensions.height);
  const front = { ...(project.front || {}), ...(mod.front || {}) };
  const isInternal = el.subtype === "szuflada-wewnetrzna";
  const isInset = (front.type || "nakladane") === "wpuszczane";
  const system = String(front.drawerSystem || "merivobox").toLowerCase();
  const y = num(el.y), h = num(el.h);

  // Wysokość wnęki: front minus wieniec, na który zachodzi (dolny / górny).
  let availableSpace = h;
  if (y < th) availableSpace -= th;
  if (y + h > H - th) availableSpace -= th;

  // Wymuszony wariant: rysunek wierceń bierze wysokość wariantu, a nie całej wnęki.
  // getDrawerComponents dostaje pełne availableSpace - sam sprawdza, czy wariant się mieści.
  let simulatedSpace = availableSpace;
  if (el.forceVariant && el.forceVariant !== "auto") {
    const variant = (drawerSystems[system] || drawerSystems.merivobox).variants?.[el.forceVariant];
    if (variant) simulatedSpace = Math.min(variant.height, availableSpace);
  }

  // Szerokość wnęki w świetle z baseZone (kolumna za przegrodą jest węższa niż szafka).
  const bz = el.baseZone || {};
  let openingX0 = parseFloat(bz.minX);
  let openingX1 = parseFloat(bz.maxX);
  if (!Number.isFinite(openingX0)) openingX0 = th;
  if (!Number.isFinite(openingX1)) openingX1 = W - th;
  const openingW = openingX1 - openingX0;

  // Głębokość dla doboru NL: wieńce korpusu minus czoło szuflady wewnętrznej albo grubość
  // frontu wpuszczanego (wjeżdża w korpus); ręczne NL nadpisuje dobór.
  const innerThick = isInternal ? num(el.innerFrontThickness, 18) : 18;
  const innerSetback = isInternal ? num(el.innerSetback, 2) : 0;
  let depth = corpusInnerDepth(mod, project);
  if (isInternal) depth -= innerThick + innerSetback;
  else if (isInset) depth -= th;
  // Głębokość realnie dostępna (bez ręcznego NL) - do sprawdzenia, czy prowadnica się mieści.
  const maxDepth = depth;
  const forceNL = parseFloat(el.forceNL);
  if (Number.isFinite(forceNL)) depth = forceNL + 10;

  const comps = getDrawerComponents(system, openingW, depth, availableSpace, el.forceVariant || "auto", el.drawerSideHeight);
  const nl = comps ? comps.nominalLength : calculateNominalLength(depth, system);
  // calculateNominalLength zwraca najkrótszą prowadnicę z serii także wtedy, gdy nie mieści
  // się ona w szafce (np. wisząca 300 mm) - tu wychodzi to na jaw (kontrola projektu).
  const fitsDepth = nl <= maxDepth - NL_SAFETY;
  // Na wysokość: getDrawerVariant przy za niskiej wnęce po cichu bierze najniższy wariant,
  // a skrzynka drewniana ustawia comps.fits - tu jedno pole dla kontroli projektu.
  const sysData = drawerSystems[system];
  const minSpace = sysData && !sysData.woodenBox
    ? Math.min(...Object.values(sysData.variants || {}).map((v) => v.minSpace))
    : null;
  const fitsHeight = comps
    ? (comps.woodenBox ? comps.fits !== false : !(minSpace !== null && Number.isFinite(minSpace) && availableSpace < minSpace))
    : true;

  return {
    system, th, isInternal, isInset, innerThick, innerSetback,
    availableSpace, simulatedSpace, depth, maxDepth, nl, fitsDepth, fitsHeight, minSpace,
    openingX0, openingX1, openingW,
    comps,
  };
}
