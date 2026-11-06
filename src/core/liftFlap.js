// src/core/liftFlap.js
//
// Klapa uchylna do góry: front 'drzwi' z openingSide 'top' - zawiasy na górnej krawędzi
// (pod wieńcem górnym), podnośnik Blum AVENTOS HK-XS w wersji TIP-ON (bez uchwytu).
// Czysta logika: rozpoznanie klapy, współczynnik mocy (LF), dobór siłownika i lista okuć.
// Zawiasy klapy nie wiercą boków (engine/cabinet.js je pomija) - prowadniki idą pod wieniec górny.

import { decorThickness } from "./boardThickness.js";

// Gęstość płyty do szacunku masy frontu (Egger wiórowa 18/19 mm ok. 650-680 kg/m³, MDF więcej).
export const FLAP_BOARD_DENSITY = 660;
// Puszki zawiasów: oś 21,5 mm od górnej krawędzi frontu, skrajne 100 mm od boków frontu.
export const FLAP_CUP_FROM_EDGE = 21.5;
export const FLAP_HINGE_INSET = 100;

// Siłowniki HK-XS TIP-ON z zakresem współczynnika mocy LF = wysokość frontu [mm] × masa [kg].
// Zakres 20K1501T jak w opisie zestawu SAS „moc 800 - 1600”; inne siłowniki - dobór ręczny.
export const HKXS_LIFTS = [
  { code: "20K1501T", min: 800, max: 1600 },
];

// Grubość frontu: z nazwy materiału frontu w cenniku („… 19mm”), inaczej płyta korpusu (fallback).
export function frontThickness(el, project, fallback = 18) {
  const mats = (project && project.pricing && project.pricing.frontMaterials) || [];
  const mat = mats.find((m) => m.id === el.materialId) || mats[0];
  return decorThickness(mat && mat.name) || fallback;
}

export function isFlap(el) {
  return !!el && el.typ === "front" && el.subtype === "drzwi" && el.openingSide === "top";
}

// Masa frontu [kg] z wymiarów i grubości płyty.
export function flapWeight(el, thickness) {
  const w = Number(el.w) || 0, h = Number(el.h) || 0;
  return (w / 1000) * (h / 1000) * ((Number(thickness) || 18) / 1000) * FLAP_BOARD_DENSITY;
}

export function flapPowerFactor(el, thickness) {
  return Math.round((Number(el.h) || 0) * flapWeight(el, thickness));
}

// Zawiasy klapy: 2 (szersza niż 900 mm - 3, środkowy na osi). Pozycje X od lewej krawędzi frontu.
export function flapHinges(el) {
  const w = Number(el.w) || 0;
  const xs = [FLAP_HINGE_INSET, w - FLAP_HINGE_INSET];
  if (w > 900) xs.splice(1, 0, w / 2);
  return xs.map((x) => ({ x, yFromTop: FLAP_CUP_FROM_EDGE }));
}

// Okucia jednej klapy: [{ name, qty, unit }].
export function flapHardware(el, thickness) {
  const lf = flapPowerFactor(el, thickness);
  const lift = HKXS_LIFTS.find((l) => lf >= l.min && lf <= l.max);
  const hinges = flapHinges(el).length;
  return [
    { name: lift
      ? `AVENTOS HK-XS TIP-ON - siłownik ${lift.code} (LF ${lift.min}-${lift.max})`
      : `AVENTOS HK-XS TIP-ON - siłownik do doboru (LF ok. ${lf})`, qty: 1, unit: "szt." },
    { name: "AVENTOS HK-XS - mocowanie korpusu 20K5101", qty: 1, unit: "szt." },
    { name: "AVENTOS HK-XS - mocowanie frontu 20K4101", qty: 1, unit: "szt." },
    { name: "TIP-ON do drzwi 956.1004 + adapter prosty 956.1201", qty: 1, unit: "kpl." },
    { name: "Zawias CLIP top 110° bez sprężyny 70T3550 + prowadnik 173L6100", qty: hinges, unit: "kpl." },
  ];
}
