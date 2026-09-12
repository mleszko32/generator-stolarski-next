// src/ui/roomPanel.js
//
// Modal ustawień pomieszczenia (szerokość/głębokość/wysokość ścian). Zbudowany jako
// samodzielny DOM-modal na wzór openCsvEditorModal (ui/sidebar.js) — showCustomDialog
// (core/storage.js) obsługuje tylko pojedyncze pole tekstowe, nie 3 pola liczbowe naraz.
import { state, DEFAULT_ROOM } from "../core/state.js";
import { getWorldFootprint } from "../core/layout.js";
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
    backgroundColor: '#fff', width: '95%', maxWidth: '420px',
    borderRadius: '8px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
  });

  modal.innerHTML = `
    <h2 style="margin:0 0 4px 0; color:#1e293b; font-size:16px;">🏠 Wymiary pomieszczenia</h2>
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
    close();
    updateRoom();
    update3D();
    updateSidebar();
  });
}
