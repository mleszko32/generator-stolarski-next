// src/core/decorColors.js
//
// Kolor płyty w podglądzie 3D zależny od ustawionego dekoru / materiału - żeby od razu było
// widać, która szafka, panel czy front ma jaki dekor. Kolor nie jest wiernym odwzorowaniem
// dekoru: kod Egger podpowiada rodzinę (W = biele, H = drewno, F = kamień/beton, U = kolory
// jednolite), a w rodzinie odcień wybiera skrót z nazwy, więc różne dekory różnią się kolorem,
// a ten sam dekor ma zawsze ten sam kolor. Czyste funkcje (bez Three.js).
import { moduleKorpusDecor } from "./materialCatalog.js";

const FAMILIES = {
  W: [0xfaf9f6, 0xf3efe6, 0xeceae4, 0xf6f1e7],
  H: [0xc8a27a, 0xa47851, 0xd9bc92, 0x8a5f3c, 0xb88d63, 0x6f4a30, 0xe2c9a4],
  F: [0x9c9a95, 0x7d7b77, 0xb7b3ab, 0x5f5e5b, 0xa89f92],
  U: [0x8fa6a0, 0xb3a28e, 0x6f7f95, 0xa6896f, 0x7e8f6c, 0x9a7f8f, 0x5d6b78, 0xc2b49a, 0x8b8f93],
};
// dekor bez rozpoznanego kodu - wyraźnie różne, stonowane barwy
const OTHER = [0x7fa7c9, 0xc99a7f, 0x8fc19a, 0xc4a9d6, 0xd6c27f, 0x7fc4c2, 0xd68f8f, 0xa3a3d6];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Kolor (liczba 0xRRGGBB) dla nazwy dekoru albo null, gdy nazwa pusta.
export function decorColor(name) {
  const s = String(name || "").trim();
  if (!s) return null;
  const m = s.match(/(?:^|[\s:(])([WUHF])\s?\d{3,4}\b/i);
  const pal = m ? FAMILIES[m[1].toUpperCase()] : OTHER;
  return pal[hash(s.toUpperCase()) % pal.length];
}

// Jasny kolor (biele) - w trybie przezroczystym nie różni się od domyślnego, więc go pomijamy.
export function isLightColor(color) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.85;
}

// Kolor materiału frontu z cennika (project.pricing.frontMaterials). Pojedynczy materiał
// bez kodu dekoru zostaje w kolorze domyślnym (null), tak samo pierwsza pozycja cennika -
// to „zwykłe” fronty; pozostałe dostają własny kolor.
export function frontMaterialColor(materialId, project) {
  const list = (project && project.pricing && project.pricing.frontMaterials) || [];
  if (!list.length) return null;
  const idx = Math.max(0, list.findIndex((m) => m.id === materialId));
  const mat = list[idx];
  const byCode = /(?:^|[\s:(])[WUHF]\s?\d{3,4}\b/i.test(mat.name || "");
  if (byCode) return decorColor(mat.name);
  return idx === 0 ? null : decorColor(`${mat.name}#${mat.id}`);
}

// Legenda kolorów dekorów użytych w projekcie: [{ group: 'Korpus'|'Front', label, color }]
// (color null = kolor domyślny). Pusta, gdy nic nie ma własnego koloru - wtedy legenda niepotrzebna.
export function projectDecorLegend(project) {
  if (!project) return [];
  const korpus = new Map(), front = new Map();
  let plainKorpus = false, plainFront = false;
  (project.modules || []).forEach((mod) => {
    const d = moduleKorpusDecor(mod);
    if (d) korpus.set(d.toUpperCase(), d); else plainKorpus = true;
    (mod.elements || []).forEach((el) => {
      if (el.typ !== "front") return;
      const c = frontMaterialColor(el.materialId, project);
      const list = project.pricing?.frontMaterials || [];
      const mat = list.find((m) => m.id === el.materialId) || list[0];
      if (c != null && mat) front.set(`m:${mat.id}`, { label: mat.name, color: c });
      else plainFront = true;
    });
  });
  (project.sidePanels || []).forEach((p) => {
    const d = String(p.decor || "").trim();
    if (d) { korpus.set(d.toUpperCase(), d); return; }
    if (p.kind === "poziomy") { plainKorpus = true; return; }
    const c = frontMaterialColor(p.materialId, project);
    const mat = (project.pricing?.frontMaterials || []).find((m) => m.id === p.materialId);
    if (c != null && mat) front.set(`m:${mat.id}`, { label: mat.name, color: c });
    else plainFront = true;
  });
  const out = [];
  const push = (group, map, plain, plainLabel) => {
    const items = [...map.values()].map((v) => (typeof v === "string" ? { label: v, color: decorColor(v) } : v));
    if (!items.length) return;
    if (plain) out.push({ group, label: plainLabel, color: null });
    items.sort((a, b) => a.label.localeCompare(b.label, "pl")).forEach((v) => out.push({ group, ...v }));
  };
  push("Korpus", korpus, plainKorpus, "bez dekoru (z projektu)");
  push("Front", front, plainFront, (project.pricing?.frontMaterials || [])[0]?.name || "standard");
  return out;
}

// Kolor bryły 3D z jej userData (moduleId / elementId / sidePanelId) i typu ('corpus',
// 'shelf', 'front'); null = kolor domyślny materiału.
export function partColor(type, userData, project) {
  if (!userData || !project) return null;
  if (userData.sidePanelId) {
    const panel = (project.sidePanels || []).find((p) => p.id === userData.sidePanelId);
    if (!panel) return null;
    const decor = String(panel.decor || "").trim();
    if (decor) return decorColor(decor);
    return type === "front" ? frontMaterialColor(panel.materialId, project) : null;
  }
  const mod = userData.moduleId && (project.modules || []).find((m) => m.id === userData.moduleId);
  if (!mod) return null;
  if (type === "front") {
    const el = userData.elementId && (mod.elements || []).find((e) => e.id === userData.elementId);
    return el ? frontMaterialColor(el.materialId, project) : null;
  }
  if (type === "corpus" || type === "shelf") return decorColor(moduleKorpusDecor(mod));
  return null;
}
