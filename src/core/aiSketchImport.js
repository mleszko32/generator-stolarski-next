// src/core/aiSketchImport.js
//
// Wynik importu szkicu (api/gemini.js) -> szafki projektu. Dane od modelu są niezaufane:
// typ tylko z białej listy, wymiary liczbowe w rozsądnych granicach, nazwy przycięte,
// liczba stref i szuflad ograniczona. Szafki startują z createModuleObject (pełne
// domyślne ustawienia, jak przy ręcznym dodaniu) i stają na prawo od ostatniej szafki.
import { createModuleObject } from "./state.js";
import { getWorldFootprint } from "./layout.js";
import { num } from "../utils/math.js";

const TYPES = ["base_cabinet", "upper_cabinet", "tall_cabinet"];
const SECTION_TYPES = ["szuflady", "drzwi", "drzwi_lp", "wneka_otwarta"];
const MAX_MODULES = 30;
const MAX_SECTIONS = 12;
const MAX_DRAWERS = 8;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Surowa tablica od modelu -> poprawne opisy szafek (niepoprawne wpisy pomijane).
export function sanitizeAiModules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MODULES).filter((m) => m && typeof m === "object").map((m) => {
    const type = TYPES.includes(m.type) ? m.type : "base_cabinet";
    const sections = (Array.isArray(m.sections) ? m.sections : []).slice(0, MAX_SECTIONS)
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        type: SECTION_TYPES.includes(s.type) ? s.type : "drzwi",
        count: clamp(Math.round(num(s.count, 1)) || 1, 1, MAX_DRAWERS),
        height: num(s.height) > 0 ? num(s.height) : null,
      }));
    return {
      name: typeof m.name === "string" && m.name.trim() ? m.name.trim().slice(0, 60) : "Moduł AI",
      type,
      width: clamp(num(m.width, 600) || 600, 150, 2400),
      height: clamp(num(m.height, type === "tall_cabinet" ? 2000 : 720) || 720, 150, 2800),
      sections,
    };
  });
}

// Opisy z sanitizeAiModules -> obiekty szafek z frontami/półkami (bez dodawania do projektu).
export function buildModulesFromAi(aiModules, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const gapFront = num(project.front && project.front.gap, 3);
  let seq = 0;
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  let currentX = 0;
  (project.modules || []).forEach((m) => {
    currentX = Math.max(currentX, num(m.position && m.position.x) + getWorldFootprint(m).worldW);
  });

  return aiModules.map((ai) => {
    const mod = createModuleObject(ai.type);
    const w = ai.width, h = ai.height;
    mod.id = uid("mod");
    mod.name = ai.name;
    mod.dimensions.width = w;
    mod.dimensions.height = h;
    mod.position.x = currentX;
    currentX += w;

    const internalH = h - th * 2;
    const door = (bZone, extra = {}) => ({ id: uid("front"), typ: "front", subtype: "drzwi", baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: gapFront, openingSide: "left", ...extra });

    if (ai.sections.length > 0) {
      let currentY = th;
      const total = ai.sections.reduce((sum, s) => sum + (s.height || 0), 0);
      const scale = total > 0 ? internalH / total : 1;
      ai.sections.forEach((sec, idx) => {
        const last = idx === ai.sections.length - 1;
        const secH = (sec.height || internalH / ai.sections.length) * scale;
        const zoneMaxY = last ? h - th : currentY + secH;
        const bZone = { minX: th, maxX: w - th, minY: currentY, maxY: zoneMaxY, offsetBottom: 0, offsetTop: 0 };

        if (sec.type === "szuflady") {
          for (let i = 0; i < sec.count; i++) {
            mod.elements.push({ id: uid("front"), typ: "front", subtype: "szuflada", baseZone: { ...bZone },
              frontCount: sec.count, distribution: String(sec.count), frontIndex: i, gap: gapFront, forceVariant: "auto", forceNL: null });
          }
        } else if (sec.type === "drzwi_lp") {
          mod.elements.push({ id: uid("front-L"), typ: "front", subtype: "drzwi-lp", baseZone: { ...bZone }, frontCount: 2, frontIndex: 0, gap: gapFront });
          mod.elements.push({ id: uid("front-P"), typ: "front", subtype: "drzwi-lp", baseZone: { ...bZone }, frontCount: 2, frontIndex: 1, gap: gapFront });
        } else if (sec.type === "drzwi") {
          mod.elements.push(door(bZone));
        }

        if (!last) {
          mod.elements.push({ id: uid("poziom"), typ: "poziom", x: th, y: zoneMaxY, w: w - th * 2, h: th, isStructural: true });
          currentY = zoneMaxY + th;
        }
      });
    } else {
      mod.elements.push(door({ minX: th, maxX: w - th, minY: th, maxY: h - th, offsetBottom: 0, offsetTop: 0 }));
    }
    return mod;
  });
}
