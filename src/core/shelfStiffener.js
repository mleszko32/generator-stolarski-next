// Listwa usztywniająca półki: długa półka (stała albo ruchoma) dostaje od spodu, przy tylnej
// krawędzi, listwę z płyty korpusu ustawioną na sztorc - razem tworzą profil L, kilka razy
// sztywniejszy od samej półki. Ustawienia w construction.shelfStiffener (scalane projekt + moduł):
// { active, minLength, height }. Listwa ma długość półki, grubość płyty i leży w pasie 0..grubość
// od tyłu wnętrza, więc nie zahacza o podpórki (37 mm od krawędzi).

export const STIFFENER_DEFAULTS = { active: true, minLength: 800, height: 50 };

export function getStiffenerSettings(mod, project) {
  const proj = (project && project.construction && project.construction.shelfStiffener) || {};
  const own = (mod && mod.construction && mod.construction.shelfStiffener) || {};
  const s = { ...STIFFENER_DEFAULTS, ...proj, ...own };
  const minLength = parseFloat(s.minLength);
  const height = parseFloat(s.height);
  return {
    active: s.active !== false,
    minLength: minLength > 0 ? minLength : STIFFENER_DEFAULTS.minLength,
    height: height > 0 ? height : STIFFENER_DEFAULTS.height,
  };
}

// Listwa pod półką `el` albo null. Szafka narożna i skos mają własne półki - bez listwy.
export function shelfStiffener(mod, el, project) {
  if (!el || el.typ !== 'poziom') return null;
  if (mod && (mod.type === 'corner_cabinet' || mod.type === 'slope_cabinet')) return null;
  const s = getStiffenerSettings(mod, project);
  const length = parseFloat(el.w) || 0;
  if (!s.active || length <= s.minLength) return null;
  const thickness = parseFloat(project && project.materials && project.materials.boardThickness) || 18;
  return { length: Math.round(length * 10) / 10, height: s.height, thickness };
}
