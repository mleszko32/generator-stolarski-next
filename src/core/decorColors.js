// src/core/decorColors.js
//
// Kolor płyty w podglądzie 3D zależny od ustawionego dekoru / materiału - żeby od razu było
// widać, która szafka, panel czy front ma jaki dekor. Kolor nie jest wiernym odwzorowaniem
// dekoru: kod Egger podpowiada rodzinę (W = biele, H = drewno, F = kamień/beton, U = kolory
// jednolite), a w rodzinie odcień wybiera skrót z nazwy, więc różne dekory różnią się kolorem,
// a ten sam dekor ma zawsze ten sam kolor. Czyste funkcje (bez Three.js).
import { moduleKorpusDecor, baseCategory, KORPUS } from "./materialCatalog.js";
import { plinthMaterial } from "./plinthMaterial.js";
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

// Materiał cokołu szafki jako nazwa + grupa legendy (null = cokół domyślny).
function plinthLegendEntry(mod, project) {
  const pm = plinthMaterial(mod, project);
  if (pm.category === "Front") return { group: "Front", label: frontMaterialName(pm.materialId, project), color: frontMaterialColor(pm.materialId, project) };
  const decor = baseCategory(pm.category) === KORPUS && pm.category !== KORPUS ? pm.category.slice(KORPUS.length + 2) : "";
  return { group: "Korpus", label: decor, color: decorColor(decor) };
}

// Legenda kolorów dekorów użytych w projekcie: [{ group: 'Korpus'|'Front', label, color }]
// (color null = kolor domyślny). Pusta, gdy nic nie ma własnego koloru - wtedy legenda niepotrzebna.
// Ta sama nazwa (np. materiał frontów i dekor blendy) to jedna pozycja - w grupie Front.
export function projectDecorLegend(project) {
  if (!project) return [];
  const entries = new Map(); // nazwa (wielkie litery) -> { group, label, color }
  let plainKorpus = false, plainFront = false;
  const add = (group, label, color) => {
    if (color == null || !String(label || "").trim()) {
      if (group === "Front") plainFront = true; else if (group === "Korpus") plainKorpus = true;
      return;
    }
    // szuflady osobno (ten sam dekor co korpus i tak ma być widać przy szufladach)
    const k = (group === "Szuflada" ? "S:" : "") + String(label).trim().toUpperCase();
    const prev = entries.get(k);
    if (!prev || (prev.group === "Korpus" && group === "Front")) entries.set(k, { group, label: String(label).trim(), color });
  };
  const list = (project.pricing && project.pricing.frontMaterials) || [];
  (project.modules || []).forEach((mod) => {
    const d = korpusDecorOf(mod, project);
    add("Korpus", d, decorColor(d));
    if ((mod.elements || []).some((el) => el.typ === "front" && /szuflada/.test(el.subtype || ""))) {
      const sd = projectDecor(project, "Szuflada");
      add("Szuflada", sd, decorColor(sd));
    }
    (mod.elements || []).forEach((el) => {
      if (el.typ === "front") add("Front", frontMaterialName(el.materialId, project), frontMaterialColor(el.materialId, project));
    });
    if (mod.legs && mod.legs.active && mod.legs.plinth) { const e = plinthLegendEntry(mod, project); add(e.group, e.label, e.color); }
  });
  (project.sidePanels || []).forEach((p) => {
    const d = String(p.decor || "").trim();
    if (d) { add(p.kind === "blenda" ? "Front" : "Korpus", d, decorColor(d)); return; }
    if (p.kind === "poziomy") { plainKorpus = true; return; }
    add("Front", frontMaterialName(p.materialId, project), frontMaterialColor(p.materialId, project));
  });
  if (!entries.size) return [];
  const out = [];
  const group = (g, plain, plainLabel) => {
    const items = [...entries.values()].filter((e) => e.group === g).sort((a, b) => a.label.localeCompare(b.label, "pl"));
    if (!items.length) return;
    if (plain) out.push({ group: g, label: plainLabel, color: null });
    items.forEach((e) => out.push(e));
  };
  group("Korpus", plainKorpus, "bez dekoru (z projektu)");
  group("Front", plainFront, (list[0] && list[0].name) || "standard");
  group("Szuflada", false, "");
  return out;
}

// Kolor bryły 3D z jej userData (moduleId / elementId / sidePanelId) i typu ('corpus',
// 'shelf', 'front', 'plinth', 'drawerBox'); null = kolor domyślny materiału.
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
  if (userData.type === "plinth") return type === "plinth" ? plinthLegendEntry(mod, project).color : null; // nóżki bez koloru
  if (type === "front") {
    const el = userData.elementId && (mod.elements || []).find((e) => e.id === userData.elementId);
    return el ? frontMaterialColor(el.materialId, project) : null;
  }
  if (type === "corpus" || type === "shelf") return decorColor(korpusDecorOf(mod, project));
  if (type === "drawerBox") return decorColor(projectDecor(project, "Szuflada"));
  return null;
}
