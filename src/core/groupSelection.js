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
// (zdejmuje, gdy cała grupa już była zaznaczona). Zwraca nowe { moduleIds, panelIds, picks } (Sety)
// i removed = czy klik odznaczył.
// Shift/Ctrl + klik w INNĄ szafkę grupy aktywnej szafki (selection.activeId) nie odznacza grupy,
// tylko dobiera tę szafkę do wspólnej edycji w prawym panelu (picks; ponowny klik ją zdejmuje) -
// grupa i tak jest zaznaczona cała, więc inaczej nie dało się zmienić kilku jej szafek naraz.
export function clickSelection(project, selection, kind, id, additive) {
  const g = groupMembers(project, kind, id);
  if (!additive) return { moduleIds: new Set(g.moduleIds), panelIds: new Set(g.panelIds), picks: new Set(), removed: false };
  const moduleIds = new Set(selection.moduleIds || []);
  const panelIds = new Set(selection.panelIds || []);
  const picks = new Set(selection.picks || []);
  const activeId = selection.activeId;
  if (kind === "module" && activeId && id !== activeId && g.moduleIds.includes(activeId)) {
    const removed = picks.has(id);
    if (removed) picks.delete(id); else picks.add(id);
    g.moduleIds.forEach((m) => moduleIds.add(m));
    g.panelIds.forEach((p) => panelIds.add(p));
    return { moduleIds, panelIds, picks, removed, picked: true };
  }
  // Shift/Ctrl + klik w blendę / bok z grupy aktywnej szafki albo w szafkę z grupy aktywnej blendy:
  // grupa zostaje zaznaczona (wcześniej taki klik odznaczał cały mebel, więc nie dało się mieć
  // zaznaczonych razem szafki i blendy z jednej grupy).
  const activePanelId = selection.activePanelId;
  const sameGroupAsActive = g.moduleIds.length + g.panelIds.length > 1
    && ((activeId && g.moduleIds.includes(activeId) && !(kind === "module" && id === activeId))
      || (activePanelId && g.panelIds.includes(activePanelId) && !(kind === "panel" && id === activePanelId)));
  if (sameGroupAsActive) {
    g.moduleIds.forEach((m) => moduleIds.add(m));
    g.panelIds.forEach((p) => panelIds.add(p));
    return { moduleIds, panelIds, picks, removed: false };   // kliknięty element staje się aktywny
  }
  const all = g.moduleIds.every((m) => moduleIds.has(m)) && g.panelIds.every((p) => panelIds.has(p));
  g.moduleIds.forEach((m) => (all ? moduleIds.delete(m) : moduleIds.add(m)));
  g.panelIds.forEach((p) => (all ? panelIds.delete(p) : panelIds.add(p)));
  return { moduleIds, panelIds, picks: all ? new Set() : picks, removed: all };
}

// Szafki dobrane Shift/Ctrl w grupie aktywnej szafki (bez niej samej) - Set id.
export function activePicks(project, selection, activeId) {
  const picks = selection && selection.picks;
  if (!activeId || !picks || !picks.size) return new Set();
  return new Set(groupMembers(project, "module", activeId).moduleIds.filter((id) => id !== activeId && picks.has(id)));
}

// Których szafek dotyczą zmiany w prawym panelu. Kliknięcie szafki z grupy zaznacza całą
// grupę (żeby mebel przesuwał się razem), ale panel ma wtedy zmieniać tylko klikniętą szafkę -
// inaczej luz albo wymiar wpisany w jednej trafiał do wszystkich szafek mebla. Kilka szafek
// naraz zmienia się tylko po świadomym dobraniu ich Shift/Ctrl, czyli gdy zaznaczenie różni
// się od samej grupy aktywnej szafki, albo po dobraniu szafek wewnątrz grupy (activePicks).
// Zwraca id szafek.
export function editTargets(project, selection, activeId) {
  const selected = [...((selection && selection.moduleIds) || [])];
  if (!activeId) return selected;
  if (!selected.includes(activeId)) return [activeId];
  const g = groupMembers(project, "module", activeId);
  const panels = [...((selection && selection.panelIds) || [])];
  const onlyGroup = selected.length === g.moduleIds.length && selected.every((id) => g.moduleIds.includes(id))
    && panels.every((id) => g.panelIds.includes(id));
  if (!onlyGroup) return selected;
  const picks = activePicks(project, selection, activeId);
  return g.moduleIds.filter((id) => id === activeId || picks.has(id));
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

// Rozbija grupę - szafki i boki/blendy (i zapomina jej nazwę).
export function splitGroup(project, groupId) {
  if (!groupId) return;
  [...modulesOf(project), ...panelsOf(project)].forEach((o) => {
    if (o.groupId === groupId) delete o.groupId;
  });
  setGroupName(project, groupId, "");
}

// Nazwy grup nadane przez użytkownika: project.groups = [{ id, name }] (pole „name” jest wolnym
// tekstem dla projectSanitize). Bez nazwy grupa nazywa się wspólnym początkiem nazw elementów
// (core/furnitureGroups.js).
export function groupName(project, groupId) {
  const g = ((project && project.groups) || []).find((x) => x.id === groupId);
  return (g && String(g.name || "").trim()) || "";
}
export function setGroupName(project, groupId, name) {
  if (!groupId) return;
  const list = ((project.groups || [])).filter((x) => x.id !== groupId);
  const n = String(name || "").trim();
  if (n) list.push({ id: groupId, name: n });
  project.groups = list;
}
