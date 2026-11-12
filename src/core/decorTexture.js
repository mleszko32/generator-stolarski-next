// src/core/decorTexture.js
//
// Struktura dekoru w podglądzie 3D: z nazwy dekoru / materiału wynika, czy płyta ma słoje
// drewna, fakturę kamienia, czy zostaje gładka (biele, kolory jednolite, lakier). Sama tekstura
// powstaje w render/decorTextures.js - tu tylko czysty opis (bez Three.js i canvasu).
import { hash, WOOD_WORDS, STONE_WORDS } from "./decorColors.js";
import { lacquerColor } from "./lacquerColors.js";
import { swissKronoDecor } from "./swissKrono.js";

// nazwy frontów i płyt z rowkami (frez ryflowany); „lamelowy” zostaje wg drewna / koloru z nazwy
export const RIBBED_WORDS = /ryfl|rowkowan/i;

// Wspólny klucz tekstury dla nazwy dekoru (generowanej i wgranej ze zdjęcia). Dekor z kodem
// Egger ma klucz = sam kod („H1180”), więc jedno zdjęcie obsługuje wszystkie grubości i
// struktury tej płyty („H1180 ST37 18mm”, „Egger H1180 ST37 Dąb Halifax 19mm”).
export function textureKey(label) {
  const s = String(label || "").trim().toUpperCase().replace(/^[SB]:/, "");
  const sk = swissKronoDecor(s); // Swiss Krono: „SK-D3025” - jedno zdjęcie na wszystkie struktury
  if (sk) return "SK-" + sk.code;
  const m =s.match(/(?:^|[\s:(])([WUHF])\s?(\d{3,4})\b/);
  return m ? m[1] + m[2] : s;
}

// Opis tekstury dekoru albo null, gdy płyta zostaje gładka (sam kolor):
// { kind: 'wood'|'stone', key, seed, color, roughness, tileU, tileV } - tileU / tileV to rozmiar
// jednego powtórzenia w mm wzdłuż i w poprzek usłojenia.
export function decorTextureSpec(label, color) {
  const s = String(label || "").trim();
  if (!s || color == null) return null;
  // płyta ryflowana / lamelowa (też lakierowana): pionowe rowki co 20 mm, kolor z materiału
  if (RIBBED_WORDS.test(s)) return { kind: "ribbed", key: textureKey(s), seed: hash(s), color, roughness: 0.5, tileU: 200, tileV: 40, ribs: 2 };
  if (lacquerColor(s) != null) return null; // lakier RAL / NCS - gładki
  const m = s.match(/(?:^|[\s:(])([WUHF])\s?\d{3,4}\b/i);
  const code = m ? m[1].toUpperCase() : "";
  let kind = null;
  const sk = swissKronoDecor(s); // typ z listy producenta: D drewno, F kamień / beton (po nazwie), U gładki
  if (sk) kind = sk.type === "D" ? "wood" : sk.type === "F" && STONE_WORDS.test(s) ? "stone" : null;
  else if (code === "H") kind = "wood";
  else if (code === "F") kind = "stone";
  else if (!code && WOOD_WORDS.test(s)) kind = "wood";
  else if (!code && STONE_WORDS.test(s)) kind = "stone";
  if (!kind) return null;
  const key = textureKey(s);
  return kind === "wood"
    ? { kind, key, seed: hash(key), color, roughness: 0.6, tileU: 1400, tileV: 520 }
    : { kind, key, seed: hash(key), color, roughness: 0.75, tileU: 900, tileV: 900 };
}

// Zdjęcie próbki dekoru wgrane przez użytkownika (kolekcja decorTextures w chmurze) zastępuje
// teksturę generowaną. Rekord przychodzi z zewnątrz, więc przechodzi przez normalizePhoto:
// { key, name, dataUrl, widthMm, grain } albo null, gdy to nie jest obraz.
// widthMm - rzeczywista szerokość tego, co widać na zdjęciu; grain - kierunek słojów NA ZDJĘCIU
// ('v' pionowo, 'h' poziomo).
const PHOTO_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const PHOTO_MAX_CHARS = 900000; // dokument Firestore ma limit 1 MB
export function normalizePhoto(rec) {
  if (!rec || typeof rec.dataUrl !== "string" || rec.dataUrl.length > PHOTO_MAX_CHARS || !PHOTO_URL.test(rec.dataUrl)) return null;
  const key = textureKey(rec.key || rec.name);
  if (!key) return null;
  const w = Number(rec.widthMm);
  return {
    key,
    name: String(rec.name || key),
    dataUrl: rec.dataUrl,
    widthMm: Number.isFinite(w) ? Math.min(5000, Math.max(50, Math.round(w))) : 600,
    grain: rec.grain === "h" ? "h" : "v",
  };
}

// Rozmiar powtórzenia tekstury ze zdjęcia w mm: tileU wzdłuż słojów, tileV w poprzek
// (zdjęcie ze słojami pionowo jest obracane, więc wzdłuż słojów biegnie jego wysokość).
export function photoTile(widthMm, imgW, imgH, grain) {
  const heightMm = widthMm * imgH / imgW;
  return grain === "h" ? { tileU: widthMm, tileV: heightMm } : { tileU: heightMm, tileV: widthMm };
}

// Id dokumentu Firestore dla klucza tekstury (bez „/” i kropek, których id nie przyjmuje).
export function photoDocId(key) {
  return encodeURIComponent(textureKey(key)).replace(/\./g, "%2E");
}

// Oś usłojenia płyty o wymiarach w × h × d (osie x, y, z): front i płyty pionowe (bok,
// przegroda) - pionowo, pozostałe - wzdłuż dłuższego z dwóch wymiarów poza grubością.
export function grainAxis(type, w, h, d) {
  const dims = { x: w, y: h, z: d };
  const thick = Object.keys(dims).reduce((a, b) => (dims[b] < dims[a] ? b : a));
  if (thick !== "y" && (type === "front" || thick === "x")) return "y";
  const [a, b] = Object.keys(dims).filter((k) => k !== thick);
  return dims[a] >= dims[b] ? a : b;
}
