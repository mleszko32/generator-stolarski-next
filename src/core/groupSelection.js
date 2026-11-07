// src/core/groupSelection.js
//
// Grupy (mebel): szafki i boki dokładane / blendy / panele poziome ze wspólnym groupId -
// zaznaczają się i przesuwają razem, a na liście formatek idą pod jednym meblem
// (core/furnitureGroups.js). Zaznaczenie = { moduleIds: Set, panelIds: Set }
// (state.selectedModules / state.selectedSidePanels). Czyste, z testami.

const panelsOf = (project) => (project && project.sidePanels) || [];
const modulesOf = (project) => (project && project.modules) || [];

// Członkowie grupy elementu (albo sam element, gdy nie ma grupy).
// kind: 'module' | 'panel'.
export function groupMembers(project, kind, id) {
  const list = kind === "module" ? modulesOf(project) : panelsOf(project);
  const item = list.find((o) => o.id === id);
  const gId = item && item.groupId;
  if (!gId) {
    return { moduleIds: kind === "module" ? [id] : [], panelIds: kind === "panel" ? [id] : [] };
  }
  return {
    moduleIds: modulesOf(project).filter((m) => m.groupId === gId).map((m) => m.id),
    panelIds: panelsOf(project).filter((p) => p.groupId === gId).map((p) => p.id),
  };
}

// Kliknięcie w liście / 3D: bez Shift/Ctrl = tylko ta grupa; z Shift/Ctrl = dołóż albo zdejmij
// (zdejmuje, gdy cała grupa już była zaznaczona). Zwraca nowe { moduleIds, panelIds } (Sety)
// i removed = czy klik odznaczył.
export function clickSelection(project, selection, kind, id, additive) {
  const g = groupMembers(project, kind, id);
  if (!additive) return { moduleIds: new Set(g.moduleIds), panelIds: new Set(g.panelIds), removed: false };
  const moduleIds = new Set(selection.moduleIds || []);
  const panelIds = new Set(selection.panelIds || []);
  const all = g.moduleIds.every((m) => moduleIds.has(m)) && g.panelIds.every((p) => panelIds.has(p));
  g.moduleIds.forEach((m) => (all ? moduleIds.delete(m) : moduleIds.add(m)));
  g.panelIds.forEach((p) => (all ? panelIds.delete(p) : panelIds.add(p)));
  return { moduleIds, panelIds, removed: all };
}

// Czy zaznaczenie można połączyć w grupę: co najmniej dwa elementy (szafki i/lub blendy, boki,
// panele - np. same panele na ścianę), nie wszystkie już w tej samej grupie.
export function canCombine(project, selection) {
  const mods = modulesOf(project).filter((m) => selection.moduleIds && selection.moduleIds.has(m.id));
  const pans = panelsOf(project).filter((p) => selection.panelIds && selection.panelIds.has(p.id));
  const items = [...mods, ...pans];
  if (items.length < 2) return false;
  const g = items[0].groupId;
  return !(g && items.every((o) => o.groupId === g));
}

// Łączy zaznaczenie w nową grupę. Boki/blendy z łączonych grup szafek idą razem z nimi.
export function combineIntoGroup(project, selection, newGroupId) {
  const oldGroups = new Set();
  modulesOf(project).forEach((m) => {
    if (!selection.moduleIds || !selection.moduleIds.has(m.id)) return;
    if (m.groupId) oldGroups.add(m.groupId);
    m.groupId = newGroupId;
  });
  panelsOf(project).forEach((p) => {
    if (selection.panelIds && selection.panelIds.has(p.id) && p.groupId) oldGroups.add(p.groupId);
  });
  panelsOf(project).forEach((p) => {
    if ((selection.panelIds && selection.panelIds.has(p.id)) || (p.groupId && oldGroups.has(p.groupId))) p.groupId = newGroupId;
  });
  modulesOf(project).forEach((m) => { if (m.groupId && oldGroups.has(m.groupId)) m.groupId = newGroupId; });
  return newGroupId;
}

// Rozbija grupę - szafki i boki/blendy.
export function splitGroup(project, groupId) {
  if (!groupId) return;
  [...modulesOf(project), ...panelsOf(project)].forEach((o) => {
    if (o.groupId === groupId) delete o.groupId;
  });
}
