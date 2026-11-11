// src/ui/splitModuleModal.js
//
// Okno „Podziel na korpusy”: wybór miejsca cięcia (półka / przegroda na całe wnętrze) i tego,
// co zrobić z frontami obejmującymi cięcie. Obliczenia: core/splitModule.js.
import { openModal, showAlert } from "../utils/modal.js";
import { escapeHtml } from "../utils/dom.js";
import { state } from "../core/state.js";
import { listSplitPoints, applySplit } from "../core/splitModule.js";

const CHOICES = {
  h: [
    ["both", "Każdy korpus dostaje własny front"],
    ["first", "Zostaje w dolnym korpusie i zasłania też górny"],
    ["second", "Zostaje w górnym korpusie i zasłania też dolny"],
  ],
  v: [
    ["both", "Każdy korpus dostaje własny front"],
    ["first", "Zostaje w lewym korpusie i zasłania też prawy"],
    ["second", "Zostaje w prawym korpusie i zasłania też lewy"],
  ],
};

export function openSplitModuleModal(mod, onDone) {
  const points = listSplitPoints(mod);
  if (!points.length) {
    showAlert("Ta szafka nie ma półki ani przegrody na całą szerokość / wysokość wnętrza, na której można ją podzielić.", "Podział na korpusy");
    return;
  }
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="hint" style="margin-top:0">Szafka zostanie rozcięta na dwa osobne korpusy. Półki, przegrody i szuflady przechodzą na swoją stronę, dzielnik zamienia się w wieniec / bok obu korpusów. Łączny wymiar szafki zostaje, więc wnętrze drugiego korpusu jest o grubość płyty mniejsze.</p>
    <div class="property-group"><label>Gdzie podzielić:</label>
      <div id="split-points" style="display:flex;flex-direction:column;gap:4px"></div></div>
    <div id="split-fronts"></div>`;
  const pointsEl = body.querySelector("#split-points");
  const frontsEl = body.querySelector("#split-fronts");
  let chosen = points[0];

  pointsEl.innerHTML = points.map((p, i) => `
    <label class="list-row" style="cursor:pointer"><input type="radio" name="split-at" value="${i}" ${i === 0 ? "checked" : ""}>
      <span>${escapeHtml(p.label)}</span></label>`).join("");

  const renderFronts = () => {
    if (!chosen.fronts.length) {
      frontsEl.innerHTML = `<div class="hint">W tym miejscu żaden front nie przechodzi przez cięcie.</div>`;
      return;
    }
    const opts = CHOICES[chosen.axis].map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("");
    frontsEl.innerHTML = `<h3>Fronty obejmujące cięcie</h3>` + chosen.fronts.map((f) => `
      <div class="property-group"><label class="fs-xs">${escapeHtml(f.label)}:</label>
        <select data-front="${escapeHtml(f.id)}">${opts}</select></div>`).join("");
  };
  renderFronts();
  pointsEl.addEventListener("change", (e) => {
    if (e.target.name !== "split-at") return;
    chosen = points[Number(e.target.value)];
    renderFronts();
  });

  openModal({
    title: "Podziel na korpusy", subtitle: mod.name, width: 520, body,
    footer: [
      { label: "Anuluj" },
      {
        label: "Podziel", kind: "primary", icon: "layout-columns",
        onClick: (close) => {
          const fronts = {};
          frontsEl.querySelectorAll("select[data-front]").forEach((s) => { fronts[s.dataset.front] = s.value; });
          try {
            const { first } = applySplit(mod, { dividerId: chosen.id, fronts });
            state.activeModuleId = first.id;
          } catch (err) {
            showAlert(err.message, "Nie udało się podzielić");
            return;
          }
          close();
          if (onDone) onDone();
        },
      },
    ],
  });
}
