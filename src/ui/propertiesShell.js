// src/ui/propertiesShell.js
//
// Wspólna "rama" prawego panelu dla wszystkich rodzajów szafek i boków dokładanych/blend:
// przyklejony nagłówek z nazwą i wymiarami, zwijane sekcje (akordeon) z pamiętanym
// stanem otwarcia oraz blok "Pozycja w przestrzeni (3D)" + "Obrót". Zwykła szafka
// (ui/properties.js), narożna (cornerProperties.js), pod skos (slopeProperties.js) i
// boki/blendy (sidePanelProperties.js) składają panel z tych samych klocków, żeby
// wyglądał i działał tak samo.
import { escapeHtml } from "../utils/dom.js";
import { clampModuleToRoom, restModuleOnNeighbors } from "../core/layout.js";

// Nazwy i ikony sekcji - wspólne, żeby ta sama sekcja (np. "Front") wyglądała tak samo
// w każdym rodzaju szafki i dzieliła stan otwarcia.
export const SECTIONS = {
  wymiary: { label: "Wymiary", icon: "ti-ruler-2" },
  front: { label: "Front", icon: "ti-door" },
  szuflady: { label: "Szuflady", icon: "ti-box" },
  konstrukcja: { label: "Konstrukcja", icon: "ti-layout-board" },
  nogi: { label: "Nóżki", icon: "ti-arrows-vertical" },
  zawiasy: { label: "Zawiasy", icon: "ti-settings" },
  material: { label: "Materiał", icon: "ti-palette" },
};

// Stan otwarcia sekcji pamiętany w localStorage, żeby panel nie "zapominał" układu
// po każdym przerysowaniu (panel jest przerysowywany po wielu zmianach).
const OPEN_SECTIONS_KEY = "propertiesOpenSections";
function loadOpenSections() {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY));
    if (Array.isArray(raw)) return new Set(raw.filter(id => SECTIONS[id]));
  } catch (e) { /* localStorage niedostępny - domyślnie tylko Wymiary */ }
  return new Set(["wymiary"]);
}
function saveOpenSections() {
  try { localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...openSections])); } catch (e) { /* brak zapisu jest nieszkodliwy */ }
}
const openSections = loadOpenSections();

const DOT_TITLE = "Ta szafka ma własne ustawienia, różne od domyślnych projektu";

// Przyklejony nagłówek: nazwa + wymiary (+ dopisek) i pole nazwy o podanym id.
export function propHeaderHtml({ name, dims, extra = "", nameId, nameLabel = "Nazwa szafki:" }) {
  const sub = [dims, extra].filter(Boolean).join(" · ");
  return `
    <div class="prop-sticky">
      <h2>${escapeHtml(name || "")}${sub ? ` <span style="font-weight:400; color:var(--text-secondary); font-size:12px;">${sub}</span>` : ""}</h2>
      <div class="property-group" style="margin-top:6px;">
        <label>${nameLabel}</label>
        <input type="text" id="${nameId}" value="${escapeHtml(name || "")}" style="font-weight: 600;" />
      </div>
    </div>`;
}

// Zwijana sekcja; `overridden` dokłada kropkę "własne ustawienia szafki".
export function sectionHtml(id, html, overridden = false) {
  const t = SECTIONS[id];
  const open = openSections.has(id);
  return `<section class="pacc${open ? " open" : ""}" data-section="${id}">
      <button type="button" class="pacc-head" data-section="${id}" aria-expanded="${open}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>
        <span class="pacc-label">${t.label}</span>
        ${overridden ? `<span class="pacc-dot" title="${DOT_TITLE}"></span>` : ""}
        <i class="ti ti-chevron-down pacc-chev" aria-hidden="true"></i>
      </button>
      <div class="pacc-body">${html}</div>
    </section>`;
}

export function bindSections(root) {
  root.querySelectorAll(".pacc-head").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.section;
      const section = btn.closest(".pacc");
      const nowOpen = !section.classList.contains("open");
      section.classList.toggle("open", nowOpen);
      btn.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) openSections.add(id); else openSections.delete(id);
      saveOpenSections();
    });
  });
}

// Włącza/wyłącza kropkę "własne ustawienia" na już narysowanych sekcjach (bez przerysowania).
export function setSectionDots(root, overridden) {
  root.querySelectorAll(".pacc").forEach(sec => {
    const head = sec.querySelector(".pacc-head");
    const dot = head.querySelector(".pacc-dot");
    if (overridden[sec.dataset.section] && !dot) {
      const d = document.createElement("span");
      d.className = "pacc-dot";
      d.title = DOT_TITLE;
      head.insertBefore(d, head.querySelector(".pacc-chev"));
    } else if (!overridden[sec.dataset.section] && dot) {
      dot.remove();
    }
  });
}

// Pozycja X/Z/Y + obrót co 90°. Pola mają id `${prefix}-x|z|y`, przyciski klasę `rotClass`.
export function positionRotationHtml({ prefix, position, rotation, rotClass, yLabel = "Wysokość od podłogi (Y) [mm]:", hint = "" }) {
  const rot = rotation || 0;
  return `
      <h3>Pozycja w przestrzeni (3D)</h3>
      <div class="property-group prop-box">
        <div class="mb-8"><label class="fs-xs">Odsunięcie od lewej ściany (X) [mm]:</label><input type="number" id="${prefix}-x" value="${position.x || 0}" /></div>
        <div class="mb-8"><label class="fs-xs">Odsunięcie od tylnej ściany (Z) [mm]:</label><input type="number" id="${prefix}-z" value="${position.z || 0}" /></div>
        <div><label class="fs-xs">${yLabel}</label><input type="number" id="${prefix}-y" value="${position.y || 0}" /></div>
      </div>

      <h3>Obrót (co 90°)</h3>
      <div class="property-group seg">
        ${[0, 90, 180, 270].map(r => `<button type="button" class="seg-btn ${rotClass}${rot === r ? " active" : ""}" data-rot="${r}">${r}°</button>`).join("")}
      </div>
      ${hint ? `<div class="hint">${hint}</div>` : ""}`;
}

// Obsługa pól z positionRotationHtml dla jednej szafki - tak samo jak w zwykłej szafce:
// w trakcie pisania tylko odświeżenie sceny, po zatwierdzeniu dociągnięcie do pokoju
// (X/Z) albo oparcie na sąsiedniej szafce (Y), obrót też pilnuje granic pokoju.
// `onChange` = lekkie odświeżenie (3D + lista), `rerender` = przerysowanie panelu.
export function bindModulePosition(root, mod, { prefix, rotClass, onChange, rerender }) {
  ["x", "y", "z"].forEach(axis => {
    const el = root.querySelector(`#${prefix}-${axis}`);
    if (!el) return;
    el.addEventListener("input", e => {
      mod.position[axis] = parseFloat(e.target.value) || 0;
      onChange();
    });
    el.addEventListener("change", () => {
      if (axis === "y") restModuleOnNeighbors(mod); else clampModuleToRoom(mod);
      onChange();
      rerender();
    });
  });
  root.querySelectorAll(`.${rotClass}`).forEach(btn => btn.addEventListener("click", () => {
    mod.rotation = parseInt(btn.dataset.rot, 10);
    clampModuleToRoom(mod); // obrót zamienia W/D odcisku - szafka przy ścianie mogłaby z niej wystawać
    onChange();
    rerender();
  }));
}
