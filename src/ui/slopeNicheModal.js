// src/ui/slopeNicheModal.js
// Okno "Zabudowa wnęki pod skosem": wymiary wnęki (ściana kolanowa, skos, sufit), luz
// pod skosem i szerokości szafek A-E; wysokości szafek liczone z funkcji skosu
// (core/slopeNiche.js). Podgląd widoku z przodu z wymiarami i zestawienie formatek
// liczone na bieżąco; "Wstaw / przelicz" zastępuje poprzednią zabudowę w projekcie.
import { state, ensureSidePanelsDefaults } from "../core/state.js";
import {
  getSlopeNicheSettings, nicheModuleSlots, nicheWidthDiff, buildSlopeNicheModules,
  applySlopeNiche, wardrobeRodLength,
} from "../core/slopeNiche.js";
import { getWorktopSettings } from "../core/worktops.js";
import { recalculateLayout } from "../core/layout.js";
import { calculateModuleParts } from "../engine/cabinet.js";
import { generateSlopeNicheSVG } from "../render/slopeNicheDrawing.js";
import { num } from "../utils/math.js";
import { escapeHtml, openHtmlWindow } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";
import { showCustomDialog } from "../core/storage.js";

const NICHE_FIELDS = [
  ["width", "Szerokość wnęki"],
  ["depth", "Głębokość wnęki"],
  ["carcaseDepth", "Głębokość korpusów"],
  ["leftHeight", "Ściana kolanowa (lewa)"],
  ["slopeRun", "Skos do (od lewej)"],
  ["ceilingHeight", "Sufit płaski"],
  ["clearance", "Luz pod skosem"],
  ["roundTo", "Zaokrąglij wys. w dół do"],
];

const SECTION_LABEL = { szuflady: "szuflady", drzwi: "drzwi", "drzwi-lp": "drzwi L+P", otwarta: "otwarta" };
function describeSections(spec) {
  const parts = (spec.sections || []).map((s) => {
    let t = s.type === "szuflady" ? `${num(s.count, 1)} szuflady` : SECTION_LABEL[s.type] || s.type;
    if (num(s.shelves)) t += ` + ${num(s.shelves)} półki`;
    if (num(s.rod)) t += `, drążek ${num(s.rod)}`;
    if (num(s.upTo)) t += ` do ${num(s.upTo)}`;
    return t;
  });
  return (spec.seat ? "siedzisko; " : "") + parts.join(" → ");
}

// Formatki szafek zabudowy zsumowane po tym samym kluczu co lista formatek projektu.
function aggregateParts(modules) {
  const agg = {};
  modules.forEach((mod) => {
    calculateModuleParts(mod).parts.forEach((p) => {
      const key = `${p.category}_${p.name}_${p.length}_${p.width}_${p.materialId || ""}`;
      if (agg[key]) { agg[key].qty += p.qty; agg[key].mods.add(mod.slopeNiche); }
      else agg[key] = { ...p, mods: new Set([mod.slopeNiche]) };
    });
  });
  const order = ["Korpus", "Front", "Szuflada", "Plecy"];
  return Object.values(agg).sort((a, b) => (order.indexOf(a.category) + 1 || 9) - (order.indexOf(b.category) + 1 || 9) || b.length - a.length);
}

export function openSlopeNicheModal(onChange) {
  const niche = getSlopeNicheSettings(state.project);
  const existing = state.project.modules.filter((m) => m.slopeNiche).length;

  const { bodyEl, close } = openModal({
    title: "Zabudowa wnęki pod skosem",
    subtitle: "Prostokątne szafki o wysokościach liczonych ze skosu (najniższy punkt nad szafką minus luz). Po pomiarze na miejscu zmień liczby i przelicz.",
    width: 1100,
    body: `
      <div class="field-row" style="flex-wrap:wrap">
        ${NICHE_FIELDS.map(([k, label]) => `<div class="field"><label>${label} (mm)</label><input class="input" type="number" data-niche="${k}" step="1" value="${num(niche[k])}"></div>`).join("")}
      </div>
      <table class="hub-table" id="sn-modules"></table>
      <div id="sn-notice"></div>
      <div id="sn-preview" style="margin:12px 0"></div>
      <h3 style="margin:8px 0">Zestawienie formatek</h3>
      <div id="sn-parts"></div>`,
    footer: [
      { label: "Rysunek w nowym oknie", icon: "printer", onClick: () => openDrawingWindow() },
      { label: "Anuluj" },
      { label: existing ? "Przelicz zabudowę" : "Wstaw do projektu", kind: "primary", icon: "check", onClick: () => apply() },
    ],
  });

  let built = [];

  function build() {
    built = buildSlopeNicheModules(niche, state.project);
    built.forEach((m) => recalculateLayout(m));
  }

  function svg() {
    return generateSlopeNicheSVG(niche, built, {
      boardThickness: num(state.project.materials.boardThickness, 18),
      seatThickness: num(getWorktopSettings(state.project).thickness, 38),
    });
  }

  function renderModules() {
    const slots = nicheModuleSlots(niche);
    bodyEl.querySelector("#sn-modules").innerHTML = `
      <thead><tr><th>Szafka</th><th>Szerokość</th><th class="num">X od lewej</th><th class="num">Sufit nad szafką</th><th class="num">Wysokość od podłogi</th><th class="num">Korpus</th><th>Wnętrze (od dołu)</th></tr></thead>
      <tbody>${(niche.modules || []).map((m, i) => {
        const s = slots[i], mod = built[i];
        return `<tr><td><b>${escapeHtml(m.key)}</b></td>
          <td><input class="input" type="number" data-mod="${i}" step="10" value="${num(m.width)}" style="width:90px"></td>
          <td class="num">${s.x}</td><td class="num">${Math.round(s.ceiling)}</td><td class="num"><b>${s.height}</b></td>
          <td class="num">${mod ? mod.dimensions.height : ""}</td>
          <td>${escapeHtml(describeSections(m))}</td></tr>`;
      }).join("")}</tbody>`;
  }

  function renderRest() {
    const diff = nicheWidthDiff(niche);
    const notes = [];
    if (Math.abs(diff) > 0.5) notes.push(`<div class="notice notice-${diff > 0 ? "danger" : "warn"}">${diff > 0 ? `Szafki są szersze od wnęki o ${diff} mm.` : `Zostaje ${-diff} mm luzu - dodaj blendę albo poszerz szafkę.`}</div>`);
    if (existing) notes.push(`<div class="notice notice-info">W projekcie jest już zabudowa wnęki (${existing} szafek) - „Przelicz zabudowę” zastąpi ją nową (zmiany wnętrza zrobione ręcznie przepadną).</div>`);
    bodyEl.querySelector("#sn-notice").innerHTML = notes.join("");
    const preview = bodyEl.querySelector("#sn-preview");
    preview.innerHTML = svg();
    preview.firstElementChild.style.maxHeight = "560px"; // cały rysunek widoczny bez przewijania

    const parts = aggregateParts(built);
    const rods = built.filter((m) => m.wardrobeRod);
    bodyEl.querySelector("#sn-parts").innerHTML = `<table class="hub-table">
      <thead><tr><th>Kategoria</th><th>Nazwa</th><th class="num">Długość</th><th class="num">Szerokość</th><th class="num">Ilość</th><th>Szafki</th></tr></thead>
      <tbody>${parts.map((p) => `<tr><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.name)}</td><td class="num">${p.length}</td><td class="num">${p.width}</td><td class="num">${p.qty}</td><td>${[...p.mods].join(", ")}</td></tr>`).join("")}
      ${rods.map((m) => `<tr><td>Okucia</td><td>Drążek garderobowy (+2 wsporniki)</td><td class="num">${wardrobeRodLength(m, num(state.project.materials.boardThickness, 18))}</td><td class="num">—</td><td class="num">1</td><td>${escapeHtml(m.slopeNiche)}</td></tr>`).join("")}
      </tbody></table>
      <p class="modal-sub">Płyta, plecy, fronty i system szuflad wg ustawień projektu. Siedzisko na szafce z blatem liczy się w blatach projektu (włączane przy wstawieniu). Pełna lista z okleiną i rozkrojem: hub „Produkcja i raporty”.</p>`;
  }

  function refresh() {
    build();
    renderModules();
    renderRest();
  }

  bodyEl.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.niche) niche[t.dataset.niche] = num(t.value, niche[t.dataset.niche]);
    else if (t.dataset.mod !== undefined) niche.modules[+t.dataset.mod].width = Math.max(150, num(t.value, 600));
    else return;
    refresh();
  });

  function openDrawingWindow() {
    openHtmlWindow(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Zabudowa wnęki pod skosem</title>
      <style>body{margin:16px;font-family:sans-serif}@page{size:A4 landscape;margin:10mm}</style></head><body>${svg()}</body></html>`);
  }

  async function apply() {
    if (existing) {
      const ok = await showCustomDialog("confirm", "Przelicz zabudowę", `Szafki obecnej zabudowy wnęki (${existing}) zostaną zastąpione nowymi. Kontynuować?`);
      if (!ok) return;
    }
    build();
    applySlopeNiche(state.project, niche, built);
    ensureSidePanelsDefaults(state.project);
    state.activeModuleId = built[0] ? built[0].id : null;
    close();
    if (onChange) onChange();
  }

  refresh();
}
