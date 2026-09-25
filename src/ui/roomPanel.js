// src/ui/roomPanel.js
//
// Modal ustawień pomieszczenia (szerokość/głębokość/wysokość ścian). Zbudowany jako
// samodzielny DOM-modal na wzór openCsvEditorModal (ui/sidebar.js) — showCustomDialog
// (core/storage.js) obsługuje tylko pojedyncze pole tekstowe, nie 3 pola liczbowe naraz.
import { state, DEFAULT_ROOM } from "../core/state.js";
import { getWorldFootprint } from "../core/layout.js";
import { getOpenings, newOpening, OPENING_KINDS, OPENING_WALLS } from "../core/openings.js";
import { escapeHtml } from "../utils/dom.js";
import { update3D, updateRoom } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";

export function openRoomSettingsModal() {
  const room = state.project.room || DEFAULT_ROOM;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: '#fff', width: '95%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto',
    borderRadius: '8px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
  });

  modal.innerHTML = `
    <h2 style="margin:0 0 4px 0; color:#1e293b; font-size:16px;"><i class="ti ti-home" aria-hidden="true"></i> Wymiary pomieszczenia</h2>
    <div style="font-size:11px; color:#64748b; margin-bottom:16px;">Prostokątny pokój — narożnik tylno-lewy to punkt (0,0).</div>
    <div class="property-group" style="margin-bottom:12px;">
      <label>Szerokość (mm):</label>
      <input type="number" id="input-room-width" value="${room.width}" min="500" step="10" />
    </div>
    <div class="property-group" style="margin-bottom:12px;">
      <label>Głębokość (mm):</label>
      <input type="number" id="input-room-depth" value="${room.depth}" min="500" step="10" />
    </div>
    <div class="property-group" style="margin-bottom:8px;">
      <label>Wysokość ścian (mm):</label>
      <input type="number" id="input-room-height" value="${room.height}" min="1500" step="10" />
    </div>
    <div style="margin:14px 0 6px 0; font-size:13px; font-weight:700; color:#1e293b;"><i class="ti ti-door" aria-hidden="true"></i> Okna, drzwi i przeszkody</div>
    <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Położenie liczone od lewego końca ściany, patrząc od środka pokoju. Parapet = wysokość dolnej krawędzi nad podłogą. Pojawiają się w 3D, w rzutach ścian i w kontroli projektu (kolizje z szafkami).</div>
    <div id="openings-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>
    <button type="button" id="btn-opening-add" class="btn btn-sm" style="margin-bottom:12px;"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj okno / drzwi / przeszkodę</button>
    <div id="room-overflow-warning" style="display:none; font-size:11px; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:4px; padding:8px; margin-bottom:12px;"></div>
    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
      <button type="button" id="btn-room-cancel" class="btn btn-neutral btn-sm">Anuluj</button>
      <button type="button" id="btn-room-save" class="btn btn-primary btn-sm">Zapisz</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const inpWidth = modal.querySelector('#input-room-width');
  const inpDepth = modal.querySelector('#input-room-depth');
  const inpHeight = modal.querySelector('#input-room-height');
  const warningEl = modal.querySelector('#room-overflow-warning');

  // Ostrzeżenie na żywo, jeśli po zapisaniu nowych (mniejszych) wymiarów jakaś
  // szafka wystawałaby poza pokój — NIE blokuje zapisu, tylko informuje, żeby
  // użytkownik mógł potem poprawić rozmieszczenie w 3D (patrz plan: brak
  // automatycznego przesuwania/kasowania szafek).
  function checkOverflow() {
    const w = parseFloat(inpWidth.value) || 0;
    const d = parseFloat(inpDepth.value) || 0;
    const overflowing = (state.project.modules || []).filter(mod => {
      const { worldW, worldD } = getWorldFootprint(mod);
      const x = parseFloat(mod.position.x) || 0;
      const z = parseFloat(mod.position.z) || 0;
      return x + worldW > w || z + worldD > d;
    });
    if (overflowing.length > 0) {
      warningEl.style.display = 'block';
      warningEl.textContent = `⚠️ ${overflowing.length} szafk${overflowing.length === 1 ? 'a wystaje' : 'i wystają'} poza nowe wymiary — możesz zapisać i poprawić rozmieszczenie w 3D.`;
    } else {
      warningEl.style.display = 'none';
    }
  }
  [inpWidth, inpDepth].forEach(inp => inp.addEventListener('input', checkOverflow));
  checkOverflow();

  // Edytor przeszkód: pracujemy na kopii, do projektu trafia dopiero po "Zapisz".
  let openings = getOpenings(state.project).map(o => ({ ...o }));
  const listEl = modal.querySelector('#openings-list');
  const numInput = (i, key, w, title) => `<input type="number" data-i="${i}" data-k="${key}" value="${openings[i][key]}" title="${title}" placeholder="${title}" step="10" style="width:${w}px" />`;
  function renderOpenings() {
    if (openings.length === 0) {
      listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8;">Brak - dodaj okno lub drzwi, żeby uwzględnić je w projekcie.</div>';
      return;
    }
    listEl.innerHTML = openings.map((o, i) => `
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:6px; border:1px solid #e2e8f0; border-radius:6px;">
        <select data-i="${i}" data-k="kind">${Object.entries(OPENING_KINDS).map(([k, v]) => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('')}</select>
        <select data-i="${i}" data-k="wall">${OPENING_WALLS.map(w => `<option value="${w.id}" ${o.wall === w.id ? 'selected' : ''}>${escapeHtml(w.label)}</option>`).join('')}</select>
        ${numInput(i, 'u', 70, 'od lewej')}
        ${numInput(i, 'width', 70, 'szerokość')}
        ${numInput(i, 'height', 70, 'wysokość')}
        ${numInput(i, 'sill', 70, 'parapet')}
        <button type="button" data-del="${i}" class="btn btn-neutral btn-sm" title="Usuń"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>`).join('');
    listEl.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
      const o = openings[+inp.dataset.i];
      const k = inp.dataset.k;
      o[k] = (k === 'kind' || k === 'wall') ? inp.value : (parseFloat(inp.value) || 0);
    }));
    listEl.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
      openings.splice(+btn.dataset.del, 1);
      renderOpenings();
    }));
  }
  modal.querySelector('#btn-opening-add').addEventListener('click', () => {
    openings.push(newOpening('okno', 'tyl'));
    renderOpenings();
  });
  renderOpenings();

  const close = () => document.body.removeChild(overlay);

  modal.querySelector('#btn-room-cancel').addEventListener('click', close);
  modal.querySelector('#btn-room-save').addEventListener('click', () => {
    const width = parseFloat(inpWidth.value);
    const depth = parseFloat(inpDepth.value);
    const height = parseFloat(inpHeight.value);
    if (!(width > 0) || !(depth > 0) || !(height > 0)) {
      alert('Wszystkie wymiary muszą być liczbami większymi od 0.');
      return;
    }
    state.project.room = { width, depth, height };
    state.project.openings = openings.filter(o => o.width > 0 && o.height > 0).map(o => ({ ...o }));
    close();
    updateRoom();
    update3D();
    updateSidebar();
  });
}
