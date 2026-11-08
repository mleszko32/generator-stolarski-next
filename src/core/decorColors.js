// src/core/decorColors.js
//
// Kolor płyty w podglądzie 3D zależny od ustawionego dekoru / materiału - żeby od razu było
// widać, która szafka, panel czy front ma jaki dekor. Kolor nie jest wiernym odwzorowaniem
// dekoru: kod Egger podpowiada rodzinę (W = biele, H = drewno, F = kamień/beton, U = kolory
// jednolite), a w rodzinie odcień wybiera skrót z nazwy, więc różne dekory różnią się kolorem,
// a ten sam dekor ma zawsze ten sam kolor. Czyste funkcje (bez Three.js).
import { moduleKorpusDecor, baseCategory, KORPUS } from "./materialCatalog.js";
import { plinthMaterial, moduleFrontMaterialId } from "./plinthMaterial.js";
import { dishwasherPlinthModule } from "./dishwasher.js";
import { lacquerColor, lacquerCode } from "./lacquerColors.js";

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
  const lac = lacquerColor(s); // „Lakier RAL 9016” / „NCS S 0502-Y” - odcień z palety
  if (lac != null) return lac;
  const m = s.match(/(?:^|[\s:(])([WUHF])\s?\d{3,4}\b/i);
  const pal = m ? FAMILIES[m[1].toUpperCase()] : OTHER;
  return pal[hash(s.toUpperCase()) % pal.length];
}

// Jasny kolor (biele) - w trybie przezroczystym nie różni się od domyślnego, więc go pomijamy.
export function isLightColor(color) {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.85;
}

// Dekor kategorii ustawiony dla całego projektu (pasek materiałów w Produkcji: Korpus / Plecy / Szuflada).
function projectDecor(project, category) {
  const d = project && project.materials && project.materials.decors && project.materials.decors[category];
  return String(d || "").trim();
}
// Dekor korpusu szafki: jej własny, a bez niego - ustawiony dla projektu.
function korpusDecorOf(mod, project) {
  return moduleKorpusDecor(mod) || projectDecor(project, KORPUS);
}

// Kolor materiału frontu z cennika (project.pricing.frontMaterials) - z nazwy materiału, tak
// samo jak dekor wpisany przy blendzie / panelu, więc ta sama nazwa = ten sam kolor. Tylko
// nietknięty domyślny „Standard” zostaje w kolorze domyślnym (null).
export function frontMaterialColor(materialId, project) {
  const list = (project && project.pricing && project.pricing.frontMaterials) || [];
  const mat = list.find((m) => m.id === materialId) || list[0];
  if (!mat) return null;
  const lac = lacquerColor(mat.color); // kolor lakieru RAL / NCS z cennika - prawdziwy odcień
  if (lac != null) return lac;
  if (mat.id === "default" && mat.name === "Standard") return null;
  return decorColor(mat.name);
}

function frontMaterialName(materialId, project) {
  const list = (project && project.pricing && project.pricing.frontMaterials) || [];
  const mat = list.find((m) => m.id === materialId) || list[0];
  if (!mat) return "";
  const code = lacquerCode(mat.color);
  return code ? `${mat.name} ${code}` : mat.name;
}

// Materiał bryły 3D jako pozycja legendy: { key, group: 'Korpus'|'Front'|'Szuflada', label, color }
// (color null = kolor domyślny). Ta sama nazwa = ten sam klucz (np. materiał frontów i dekor
// blendy), szuflady osobno. Klucz łączy legendę z bryłami (tryb „materiały”, podświetlanie).
const PLAIN_LABEL = { Korpus: "bez dekoru (z projektu)", Front: "standard", Szuflada: "bez dekoru" };
function entry(group, label, color) {
  const l = String(label || "").trim();
  if (!l) return { key: "~" + group.toUpperCase(), group, label: PLAIN_LABEL[group], color: null };
  return { key: (group === "Szuflada" ? "S:" : "") + l.toUpperCase(), group, label: l, color: color == null ? null : color };
}
const frontEntry = (materialId, project) => entry("Front", frontMaterialName(materialId, project), frontMaterialColor(materialId, project));
const korpusEntry = (decor) => entry("Korpus", decor, decorColor(decor));
const drawerEntry = (project) => { const d = projectDecor(project, "Szuflada"); return entry("Szuflada", d, decorColor(d)); };

function plinthEntry(mod, project) {
  const pm = plinthMaterial(mod, project);
  if (pm.category === "Front") return frontEntry(pm.materialId, project);
  return korpusEntry(baseCategory(pm.category) === KORPUS && pm.category !== KORPUS ? pm.category.slice(KORPUS.length + 2) : "");
}

function panelEntry(panel, type, project) {
  // listwa mocująca blendy - płyta korpusu w dekorze szafki obok (flangeDecor)
  if (panel.kind === "blenda" && type !== "front") return korpusEntry(String(panel.flangeDecor || "").trim());
  // zmywarka: front z cennika frontów, cokół jak cokół szafki, wieniec w dekorze (pusty = korpus projektu)
  if (panel.kind === "zmywarka") {
    if (type === "front") return frontEntry(panel.materialId, project);
    if (type === "plinth") return plinthEntry(dishwasherPlinthModule(panel), project);
    return korpusEntry(String(panel.decor || "").trim());
  }
  const decor = String(panel.decor || "").trim();
  if (decor) return entry(panel.kind === "blenda" ? "Front" : "Korpus", decor, decorColor(decor));
  return type === "front" ? frontEntry(panel.materialId, project) : korpusEntry("");
}

// Materiał bryły z jej userData (moduleId / elementId / sidePanelId) i typu ('corpus', 'shelf',
// 'front', 'plinth', 'drawerBox'); null = bryła bez materiału z legendy (nóżki, plecy HDF…).
export function partMaterial(type, userData, project) {
  if (!userData || !project) return null;
  if (userData.sidePanelId) {
    const panel = (project.sidePanels || []).find((p) => p.id === userData.sidePanelId);
    return panel ? panelEntry(panel, type, project) : null;
  }
  const mod = userData.moduleId && (project.modules || []).find((m) => m.id === userData.moduleId);
  if (!mod) return null;
  if (userData.type === "plinth") return type === "plinth" ? plinthEntry(mod, project) : null; // nóżki bez materiału
  if (type === "front") {
    const el = userData.elementId && (mod.elements || []).find((e) => e.id === userData.elementId);
    return frontEntry(el ? el.materialId : moduleFrontMaterialId(mod, project), project);
  }
  if (type === "corpus" || type === "shelf") return korpusEntry(korpusDecorOf(mod, project));
  if (type === "drawerBox") return drawerEntry(project);
  return null;
}

// Kolor bryły 3D (null = kolor domyślny materiału).
export function partColor(type, userData, project) {
  const e = partMaterial(type, userData, project);
  return e ? e.color : null;
}

// Legenda materiałów projektu: [{ key, group, label, color }]. Domyślnie tylko grupy, w których
// coś ma własny kolor (z pozycją domyślną obok); { all: true } - wszystkie materiały (tryb
// „Kolory: materiały”). Pusta, gdy nie ma czego pokazać.
export function projectDecorLegend(project, opts = {}) {
  if (!project) return [];
  const entries = new Map();
  const add = (e) => {
    const prev = entries.get(e.key);
    if (!prev || (prev.group === "Korpus" && e.group === "Front")) entries.set(e.key, e);
  };
  (project.modules || []).forEach((mod) => {
    add(korpusEntry(korpusDecorOf(mod, project)));
    (mod.elements || []).forEach((el) => {
      if (el.typ !== "front") return;
      add(frontEntry(el.materialId, project));
      if (/szuflada/.test(el.subtype || "")) add(drawerEntry(project));
    });
    if (mod.legs && mod.legs.active && mod.legs.plinth) add(plinthEntry(mod, project));
  });
  (project.sidePanels || []).forEach((p) => {
    add(panelEntry(p, p.kind === "poziomy" ? "corpus" : "front", project));
    if (p.kind === "zmywarka" && p.topBoard !== false) add(panelEntry(p, "corpus", project));
  });
  const out = [];
  ["Korpus", "Front", "Szuflada"].forEach((g) => {
    const items = [...entries.values()].filter((e) => e.group === g);
    if (!opts.all && !items.some((e) => e.color != null)) return;
    items.sort((a, b) => (a.key.startsWith("~") ? -1 : b.key.startsWith("~") ? 1 : a.label.localeCompare(b.label, "pl")));
    out.push(...items);
  });
  return out;
}

// Kontrastowa paleta trybu „Kolory: materiały” - kolejne materiały legendy, po kolei.
export const MATERIAL_PALETTE = [0x2563eb, 0x16a34a, 0xea580c, 0x9333ea, 0xdc2626, 0x0891b2, 0xca8a04, 0xdb2777, 0x4b5563, 0x65a30d, 0x7c3aed, 0x0d9488];
export function materialPaletteMap(legend) {
  return new Map(legend.map((e, i) => [e.key, MATERIAL_PALETTE[i % MATERIAL_PALETTE.length]]));
}
