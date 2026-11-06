// src/core/materialReplace.js
//
// Podmiana materiału z legendy 3D w całym projekcie: wszystko, co w podglądzie ma ten sam
// klucz materiału (core/decorColors.js: partMaterial), dostaje nowy dekor / materiał.
//   Korpus   - dekor korpusu szafek (setModuleKorpusDecor: grubość z dekoru dopasowuje wnętrze),
//              dekor boków dokładanych i paneli poziomych (z grubością z nazwy), cokół „Dekor płyty”.
//   Front    - fronty, czoła blend i boki w materiale frontów, cokół „materiał z cennika”:
//              materiał z cennika frontów o tej nazwie albo nowy (assignFrontMaterialByName).
//   Szuflada - dekor „Szuflada” projektu.
// Zwraca liczbę zmienionych elementów. Czyste (mutuje przekazany projekt).
import { partMaterial } from "./decorColors.js";
import { setModuleKorpusDecor } from "./korpusDecorChange.js";
import { assignFrontMaterialByName } from "./materialCatalog.js";
import { applyPanelDecorThickness } from "./boardThickness.js";

export function replaceMaterial(project, key, newName) {
  const name = String(newName || "").trim();
  if (!project || !key || !name) return 0;
  const group = key.startsWith("S:") || key === "~SZUFLADA" ? "Szuflada" : null;
  let changed = 0;
  const is = (e) => e && e.key === key;

  if (group === "Szuflada") {
    project.materials = { ...(project.materials || {}) };
    project.materials.decors = { ...(project.materials.decors || {}), Szuflada: name };
    return 1;
  }

  // materiał frontów (cennik) - tworzony raz, dopiero gdy któryś front go dostaje
  let frontMatId = null;
  const frontMaterialId = () => frontMatId || (frontMatId = assignFrontMaterialByName([], name, project));

  (project.modules || []).forEach((mod) => {
    const korpus = partMaterial("corpus", { moduleId: mod.id }, project);
    if (is(korpus) && korpus.group === "Korpus") { setModuleKorpusDecor(mod, name, project); changed++; }
    (mod.elements || []).forEach((el) => {
      if (el.typ !== "front") return;
      if (is(partMaterial("front", { moduleId: mod.id, elementId: el.id }, project))) { el.materialId = frontMaterialId(); changed++; }
    });
    const plinth = mod.legs && mod.legs.active && mod.legs.plinth ? partMaterial("plinth", { moduleId: mod.id, type: "plinth" }, project) : null;
    const pm = String((mod.legs && mod.legs.plinthMaterial) || "");
    if (is(plinth)) {
      // „jak fronty” / „jak korpus” podążają same; podmieniamy tylko wybór wprost
      if (pm.startsWith("decor:")) { mod.legs.plinthMaterial = "decor:" + name; changed++; }
      else if (pm.startsWith("front:")) { mod.legs.plinthMaterial = "front:" + frontMaterialId(); changed++; }
    }
  });

  (project.sidePanels || []).forEach((panel) => {
    const type = panel.kind === "poziomy" ? "corpus" : "front";
    const e = partMaterial(type, { sidePanelId: panel.id }, project);
    if (!is(e)) return;
    if (e.group === "Front") {
      // czoło blendy / bok w materiale frontów - materiał z cennika, bez osobnego dekoru
      panel.decor = "";
      panel.materialId = frontMaterialId();
    } else {
      panel.decor = name;
      applyPanelDecorThickness(panel, name); // płyty sklejone (36 mm) zostają sklejone
    }
    changed++;
  });
  return changed;
}
