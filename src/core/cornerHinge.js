// Zawias drzwi szafki narożnej L z dwoma oddzielnymi frontami: mod.cornerWideHinge = true
// (pole w ui/cornerConfigModal.js) -> zawiasy Blum CLIP top 170° zamiast zwykłych 110°.
// Front łamany (cornerFrontMode 'bifold') ma własne zawiasy (engine/hardware.js).
export const CORNER_WIDE_HINGE_NAME = "Zawias Blum CLIP top 170° + prowadnik (szafka narożna)";

export function cornerHingeName(mod, front) {
  if (!mod || mod.type !== "corner_cabinet" || !front || !front.cornerArm) return null;
  if (mod.cornerFrontMode === "bifold" || !mod.cornerWideHinge) return null;
  return CORNER_WIDE_HINGE_NAME;
}
