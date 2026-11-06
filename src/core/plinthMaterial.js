// src/core/plinthMaterial.js
//
// Materiał cokołu szafki: mod.legs.plinthMaterial
//   ''  / brak         - jak fronty szafki (domyślnie; materiał z cennika frontów, którego
//                        najwięcej we frontach tej szafki, bez frontów - pierwszy z cennika)
//   'korpus'           - jak korpus szafki (z jej dekorem korpusu)
//   'front:<id>'       - materiał frontu z cennika (project.pricing.frontMaterials)
//   'decor:<dekor>'    - płyta w dekorze, liczona jak „Korpus: <dekor>” (np. W1000)
// Wynik { category, materialId, key } - kategoria i materialId formatki jak u frontów /
// korpusu, key rozdziela biegi cokołu z różnych materiałów. Czyste funkcje.
import { korpusCategory, moduleKorpusDecor } from "./materialCatalog.js";

export const PLINTH_KORPUS = "korpus";

function frontList(project) {
  return (project && project.pricing && project.pricing.frontMaterials) || [];
}

// Materiał frontów szafki: najczęstszy materialId jej frontów (bez czół szuflad wewnętrznych).
export function moduleFrontMaterialId(mod, project) {
  const list = frontList(project);
  const known = (id) => list.some((m) => m.id === id);
  const count = new Map();
  ((mod && mod.elements) || []).forEach((el) => {
    if (el.typ !== "front" || el.subtype === "szuflada-wewnetrzna") return;
    const id = known(el.materialId) ? el.materialId : (list[0] && list[0].id);
    if (id) count.set(id, (count.get(id) || 0) + 1);
  });
  let best = list[0] && list[0].id, n = 0;
  count.forEach((c, id) => { if (c > n) { best = id; n = c; } });
  return best;
}

export function plinthMaterial(mod, project) {
  const v = String((mod && mod.legs && mod.legs.plinthMaterial) || "").trim();
  if (v === PLINTH_KORPUS) {
    const category = korpusCategory(moduleKorpusDecor(mod));
    return { category, materialId: undefined, key: category };
  }
  if (v.startsWith("decor:") && v.slice(6).trim()) {
    const category = korpusCategory(v.slice(6));
    return { category, materialId: undefined, key: category };
  }
  let materialId = v.startsWith("front:") ? v.slice(6) : moduleFrontMaterialId(mod, project);
  if (!frontList(project).some((m) => m.id === materialId)) materialId = moduleFrontMaterialId(mod, project);
  return { category: "Front", materialId, key: `Front::${materialId || ""}` };
}
