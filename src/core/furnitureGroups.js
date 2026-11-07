// src/core/furnitureGroups.js
//
// Podział projektu na „meble” do listy formatek / rozkroju: mebel wstawiony z pliku (szafki ze
// wspólnym groupId) to jeden mebel, szafka bez grupy to osobny mebel, a bok dokładany / blenda
// należy do mebla przez swoje groupId albo przez nazwę zaczynającą się od nazwy mebla (meble
// z pliku nazywają wszystko tym samym przedrostkiem, np. „S.6.2 Szafa lewa”, „S.6.2 Blenda…”).
// Nazwa mebla z grupy = wspólny przedrostek nazw jego szafek (całe słowa), np. „S.6.2”.
// Czyste - bez state, z testami.

export const COLLECTIVE_KEY = "zbiorcze";
const COLLECTIVE_LABEL = "Elementy zbiorcze";

// Wspólny przedrostek nazw (całymi słowami), bez końcowych myślników/dwukropków.
export function commonNamePrefix(names) {
  const words = names.map((n) => String(n || "").trim().split(/\s+/).filter(Boolean));
  if (words.length === 0) return "";
  const out = [];
  for (let i = 0; i < words[0].length; i++) {
    const w = words[0][i];
    if (words.every((ws) => ws[i] === w)) out.push(w); else break;
  }
  return out.join(" ").replace(/[\s\-–—:,]+$/, "").trim();
}

// Zwraca { groups: [{ key, label }], moduleKey: Map(id → key), panelKey: Map(id → key) }.
// Kolejność mebli = kolejność pierwszego wystąpienia w projekcie.
export function furnitureGroups(project) {
  const modules = (project && project.modules) || [];
  const panels = (project && project.sidePanels) || [];
  const groups = [];
  const byKey = new Map();
  const moduleKey = new Map();
  const panelKey = new Map();
  const add = (key, label) => {
    if (!byKey.has(key)) { const g = { key, label }; byKey.set(key, g); groups.push(g); }
    return key;
  };

  const grouped = new Map();  // groupId → moduły
  modules.forEach((m) => {
    if (m.groupId) {
      if (!grouped.has(m.groupId)) grouped.set(m.groupId, []);
      grouped.get(m.groupId).push(m);
    }
  });
  const prefixes = [];  // [{ prefix, key }] - do przypisania boków bez groupId
  modules.forEach((m) => {
    if (m.groupId) {
      const mods = grouped.get(m.groupId);
      if (!byKey.has(m.groupId)) {
        const prefix = mods.length > 1 ? commonNamePrefix(mods.map((x) => x.name)) : "";
        add(m.groupId, prefix || mods[0].name || "Mebel");
        if (prefix) prefixes.push({ prefix, key: m.groupId });
      }
      moduleKey.set(m.id, m.groupId);
    } else {
      moduleKey.set(m.id, add(m.id, m.name || "Szafka"));
    }
  });
  // dłuższy przedrostek wygrywa („S.6.2” przed „S.6”)
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);

  panels.forEach((p) => {
    if (p.groupId && byKey.has(p.groupId)) { panelKey.set(p.id, p.groupId); return; }
    const name = String(p.name || "").trim();
    const hit = prefixes.find(({ prefix }) => name === prefix || name.startsWith(prefix + " "));
    if (hit) { panelKey.set(p.id, hit.key); return; }
    const label = name || (p.kind === "blenda" ? "Blenda" : p.kind === "poziomy" ? "Panel poziomy" : "Bok dokładany");
    panelKey.set(p.id, add(p.id, label));
  });
  return { groups, moduleKey, panelKey };
}

// Mebel elementu złożonego z kilku szafek (bieg cokołu): wspólny, gdy wszystkie są z jednego.
export function sharedFurnitureKey(keys) {
  const set = new Set(keys.filter(Boolean));
  return set.size === 1 ? [...set][0] : COLLECTIVE_KEY;
}

// Lista mebli do wyboru: meble projektu + „Elementy zbiorcze”, jeśli jakaś formatka do nich trafiła.
export function furnitureChoices(project, parts) {
  const { groups } = furnitureGroups(project);
  const used = new Set(parts.map((p) => p.furnitureKey || COLLECTIVE_KEY));
  const list = groups.filter((g) => used.has(g.key));
  if (used.has(COLLECTIVE_KEY)) list.push({ key: COLLECTIVE_KEY, label: COLLECTIVE_LABEL });
  return list;
}

// Sumowanie formatek w obrębie mebla (klucz jak w calculateAllProjectParts + mebel), tylko
// z mebli nie wykluczonych. Wiersz dostaje furnitureLabel (do opisu w FC2/SAS) i modules.
export function aggregateByFurniture(parts, project, excluded = []) {
  const skip = new Set(excluded);
  const labels = new Map(furnitureChoices(project, parts).map((g) => [g.key, g.label]));
  const out = new Map();
  parts.forEach((p) => {
    const fk = p.furnitureKey || COLLECTIVE_KEY;
    if (skip.has(fk)) return;
    const key = `${fk}_${p.category}_${p.name}_${p.length}_${p.width}_${p.materialId || ""}`;
    const row = out.get(key);
    if (row) {
      row.qty += p.qty;
      if (!row.modules.includes(p.moduleName)) row.modules.push(p.moduleName);
    } else {
      out.set(key, {
        category: p.category || "Inne", name: p.name, length: p.length, width: p.width, qty: p.qty,
        materialId: p.materialId, defaultEdges: p.defaultEdges, modules: [p.moduleName],
        // cokół z kilku mebli / blaty - bez przedrostka mebla w opisie
        furnitureKey: fk, furnitureLabel: fk === COLLECTIVE_KEY ? "" : labels.get(fk) || "",
      });
    }
  });
  return [...out.values()];
}
