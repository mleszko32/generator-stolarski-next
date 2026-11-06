// src/core/materialCatalog.js
//
// Katalog dekorów płyt różnych producentów i podstawianie nazwy materiału w liście formatek.
// Wybór: project.materials.decors = { Korpus, Plecy, Szuflada } (wolny tekst, zwykle pozycja z
// katalogu); fronty biorą nazwę z cennika materiałów frontów (front.materialId), jak w kosztorysie.
// Własne pozycje katalogu: project.materialCatalog = [{ producer, code, name }].

import { EGGER_SAS_DECORS } from "./data/eggerSasDecors.js";

// Wbudowany katalog: płyty Egger z cennika SAS + HDF; inne dekory dopisuje się jako własne pozycje.
export const BUILTIN_DECORS = Object.freeze([
  ...EGGER_SAS_DECORS.map((d) => ({ producer: "Egger", code: "", name: d.name })),
  { producer: "", code: "", name: "HDF biały 3 mm" },
]);

export const DECOR_CATEGORIES = ["Korpus", "Plecy", "Szuflada"];

// Napis pozycji katalogu: „Egger W1000 ST9 Biały premium”.
export function decorLabel(d) {
  return [d && d.producer, d && d.code, d && d.name].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
}

// Cały katalog (wbudowany + własny projektu) jako napisy, bez powtórzeń.
export function catalogLabels(project) {
  const own = Array.isArray(project && project.materialCatalog) ? project.materialCatalog : [];
  return [...new Set([...BUILTIN_DECORS, ...own].map(decorLabel).filter(Boolean))];
}

// Dopisuje własną pozycję do katalogu projektu (pomija puste i już istniejące).
export function addCatalogDecor(project, decor) {
  const label = decorLabel(decor);
  if (!label || catalogLabels(project).includes(label)) return false;
  if (!Array.isArray(project.materialCatalog)) project.materialCatalog = [];
  project.materialCatalog.push({ producer: String(decor.producer || "").trim(), code: String(decor.code || "").trim(), name: String(decor.name || "").trim() });
  return true;
}

// --- Dekor korpusu per szafka ---
// Szafka z mod.materials.korpusDecor (a panel poziomy / bok dokładany z wypełnionym „Dekor”)
// daje formatki kategorii „Korpus: <dekor>” zamiast „Korpus” - w zbiorczej liście projektu
// (engine/cabinet.js: collectProjectParts), więc kosztorys, rozkrój i CSV rozdzielają je
// same. Pusty dekor = zwykły „Korpus” projektu.
export const KORPUS = "Korpus";

export function korpusCategory(decor) {
  const d = String(decor || "").trim();
  return d ? `${KORPUS}: ${d}` : KORPUS;
}

// Kategoria bazowa do kolejności i reguł („Korpus: U740 PM” -> „Korpus”).
export function baseCategory(category) {
  const c = String(category || "");
  return c.startsWith(`${KORPUS}: `) ? KORPUS : c;
}

export function moduleKorpusDecor(mod) {
  return String((mod && mod.materials && mod.materials.korpusDecor) || "").trim();
}

// Nazwa materiału formatki do listy: front - pozycja cennika frontów (brak/usunięta = pierwsza,
// jak w kosztorysie), pozostałe - wybrany dekor kategorii; bez wyboru sama kategoria.
// Płyta, z której tnie się formatki materiału frontu: pole board z cennika, a dla lakieru
// bez wpisu - MDF dwustronnie laminowany 18 mm z bazy SAS (lakieruje się MDF).
export const LACQUER_BOARD = "Egger W908/W908 SM/SM-MB Biały bazowy 18mm 2800x2070 Dwustronna E1E05 TSCA";
export function frontMaterialBoard(mat) {
  if (!mat) return "";
  const own = String(mat.board || "").trim();
  if (own) return own;
  return /lakier/i.test(String(mat.name || "")) ? LACQUER_BOARD : "";
}

export function partMaterialLabel(part, project) {
  const category = (part && part.category) || "";
  if (category === "Front") {
    const list = (project && project.pricing && project.pricing.frontMaterials) || [];
    const m = list.find((x) => x.id === part.materialId) || list[0];
    if (!m || !m.name) return category;
    const board = frontMaterialBoard(m);
    const color = String(m.color || "").trim();
    const name = color ? `${m.name} ${color}` : m.name;
    return board ? `Front: ${name} (${board})` : `Front: ${name}`;
  }
  const decor = project && project.materials && project.materials.decors && project.materials.decors[category];
  return decor && String(decor).trim() ? `${category}: ${String(decor).trim()}` : category;
}

// Materiał frontów po nazwie (wpisanej albo wybranej z bazy dekorów) dla wszystkich frontów
// podanych szafek: pozycja cennika frontów o tej nazwie (bez względu na wielkość liter) albo
// nowa z ceną 0 do uzupełnienia w Kosztorysie. Zwraca id materiału albo null (pusta nazwa).
export function assignFrontMaterialByName(mods, name, project) {
  const n = String(name || "").trim();
  if (!n || !project) return null;
  if (!project.pricing) project.pricing = {};
  if (!Array.isArray(project.pricing.frontMaterials)) project.pricing.frontMaterials = [];
  const list = project.pricing.frontMaterials;
  let mat = list.find((m) => String(m.name || "").trim().toLowerCase() === n.toLowerCase());
  if (!mat) {
    mat = { id: "mat-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: n, pricePerM2: 0 };
    list.push(mat);
  }
  (mods || []).forEach((mod) => (mod.elements || []).forEach((el) => {
    if (el.typ === "front") el.materialId = mat.id;
  }));
  return mat.id;
}
