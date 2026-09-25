// src/ui/roomPanel.js
//
// Okno ustawień pomieszczenia: wymiary ścian oraz okna, drzwi i przeszkody.
// Zbudowane na wspólnym oknie (utils/modal.js) - showCustomDialog obsługuje tylko
// pojedyncze pole tekstowe, a tu jest kilka pól liczbowych naraz.
import { state, DEFAULT_ROOM } from "../core/state.js";
import { getWorldFootprint } from "../core/layout.js";
import { getOpenings, newOpening, OPENING_KINDS, OPENING_WALLS } from "../core/openings.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";
import { update3D, updateRoom } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";

export function openRoomSettingsModal() {
  const room = state.project.room || DEFAULT_ROOM;

  const dlg = openModal({
    title: "Pomieszczenie",
    subtitle: "Prostokątny pokój - narożnik tylno-lewy to punkt (0, 0).",
    width: 700,
    dismissable: false,
    body: `
      <div class="field-row">
        <div class="field"><label>Szerokość (mm)</label><input type="number" id="input-room-width" value="${room.width}" min="500" step="10" /></div>
        <div class="field"><label>Głębokość (mm)</label><input type="number" id="input-room-depth" value="${room.depth}" min="500" step="10" /></div>
        <div class="field"><label>Wysokość ścian (mm)</label><input type="number" id="input-room-height" value="${room.height}" min="1500" step="10" /></div>
      </div>
      <div id="room-overflow-warning" class="notice notice-danger" style="display:none; margin-bottom:12px;"></div>

      <div class="panel-head" style="margin-top:6px"><h2><i class="ti ti-door" aria-hidden="true"></i> Okna, drzwi i przeszkody</h2></div>
      <div class="modal-sub" style="margin:0 0 8px">Położenie liczone od lewego końca ściany, patrząc od środka pokoju. Parapet = wysokość dolnej krawędzi nad podłogą. Widać je w 3D, w rzutach ścian i w kontroli projektu (kolizje z szafkami).</div>
      <div id="openings-list"></div>
      <button type="button" id="btn-opening-add" class="btn btn-sm"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj okno / drzwi / przeszkodę</button>`,
    footer: [
      { label: "Anuluj" },
      { label: "Zapisz", kind: "primary", onClick: (close) => save(close) },
    ],
  });
  const modal = dlg.modal;

  const inpWidth = modal.querySelector("#input-room-width");
  const inpDepth = modal.querySelector("#input-room-depth");
  const inpHeight = modal.querySelector("#input-room-height");
  const warningEl = modal.querySelector("#room-overflow-warning");

  // Ostrzeżenie na żywo, jeśli po zapisaniu nowych (mniejszych) wymiarów jakaś
  // szafka wystawałaby poza pokój - NIE blokuje zapisu, tylko informuje.
  function checkOverflow() {
    const w = parseFloat(inpWidth.value) || 0;
    const d = parseFloat(inpDepth.value) || 0;
    const overflowing = (state.project.modules || []).filter((mod) => {
      const { worldW, worldD } = getWorldFootprint(mod);
      const x = parseFloat(mod.position.x) || 0;
      const z = parseFloat(mod.position.z) || 0;
      return x + worldW > w || z + worldD > d;
    });
    if (overflowing.length > 0) {
      warningEl.style.display = "block";
      warningEl.textContent = `${overflowing.length} szafk${overflowing.length === 1 ? "a wystaje" : "i wystają"} poza nowe wymiary - możesz zapisać i poprawić rozmieszczenie w 3D.`;
    } else {
      warningEl.style.display = "none";
    }
  }
  [inpWidth, inpDepth].forEach((inp) => inp.addEventListener("input", checkOverflow));
  checkOverflow();

  // Edytor przeszkód: pracujemy na kopii, do projektu trafia dopiero po "Zapisz".
  const openings = getOpenings(state.project).map((o) => ({ ...o }));
  const listEl = modal.querySelector("#openings-list");
  const numInput = (i, key, title) => `<input type="number" class="input" data-i="${i}" data-k="${key}" value="${openings[i][key]}" title="${title}" placeholder="${title}" step="10" style="width:84px" />`;

  function renderOpenings() {
    if (openings.length === 0) {
      listEl.innerHTML = '<div class="empty-note" style="margin-bottom:8px">Brak - dodaj okno lub drzwi, żeby uwzględnić je w projekcie.</div>';
      return;
    }
    listEl.innerHTML = openings.map((o, i) => `
      <div class="list-row" style="flex-wrap:wrap; background:var(--surface-panel)">
        <select class="input" data-i="${i}" data-k="kind">${Object.entries(OPENING_KINDS).map(([k, v]) => `<option value="${k}" ${o.kind === k ? "selected" : ""}>${escapeHtml(v.label)}</option>`).join("")}</select>
        <select class="input" data-i="${i}" data-k="wall">${OPENING_WALLS.map((w) => `<option value="${w.id}" ${o.wall === w.id ? "selected" : ""}>${escapeHtml(w.label)}</option>`).join("")}</select>
        ${numInput(i, "u", "od lewej")}${numInput(i, "width", "szerokość")}${numInput(i, "height", "wysokość")}${numInput(i, "sill", "parapet")}
        <button type="button" data-del="${i}" class="btn btn-sm btn-danger" title="Usuń"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>`).join("");
    listEl.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("change", () => {
      const o = openings[+inp.dataset.i];
      const k = inp.dataset.k;
      o[k] = (k === "kind" || k === "wall") ? inp.value : (parseFloat(inp.value) || 0);
    }));
    listEl.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", () => {
      openings.splice(+btn.dataset.del, 1);
      renderOpenings();
    }));
  }
  modal.querySelector("#btn-opening-add").addEventListener("click", () => {
    openings.push(newOpening("okno", "tyl"));
    renderOpenings();
  });
  renderOpenings();

  function save(close) {
    const width = parseFloat(inpWidth.value);
    const depth = parseFloat(inpDepth.value);
    const height = parseFloat(inpHeight.value);
    if (!(width > 0) || !(depth > 0) || !(height > 0)) {
      alert("Wszystkie wymiary muszą być liczbami większymi od 0.");
      return;
    }
    state.project.room = { width, depth, height };
    state.project.openings = openings.filter((o) => o.width > 0 && o.height > 0).map((o) => ({ ...o }));
    close();
    updateRoom();
    update3D();
    updateSidebar();
  }
}
