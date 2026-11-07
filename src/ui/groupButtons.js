// src/ui/groupButtons.js
// Blok „Grupowanie” w prawym panelu - ten sam dla szafki i dla boku dokładanego / blendy /
// panelu poziomego: „Połącz zaznaczone w grupę” (zaznaczenie Shift/Ctrl w lewym panelu lub
// w 3D, szafki razem z blendami i bokami) i „Rozbij grupę”. Logika w core/groupSelection.js.
import { state } from "../core/state.js";
import { canCombine, combineIntoGroup, splitGroup } from "../core/groupSelection.js";

const selection = () => ({ moduleIds: state.selectedModules || new Set(), panelIds: state.selectedSidePanels || new Set() });

// groupId = grupa elementu otwartego w panelu. Pusty napis, gdy nie ma czego pokazać.
export function groupButtonsHtml(groupId) {
  const combine = canCombine(state.project, selection());
  if (!combine && !groupId) return '';
  return `
        <h3>Grupowanie</h3>
        <div class="property-group" style="display: flex; flex-direction: column; gap: 6px;">
          ${combine ? `<button type="button" id="btn-group-combine" class="btn btn-sm"><i class="ti ti-link" aria-hidden="true"></i> Połącz zaznaczone w grupę</button>` : ''}
          ${groupId ? `<button type="button" id="btn-group-split" class="btn btn-sm btn-danger"><i class="ti ti-scissors" aria-hidden="true"></i> Rozbij grupę</button>` : ''}
        </div>`;
}

// refresh = standardowe odświeżenie (update3D + updateSidebar + initPropertiesPanel).
export function bindGroupButtons(groupId, refresh) {
  document.getElementById('btn-group-combine')?.addEventListener('click', () => {
    combineIntoGroup(state.project, selection(), 'group-' + Date.now());
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
