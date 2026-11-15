// src/engine/lacquerSummary.js
//
// Zestawienie lakieru: ile m² (jedna strona formatek) trzeba polakierować w każdym kolorze, niezależnie od tego, czy to
// front, blenda, bok dokładany, cokół czy panel - wszystkie lakierowane elementy idą z tej samej płyty (MDF), różni je
// tylko kolor (kod NCS / RAL w materiale frontu). Czyste funkcje.

// Materiał frontu jest lakierowany, gdy ma „lakier” w nazwie (ta sama zasada co w Kosztorysie).
export const isLacquerMaterial = (mat) => /lakier/i.test(String((mat && mat.name) || ""));

// Ten sam kolor zapisany różnie („2005-Y40R”, „S 2005-Y40R”, „ncs s 2005-y40r”) to jedna pozycja zestawienia: kod NCS
// sprowadzamy do „NCS S 2005-Y40R”, resztę (RAL itd.) tylko porządkujemy (spacje, wielkość liter kodu).
export function canonicalColor(color) {
  const t = String(color || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const m = /^(?:NCS\s*)?(?:S\s*)?(\d{4})\s*-\s*([A-Z]\d{2}[A-Z]?|N)$/i.exec(t);
  return m ? `NCS S ${m[1]}-${m[2].toUpperCase()}` : t;
}

// parts: formatki projektu (kategoria „Front” z materialId), frontMaterials: pricing.frontMaterials.
// Zwraca [{ color, areaM2, pieces, materials: [nazwy] }] od największej powierzchni; „bez koloru”, gdy materiał go nie ma.
export function lacquerByColor(parts, frontMaterials) {
  const byId = Object.fromEntries((frontMaterials || []).map((m) => [m.id, m]));
  const groups = new Map();
  for (const p of parts || []) {
    if (p.category !== "Front") continue;
    const mat = byId[p.materialId];
    if (!isLacquerMaterial(mat)) continue;
    const color = canonicalColor(mat.color) || "bez koloru";
    const key = color.toUpperCase();
    const g = groups.get(key) || { color, areaMm2: 0, pieces: 0, materials: new Set() };
    const qty = parseFloat(p.qty) || 0;
    g.areaMm2 += (parseFloat(p.length) || 0) * (parseFloat(p.width) || 0) * qty;
    g.pieces += qty;
    g.materials.add(mat.name);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ color: g.color, areaM2: g.areaMm2 / 1e6, pieces: g.pieces, materials: [...g.materials] }))
    .sort((a, b) => b.areaM2 - a.areaM2);
}

// Elementy z dekorem „Lakier …” wpisanym w polu Dekor: wypełniony dekor zawsze daje formatkę „Korpus: <dekor>” (zwykła płyta
// z ręczną ceną), nawet gdy wybrano też materiał lakierowany - nie wchodzą do zestawienia lakieru ani wspólnej płyty MDF.
// Zwraca [{ kind: 'szafka'|'element', name, decor }].
export function lacquerWithoutMaterial(project) {
  const out = [];
  for (const sp of (project || {}).sidePanels || []) {
    if (sp.decor && /lakier/i.test(sp.decor)) out.push({ kind: "element", name: sp.name || sp.id, decor: sp.decor });
  }
  for (const m of (project || {}).modules || []) {
    const d = m.materials && m.materials.korpusDecor;
    if (d && /lakier/i.test(d)) out.push({ kind: "szafka", name: m.name || m.id, decor: d });
  }
  return out;
}
