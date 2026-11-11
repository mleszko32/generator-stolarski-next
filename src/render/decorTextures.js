// src/render/decorTextures.js
//
// Tekstury dekorów podglądu 3D (słoje drewna, faktura kamienia) rysowane na canvasie 2D z opisu
// z core/decorTexture.js. Jedna tekstura na dekor, z cache - współdzielona między przebudowami
// sceny (userData.shared, disposeObject jej nie zwalnia). Słoje biegną wzdłuż osi U tekstury;
// UV płyt są w mm (grainBoxGeometry), a skalę daje texture.repeat.
import * as THREE from 'three';
import { decorTextureSpec, textureKey, normalizePhoto, photoTile, PHOTO_MAX_CHARS } from '../core/decorTexture.js';

const SIZE = 512;
const TAU = Math.PI * 2;
const cache = new Map();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wszystkie częstotliwości są całkowite, a szum zawijany - tekstura powtarza się bez szwu.
function woodShade(rand) {
  // Spokojny rysunek jak na płycie laminowanej: gęste, prawie proste włókna (co ok. 1-3 mm),
  // delikatne słoje co kilka cm i szerokie, ledwo widoczne pasy odcienia.
  const rings = 20 + Math.floor(rand() * 10);
  const f1 = 1 + Math.floor(rand() * 2), f2 = 2 + Math.floor(rand() * 2);
  const p = [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU];
  const smoothed = (passes) => {
    let a = Float32Array.from({ length: SIZE }, () => rand());
    for (let pass = 0; pass < passes; pass++) {
      a = a.map((v, i) => (a[(i + SIZE - 1) % SIZE] + 2 * v + a[(i + 1) % SIZE]) / 4);
    }
    return a;
  };
  const fine = smoothed(1), coarse = smoothed(12);
  const row = (a, v) => a[((Math.round(v) % SIZE) + SIZE) % SIZE];
  return (x, y) => {
    const wy = y + 4 * Math.sin(TAU * x * f1 / SIZE + p[0]) + 1.5 * Math.sin(TAU * (x * f2 + y) / SIZE + p[1]);
    const ring = 0.5 + 0.5 * Math.sin(TAU * wy * rings / SIZE + p[2]);
    const band = 0.5 + 0.5 * Math.sin(TAU * wy / SIZE + p[3]);
    return 1.04 - 0.05 * ring * ring - 0.05 * band
      - 0.2 * (row(fine, wy) - 0.5) - 0.5 * (row(coarse, wy) - 0.5) + 0.03 * (rand() - 0.5);
  };
}

function stoneShade(rand) {
  const octaves = [4, 8, 16, 32, 64].map((n) => ({ n, g: Float32Array.from({ length: n * n }, () => rand()) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = ({ n, g }, x, y) => {
    const fx = x / SIZE * n, fy = y / SIZE * n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const at = (i, j) => g[((j % n) * n) + (i % n)];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
  return (x, y) => {
    let v = 0, amp = 0.5;
    for (const o of octaves) { v += amp * sample(o, x, y); amp /= 2; }
    return 1 + 0.26 * (v - 0.48) + 0.05 * (rand() - 0.5);
  };
}

function buildTexture(spec) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const rand = rng(spec.seed);
  const shade = spec.kind === 'wood' ? woodShade(rand) : stoneShade(rand);
  const r = (spec.color >> 16) & 255, g = (spec.color >> 8) & 255, b = spec.color & 255;
  for (let y = 0, i = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i += 4) {
      const s = shade(x, y);
      img.data[i] = Math.min(255, r * s);
      img.data[i + 1] = Math.min(255, g * s);
      img.data[i + 2] = Math.min(255, b * s);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / spec.tileU, 1 / spec.tileV);
  tex.userData.shared = true;
  tex.userData.roughness = spec.roughness;
  return tex;
}

// Zdjęcia próbek dekorów wgrane przez użytkownika: klucz tekstury -> { data, texture }.
// Zastępują teksturę generowaną (także dla dekorów gładkich).
const photos = new Map();

export function getDecorPhoto(key) {
  const p = photos.get(textureKey(key));
  return p ? p.data : null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Ustawia (rec) albo usuwa (null) zdjęcie dekoru. Zwraca true, gdy zdjęcie zostało przyjęte.
// Stara tekstura zostaje w GPU, dopóki używa jej bieżąca scena - po przebudowie nikt jej nie trzyma.
export async function setDecorPhoto(key, rec) {
  const k = textureKey(key);
  const data = rec ? normalizePhoto({ ...rec, key: k }) : null;
  if (!data) { photos.delete(k); return false; }
  let img;
  try { img = await loadImage(data.dataUrl); } catch (e) { return false; }
  const vertical = data.grain === 'v'; // obracamy, żeby słoje biegły wzdłuż U
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? img.height : img.width;
  canvas.height = vertical ? img.width : img.height;
  const ctx = canvas.getContext('2d');
  if (vertical) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
  ctx.drawImage(img, 0, 0);
  const tile = photoTile(data.widthMm, img.width, img.height, data.grain);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(1 / tile.tileU, 1 / tile.tileV);
  tex.userData.shared = true;
  tex.userData.roughness = 0.6;
  photos.set(k, { data, texture: tex });
  return true;
}

// Wczytuje listę zdjęć z chmury; zwraca liczbę przyjętych.
export async function loadDecorPhotos(list) {
  const ok = await Promise.all((list || []).map((rec) => setDecorPhoto(rec && (rec.key || rec.name), rec)));
  return ok.filter(Boolean).length;
}

// Plik obrazu -> JPEG jako data URL, zmniejszony tak, żeby zmieścił się w dokumencie Firestore.
export async function photoFileToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    for (const [max, quality] of [[1024, 0.82], [768, 0.75], [512, 0.7]]) {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= PHOTO_MAX_CHARS) return dataUrl;
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Tekstura dekoru o danej nazwie i kolorze albo null, gdy dekor jest gładki i nie ma zdjęcia.
export function decorTextureFor(label, color) {
  const photo = photos.get(textureKey(label));
  if (photo) return photo.texture;
  const spec = decorTextureSpec(label, color);
  if (!spec) return null;
  const key = spec.key + '|' + spec.color;
  let tex = cache.get(key);
  if (!tex) { tex = buildTexture(spec); cache.set(key, tex); }
  return tex;
}

// Prostopadłościan z UV w mm: U wzdłuż osi usłojenia (axis), V w poprzek. Ścianki czołowe
// (prostopadłe do słojów) biorą dwie pozostałe osie.
const AXES = ['x', 'y', 'z'];
export function grainBoxGeometry(w, h, d, axis) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const g = AXES.indexOf(axis);
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const face = n.indexOf(Math.max(...n));
    const inPlane = [0, 1, 2].filter((k) => k !== face);
    const u = inPlane.includes(g) ? g : inPlane[0];
    const v = inPlane.find((k) => k !== u);
    uv.setXY(i, p[u], p[v]);
  }
  uv.needsUpdate = true;
  return geo;
}
