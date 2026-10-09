// src/ui/wallFillModal.js
// Okno "Rozmieść szafki na ścianie": wybór ściany i rzędu (dolne / wiszące /
// słupki), wolny odcinek (wykryty automatycznie, do poprawienia ręcznie), sposób
// podziału, reszta na blendę albo rozciągnięcie szafek, warianty i podgląd rzutu
// ściany z kolizjami. Obliczenia: core/wallFill.js.
import { state } from "../core/state.js";
import { WALLS, computeWallLayouts } from "../core/walls.js";
import {
  ROW_TYPES, STANDARD_WIDTHS, rowProfile, findFreeSegments, divideSegment,
  buildFillItems, findPlanConflicts, applyFillPlan,
} from "../core/wallFill.js";
import { runPresets, planKitchenRun, applyKitchenRun, CORNER_KINDS, defaultCorner } from "../core/kitchenRun.js";
import { fittingsOfKind } from "../core/cornerFittings.js";
import { getWorldFootprint } from "../core/layout.js";
import { getSidePanelBox } from "../core/moduleDrag.js";
import { num } from "../utils/math.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";

const MODES = [
  { id: "standard", label: "Szerokości katalogowe", hint: "Kombinacje typowych szerokości z najmniejszą resztą." },
  { id: "equal", label: "Równy podział", hint: "N szafek tej samej szerokości. Puste pole = kilka propozycji." },
  { id: "fixed", label: "Stałe + reszta", hint: "Szerokości w mm, * = podziel to, co zostało, np. 600, 800, *, *" },
  { id: "ratio", label: "Proporcje", hint: "Jak przy frontach: 1:2:1, albo mieszane 3fr:100 (liczby do 10 to proporcje)." },
];

// Ustawienia zostają między otwarciami okna (w obrębie sesji).
// scope 'kitchen' = zabudowa L/U od narożników (core/kitchenRun.js).
const cfg = {
  scope: "wall", presetId: "lewa+tyl", corners: null, armLength: {}, choice: {}, custom: {},
  wallId: "tyl", type: "base_cabinet", templateId: "",
  u0: null, u1: null,
  openingMargin: 50, doorPassage: 600,
  mode: "standard", catalog: STANDARD_WIDTHS.join(", "), count: "",
  fixedSplit: "600, 800, *, *", ratioSplit: "1:2:1",
  restMode: "blenda", fillerSide: "right", maxFiller: 150, roundTo: 1,
  variant: 0,
};

const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

// onChange: wołane po wstawieniu szafek (odświeżenie widoków).
export function openWallFillModal(onChange) {
  let calc = null;

  const dlg = openModal({
    title: "Rozmieść szafki",
    subtitle: "Jedna ściana albo cała kuchnia L/U od narożników. Program znajdzie wolne miejsce (bez kolizji z szafkami, oknami i drzwiami) i zaproponuje podział.",
    width: 860,
    body: `
      <div class="field"><div class="seg" id="wf-scope">
        <button type="button" class="seg-btn" data-scope="wall">Jedna ściana</button>
        <button type="button" class="seg-btn" data-scope="kitchen">Kuchnia L / U (od narożników)</button>
      </div></div>
      <div class="field-row">
        <div class="field" id="wf-preset-field"><label>Układ</label>
          <select id="wf-preset">${runPresets().map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}</select></div>
        <div class="field" id="wf-wall-field"><label>Ściana</label>
          <select id="wf-wall">${WALLS.map((w) => `<option value="${w.id}">${w.label}</option>`).join("")}</select></div>
        <div class="field"><label>Rząd</label>
          <div class="seg" id="wf-type">${ROW_TYPES.map((r) => `<button type="button" class="seg-btn" data-type="${r.type}">${r.label}</button>`).join("")}</div></div>
        <div class="field"><label>Wzór szafki</label><select id="wf-template"></select></div>
      </div>

      <div class="field wf-single"><label>Wolne odcinki</label><div id="wf-segments" class="row" style="flex-wrap:wrap"></div></div>
      <div id="wf-kitchen" class="wf-kitchen-only"></div>
      <div class="field-row">
        <div class="field wf-single"><label>Od (mm)</label><input type="number" id="wf-u0" step="1"></div>
        <div class="field wf-single"><label>Do (mm)</label><input type="number" id="wf-u1" step="1"></div>
        <div class="field"><label title="Odstęp szafek od krawędzi okien i drzwi">Odstęp od otworów (mm)</label><input type="number" id="wf-margin" min="0" step="10"></div>
        <div class="field"><label title="Głębokość wolnej strefy przed drzwiami - blokuje też narożnik sąsiedniej ściany">Strefa przed drzwiami (mm)</label><input type="number" id="wf-passage" min="0" step="50"></div>
      </div>

      <div class="field"><label>Podział</label>
        <div class="seg" id="wf-mode">${MODES.map((m) => `<button type="button" class="seg-btn" data-mode="${m.id}">${m.label}</button>`).join("")}</div>
        <div class="modal-sub" id="wf-mode-hint" style="margin:4px 0 0"></div></div>
      <div class="field-row">
        <div class="field" id="wf-mode-field"></div>
        <div class="field" id="wf-round-field"><label title="Szerokości szafek zaokrąglane w dół - reszta trafia do blendy">Zaokrąglenie (mm)</label>
          <select id="wf-round"><option value="1">1</option><option value="5">5</option><option value="10">10</option></select></div>
      </div>

      <div class="field-row">
        <div class="field"><label>Reszta szerokości</label>
          <div class="seg" id="wf-rest">
            <button type="button" class="seg-btn" data-rest="blenda">Blenda</button>
            <button type="button" class="seg-btn" data-rest="stretch">Rozciągnij szafki</button>
          </div></div>
        <div class="field" id="wf-side-field"><label>Blenda po stronie</label>
          <select id="wf-side"><option value="left">lewej</option><option value="right">prawej</option><option value="both">obu (po połowie)</option></select></div>
        <div class="field"><label title="Większa reszta jest oznaczana ostrzeżeniem">Maks. reszta (mm)</label><input type="number" id="wf-maxfiller" min="0" step="10"></div>
      </div>

      <div class="wf-single">
        <div class="field"><label>Warianty</label><div id="wf-variants"></div></div>
        <div class="wf-preview" id="wf-preview"></div>
        <div id="wf-conflicts" style="margin-top:10px"></div>
      </div>
      <div class="wf-kitchen-only" id="wf-kitchen-result"></div>`,
    footer: [
      { label: "Anuluj" },
      { label: "Wstaw szafki", kind: "primary", icon: "layout-columns", onClick: (close) => apply(close) },
    ],
  });

  const $ = (sel) => dlg.bodyEl.querySelector(sel);
  const applyBtn = dlg.footEl.querySelector(".btn-primary");

  // --- powiązania pól ---
  $("#wf-wall").value = cfg.wallId;
  $("#wf-margin").value = cfg.openingMargin;
  $("#wf-passage").value = cfg.doorPassage;
  $("#wf-round").value = String(cfg.roundTo);
  $("#wf-side").value = cfg.fillerSide;
  $("#wf-maxfiller").value = cfg.maxFiller;

  const resetSegment = () => { cfg.u0 = null; cfg.u1 = null; cfg.variant = 0; cfg.choice = {}; };
  const resetKitchen = () => { cfg.corners = null; cfg.choice = {}; cfg.custom = {}; };
  $("#wf-wall").addEventListener("change", (e) => { cfg.wallId = e.target.value; resetSegment(); refresh(); });
  $("#wf-template").addEventListener("change", (e) => { cfg.templateId = e.target.value; resetSegment(); resetKitchen(); refresh(); });
  bindSeg("#wf-type", "type", (v) => { cfg.type = v; cfg.templateId = ""; resetSegment(); resetKitchen(); });
  bindSeg("#wf-scope", "scope", (v) => { cfg.scope = v; });
  $("#wf-preset").value = cfg.presetId;
  $("#wf-preset").addEventListener("change", (e) => { cfg.presetId = e.target.value; resetKitchen(); cfg.armLength = {}; refresh(); });
  bindSeg("#wf-mode", "mode", (v) => { cfg.mode = v; cfg.variant = 0; });
  bindSeg("#wf-rest", "rest", (v) => { cfg.restMode = v; cfg.variant = 0; });
  bindNum("#wf-u0", (v) => { cfg.u0 = v; cfg.variant = 0; });
  bindNum("#wf-u1", (v) => { cfg.u1 = v; cfg.variant = 0; });
  bindNum("#wf-margin", (v) => { cfg.openingMargin = Math.max(0, v); resetSegment(); });
  bindNum("#wf-passage", (v) => { cfg.doorPassage = Math.max(0, v); resetSegment(); });
  bindNum("#wf-maxfiller", (v) => { cfg.maxFiller = Math.max(0, v); cfg.variant = 0; });
  $("#wf-round").addEventListener("change", (e) => { cfg.roundTo = num(e.target.value, 1); refresh(); });
  $("#wf-side").addEventListener("change", (e) => { cfg.fillerSide = e.target.value; refresh(); });

  function bindSeg(sel, attr, set) {
    $(sel).addEventListener("click", (e) => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      set(b.dataset[attr]);
      refresh();
    });
  }
  function bindNum(sel, set) {
    let t = null;
    $(sel).addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { set(num(e.target.value)); refresh({ keepFocus: true }); }, 250);
    });
  }

  function renderModeField() {
    const f = $("#wf-mode-field");
    const mode = cfg.mode;
    $("#wf-mode-hint").textContent = MODES.find((m) => m.id === mode).hint;
    const key = { standard: "catalog", equal: "count", fixed: "fixedSplit", ratio: "ratioSplit" }[mode];
    const label = { standard: "Dostępne szerokości (mm)", equal: "Liczba szafek", fixed: "Szerokości (mm, * = reszta)", ratio: "Proporcje" }[mode];
    if (f.dataset.mode !== mode) {
      f.dataset.mode = mode;
      f.innerHTML = `<label>${label}</label><input type="${mode === "equal" ? "number" : "text"}" id="wf-mode-input" ${mode === "equal" ? 'min="1" step="1" placeholder="auto"' : ""}>`;
      const inp = f.querySelector("input");
      inp.value = cfg[key];
      let t = null;
      inp.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => { cfg[key] = inp.value; cfg.variant = 0; refresh({ keepFocus: true }); }, 250);
      });
    }
    // Zaokrąglenie dotyczy tylko podziałów liczonych (nie katalogu).
    $("#wf-round-field").style.display = mode === "standard" ? "none" : "";
  }

  function fillOpts() {
    return {
      mode: cfg.mode,
      catalog: String(cfg.catalog).split(/[,;\s]+/).map(num).filter((x) => x > 0),
      count: cfg.count,
      split: cfg.mode === "fixed" ? cfg.fixedSplit : cfg.ratioSplit,
      restMode: cfg.restMode, fillerSide: cfg.fillerSide, maxFiller: cfg.maxFiller, roundTo: cfg.roundTo,
    };
  }

  // --- Kuchnia L/U ---
  let kcalc = null;
  const presetOf = () => runPresets().find((p) => p.id === cfg.presetId) || runPresets()[0];
  const wallLabel = (id) => (WALLS.find((w) => w.id === id) || {}).label || id;

  function refreshKitchen() {
    const preset = presetOf();
    const template = state.project.modules.find((m) => m.id === cfg.templateId) || null;
    const row = rowProfile(cfg.type, template);
    if (!cfg.corners || cfg.corners.length !== preset.walls.length - 1) {
      cfg.corners = preset.walls.slice(1).map(() => defaultCorner(row));
    }
    const plan = planKitchenRun(state.project, {
      walls: preset.walls, type: cfg.type, template, corners: cfg.corners, armLength: cfg.armLength,
      fill: fillOpts(), choice: cfg.choice, custom: cfg.custom, openingMargin: cfg.openingMargin, doorPassage: cfg.doorPassage,
    });
    kcalc = { preset, row, plan };
    renderKitchenSetup();
    renderKitchenResult();
    applyBtn.disabled = plan.modules.length === 0;
  }

  // Ustawienia narożników i długości ramion. Pola reagują na "change" (bez utraty fokusu w trakcie pisania).
  function renderKitchenSetup() {
    const { preset } = kcalc;
    const el = $("#wf-kitchen");
    const corners = cfg.corners.map((c, i) => {
      const prev = preset.walls[i], next = preset.walls[i + 1];
      const sideSel = (label) => `<div class="field"><label>${label}</label><select data-c="${i}" data-k="blindOn">
          <option value="prev"${c.blindOn === "prev" ? " selected" : ""}>${wallLabel(prev)}</option>
          <option value="next"${c.blindOn === "next" ? " selected" : ""}>${wallLabel(next)}</option></select></div>`;
      const numField = (label, k, title = "") => `<div class="field"><label${title ? ` title="${title}"` : ""}>${label}</label><input type="number" data-c="${i}" data-k="${k}" value="${c[k]}" step="10" min="0"></div>`;
      const fitSel = (kind, k) => `<div class="field"><label>Okucie</label><select data-c="${i}" data-k="${k}">
          <option value="">Bez okucia (półki)</option>${fittingsOfKind(kind).map((f) => `<option value="${f.id}"${c[k] === f.id ? " selected" : ""}>${escapeHtml(f.label)}</option>`).join("")}</select></div>`;
      let fields = "";
      if (c.kind === "L") fields = numField("Ramiona (mm)", "size", "Szafka L kwadratowa: oba ramiona tej samej długości") + fitSel("corner", "cornerFitting");
      if (c.kind === "blind") fields = sideSel("Szafka ślepa na ścianie") + numField("Szerokość szafki (mm)", "width") + numField("Front (mm)", "frontWidth") + fitSel("blind", "fitting")
        + numField("Blenda narożna (mm)", "filler", "30 bez uchwytów, 50 z uchwytami, 100 przy zmywarce/piekarniku");
      if (c.kind === "dead") fields = sideSel("Zaślepka na ścianie") + numField("Blenda narożna (mm)", "filler", "30 bez uchwytów, 50 z uchwytami, 100 przy zmywarce/piekarniku");
      return `<div class="wf-corner">
        <div class="wf-corner-head"><i class="ti ti-corner-down-right" aria-hidden="true"></i> Narożnik: ${escapeHtml(wallLabel(prev))} / ${escapeHtml(wallLabel(next))}</div>
        <div class="seg mb-8">${CORNER_KINDS.map((k) => `<button type="button" class="seg-btn${c.kind === k.id ? " active" : ""}" data-c="${i}" data-kind="${k.id}">${k.label}</button>`).join("")}</div>
        <div class="field-row" style="flex-wrap:wrap">${fields}</div>
      </div>`;
    }).join("");
    const ends = [preset.walls[0], preset.walls[preset.walls.length - 1]];
    const arms = `<div class="field-row">${ends.map((w) => `<div class="field"><label title="Liczona od narożnika; puste = cała ściana">Długość ciągu: ${escapeHtml(wallLabel(w))} (mm)</label>
        <input type="number" data-arm="${w}" value="${cfg.armLength[w] || ""}" placeholder="cała ściana" step="10" min="0"></div>`).join("")}</div>`;
    el.innerHTML = corners + arms;

    el.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      cfg.corners[+b.dataset.c].kind = b.dataset.kind;
      cfg.choice = {};
      refresh();
    }));
    el.querySelectorAll("select[data-c], input[data-c]").forEach((inp) => inp.addEventListener("change", () => {
      const c = cfg.corners[+inp.dataset.c];
      c[inp.dataset.k] = inp.tagName === "SELECT" ? inp.value : num(inp.value);
      cfg.choice = {};
      refresh();
    }));
    el.querySelectorAll("[data-arm]").forEach((inp) => inp.addEventListener("change", () => {
      cfg.armLength[inp.dataset.arm] = num(inp.value) || "";
      cfg.choice = {};
      refresh();
    }));
  }

  function renderKitchenResult() {
    const { plan } = kcalc;
    const el = $("#wf-kitchen-result");
    const walls = plan.walls.map((w) => {
      const segs = w.segments.length ? w.segments.map((s) => {
        const vs = s.variants;
        const pick = vs[0] && vs[0].error
          ? `<span class="badge badge-warn">${escapeHtml(vs[0].error)}</span>`
          : `<select class="input" data-choice="${s.key}">${vs.map((v, i) => {
              const fill = v.fillers.length ? ` · blenda ${v.fillers.map((f) => fmt(f.width)).join(" + ")} mm` : "";
              return `<option value="${i}"${i === s.chosen ? " selected" : ""}>${escapeHtml(v.label)}${fill}${v.warnings.length ? " ⚠" : ""}</option>`;
            }).join("")}</select>`;
        const own = `<input type="text" class="input wf-own" data-custom="${s.key}" value="${escapeHtml(s.custom || "")}"
            placeholder="własne szerokości, np. 600, 800, *" title="Szerokości szafek od lewej (patrząc na ścianę), * = podziel resztę. Puste = podział ogólny.">`;
        return `<div class="row-center mb-8" style="flex-wrap:wrap"><span class="list-row-sub" style="min-width:150px">${fmt(s.u0)}–${fmt(s.u1)} (${fmt(s.u1 - s.u0)} mm)</span>${own}${pick}</div>`;
      }).join("") : `<div class="empty-note">Brak wolnego miejsca.</div>`;
      return `<div class="field"><label>${escapeHtml(wallLabel(w.wallId))}</label>${segs}</div>`;
    }).join("");
    const cabinets = plan.modules.length, panels = plan.panels.length;
    const warn = plan.warnings.length ? `<div class="notice notice-warn mb-8">${plan.warnings.map(escapeHtml).join("<br>")}</div>` : "";
    el.innerHTML = `${walls}${warn}
      <div class="wf-preview">${planSvg(plan)}</div>
      <div class="modal-sub" style="margin:6px 0 0">Do wstawienia: ${cabinets} szafek, ${panels} blend / zaślepek.</div>`;
    el.querySelectorAll("[data-custom]").forEach((inp) => inp.addEventListener("change", () => {
      cfg.custom[inp.dataset.custom] = inp.value.trim();
      cfg.choice[inp.dataset.custom] = 0;
      refresh();
    }));
    el.querySelectorAll("[data-choice]").forEach((sel) => sel.addEventListener("change", () => {
      cfg.choice[sel.dataset.choice] = +sel.value;
      refresh();
    }));
  }

  function compute() {
    const template = state.project.modules.find((m) => m.id === cfg.templateId) || null;
    const row = rowProfile(cfg.type, template);
    const free = findFreeSegments(state.project, cfg.wallId, row, { openingMargin: cfg.openingMargin, doorPassage: cfg.doorPassage });
    if (cfg.u0 === null || cfg.u1 === null) {
      // Domyślnie najdłuższy wolny odcinek.
      const best = free.segments.slice().sort((a, b) => (b.u1 - b.u0) - (a.u1 - a.u0))[0];
      cfg.u0 = best ? round1(best.u0) : 0;
      cfg.u1 = best ? round1(best.u1) : 0;
    }
    const u0 = Math.max(0, Math.min(cfg.u0, free.length));
    const u1 = Math.max(u0, Math.min(cfg.u1, free.length));
    const variants = divideSegment(u1 - u0, fillOpts());
    if (cfg.variant >= variants.length) cfg.variant = 0;
    const v = variants[cfg.variant];
    const items = v && !v.error ? buildFillItems({ u0, u1 }, v) : [];
    const conflicts = items.length ? findPlanConflicts(items, free.blocked, free.length) : [];
    return { template, row, free, u0, u1, variants, items, conflicts };
  }

  function refresh({ keepFocus = false } = {}) {
    const kitchen = cfg.scope === "kitchen";
    dlg.bodyEl.querySelectorAll("#wf-scope .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.scope === cfg.scope));
    dlg.bodyEl.querySelectorAll(".wf-single").forEach((el) => { el.style.display = kitchen ? "none" : ""; });
    dlg.bodyEl.querySelectorAll(".wf-kitchen-only").forEach((el) => { el.style.display = kitchen ? "" : "none"; });
    $("#wf-wall-field").style.display = kitchen ? "none" : "";
    $("#wf-preset-field").style.display = kitchen ? "" : "none";
    dlg.bodyEl.querySelectorAll("#wf-type .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === cfg.type));
    dlg.bodyEl.querySelectorAll("#wf-mode .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === cfg.mode));
    dlg.bodyEl.querySelectorAll("#wf-rest .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.rest === cfg.restMode));
    $("#wf-side-field").style.display = cfg.restMode === "blenda" ? "" : "none";

    const tpl = $("#wf-template");
    const options = state.project.modules.filter((m) => m.type === cfg.type);
    tpl.innerHTML = `<option value="">Nowa pusta szafka (domyślne wymiary)</option>` +
      options.map((m) => `<option value="${escapeHtml(m.id)}">Kopia: ${escapeHtml(m.name || "Szafka")} (${fmt(num(m.dimensions.height))} × ${fmt(num(m.dimensions.depth))})</option>`).join("");
    if (!options.some((m) => m.id === cfg.templateId)) cfg.templateId = "";
    tpl.value = cfg.templateId;
    renderModeField();
    if (kitchen) { refreshKitchen(); return; }
    calc = compute();

    if (!keepFocus || document.activeElement !== $("#wf-u0")) $("#wf-u0").value = calc.u0;
    if (!keepFocus || document.activeElement !== $("#wf-u1")) $("#wf-u1").value = calc.u1;

    renderSegments();
    renderVariants();
    $("#wf-preview").innerHTML = previewSvg(calc);
    renderConflicts();
    applyBtn.disabled = calc.items.filter((i) => i.kind === "cabinet").length === 0;
  }

  function renderSegments() {
    const el = $("#wf-segments");
    const segs = calc.free.segments;
    if (!segs.length) {
      el.innerHTML = `<div class="empty-note">Na tej ścianie nie ma wolnego miejsca dla tego rzędu.</div>`;
      return;
    }
    el.innerHTML = segs.map((s, i) => {
      const active = Math.abs(s.u0 - calc.u0) < 0.5 && Math.abs(s.u1 - calc.u1) < 0.5;
      return `<button type="button" class="btn btn-sm${active ? " active" : ""}" data-seg="${i}">${fmt(s.u0)}–${fmt(s.u1)} <span class="wf-seg-len">(${fmt(s.u1 - s.u0)} mm)</span></button>`;
    }).join("");
    el.querySelectorAll("[data-seg]").forEach((b) => b.addEventListener("click", () => {
      const s = segs[+b.dataset.seg];
      cfg.u0 = round1(s.u0); cfg.u1 = round1(s.u1); cfg.variant = 0;
      refresh();
    }));
  }

  function renderVariants() {
    const el = $("#wf-variants");
    const vs = calc.variants;
    if (vs[0] && vs[0].error) {
      el.innerHTML = `<div class="notice notice-warn">${escapeHtml(vs[0].error)}</div>`;
      return;
    }
    el.innerHTML = vs.map((v, i) => {
      const fill = v.fillers.length ? " · blenda " + v.fillers.map((f) => `${fmt(f.width)} mm ${f.side === "left" ? "z lewej" : "z prawej"}`).join(", ") : "";
      const rest = !v.fillers.length && v.rest > 0 ? ` · luz ${fmt(v.rest)} mm` : "";
      return `<div class="list-row wf-variant${i === cfg.variant ? " is-selected" : ""}" data-variant="${i}">
        <input type="radio" name="wf-variant" ${i === cfg.variant ? "checked" : ""} aria-label="Wybierz wariant">
        <div class="grow">
          <div class="list-row-title">${escapeHtml(v.label)} <span class="list-row-sub">· ${v.widths.length} szt.${fill}${rest}</span></div>
          ${v.warnings.length ? `<div class="list-row-sub">${v.warnings.map((w) => `<span class="badge badge-warn">${escapeHtml(w)}</span>`).join(" ")}</div>` : ""}
        </div>
      </div>`;
    }).join("");
    el.querySelectorAll("[data-variant]").forEach((r) => r.addEventListener("click", () => {
      cfg.variant = +r.dataset.variant;
      refresh();
    }));
  }

  function renderConflicts() {
    const el = $("#wf-conflicts");
    el.innerHTML = calc.conflicts.length
      ? `<div class="notice notice-danger"><b>Kolizje:</b><br>${calc.conflicts.map(escapeHtml).join("<br>")}<br>Szafki zostaną wstawione mimo to - popraw zakres Od/Do albo wybierz wolny odcinek.</div>`
      : "";
  }

  function apply(close) {
    if (cfg.scope === "kitchen") {
      if (!kcalc || !kcalc.plan.modules.length) return;
      applyKitchenRun(kcalc.plan);
      close();
      if (onChange) onChange();
      return;
    }
    if (!calc || !calc.items.some((i) => i.kind === "cabinet")) return;
    applyFillPlan({ wallId: cfg.wallId, items: calc.items, type: cfg.type, template: calc.template });
    close();
    if (onChange) onChange();
  }

  refresh();
}

const round1 = (v) => Math.round(v * 10) / 10;

// Rzut ściany (widok od środka pokoju): istniejące szafki, otwory, zajęte miejsca
// w pasie rzędu, wybrany odcinek i proponowane szafki/blendy. SVG w oknie
// aplikacji, więc kolory z tokenów CSS (klasy .wf-* w global.css).
function previewSvg(calc) {
  const { room, walls } = computeWallLayouts(state.project);
  const wall = walls.find((w) => w.id === cfg.wallId);
  const L = wall.length, H = room.height;
  // Rzut jest ograniczony wysokością okna (max-height), więc font liczony też od wysokości.
  const fs = Math.max(L, H * 1.6) / 55;
  const pad = fs;
  const Y = (y) => H - y;
  const band = { y0: calc.row.y0, y1: calc.row.y1 };
  const out = [];

  out.push(`<rect class="wf-wall" x="0" y="0" width="${L}" height="${H}"/>`);
  wall.items.forEach((it) => {
    out.push(`<rect class="wf-existing" x="${it.u0}" y="${Y(it.y1)}" width="${it.u1 - it.u0}" height="${it.y1 - it.floorY}"/>`);
  });
  (wall.openings || []).forEach((o) => {
    out.push(`<rect class="wf-opening" x="${o.u}" y="${Y(o.sill + o.height)}" width="${o.width}" height="${o.height}"/>`);
  });
  // Zajęte miejsca w pasie rzędu (też z sąsiednich ścian i strefy przed drzwiami).
  calc.free.blocked.forEach((b) => {
    out.push(`<rect class="wf-blocked" x="${b.u0}" y="${Y(band.y1)}" width="${b.u1 - b.u0}" height="${band.y1 - band.y0}"><title>${escapeHtml(b.label)}</title></rect>`);
  });
  out.push(`<rect class="wf-seg" x="${calc.u0}" y="${Y(band.y1)}" width="${calc.u1 - calc.u0}" height="${band.y1 - band.y0}"/>`);

  const bodyY0 = calc.row.posY + calc.row.legsH;
  let n = 0;
  calc.items.forEach((it) => {
    const bad = calc.free.blocked.some((b) => Math.min(it.u0 + it.width, b.u1) - Math.max(it.u0, b.u0) > 1) || it.u0 + it.width > L + 0.5;
    const cls = bad ? "wf-bad" : it.kind === "cabinet" ? "wf-cab" : "wf-blenda";
    out.push(`<rect class="${cls}" x="${it.u0}" y="${Y(bodyY0 + calc.row.height)}" width="${it.width}" height="${calc.row.height}"/>`);
    const cx = it.u0 + it.width / 2;
    if (it.kind === "cabinet") {
      n++;
      out.push(`<text x="${cx}" y="${Y(bodyY0 + calc.row.height / 2) - fs * 0.2}" font-size="${fs}" text-anchor="middle">${fmt(it.width)}</text>`);
      out.push(`<text class="wf-muted" x="${cx}" y="${Y(bodyY0 + calc.row.height / 2) + fs}" font-size="${fs * 0.8}" text-anchor="middle">#${n}</text>`);
    } else {
      out.push(`<text class="wf-muted" x="${cx}" y="${Y(bodyY0 + calc.row.height) - fs * 0.4}" font-size="${fs * 0.75}" text-anchor="middle">${fmt(it.width)}</text>`);
    }
  });

  // Wymiar odcinka pod rzutem.
  const dimY = H + fs * 1.4;
  out.push(`<line class="wf-dim" x1="${calc.u0}" y1="${dimY}" x2="${calc.u1}" y2="${dimY}"/>`);
  out.push(`<line class="wf-dim" x1="${calc.u0}" y1="${dimY - fs / 2}" x2="${calc.u0}" y2="${dimY + fs / 2}"/>`);
  out.push(`<line class="wf-dim" x1="${calc.u1}" y1="${dimY - fs / 2}" x2="${calc.u1}" y2="${dimY + fs / 2}"/>`);
  out.push(`<text x="${(calc.u0 + calc.u1) / 2}" y="${dimY + fs * 1.3}" font-size="${fs}" text-anchor="middle">${fmt(calc.u1 - calc.u0)} mm (od ${fmt(calc.u0)} do ${fmt(calc.u1)})</text>`);

  const vbH = H + fs * 3.4 + pad;
  return `<svg viewBox="${-pad} ${-pad} ${L + 2 * pad} ${vbH + pad}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Podgląd rozmieszczenia na ścianie">
    <defs><pattern id="wf-hatch" patternUnits="userSpaceOnUse" width="${fs}" height="${fs}" patternTransform="rotate(45)">
      <line class="wf-hatch-line" x1="0" y1="0" x2="0" y2="${fs}"/></pattern></defs>
    ${out.join("")}
  </svg>
  <div class="wf-legend"><span class="wf-key wf-key-cab"></span> nowe szafki <span class="wf-key wf-key-blenda"></span> blenda
    <span class="wf-key wf-key-blocked"></span> zajęte w tym rzędzie <span class="wf-key wf-key-opening"></span> okna / drzwi
    <span class="wf-key wf-key-bad"></span> kolizja</div>`;
}

// Rzut z góry (ściana tylna u góry): istniejące szafki, nowe szafki i blendy z planu kuchni L/U.
function planSvg(plan) {
  const room = plan.room;
  const W = room.width, D = room.depth;
  const fs = Math.max(W, D) / 45;
  const pad = fs;
  const out = [`<rect class="wf-wall" x="0" y="0" width="${W}" height="${D}"/>`];
  const rect = (b, cls, label) => {
    out.push(`<rect class="${cls}" x="${b.x0}" y="${b.z0}" width="${b.x1 - b.x0}" height="${b.z1 - b.z0}"/>`);
    if (label) out.push(`<text x="${(b.x0 + b.x1) / 2}" y="${(b.z0 + b.z1) / 2 + fs * 0.35}" font-size="${fs}" text-anchor="middle">${label}</text>`);
  };
  const modBox = (m) => {
    const { worldW, worldD } = getWorldFootprint(m);
    const x0 = num(m.position.x), z0 = num(m.position.z);
    return { x0, x1: x0 + worldW, z0, z1: z0 + worldD };
  };
  (state.project.modules || []).forEach((m) => rect(modBox(m), "wf-existing"));
  (state.project.sidePanels || []).forEach((p) => rect(getSidePanelBox(p), "wf-existing"));
  plan.modules.forEach((m) => rect(modBox(m), m.blindCorner ? "wf-cab wf-cab-blind" : "wf-cab",
    m.type === "corner_cabinet" ? "L" : fmt(num(m.dimensions.width))));
  plan.panels.forEach((p) => rect(getSidePanelBox(p), "wf-blenda"));
  return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${D + 2 * pad}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rzut z góry planowanej zabudowy">
    ${out.join("")}
    <text class="wf-muted" x="${W / 2}" y="${-fs * 0.25}" font-size="${fs * 0.8}" text-anchor="middle">ściana tylna</text>
  </svg>
  <div class="wf-legend"><span class="wf-key wf-key-cab"></span> nowe szafki <span class="wf-key wf-key-blenda"></span> blendy / zaślepki
    <span class="wf-key wf-key-blocked"></span> istniejące</div>`;
}
