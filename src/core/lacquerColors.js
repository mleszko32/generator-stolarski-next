// src/core/lacquerColors.js
//
// Kolory lakieru frontów: RAL Classic (tabela w data/ralClassic.js) i NCS (przeliczane ze
// wzoru, więc działa każdy poprawny kod, np. „S 0502-Y”, „NCS S 2005-Y20R”, „S 1000-N”).
// Wynik to przybliżenie ekranowe do podglądu 3D i legendy - nie do dobierania lakieru.
// Czyste funkcje.
import { RAL_CLASSIC } from "./data/ralClassic.js";

const RAL_BY_CODE = new Map(RAL_CLASSIC.map(([code, name, color]) => [code.replace(/\s/g, ""), { code, name, color }]));

// Popularne kody NCS do podpowiedzi (wpisać można dowolny poprawny kod).
export const NCS_COMMON = [
  "S 0300-N", "S 0500-N", "S 0502-Y", "S 0502-G50Y", "S 0502-Y50R", "S 0505-Y20R", "S 1000-N", "S 1002-Y",
  "S 1002-Y50R", "S 1005-Y20R", "S 1505-Y20R", "S 2000-N", "S 2002-Y", "S 2005-Y20R", "S 3000-N", "S 3005-Y20R",
  "S 4000-N", "S 4005-Y20R", "S 5000-N", "S 6000-N", "S 7000-N", "S 7500-N", "S 8000-N", "S 8500-N", "S 9000-N",
];

const RAL_RE = /\bRAL\s*(\d{4})\b/i;
const NCS_RE = /\b(?:NCS\s*)?S?\s*(\d{2})(\d{2})-(N|[RGBY])(?:(\d{2})([RGBY]))?\b/i;

// Kod koloru z wpisanego tekstu (np. „RAL 9016 Traffic white”, „ncs s0502-y”) w postaci
// „RAL 9016” / „NCS S 0502-Y”, albo "" gdy brak kodu.
export function lacquerCode(text) {
  const s = String(text || "");
  const r = s.match(RAL_RE);
  if (r) return `RAL ${r[1]}`;
  const n = s.match(NCS_RE);
  if (n) return `NCS S ${n[1]}${n[2]}-${n[3].toUpperCase()}${n[4] ? n[4] + n[5].toUpperCase() : ""}`;
  return "";
}

// NCS -> RGB wg wzoru przybliżającego atlas NCS (port algorytmu z pakietu npm ncs-color, MIT).
function ncsToColor(blackness, chromaticness, hue1, pct) {
  if (hue1 === "N") {
    const v = Math.floor((1 - blackness / 100) * 255);
    return (v << 16) | (v << 8) | v;
  }
  const N = pct;
  const S = 1.05 * blackness - 5.25;
  const C = chromaticness;
  let R = 0, G, B;
  // czerwony
  if (hue1 === "Y" && N <= 60) R = 1;
  else if ((hue1 === "Y" && N > 60) || (hue1 === "R" && N <= 80)) {
    const x = hue1 === "Y" ? N - 60 : N + 40;
    R = (Math.sqrt(14884 - x * x) - 22) / 100;
  } else if ((hue1 === "R" && N > 80) || hue1 === "B") R = 0;
  else if (hue1 === "G") { const x = N - 170; R = (Math.sqrt(33800 - x * x) - 70) / 100; }
  // niebieski
  if (hue1 === "Y" && N <= 80) B = 0;
  else if ((hue1 === "Y" && N > 80) || (hue1 === "R" && N <= 60)) {
    const x = (hue1 === "Y" ? N - 80 : N + 20) + 20.5;
    B = (104 - Math.sqrt(11236 - x * x)) / 100;
  } else if ((hue1 === "R" && N > 60) || (hue1 === "B" && N <= 80)) {
    const x = (hue1 === "R" ? N - 60 : N + 40) - 60;
    B = (Math.sqrt(10000 - x * x) - 10) / 100;
  } else if ((hue1 === "B" && N > 80) || (hue1 === "G" && N <= 40)) {
    const x = (hue1 === "B" ? N - 80 : N + 20) - 131;
    B = (122 - Math.sqrt(19881 - x * x)) / 100;
  } else B = 0;
  // zielony
  if (hue1 === "Y") G = (85 - (17 / 20) * N) / 100;
  else if (hue1 === "R" && N <= 60) G = 0;
  else if (hue1 === "R") { const x = N - 60 + 35; G = (67.5 - Math.sqrt(5776 - x * x)) / 100; }
  else if (hue1 === "B" && N <= 60) { const x = N - 68.5; G = (6.5 + Math.sqrt(7044.5 - x * x)) / 100; }
  else if ((hue1 === "B" && N > 60) || (hue1 === "G" && N <= 60)) G = 0.9;
  else { const x = N - 60; G = (90 - x / 8) / 100; }
  // nasycenie i czerń
  const avg = (R + G + B) / 3;
  const mix = (v) => (avg - v) * (100 - C) / 100 + v;
  const Rc = mix(R), Gc = mix(G), Bc = mix(B);
  const k = (1 / Math.max(Rc, Gc, Bc)) * (100 - S) / 100 * 255;
  const ch = (v) => Math.max(0, Math.min(255, Math.floor(v * k)));
  return (ch(Rc) << 16) | (ch(Gc) << 8) | ch(Bc);
}

// Kolor 0xRRGGBB dla tekstu z kodem RAL / NCS albo null.
export function lacquerColor(text) {
  const code = lacquerCode(text);
  if (!code) return null;
  if (code.startsWith("RAL")) {
    const r = RAL_BY_CODE.get(code.replace(/\s/g, ""));
    return r ? r.color : null;
  }
  const m = code.match(/S (\d{2})(\d{2})-(N|[RGBY])(?:(\d{2})([RGBY]))?$/);
  const blackness = parseInt(m[1], 10), chroma = parseInt(m[2], 10);
  if (blackness + chroma > 100) return null;
  return ncsToColor(blackness, chroma, m[3], m[4] ? parseInt(m[4], 10) : 0);
}

// Podpowiedzi do pola koloru lakieru: „RAL 9016 Traffic white”, „NCS S 0502-Y”.
export function lacquerSuggestions() {
  return [...RAL_CLASSIC.map(([code, name]) => `${code} ${name}`), ...NCS_COMMON.map((c) => `NCS ${c}`)];
}
