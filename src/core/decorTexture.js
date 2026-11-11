// src/core/decorTexture.js
//
// Struktura dekoru w podglądzie 3D: z nazwy dekoru / materiału wynika, czy płyta ma słoje
// drewna, fakturę kamienia, czy zostaje gładka (biele, kolory jednolite, lakier). Sama tekstura
// powstaje w render/decorTextures.js - tu tylko czysty opis (bez Three.js i canvasu).
import { hash, WOOD_WORDS, STONE_WORDS } from "./decorColors.js";
import { lacquerColor } from "./lacquerColors.js";

// Wspólny klucz tekstury dla nazwy dekoru (generowanej i wgranej ze zdjęcia).
export function textureKey(label) {
  return String(label || "").trim().toUpperCase().replace(/^S:/, "");
}

// Opis tekstury dekoru albo null, gdy płyta zostaje gładka (sam kolor):
// { kind: 'wood'|'stone', key, seed, color, roughness, tileU, tileV } - tileU / tileV to rozmiar
// jednego powtórzenia w mm wzdłuż i w poprzek usłojenia.
export function decorTextureSpec(label, color) {
  const s = String(label || "").trim();
  if (!s || color == null) return null;
  if (lacquerColor(s) != null) return null; // lakier RAL / NCS - gładki
  const m = s.match(/(?:^|[\s:(])([WUHF])\s?\d{3,4}\b/i);
  const code = m ? m[1].toUpperCase() : "";
  let kind = null;
  if (code === "H") kind = "wood";
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
