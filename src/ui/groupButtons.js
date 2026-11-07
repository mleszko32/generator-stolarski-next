// src/ui/groupButtons.js
// Blok „Grupowanie” w prawym panelu - ten sam dla szafki i dla boku dokładanego / blendy /
// panelu poziomego: „Połącz zaznaczone w grupę” (zaznaczenie Shift/Ctrl w lewym panelu lub
// w 3D, szafki razem z blendami i bokami; pyta o nazwę grupy), pole „Nazwa grupy” i
// „Rozbij grupę”. Nazwa grupy = nazwa mebla na liście formatek, w SAS i w planie rozkroju.
// Logika w core/groupSelection.js.
import { state } from "../core/state.js";
import { canCombine, combineIntoGroup, splitGroup, groupName, setGroupName } from "../core/groupSelection.js";
import { furnitureGroups, commonNamePrefix } from "../core/furnitureGroups.js";
import { showCustomDialog } from "../core/storage.js";
import { escapeHtml } from "../utils/dom.js";

const selection = () => ({ moduleIds: state.selectedModules || new Set(), panelIds: state.selectedSidePanels || new Set() });

// Nazwa, którą grupa ma bez wpisu (wspólny początek nazw elementów).
function autoLabel(groupId) {
  const g = furnitureGroups({ ...state.project, groups: [] }).groups.find(x => x.key === groupId);
  return g ? g.label : '';
}

// groupId = grupa elementu otwartego w panelu. Pusty napis, gdy nie ma czego pokazać.
export function groupButtonsHtml(groupId) {
  const combine = canCombine(state.project, selection());
  if (!combine && !groupId) return '';
  return `
        <h3>Grupowanie</h3>
        ${groupId ? `<div class="property-group"><label>Nazwa grupy (mebel na liście formatek i w SAS):</label>
          <input type="text" id="input-group-name" value="${escapeHtml(groupName(state.project, groupId))}" placeholder="${escapeHtml(autoLabel(groupId))}" /></div>` : ''}
        <div class="property-group" style="display: flex; flex-direction: column; gap: 6px;">
          ${combine ? `<button type="button" id="btn-group-combine" class="btn btn-sm"><i class="ti ti-link" aria-hidden="true"></i> Połącz zaznaczone w grupę</button>` : ''}
          ${groupId ? `<button type="button" id="btn-group-split" class="btn btn-sm btn-danger"><i class="ti ti-scissors" aria-hidden="true"></i> Rozbij grupę</button>` : ''}
        </div>`;
}

// refresh = standardowe odświeżenie (update3D + updateSidebar + initPropertiesPanel).
export function bindGroupButtons(groupId, refresh) {
  document.getElementById('btn-group-combine')?.addEventListener('click', async () => {
    const sel = selection();
    const names = [
      ...state.project.modules.filter(m => sel.moduleIds.has(m.id)).map(m => m.name),
      ...(state.project.sidePanels || []).filter(p => sel.panelIds.has(p.id)).map(p => p.name),
    ];
    // podpowiedź: nazwa jednej z łączonych grup albo wspólny początek nazw
    const oldGroup = [...state.project.modules, ...(state.project.sidePanels || [])]
      .find(o => (sel.moduleIds.has(o.id) || sel.panelIds.has(o.id)) && o.groupId && groupName(state.project, o.groupId));
    const suggestion = (oldGroup && groupName(state.project, oldGroup.groupId)) || commonNamePrefix(names);
    const name = await showCustomDialog('prompt', 'Połącz w grupę',
      'Nazwa grupy - pod nią formatki tej grupy będą na liście, w SAS i w planie rozkroju (np. „Szafa przy łóżku”):',
      suggestion, 'Połącz', 'Anuluj');
    if (name === null || name === undefined || name === false) return;
    const id = combineIntoGroup(state.project, sel, 'group-' + Date.now());
    setGroupName(state.project, id, name);
    refresh();
  });
  const nameInput = document.getElementById('input-group-name');
  nameInput?.addEventListener('change', () => {
    setGroupName(state.project, groupId, nameInput.value);
    refresh();
  });
  document.getElementById('btn-group-split')?.addEventListener('click', () => {
    splitGroup(state.project, groupId);
    // zostaje zaznaczony tylko element otwarty w panelu
    if (state.activeSidePanelId) {
      state.selectedModules = new Set();
      state.selectedSidePanels = new Set([state.activeSidePanelId]);
    } else {
      state.selectedModules = new Set(state.activeModuleId ? [state.activeModuleId] : []);
      state.selectedSidePanels = new Set();
    }
    refresh();
  });
}
