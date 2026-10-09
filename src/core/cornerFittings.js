// src/core/cornerFittings.js
//
// JEDYNY katalog okuć narożnych (wysuwy do szafek ślepych, karuzele do szafek
// narożnych L) - jak drawerSystems.js dla szuflad. Dane z kart producentów i
// dystrybutorów (Kesseböhmer, Häfele, Vauth-Sagel - stan 2026-10); część wartości
// jest od dystrybutorów, a nie z karty montażowej, więc kontrola daje tylko
// ostrzeżenia, nie błędy. Przed zamówieniem sprawdź kartę konkretnego artykułu.
//
// kind: 'blind'  - szafka ślepa (mod.blindCorner, core/blindCorner.js),
//       'corner' - szafka narożna L z frontem łamanym (mod.cornerFitting).
// widths       - nominalne szerokości korpusu (dla 'corner': długości ramion),
// fronts       - nominalne szerokości frontu (lista) albo minFront,
// minInnerDepth / innerHeight [min, max] - wnętrze korpusu (mm), null = brak danych.
// hwName       - nazwa pozycji na liście okuć (cena w project.pricing.hardware po nazwie).
export const CORNER_FITTINGS = {
  lemans: {
    label: "Kesseböhmer LeMans II",
    kind: "blind",
    widths: [900, 1000],
    fronts: [450, 500, 600],
    minInnerDepth: null,
    innerHeight: [650, 800],
    note: "Drzwi muszą otwierać się co najmniej o 85°. Nośność 25 kg na tacę.",
    hwName: "Okucie narożne Kesseböhmer LeMans II (2 tace)",
  },
  magicCorner: {
    label: "Magic Corner (Kesseböhmer / Häfele)",
    kind: "blind",
    widths: [900, 1000],
    minFront: 450,
    minInnerDepth: 500,
    innerHeight: [540, null],
    note: "Kosze przednie na froncie + kosze tylne w części ślepej. Do 32 kg.",
    hwName: "Okucie narożne Magic Corner (kpl. koszy)",
  },
  cornerstone: {
    label: "Vauth-Sagel Cornerstone Maxx",
    kind: "blind",
    widths: [800, 900, 1000],
    fronts: [450, 500],
    minInnerDepth: 490,
    innerHeight: [650, 850],
    note: "Front 450 przy korpusie 900, 500 przy korpusie 1000. 25 kg na półkę.",
    hwName: "Okucie narożne Vauth-Sagel Cornerstone Maxx",
  },
  corFold: {
    label: "Vauth-Sagel VS COR Fold",
    kind: "blind",
    widths: [800, 900],
    fronts: [450],
    minInnerDepth: 485,
    innerHeight: [530, null],
    note: "Do 35 kg.",
    hwName: "Okucie narożne Vauth-Sagel VS COR Fold",
  },
  pullSwing: {
    label: "Häfele Pull and Swing",
    kind: "blind",
    widths: [800, 900, 1000],
    fronts: [400, 500, 600],
    minInnerDepth: 490,
    innerHeight: [530, null],
    note: "",
    hwName: "Okucie narożne Häfele Pull and Swing",
  },
  polkole: {
    label: "Półkole obrotowe 1/2",
    kind: "blind",
    widths: [800, 900],
    minFront: 400,
    minInnerDepth: null,
    innerHeight: [645, 790],
    note: "Oś regulowana 645–790 mm (do przycięcia).",
    hwName: "Półkole obrotowe 1/2 do szafki ślepej (2 półki)",
  },
  karuzela34: {
    label: "Karuzela 3/4",
    kind: "corner",
    widths: [800, 900],
    minInnerDepth: null,
    innerHeight: [645, 790],
    note: "Do szafki L 800×800 / 900×900 z frontem łamanym. 13–25 kg na półkę.",
    hwName: "Karuzela 3/4 do szafki narożnej (2 półki)",
  },
};

export function getCornerFitting(id) {
  return (id && CORNER_FITTINGS[id]) || null;
}

export function fittingsOfKind(kind) {
  return Object.entries(CORNER_FITTINGS).filter(([, f]) => f.kind === kind).map(([id, f]) => ({ id, ...f }));
}

const WIDTH_TOL = 30;  // nominalna szerokość korpusu: rama okucia ma regulację
const FRONT_TOL = 15;  // nominalna szerokość frontu vs. rzeczywista (szczeliny)
const fmtList = (xs) => xs.join(" / ");

// Uwagi do dopasowania okucia do szafki. dims: { width (dla 'corner': [legA, legB]),
// frontWidth, innerDepth, innerHeight }. Zwraca listę komunikatów (pusta = pasuje).
export function checkCornerFitting(id, dims) {
  const f = getCornerFitting(id);
  if (!f) return [];
  const out = [];
  const widths = Array.isArray(dims.width) ? dims.width : [dims.width];
  const lo = Math.min(...f.widths) - WIDTH_TOL, hi = Math.max(...f.widths) + WIDTH_TOL;
  widths.forEach((w) => {
    if (w < lo || w > hi) {
      out.push(`${f.label}: ${f.kind === "corner" ? "ramię" : "korpus"} ${Math.round(w)} mm - okucie jest do szerokości ${fmtList(f.widths)} mm.`);
    }
  });
  if (f.kind === "blind" && dims.frontWidth !== undefined) {
    const fw = dims.frontWidth;
    if (f.fronts && !f.fronts.some((n) => Math.abs(n - fw) <= FRONT_TOL)) {
      out.push(`${f.label}: front ${Math.round(fw)} mm - okucie jest do frontów ${fmtList(f.fronts)} mm.`);
    }
    if (f.minFront && fw < f.minFront - FRONT_TOL) {
      out.push(`${f.label}: front ${Math.round(fw)} mm - okucie wymaga frontu co najmniej ${f.minFront} mm.`);
    }
  }
  if (f.minInnerDepth && dims.innerDepth < f.minInnerDepth) {
    out.push(`${f.label}: głębokość wnętrza ${Math.round(dims.innerDepth)} mm - wymagane co najmniej ${f.minInnerDepth} mm.`);
  }
  const [hMin, hMax] = f.innerHeight || [];
  if (hMin && dims.innerHeight < hMin) {
    out.push(`${f.label}: wysokość wnętrza ${Math.round(dims.innerHeight)} mm - wymagane co najmniej ${hMin} mm.`);
  }
  if (hMax && dims.innerHeight > hMax) {
    out.push(`${f.label}: wysokość wnętrza ${Math.round(dims.innerHeight)} mm - okucie jest do ${hMax} mm (wyższe wnętrze zostanie częściowo puste).`);
  }
  return out;
}
