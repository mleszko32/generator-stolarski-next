// src/core/sidebarTree.js
//
// Drzewo lewego panelu: szafki, boki dokładane, blendy i zmywarki pogrupowane po meblach
// (te same meble co w Menedżerze formatek - core/furnitureGroups.js). Meble z grupy (wspólne
// groupId) to zwijane gałęzie, pozostałe elementy trafiają do „Bez grupy”. Numery „M1…” idą
// w kolejności mebli w projekcie, jak furnitureCodes (tam pomijane są meble bez formatek).
// Czyste - bez state, z testami.

import { furnitureGroups } from "./furnitureGroups.js";

const PANEL_NAMES = { blenda: "Blenda", poziomy: "Panel poziomy", zmywarka: "Zmywarka" };

function moduleItem(m) {
  const d = m.dimensions || {};
  return { kind: "module", id: m.id, type: m.type, name: m.name || "Szafka", meta: `${d.width} × ${d.height} × ${d.depth}` };
}

function panelItem(p) {
  const d = p.dimensions || {};
  const panelKind = PANEL_NAMES[p.kind] ? p.kind : "bok";
  let meta = `${d.height} × ${d.depth}`;
  if (panelKind === "blenda") meta = `${d.width} × ${d.height}`;
  if (panelKind === "poziomy") meta = `${d.width} × ${d.depth}, Y ${p.position?.y ?? 0}`;
  if (panelKind === "zmywarka") meta = `${d.width} × ${d.height}${p.topBoard !== false ? ", z wieńcem" : ""}`;
  return { kind: "panel", id: p.id, panelKind, name: p.name || PANEL_NAMES[p.kind] || "Bok dokładany", meta };
}

// Zwraca { furniture: [{ key, code, label, items }], loose: [item + code], shown, total }.
// query filtruje po nazwie elementu; pasująca nazwa mebla pokazuje cały mebel.
export function buildSidebarTree(project, query = "") {
  const modules = (project && project.modules) || [];
  const panels = (project && project.sidePanels) || [];
  const { groups, moduleKey, panelKey } = furnitureGroups(project);
  const nodes = new Map(groups.map((g, i) => [g.key, { key: g.key, code: `M${i + 1}`, label: g.label, grouped: g.grouped, items: [] }]));
  modules.forEach((m) => nodes.get(moduleKey.get(m.id)).items.push(moduleItem(m)));
  panels.forEach((p) => nodes.get(panelKey.get(p.id)).items.push(panelItem(p)));

  const q = String(query || "").trim().toLowerCase();
  const hit = (text) => String(text).toLowerCase().includes(q);
  const furniture = [];
  const loose = [];
  let shown = 0;
  nodes.forEach((node) => {
    const whole = !q || (node.grouped && (hit(node.label) || hit(node.code)));
    const items = whole ? node.items : node.items.filter((it) => hit(it.name));
    if (!items.length) return;
    shown += items.length;
    if (node.grouped) furniture.push({ key: node.key, code: node.code, label: node.label, items });
    else items.forEach((it) => loose.push({ ...it, code: node.code }));
  });
  return { furniture, loose, shown, total: modules.length + panels.length };
}
