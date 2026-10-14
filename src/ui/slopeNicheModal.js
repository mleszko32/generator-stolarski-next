// src/ui/slopeNicheModal.js
// Okno "Zabudowa wnęki pod skosem": kształt szafek (pod skos / schodki), wymiary wnęki, luz
// pod skosem i edytowalna lista szafek od lewej (nazwa, szerokość, siedzisko, sekcje od dołu:
// szuflady / drzwi / drzwi L+P / otwarta z wysokością, półkami i drążkiem); wysokości szafek
// liczone z funkcji skosu (core/slopeNiche.js). Podgląd widoku z przodu z wymiarami i zestawienie formatek
// liczone na bieżąco; "Wstaw / przelicz" zastępuje poprzednią zabudowę w projekcie.
import { state, ensureSidePanelsDefaults } from "../core/state.js";
import {
  getSlopeNicheSettings, nicheModuleSlots, nicheWidthDiff, buildSlopeNicheModules,
  applySlopeNiche, wardrobeRodLength, SECTION_TYPES, DEFAULT_SLOPE_NICHE,
  addNicheModule, newNicheSection, moveInList,
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

const SECTION_LABEL = { szuflady: "Szuflady", drzwi: "Drzwi", "drzwi-lp": "Drzwi L+P", otwarta: "Otwarta" };

// Pola sekcji: [klucz, etykieta, podpowiedź, dla których typów]. Puste pole = brak wartości.
const SECTION_FIELDS = [
  ["count", "Ilość", "Liczba szuflad", ["szuflady"]],
  ["h", "Wys.", "Wysokość wnęki w mm (puste = reszta / równy podział)", SECTION_TYPES],
  ["upTo", "Półka nad na", "Wierzch półki nad sekcją, mm od podłogi (zamiast wysokości)", SECTION_TYPES],
  ["shelves", "Półki", "Półki ruchome w środku sekcji (równo rozłożone)", ["drzwi", "drzwi-lp", "otwarta"]],
  ["rod", "Drążek na", "Drążek garderobowy, mm od podłogi", ["drzwi", "drzwi-lp", "otwarta"]],
];

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
    subtitle: "Szafki dopasowane do skosu (trapez: sufit nad bokami minus luz) albo prostokątne schodki. Po pomiarze na miejscu zmień liczby i przelicz.",
    width: 1100,
    body: `
      <div class="field-row" style="flex-wrap:wrap">
        <div class="field"><label>Kształt szafek</label><select class="input" data-niche-shape>
          <option value="skos"${niche.shape !== "prostokat" ? " selected" : ""}>Dopasowane do skosu</option>
          <option value="prostokat"${niche.shape === "prostokat" ? " selected" : ""}>Prostokątne (schodki)</option></select></div>
        ${NICHE_FIELDS.map(([k, label]) => `<div class="field"><label>${label} (mm)</label><input class="input" type="number" data-niche="${k}" step="1" value="${num(niche[k])}"></div>`).join("")}
      </div>
      <h3 style="margin:8px 0 4px">Szafki od lewej</h3>
      <div class="modal-sub" style="margin:0 0 6px">Sekcje od dołu; ostatnia dostaje resztę wysokości. Bez siedziska szafka pod skosem jest dopasowana do skosu, z siedziskiem - prostokątna z blatem.</div>
      <div id="sn-editor"></div>
      <div class="row" style="gap:6px;margin:6px 0 10px">
        <button type="button" class="btn btn-sm" data-act="add-mod"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj szafkę</button>
        <button type="button" class="btn btn-sm" data-act="defaults"><i class="ti ti-restore" aria-hidden="true"></i> Układ domyślny (A-E)</button>
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
      project: state.project,
      boardThickness: num(state.project.materials.boardThickness, 18),
      seatThickness: num(getWorktopSettings(state.project).thickness, 38),
    });
  }

  const val = (v) => (v === undefined || v === null || v === 0 ? "" : v);

  // Edytor szafek: przebudowywany tylko przy zmianie struktury (dodanie/usunięcie/przesunięcie,
  // zmiana typu sekcji), żeby nie gubić kursora przy wpisywaniu liczb.
  function renderEditor() {
    bodyEl.querySelector("#sn-editor").innerHTML = (niche.modules || []).map((m, i) => {
      const secs = (m.sections || []).map((sec, j) => `
        <tr>
          <td><select class="input" data-m="${i}" data-s="${j}" data-k="type">${SECTION_TYPES.map((t) => `<option value="${t}"${sec.type === t ? " selected" : ""}>${SECTION_LABEL[t]}</option>`).join("")}</select></td>
          ${SECTION_FIELDS.map(([k, , hint, types]) => types.includes(sec.type)
            ? `<td><input class="input" type="number" min="0" step="${k === "count" || k === "shelves" ? 1 : 10}" data-m="${i}" data-s="${j}" data-k="${k}" value="${val(sec[k])}" title="${hint}" style="width:80px"></td>`
            : "<td></td>").join("")}
          <td class="num" style="white-space:nowrap">
            <button type="button" class="icon-btn" data-act="sec-down" data-m="${i}" data-s="${j}" title="Niżej"><i class="ti ti-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="icon-btn" data-act="sec-up" data-m="${i}" data-s="${j}" title="Wyżej"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="icon-btn" data-act="sec-del" data-m="${i}" data-s="${j}" title="Usuń sekcję"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </td>
        </tr>`).join("");
      return `<div class="list-row" style="align-items:flex-start;gap:12px">
        <div style="display:flex;flex-direction:column;gap:6px;min-width:150px">
          <div class="field-row">
            <div class="field"><label>Nazwa</label><input class="input" maxlength="6" data-m="${i}" data-k="key" value="${escapeHtml(m.key)}" style="width:60px"></div>
            <div class="field"><label>Szerokość</label><input class="input" type="number" min="150" step="10" data-m="${i}" data-k="width" value="${num(m.width)}" style="width:80px"></div>
          </div>
          <label title="Poziomy blat na szafce (szafka prostokątna, blat z ustawień blatów projektu)"><input type="checkbox" data-m="${i}" data-k="seat"${m.seat ? " checked" : ""}> Siedzisko / blat</label>
          <div>
            <button type="button" class="icon-btn" data-act="mod-left" data-m="${i}" title="W lewo"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
            <button type="button" class="icon-btn" data-act="mod-right" data-m="${i}" title="W prawo"><i class="ti ti-arrow-right" aria-hidden="true"></i></button>
            <button type="button" class="icon-btn" data-act="mod-del" data-m="${i}" title="Usuń szafkę"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </div>
        <div class="grow">
          <table class="hub-table"><thead><tr><th>Sekcja (od dołu)</th>${SECTION_FIELDS.map(([, label, hint]) => `<th title="${hint}">${label}</th>`).join("")}<th></th></tr></thead>
          <tbody>${secs}</tbody></table>
          <button type="button" class="btn btn-sm" data-act="sec-add" data-m="${i}" style="margin-top:4px"><i class="ti ti-plus" aria-hidden="true"></i> Sekcja na górze</button>
        </div>
      </div>`;
    }).join("") || '<div class="empty-note">Brak szafek - dodaj pierwszą.</div>';
  }

  function renderModules() {
    const slots = nicheModuleSlots(niche);
    bodyEl.querySelector("#sn-modules").innerHTML = `
      <thead><tr><th>Szafka</th><th class="num">Szerokość</th><th class="num">X od lewej</th><th class="num">Sufit nad szafką</th><th class="num">Wysokość od podłogi</th><th>Kształt</th><th class="num">Korpus</th></tr></thead>
      <tbody>${(niche.modules || []).map((m, i) => {
        const s = slots[i], mod = built[i];
        return `<tr><td><b>${escapeHtml(m.key)}</b></td><td class="num">${s.width}</td>
          <td class="num">${s.x}</td><td class="num">${Math.round(s.ceiling)}</td><td class="num"><b>${s.slope ? `${s.heightLow}–${s.heightHigh}` : s.height}</b></td>
          <td>${s.slope ? "pod skos" : m.seat ? "prostokątna + blat" : "prostokątna"}</td>
          <td class="num">${mod ? mod.dimensions.height : ""}</td></tr>`;
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
    const t = e.target, d = t.dataset;
    if (d.nicheShape !== undefined) niche.shape = t.value;
    else if (d.niche) niche[d.niche] = num(t.value, niche[d.niche]);
    else if (d.m !== undefined && d.k) {
      const m = niche.modules[+d.m];
      if (!m) return;
      if (d.s !== undefined) {
        const sec = m.sections[+d.s];
        if (d.k === "type") {
          // Zmiana typu: zostają wysokości (i półki/drążek, jeśli nowy typ je ma).
          const next = newNicheSection(t.value);
          ["h", "upTo"].forEach((k) => { if (sec[k]) next[k] = sec[k]; });
          if (t.value !== "szuflady") ["shelves", "rod"].forEach((k) => { if (sec[k]) next[k] = sec[k]; });
          m.sections[+d.s] = next;
        } else {
          const v = t.value === "" ? 0 : Math.max(0, num(t.value));
          if (d.k === "count") sec.count = Math.min(8, Math.max(1, Math.round(v) || 1));
          else if (d.k === "shelves") { if (v) sec.shelves = Math.min(12, Math.round(v)); else delete sec.shelves; }
          else if (v) sec[d.k] = v;
          else delete sec[d.k];
          // Wysokość i "półka nad na" wykluczają się - wygrywa ostatnio wpisane.
          if (d.k === "h" && v) delete sec.upTo;
          if (d.k === "upTo" && v) delete sec.h;
        }
        renderEditor();
      } else if (d.k === "key") {
        const k = t.value.trim().slice(0, 6);
        if (k && !niche.modules.some((o, j) => j !== +d.m && o.key === k)) m.key = k;
        renderEditor();
      } else if (d.k === "width") m.width = Math.max(150, num(t.value, 600));
      else if (d.k === "seat") m.seat = t.checked;
    } else return;
    refresh();
  });

  bodyEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const i = +b.dataset.m, j = +b.dataset.s;
    const m = niche.modules[i];
    switch (b.dataset.act) {
      case "add-mod": addNicheModule(niche); break;
      case "defaults": niche.modules = JSON.parse(JSON.stringify(DEFAULT_SLOPE_NICHE.modules)); break;
      case "mod-left": moveInList(niche.modules, i, -1); break;
      case "mod-right": moveInList(niche.modules, i, 1); break;
      case "mod-del": niche.modules.splice(i, 1); break;
      case "sec-add": m.sections.push(newNicheSection("drzwi-lp")); break;
      case "sec-down": moveInList(m.sections, j, -1); break;
      case "sec-up": moveInList(m.sections, j, 1); break;
      case "sec-del": if (m.sections.length > 1) m.sections.splice(j, 1); break;
      default: return;
    }
    renderEditor();
    refresh();
  });

  function openDrawingWindow() {
    openHtmlWindow(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Zabudowa wnęki pod skosem</title>
      <style>body{margin:16px;font-family:sans-serif}@page{size:A4 landscape;margin:10mm}</style></head><body>${svg()}</body></html>`);
  }

  async function apply() {
    if (!(niche.modules || []).length) return;
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

  renderEditor();
  refresh();
}
