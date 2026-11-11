// src/core/swissKrono.js
//
// Rozpoznanie dekoru Swiss Krono w nazwie materiału („Swiss Krono D3025 OW Dąb Sonoma”):
// kod, typ (D drewno, F fantazyjny, U unikolor) i kolor próbki z listy producenta. Wymaga
// słów „Swiss Krono” w nazwie - same kody U### pokrywają się z kodami Egger. Czyste.
import { SWISS_KRONO_DECORS } from "./data/swissKronoDecors.js";

const BY_CODE = new Map();
for (const d of SWISS_KRONO_DECORS) if (!BY_CODE.has(d.code)) BY_CODE.set(d.code, d);

// { code, type, name, color (liczba 0xRRGGBB) } albo null, gdy to nie dekor Swiss Krono z listy.
export function swissKronoDecor(label) {
  const s = String(label || "").toUpperCase();
  if (!/SWISS\s*KRONO/.test(s)) return null;
  const m = s.match(/(?:^|[\s:(])([DUK]\d{3,5})\b/);
  const d = m && BY_CODE.get(m[1]);
  return d ? { code: d.code, type: d.type, name: d.name, color: parseInt(d.color.slice(1), 16) } : null;
}
