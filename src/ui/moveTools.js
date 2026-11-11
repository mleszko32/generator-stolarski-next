// src/ui/moveTools.js
//
// Karta „Odstępy i wyrównanie” pod polami pozycji szafki (ui/propertiesShell.js):
// odstęp od sąsiada / ściany z lewej i z prawej, dosuwanie, wyrównanie krawędzi
// zaznaczonych szafek i zsuwanie rzędu. Logika w czystym core/alignCommands.js.
import { state } from "../core/state.js";
import { moveSelectionOf, selectionGaps, setSelectionGap, pushSelection, alignSelection, packSelection } from "../core/alignCommands.js";
import { fmtMm } from "../utils/math.js";

// Zaznaczenie, którego dotyczą polecenia: bieżące (z grupą), o ile zawiera tę szafkę.
function selectionFor(mod) {
  const sel = moveSelectionOf(state);
  return sel.moduleIds.has(mod.id) ? sel : { moduleIds: new Set([mod.id]), panelIds: new Set() };
}

const btn = (attr, value, icon, text, title) =>
  `<button type="button" class="btn btn-sm flex-1" data-${attr}="${value}" title="${title}"><i class="ti ti-${icon}" aria-hidden="true"></i> ${text}</button>`;

function moveToolsHtml(mod) {
  const sel = selectionFor(mod);
  const gaps = selectionGaps(state.project, sel, mod.id);
  if (!gaps) return "";
  const count = sel.moduleIds.size + sel.panelIds.size;
  const gapField = (dir, label) => {
    const g = gaps[dir];
    return `<div class="mb-8"><label class="fs-xs">${label} (${g && g.wall ? "ściana" : "sąsiad"}) [mm]:</label><input type="number" id="move-gap-${dir}" min="0" value="${g ? fmtMm(g.gap) : ""}" /></div>`;
  };
  return `
      <h3>Odstępy i wyrównanie</h3>
      <div class="property-group prop-box" id="move-tools">
        ${gapField("left", "Odstęp z lewej")}${gapField("right", "Odstęp z prawej")}
        <label class="fs-xs">Dosuń do sąsiada / ściany:</label>
        <div class="row mb-8">
          ${btn("push", "left", "arrow-bar-to-left", "Lewo", "Dosuń w lewo do najbliższej szafki albo ściany")}
          ${btn("push", "right", "arrow-bar-to-right", "Prawo", "Dosuń w prawo do najbliższej szafki albo ściany")}
        </div>
        <div class="row mb-8">
          ${btn("push", "back", "arrow-bar-to-up", "Tył", "Dosuń do ściany za plecami (ze szczeliną rzędu) albo do szafki za nią")}
          ${btn("push", "front", "arrow-bar-to-down", "Przód", "Dosuń do przodu do najbliższej szafki albo ściany")}
        </div>
        ${count > 1 ? `
        <label class="fs-xs">Wyrównaj zaznaczone (${count}) do tej szafki:</label>
        <div class="row mb-8">
          ${btn("align", "left", "layout-align-left", "Lewa", "Lewe krawędzie równo z tą szafką")}
          ${btn("align", "right", "layout-align-right", "Prawa", "Prawe krawędzie równo z tą szafką")}
        </div>
        <div class="row mb-8">
          ${btn("align", "back", "layout-align-top", "Tyły", "Tyły równo z tą szafką")}
          ${btn("align", "front", "layout-align-bottom", "Fronty", "Przody korpusów równo z tą szafką")}
        </div>
        <div class="row mb-8">
          ${btn("align", "top", "arrow-bar-up", "Góra", "Góry równo z tą szafką")}
          ${btn("align", "bottom", "arrow-bar-down", "Dół", "Spody równo z tą szafką")}
        </div>
        <button type="button" class="btn btn-sm btn-block" data-pack="1" title="Zaznaczone szafki stają jedna przy drugiej, bez szczelin i nałożeń; ta szafka zostaje na miejscu"><i class="ti ti-layout-distribute-vertical" aria-hidden="true"></i> Zsuń rząd bez przerw</button>` : ""}
        <div class="hint">Strzałki przesuwają o 1 mm, z Shift o 10 mm; PageUp / PageDown w górę i w dół.</div>
      </div>`;
}

// Wstawia kartę pod polami pozycji (pole Y o id `${prefix}-y`) i podpina jej obsługę.
export function mountMoveTools(root, mod, prefix, handlers) {
  const posBox = root.querySelector(`#${prefix}-y`)?.closest(".property-group");
  if (!posBox || !mod) return;
  posBox.insertAdjacentHTML("afterend", moveToolsHtml(mod));
  bindMoveTools(root, mod, handlers);
}

function bindMoveTools(root, mod, { onChange, rerender }) {
  const box = root.querySelector("#move-tools");
  if (!box) return;
  const done = (changed) => { if (changed) { onChange(); rerender(); } };
  ["left", "right"].forEach((dir) => {
    const el = box.querySelector(`#move-gap-${dir}`);
    if (el) el.addEventListener("change", () => {
      setSelectionGap(state.project, selectionFor(mod), mod.id, dir, parseFloat(el.value) || 0);
      onChange();
      rerender();
    });
  });
  box.querySelectorAll("[data-push]").forEach((b) => b.addEventListener("click", () =>
    done(pushSelection(state.project, selectionFor(mod), mod.id, b.dataset.push))));
  box.querySelectorAll("[data-align]").forEach((b) => b.addEventListener("click", () =>
    done(alignSelection(state.project, selectionFor(mod), mod.id, b.dataset.align))));
  box.querySelectorAll("[data-pack]").forEach((b) => b.addEventListener("click", () =>
    done(packSelection(state.project, selectionFor(mod), mod.id))));
}
