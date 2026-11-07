// src/ui/furnitureFilter.js
// Wybór grup do zestawienia - wspólny dla Menedżera formatek (CSV / FC2 / SAS) i planu rozkroju.
// Pozycje: grupy (szafki/panele połączone w grupę), „Bez grupy”, „Elementy zbiorcze”
// (core/furnitureGroups.js). Odznaczone zapamiętane w projekcie (project.partsSelection).
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { scheduleCheckpoint } from "../core/history.js";
import { furnitureChoices, getExcludedChoices, setExcludedChoices } from "../core/furnitureGroups.js";

// Odznaczone pozycje, które w projekcie jeszcze istnieją.
export function currentExcluded(parts) {
  const keys = new Set(furnitureChoices(state.project, parts).map(c => c.key));
  return getExcludedChoices(state.project).filter(k => keys.has(k));
}

// Pusty napis, gdy jest tylko jedna pozycja (nie ma czego wybierać).
export function furnitureFilterHtml(parts) {
  const choices = furnitureChoices(state.project, parts);
  if (choices.length < 2) return '';
  const excluded = currentExcluded(parts);
  return `
    <div class="field"><span>Grupy w zestawieniu (odznaczone nie idą do listy, eksportu ani rozkroju):</span></div>
    <div class="csv-furniture">
      ${choices.map(c => `<label><input type="checkbox" class="furn-check" data-key="${escapeHtml(c.key)}" ${excluded.includes(c.key) ? '' : 'checked'}> ${escapeHtml(c.label)}</label>`).join('')}
      <button type="button" class="btn btn-sm furn-all">Wszystkie</button>
      <button type="button" class="btn btn-sm furn-none">Żadna</button>
    </div>`;
}

// onChange(excluded) - po każdej zmianie (wybór już zapisany w projekcie).
export function bindFurnitureFilter(root, parts, onChange) {
  const choices = furnitureChoices(state.project, parts);
  const set = (next) => {
    setExcludedChoices(state.project, next);
    scheduleCheckpoint();
    root.querySelectorAll('.furn-check').forEach(cb => { cb.checked = !next.includes(cb.getAttribute('data-key')); });
    onChange(next);
  };
  root.querySelectorAll('.furn-check').forEach(cb => cb.addEventListener('change', () => {
    const key = cb.getAttribute('data-key');
    const cur = currentExcluded(parts);
    set(cb.checked ? cur.filter(k => k !== key) : [...cur, key]);
  }));
  root.querySelector('.furn-all')?.addEventListener('click', () => set([]));
  root.querySelector('.furn-none')?.addEventListener('click', () => set(choices.map(c => c.key)));
}
