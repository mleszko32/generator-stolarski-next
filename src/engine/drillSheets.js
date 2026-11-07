// src/engine/drillSheets.js
//
// Arkusze nawierceń do druku całego mebla: każda formatka z otworami (boki, przegrody, wieńce,
// trawersy, półki stałe - z engine/cabinetDrillings.js, jak instrukcja montażu - oraz fronty
// z puszkami zawiasów) na osobnej stronie A4. Jednakowe formatki (ten sam wymiar i te same
// otwory) w obrębie mebla są jednym arkuszem z liczbą „do nawiercenia: N szt.”.
// Nazwa formatki jak na liście formatek i w opisie SAS/FC2 („M1 Bok (L/P)”) - dopasowana po
// wymiarze do formatek szafki (calculateModuleParts). Czyste (na state.project jak reszta
// silnika), z testami; rysuje ui/drillSheetsPrint.js.

import { getCabinetPanels } from "./cabinetDrillings.js";
import { calculateModuleParts, collectProjectParts } from "./cabinet.js";
import { furnitureGroups, furnitureCodes, filterByChoice } from "../core/furnitureGroups.js";
import { moduleBoardThickness } from "../core/boardThickness.js";
import { recalculateLayout } from "../core/layout.js";
import { num, round1 } from "../utils/math.js";

// Puszka zawiasu Ø35, głęb. 13 mm.
export const CUP = { d: 35, depth: 13 };

// Fronty szafki z puszkami zawiasów (drzwi; klapy i szuflady bez - mają inne okucia).
function frontPanels(mod, project, mountingData) {
  const th = moduleBoardThickness(mod, project);
  const fronts = (mod.elements || []).filter((el) => el.typ === "front");
  return mountingData
    .filter((d) => d.type === "door" && d.hinges && fronts.some((f) => f.id === d.frontId))
    .map((d) => {
      const f = fronts.find((x) => x.id === d.frontId);
      const W = round1(num(f.w)), H = round1(num(f.h));
      const ys = [...new Set(d.hinges.map((h) => round1(num(h.relY))))].filter((y) => y > 0 && y < H).sort((a, b) => a - b);
      const left = d.side === "left";
      return {
        id: `front-${f.id}`, kind: "front", name: left ? "Drzwi lewe" : "Drzwi prawe", qty: 1, length: W, width: H, thickness: th,
        hingeSide: left ? "lewa" : "prawa",
        holes: ys.map((y) => ({ x: round1(left ? 22.5 : W - 22.5), y, kind: "puszka", d: CUP.d, depth: CUP.depth, to: "puszka zawiasu", hingeY: y })),
      };
    });
}

// Nazwa formatki z listy formatek szafki o tym samym wymiarze (dowolna orientacja).
function listName(panel, parts) {
  const L = round1(panel.length), W = round1(panel.width);
  const same = (p) => (round1(p.length) === L && round1(p.width) === W) || (round1(p.length) === W && round1(p.width) === L);
  const wantFront = panel.kind === "front";
  const hit = parts.find((p) => same(p) && (p.category === "Front") === wantFront);
  return hit ? hit.name : panel.name;
}

// Podpis otworów do porównania formatek (bez opisów).
const holeSig = (h) => [h.edge || "", h.side || "", round1(num(h.x)), round1(num(h.y)), round1(num(h.z)), h.kind].join(":");
function signature(p) {
  return JSON.stringify([p.kind, p.listName, round1(p.length), round1(p.width), round1(p.thickness), !!p.frontOnRight, p.hingeSide || "",
    p.holes.map(holeSig).sort()]);
}

// Formatki z otworami jednej szafki (korpus prostokątny + fronty). Szafka narożna i pod skos
// mają własne rysunki - tu pomijane (skipped).
export function moduleDrillPanels(mod, project) {
  if (!mod || mod.type === "corner_cabinet" || mod.type === "slope_cabinet") return null;
  recalculateLayout(mod);  // fronty muszą mieć wyliczone x/y/w/h przed zawiasami
  const { parts, mountingData } = calculateModuleParts(mod);
  const corpus = getCabinetPanels(mod, project).filter((p) => p.holes.length > 0 && p.kind !== "plecy");
  return [...corpus, ...frontPanels(mod, project, mountingData || [])]
    .map((p) => ({ ...p, listName: listName(p, parts) }));
}

// Arkusze dla zaznaczonych grup (excluded - odznaczone pozycje wyboru, jak w Menedżerze formatek).
// Zwraca { sheets: [{ code, furniture, name, listName, kind, length, width, thickness, qty,
// modules[], panel }], skipped: [nazwy szafek bez arkuszy] }. Kolejność: meble jak w projekcie,
// w meblu formatki w kolejności szafek.
export function drillSheets(project, excluded = []) {
  const furn = furnitureGroups(project);
  const codes = furnitureCodes(project, collectProjectParts());
  const labels = new Map(furn.groups.map((g) => [g.key, g.label]));
  const chosen = new Set(filterByChoice((project.modules || []).map((m) => ({ id: m.id, furnitureKey: furn.moduleKey.get(m.id) })), project, excluded).map((x) => x.id));
  const byKey = new Map();
  const skipped = [];
  (project.modules || []).forEach((mod) => {
    if (!chosen.has(mod.id)) return;
    const panels = moduleDrillPanels(mod, project);
    if (!panels) { skipped.push(mod.name || "Szafka"); return; }
    const fk = furn.moduleKey.get(mod.id);
    panels.forEach((p) => {
      const key = `${fk}|${signature(p)}`;
      const row = byKey.get(key);
      if (row) {
        row.qty += p.qty;
        if (!row.modules.includes(mod.name)) row.modules.push(mod.name);
        // „Wieniec dolny, Wieniec górny”, „Półka stała 1–4” - wszystkie nazwy formatek arkusza
        if (!row.names.includes(p.name)) { row.names.push(p.name); row.name = row.names.join(', '); }
        return;
      }
      byKey.set(key, {
        code: codes.get(fk) || "", furniture: labels.get(fk) || "", name: p.name, names: [p.name], listName: p.listName, kind: p.kind,
        length: p.length, width: p.width, thickness: p.thickness, qty: p.qty, modules: [mod.name], panel: p,
      });
    });
  });
  return { sheets: [...byKey.values()], skipped };
}
