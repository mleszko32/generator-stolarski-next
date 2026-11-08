// src/core/assistantApi.js
//
// „Pilot” do aplikacji dla Claude'a (Claude Code / Claude w Chrome): proste, nazwane
// operacje na projekcie zamiast grzebania w `state` i szukania w kodzie, jak coś zmienić.
// Czyste funkcje na `state` (z testami); w przeglądarce wystawia je `ui/assistantBridge.js`
// jako `window.gsn` i po każdej zmianie woła standardowe odświeżenia (Ctrl+Z, autozapis).
//
// Wnęki adresujemy ścieżką w drzewie BSP wnętrza (core/zoneTree.js): "" = całe wnętrze,
// potem litery a/b. Przy podziale półką (oś 'h') a = dół, b = góra; przy przegrodzie
// (oś 'v') a = lewa, b = prawa. Np. "ba" = góra całości, a w niej lewa kolumna.
import { setModuleKorpusDecor, refitInterior } from "./korpusDecorChange.js";
import { state, addSidePanel } from "./state.js";
import {
  buildZoneTree, splitZoneHorizontal, splitZoneVertical, addEvenShelves,
  assignFront, removeSplit, moveSplit,
} from "./zoneTree.js";
import { recalculateLayout } from "./layout.js";
import { validateProject } from "./validate.js";
import { round1 } from "../utils/math.js";

const FRONT_TYPES = ["drzwi", "drzwi-lp", "szuflada", "szuflada-wewnetrzna"];

// Szafka po id, dokładnej nazwie albo jednoznacznym fragmencie nazwy (bez wielkości liter).
export function findModule(ref, project = state.project) {
  const mods = project.modules || [];
  if (ref && typeof ref === "object" && ref.id) ref = ref.id;
  const key = String(ref ?? "").trim();
  const byId = mods.find((m) => m.id === key);
  if (byId) return byId;
  const low = key.toLowerCase();
  const exact = mods.filter((m) => String(m.name || "").toLowerCase() === low);
  if (exact.length === 1) return exact[0];
  const part = mods.filter((m) => String(m.name || "").toLowerCase().includes(low));
  if (part.length === 1) return part[0];
  const names = (part.length ? part : mods).map((m) => `„${m.name}”`).join(", ");
  throw new Error(part.length > 1
    ? `Nazwa „${key}” pasuje do kilku szafek: ${names}. Podaj dokładniej.`
    : `Nie ma szafki „${key}”. Szafki w projekcie: ${names || "(brak)"}.`);
}

const dims = (m) => ({
  w: Number(m.dimensions?.width) || 0,
  h: Number(m.dimensions?.height) || 0,
  d: Number(m.dimensions?.depth) || 0,
});

// Krótki spis projektu: szafki z wymiarami, położeniem i tym, co mają w środku.
export function projectOverview(project = state.project) {
  return {
    name: project.name || "",
    room: project.room,
    modules: (project.modules || []).map((m) => {
      const els = m.elements || [];
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        ...dims(m),
        x: Number(m.position?.x) || 0,
        y: Number(m.position?.y) || 0,
        z: Number(m.position?.z) || 0,
        rotation: Number(m.rotation) || 0,
        legs: m.legs?.active ? Number(m.legs.height) || 0 : 0,
        shelves: els.filter((e) => e.typ === "poziom").length,
        dividers: els.filter((e) => e.typ === "pion").length,
        fronts: els.filter((e) => e.typ === "front").map((e) => e.subtype),
      };
    }),
    sidePanels: (project.sidePanels || []).map((p) => ({ id: p.id, name: p.name, kind: p.kind || "bok", ...dims(p) })),
  };
}

function walkZones(node, path, out) {
  const r = node.rect;
  const item = {
    path,
    kind: node.type,
    x: round1(r.minX), y: round1(r.minY),
    w: round1(r.maxX - r.minX), h: round1(r.maxY - r.minY),
    fronts: node.fronts.map((f) => f.subtype),
  };
  if (node.type === "split") {
    const d = node.divider;
    item.divider = {
      kind: node.axis === "h" ? "półka" : "przegroda",
      pos: round1(node.axis === "h" ? d.y : d.x),
      structural: !!d.isStructural,
    };
    out.push(item);
    walkZones(node.a, path + "a", out);
    walkZones(node.b, path + "b", out);
  } else {
    out.push(item);
  }
  return out;
}

// Wszystkie wnęki szafki (płasko, w kolejności drzewa) w mm od lewego dolnego
// narożnika korpusu (te same współrzędne co el.x / el.y elementów).
export function listZones(mod) {
  if (mod.type === "corner_cabinet") throw new Error("Szafka narożna ma wnętrze w ramionach — edytuj ją w oknie szafki narożnej.");
  return walkZones(buildZoneTree(mod), "", []);
}

export function zoneAt(mod, path = "") {
  let node = buildZoneTree(mod);
  for (const ch of String(path)) {
    if (node.type !== "split" || (ch !== "a" && ch !== "b")) {
      throw new Error(`Nie ma wnęki „${path}” — sprawdź listę wnęk (zones).`);
    }
    node = node[ch];
  }
  return node;
}

// Dzieli wnękę półką (axis 'h') albo przegrodą (axis 'v'); `at` = pozycja dzielnika
// (y spodu półki / x lewej krawędzi przegrody), bez niej na środku.
export function splitZone(mod, path, axis = "h", at) {
  const node = zoneAt(mod, path);
  if (node.type !== "leaf") throw new Error(`Wnęka „${path}” jest już podzielona — podziel jedną z jej części (${path}a / ${path}b).`);
  const el = axis === "v" ? splitZoneVertical(mod, node) : splitZoneHorizontal(mod, node);
  if (at !== undefined && at !== null) moveSplit(mod, zoneAt(mod, path), Number(at));
  recalculateLayout(mod);
  return el;
}

export function addShelves(mod, path, count) {
  const node = zoneAt(mod, path);
  if (node.type !== "leaf") throw new Error(`Wnęka „${path}” jest już podzielona — półki dodaje się do pustej wnęki.`);
  const shelves = addEvenShelves(mod, node, Math.max(1, parseInt(count, 10) || 1));
  recalculateLayout(mod);
  return shelves;
}

// Front na wnękę (zastępuje fronty tej wnęki i zagnieżdżone w niej).
// opts: openingSide ('left'|'right' — zawiasy pojedynczych drzwi), distribution (szuflady: "3", "1:1:2"…).
export function setFront(mod, path, subtype, opts = {}) {
  if (!FRONT_TYPES.includes(subtype)) throw new Error(`Rodzaj frontu: ${FRONT_TYPES.join(" | ")}.`);
  assignFront(mod, zoneAt(mod, path), subtype, opts);
  recalculateLayout(mod);
}

// Zdejmuje fronty z wnęki (półki i przegrody zostają).
export function clearFronts(mod, path) {
  const ids = new Set(zoneAt(mod, path).fronts.map((f) => f.id));
  mod.elements = mod.elements.filter((el) => !ids.has(el.id));
  recalculateLayout(mod);
}

export function removeDivider(mod, path) {
  const node = zoneAt(mod, path);
  if (node.type !== "split") throw new Error(`Wnęka „${path}” nie ma dzielnika do usunięcia.`);
  removeSplit(mod, node);
  recalculateLayout(mod);
}

export function moveDivider(mod, path, pos) {
  const node = zoneAt(mod, path);
  if (node.type !== "split") throw new Error(`Wnęka „${path}” nie ma dzielnika do przesunięcia.`);
  moveSplit(mod, node, Number(pos));
  recalculateLayout(mod);
}

// Półka stała (kołek + wkręt) albo ruchoma (podpórki); przegroda wkręcona albo luźna.
export function setStructural(mod, path, structural) {
  const node = zoneAt(mod, path);
  if (node.type !== "split") throw new Error(`Wnęka „${path}” nie ma dzielnika.`);
  node.divider.isStructural = !!structural;
  recalculateLayout(mod);
}

const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);

function mergeInto(target, patch) {
  Object.entries(patch).forEach(([k, v]) => {
    if (isPlain(v) && isPlain(target[k])) mergeInto(target[k], v);
    else target[k] = isPlain(v) ? JSON.parse(JSON.stringify(v)) : v;
  });
}

// Zmienia pola szafki przez głębokie scalenie, np. { dimensions: { height: 1188 },
// legs: { active: false } }. Tablice są zastępowane w całości; id zmienić nie można.
export function patchModule(mod, patch) {
  if (!isPlain(patch)) throw new Error("Zmiana musi być obiektem, np. { dimensions: { width: 600 } }.");
  if ("id" in patch) throw new Error("Id szafki się nie zmienia.");
  // dekor korpusu może zmienić grubość płyty - wnętrze dopasowuje setModuleKorpusDecor
  if (isPlain(patch.materials) && "korpusDecor" in patch.materials) {
    const { korpusDecor, ...restMaterials } = patch.materials;
    setModuleKorpusDecor(mod, korpusDecor, state.project);
    patch = { ...patch, materials: restMaterials };
    if (!Object.keys(restMaterials).length) delete patch.materials;
  }
  // wymiary / konstrukcja zmieniają światło korpusu - wnętrze się do niego dopasowuje
  if (isPlain(patch.dimensions) || isPlain(patch.construction)) refitInterior(mod, () => mergeInto(mod, patch));
  else mergeInto(mod, patch);
  recalculateLayout(mod);
  return mod;
}

// Bok dokładany / blenda / panel poziomy po id albo nazwie (bez względu na wielkość liter).
export function findPanel(ref, project = state.project) {
  const list = project.sidePanels || [];
  const low = String(ref).toLowerCase();
  const hit = list.find((p) => p.id === ref) || list.find((p) => String(p.name || "").toLowerCase() === low);
  if (!hit) throw new Error(`Nie ma boku / blendy / panelu „${ref}”.`);
  return hit;
}

// Nowy element project.sidePanels ('bok' | 'blenda' | 'poziomy' | 'zmywarka') z polami z props (głębokie scalenie),
// np. addPanel("poziomy", { name: "Półka", dimensions: { width: 2102, depth: 300 }, position: { x: 1688, y: 819, z: 0 } }).
export function addPanel(kind = "bok", props = {}) {
  if (!["bok", "blenda", "poziomy", "zmywarka"].includes(kind)) throw new Error("Rodzaj: bok | blenda | poziomy | zmywarka.");
  const panel = addSidePanel(kind);
  if (props) patchPanel(panel, props);
  return panel;
}

export function patchPanel(panel, patch) {
  if (!isPlain(patch)) throw new Error("Zmiana musi być obiektem, np. { position: { y: 2132 } }.");
  if ("id" in patch || "kind" in patch) throw new Error("Id i rodzaju elementu się nie zmienia.");
  mergeInto(panel, patch);
  return panel;
}

// Błędy i ostrzeżenia z kontroli projektu (bez informacji).
export function projectIssues(project = state.project) {
  return validateProject(project).issues
    .filter((i) => i.level !== "info")
    .map((i) => ({ level: i.level, module: i.moduleName, message: i.message }));
}
