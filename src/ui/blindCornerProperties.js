// src/ui/blindCornerProperties.js
// Sekcja "Narożnik" prawego panelu: szafka ślepa (zwykła szafka - ui/properties.js)
// i okucie narożne szafki L (ui/cornerProperties.js). Obliczenia: core/blindCorner.js,
// katalog okuć: core/cornerFittings.js.
import { state } from "../core/state.js";
import { recalculateLayout } from "../core/layout.js";
import { buildZoneTree, assignFront } from "../core/zoneTree.js";
import { blindGeometry, checkBlindCorner, getBlindCorner, blindHingeSide, DEFAULT_BLIND_FRONT, BLIND_MOUNTS, DEFAULT_BLIND_MOUNT, DEFAULT_STILE_WIDTH } from "../core/blindCorner.js";
import { fittingsOfKind, getCornerFitting, checkCornerFitting } from "../core/cornerFittings.js";
import { escapeHtml } from "../utils/dom.js";
import { num, fmtMm } from "../utils/math.js";
import { sectionHtml } from "./propertiesShell.js";

function fittingOptions(kind, selected) {
  return `<option value="">Bez okucia (półki)</option>` + fittingsOfKind(kind)
    .map((f) => `<option value="${f.id}"${f.id === selected ? " selected" : ""}>${escapeHtml(f.label)}</option>`).join("");
}

function notesHtml(fittingId, warnings) {
  const f = getCornerFitting(fittingId);
  const note = f && f.note ? `<div class="hint mb-8">${escapeHtml(f.note)}</div>` : "";
  const warn = warnings.length ? `<div class="notice notice-warn mb-8">${warnings.map(escapeHtml).join("<br>")}</div>` : "";
  return note + warn;
}

export function blindCornerSectionHtml(mod) {
  const b = getBlindCorner(mod);
  let body = `
    <label class="row-center pointer mb-8"><input type="checkbox" id="input-blind-active"${b ? " checked" : ""}>
      <span>Szafka ślepa - część wchodzi w narożnik pod sąsiedni ciąg szafek</span></label>`;
  if (b) {
    recalculateLayout(mod);
    const g = blindGeometry(mod, state.project);
    body += `
      <div class="property-group"><label>Część ślepa po stronie:</label>
        <div class="seg">
          <button type="button" class="seg-btn btn-blind-side${b.side === "left" ? " active" : ""}" data-side="left">Lewej</button>
          <button type="button" class="seg-btn btn-blind-side${b.side === "right" ? " active" : ""}" data-side="right">Prawej</button>
        </div></div>
      <div class="property-group"><label>Szerokość frontu (drzwi) (mm):</label>
        <input type="number" id="input-blind-front" value="${b.frontWidth}" step="1" min="100"></div>
      <div class="property-group"><label>Okucie narożne:</label>
        <select id="input-blind-fitting">${fittingOptions("blind", b.fitting)}</select></div>
      <div class="property-group"><label>Mocowanie drzwi:</label>
        <select id="input-blind-mount">${Object.entries(BLIND_MOUNTS).map(([id, m]) => `<option value="${id}"${id === b.mount ? " selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}</select></div>
      ${b.mount === "listwa" ? `<div class="property-group"><label>Szerokość listwy (mm):</label>
        <input type="number" id="input-blind-stile" value="${b.stileWidth}" step="5" min="30"></div>` : ""}
      <div class="prop-info"><div class="info-body">
        <div class="info-row"><span class="info-k">Zaślepka</span><span class="info-v">${fmtMm(Math.max(0, g.panelX1 - g.panelX0))} mm</span></div>
        <div class="info-row"><span class="info-k">Od boku do drzwi</span><span class="info-v">${fmtMm(g.blindReach)} mm</span></div>
        <div class="info-row"><span class="info-k">Otwór w świetle</span><span class="info-v">${fmtMm(g.clearOpening)} mm</span></div>
        <div class="info-row"><span class="info-k">Zawiasy</span><span class="info-v">${g.hingeSide === b.side ? "od strony narożnika" : "z dala od narożnika"}</span></div>
      </div></div>
      <div class="hint mb-8">Od boku po stronie ślepej do drzwi musi być co najmniej: odsunięcie od ściany + głębokość szafek sąsiedniej ściany + front + blenda (30–100 mm). LeMans / Cornerstone: drzwi na listwie albo zaślepce (zawias równoległy, otwarcie min. 85°); Magic Corner: zwykłe zawiasy na boku z dala od narożnika.</div>
      ${notesHtml(b.fitting, checkBlindCorner(mod, state.project))}`;
  }
  return sectionHtml("naroznik", body, !!b);
}

// Strona zawiasów drzwi pojedynczych wg mocowania (core/blindCorner.js: blindHingeSide;
// applyBlindCorner pilnuje tego też przy każdym przeliczeniu układu).
function setBlindHingeSide(mod) {
  const side = blindHingeSide(mod);
  if (!side) return;
  (mod.elements || []).forEach((el) => {
    if (el.typ === "front" && el.subtype === "drzwi") el.openingSide = side;
  });
}

// refresh = odświeżenie 3D/listy, rerender = przebudowa panelu.
export function bindBlindCornerSection(root, mod, { refresh, rerender }) {
  root.querySelector("#input-blind-active")?.addEventListener("change", (e) => {
    if (e.target.checked) {
      const W = num(mod.dimensions.width, 600);
      const prev = mod.blindCorner || {};
      mod.blindCorner = {
        side: prev.side || "left",
        frontWidth: prev.frontWidth || (W >= 1000 ? 500 : DEFAULT_BLIND_FRONT),
        fitting: prev.fitting || "",
        mount: prev.mount || DEFAULT_BLIND_MOUNT,
        stileWidth: prev.stileWidth || DEFAULT_STILE_WIDTH,
        active: true,
      };
      setBlindHingeSide(mod);
      // Pusta szafka dostaje od razu drzwi na całą wysokość (przycięte do otworu).
      if (!(mod.elements || []).some((el) => el.typ === "front")) {
        mod.elements = mod.elements || [];
        assignFront(mod, buildZoneTree(mod), "drzwi", { openingSide: blindHingeSide(mod) });
      }
    } else if (mod.blindCorner) {
      mod.blindCorner.active = false;
    }
    refresh(); rerender();
  });
  root.querySelectorAll(".btn-blind-side").forEach((btn) => btn.addEventListener("click", () => {
    mod.blindCorner.side = btn.dataset.side;
    setBlindHingeSide(mod);
    refresh(); rerender();
  }));
  root.querySelector("#input-blind-front")?.addEventListener("change", (e) => {
    mod.blindCorner.frontWidth = Math.max(100, num(e.target.value, DEFAULT_BLIND_FRONT));
    refresh(); rerender();
  });
  root.querySelector("#input-blind-fitting")?.addEventListener("change", (e) => {
    mod.blindCorner.fitting = e.target.value;
    // Okucie z wymaganym mocowaniem (np. Magic Corner - zawias na boku) ustawia je od razu.
    const f = getCornerFitting(e.target.value);
    if (f && f.mounts && !f.mounts.includes(getBlindCorner(mod).mount)) mod.blindCorner.mount = f.mounts[0];
    setBlindHingeSide(mod);
    refresh(); rerender();
  });
  root.querySelector("#input-blind-mount")?.addEventListener("change", (e) => {
    mod.blindCorner.mount = e.target.value;
    setBlindHingeSide(mod);
    refresh(); rerender();
  });
  root.querySelector("#input-blind-stile")?.addEventListener("change", (e) => {
    mod.blindCorner.stileWidth = Math.max(30, num(e.target.value, DEFAULT_STILE_WIDTH));
    refresh(); rerender();
  });
}

// Szafka narożna L: wybór karuzeli.
export function cornerFittingSectionHtml(mod) {
  const id = getCornerFitting(mod.cornerFitting) ? mod.cornerFitting : "";
  const th = num(state.project.materials && state.project.materials.boardThickness, 18) || 18;
  const warnings = id ? checkCornerFitting(id, {
    width: [num(mod.dimensions.width), num(mod.dimensions.legB, num(mod.dimensions.width))],
    innerHeight: num(mod.dimensions.height) - 2 * th,
  }) : [];
  return sectionHtml("naroznik", `
    <div class="property-group"><label>Okucie narożne:</label>
      <select id="input-corner-fitting">${fittingOptions("corner", id)}</select></div>
    ${notesHtml(id, warnings)}`, !!id);
}

export function bindCornerFittingSection(root, mod, { refresh, rerender }) {
  root.querySelector("#input-corner-fitting")?.addEventListener("change", (e) => {
    mod.cornerFitting = e.target.value;
    refresh(); rerender();
  });
}
