// src/ui/interiorEditor.js
//
// Wizualny, klikalny edytor wnętrza szafki — zastępuje (jako alternatywę,
// nie zamiennik) dotychczasowy jedyny sposób budowania wnętrza: kliknięcie
// prawym przyciskiem dokładnie w plecy korpusu w widoku 3D. Tutaj cały układ
// wnęk widać naraz, z góry, jako rzut czołowy; klik w wnękę pokazuje mini-pasek
// narzędzi (podziel poziomo/pionowo, obsadź frontem, usuń), klik w dzielnik
// pozwala go przeciągnąć albo usunąć. Logika podziału/scalania siedzi w
// core/zoneTree.js (czysta, testowana) — ten plik tylko rysuje i obsługuje
// wejście.
import { state, getActiveModule } from "../core/state.js";
import {
  buildZoneTree,
  splitZoneHorizontal,
  splitZoneVertical,
  removeSplit,
  toggleStructural,
  assignFront,
  moveSplit,
} from "../core/zoneTree.js";
import { update3D, enterAlignMode } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";
import { autoDistributeShelves } from "../core/shelfMath.js";

const FRONT_LABELS = {
  drzwi: "Drzwi",
  "drzwi-lp": "Drzwi L/P",
  szuflada: "Szuflada",
  "szuflada-wewnetrzna": "Szuflada wewn.",
};
const FRONT_COLORS = {
  drzwi: { fill: "#eff6ff", border: "#2563eb" },
  "drzwi-lp": { fill: "#eff6ff", border: "#2563eb" },
  szuflada: { fill: "#fff7ed", border: "#d97706" },
  "szuflada-wewnetrzna": { fill: "#fff7ed", border: "#c2410c" },
};

let selectedNode = null; // węzeł drzewa aktualnie pod pływającym paskiem
let toolbarMode = null; // null | 'zone' | 'front-picker' | 'divider'

function getContainer() {
  return document.getElementById("editor-interior-container");
}

export function isInteriorEditorVisible() {
  const el = getContainer();
  return !!el && el.style.display !== "none";
}

export function toggleInteriorEditor() {
  const interior = getContainer();
  const viewer3d = document.getElementById("editor-3d-container");
  if (!interior) return;
  const showing = interior.style.display === "none" || !interior.style.display;
  interior.style.display = showing ? "block" : "none";
  if (viewer3d) viewer3d.style.display = showing ? "none" : "block";
  if (showing) renderInteriorEditor();
}

// Wołane z update3D()/updateSidebar()/initPropertiesPanel() — czyli tam,
// gdzie cała reszta aplikacji już dziś odświeża swoje panele po zmianie
// stanu (patrz CLAUDE.md: "Update flow"). Tanie, gdy panel jest ukryty.
export function renderInteriorEditorIfVisible() {
  if (isInteriorEditorVisible()) renderInteriorEditor();
}

function refreshAfterEdit() {
  selectedNode = null;
  toolbarMode = null;
  update3D();
  updateSidebar();
  initPropertiesPanel();
  renderInteriorEditor();
}

export function renderInteriorEditor() {
  const container = getContainer();
  if (!container) return;
  container.innerHTML = "";

  const mod = getActiveModule();
  if (!mod) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-family:sans-serif;">Wybierz szafkę, żeby edytować jej wnętrze</div>`;
    return;
  }

  const W = parseFloat(mod.dimensions.width) || 600;
  const H = parseFloat(mod.dimensions.height) || 720;
  const pad = 40;
  const availW = Math.max(container.clientWidth - pad * 2, 100);
  const availH = Math.max(container.clientHeight - pad * 2, 100);
  const scale = Math.min(availW / W, availH / H);
  const originX = (container.clientWidth - W * scale) / 2;
  const originTop = (container.clientHeight - H * scale) / 2;

  // mm -> px: X wprost, Y odwrócone (0mm = dół korpusu = duże piksele)
  const toPxX = (mmX) => originX + mmX * scale;
  const toPxY = (mmY) => originTop + (H - mmY) * scale;
  const toPxLen = (mm) => mm * scale;

  const stage = document.createElement("div");
  Object.assign(stage.style, { position: "absolute", inset: "0", fontFamily: "sans-serif", userSelect: "none" });

  const title = document.createElement("div");
  title.innerHTML = `🗂️ Wnętrze: <b>${escapeHtml(mod.name)}</b> <span style="color:#94a3b8; font-weight:normal;">— klik w wnękę: podziel / obsadź · klik w dzielnik: przesuń / usuń</span>`;
  Object.assign(title.style, { position: "absolute", top: "10px", left: "16px", fontSize: "13px", color: "#1e3a8a" });
  stage.appendChild(title);

  // obrys całej szafki (boki/wieńce) dla kontekstu
  const shell = document.createElement("div");
  Object.assign(shell.style, {
    position: "absolute",
    left: toPxX(0) + "px",
    top: toPxY(H) + "px",
    width: toPxLen(W) + "px",
    height: toPxLen(H) + "px",
    border: "2px solid #334155",
    background: "#ffffff",
    boxSizing: "border-box",
  });
  stage.appendChild(shell);

  const tree = buildZoneTree(mod);
  renderNode(tree, stage, { toPxX, toPxY, toPxLen });

  container.appendChild(stage);

  // klik poza wnęką/dzielnikiem = zamknij pływający pasek
  stage.addEventListener("click", (e) => {
    if (e.target === stage || e.target === shell) closeToolbar();
  });
}

function renderNode(node, stage, px) {
  if (node.type === "leaf") {
    renderLeaf(node, stage, px);
    return;
  }
  renderNode(node.a, stage, px);
  renderNode(node.b, stage, px);
  renderDividerHandle(node, stage, px);
}

function renderLeaf(node, stage, px) {
  const { minX, maxX, minY, maxY } = node.rect;
  const el = document.createElement("div");
  const isOccupied = node.fronts.length > 0;
  const isMultiFront = node.fronts.length > 1;
  const colors = isOccupied ? FRONT_COLORS[node.fronts[0].subtype] || { fill: "#f1f5f9", border: "#94a3b8" } : null;

  // Przy kilku frontach w jednej wnęce (np. 3 szuflady jedna nad drugą) sam
  // prostokąt wnęki zostaje tylko celem kliknięcia (cała grupa to jeden front
  // w sensie "Usuń front"/kierunek otwierania) - realny podział rysują
  // osobne, nieklikalne boksy niżej, każdy na własnej pozycji z layoutu.
  Object.assign(el.style, {
    position: "absolute",
    left: px.toPxX(minX) + "px",
    top: px.toPxY(maxY) + "px",
    width: px.toPxLen(maxX - minX) + "px",
    height: px.toPxLen(maxY - minY) + "px",
    boxSizing: "border-box",
    border: isOccupied ? (isMultiFront ? `1px dashed ${colors.border}` : `1.5px solid ${colors.border}`) : "1px dashed #cbd5e1",
    background: isOccupied ? (isMultiFront ? "transparent" : colors.fill) : "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "11px",
    color: isOccupied ? colors.border : "#94a3b8",
    transition: "background .12s",
  });
  el.dataset.leaf = "1";

  if (isOccupied && !isMultiFront) {
    el.innerText = FRONT_LABELS[node.fronts[0].subtype] || node.fronts[0].subtype;
  } else if (!isOccupied) {
    el.innerText = "+ pusta wnęka";
  }

  el.addEventListener("mouseenter", () => { if (!isOccupied) el.style.background = "#e0f2fe"; });
  el.addEventListener("mouseleave", () => { if (!isOccupied) el.style.background = "#f8fafc"; });
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectNode(node, el, stage, px, isOccupied ? "occupied" : "empty");
  });

  stage.appendChild(el);

  if (isMultiFront) {
    node.fronts.forEach((front) => {
      const fx = parseFloat(front.x);
      const fy = parseFloat(front.y);
      const fw = parseFloat(front.w);
      const fh = parseFloat(front.h);
      if ([fx, fy, fw, fh].some((v) => isNaN(v))) return;

      const box = document.createElement("div");
      Object.assign(box.style, {
        position: "absolute",
        left: px.toPxX(fx) + "px",
        top: px.toPxY(fy + fh) + "px",
        width: px.toPxLen(fw) + "px",
        height: px.toPxLen(fh) + "px",
        boxSizing: "border-box",
        border: `1.5px solid ${colors.border}`,
        background: colors.fill,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontSize: "10px",
        color: colors.border,
        pointerEvents: "none",
      });
      box.innerText = FRONT_LABELS[front.subtype] || front.subtype;
      stage.appendChild(box);
    });
  }
}

function renderDividerHandle(node, stage, px) {
  const handle = document.createElement("div");
  const isH = node.axis === "h";
  const { minX, maxX, minY, maxY } = node.rect;

  if (isH) {
    Object.assign(handle.style, {
      position: "absolute",
      left: px.toPxX(minX) + "px",
      top: px.toPxY(node.divider.y + node.divider.h) + "px",
      width: px.toPxLen(maxX - minX) + "px",
      height: Math.max(px.toPxLen(node.divider.h), 5) + "px",
      cursor: "ns-resize",
    });
  } else {
    Object.assign(handle.style, {
      position: "absolute",
      left: px.toPxX(node.divider.x) + "px",
      top: px.toPxY(maxY) + "px",
      width: Math.max(px.toPxLen(node.divider.w), 5) + "px",
      height: px.toPxLen(maxY - minY) + "px",
      cursor: "ew-resize",
    });
  }
  handle.style.background = node.divider.isStructural ? "#a7f3d0" : "#cbd5e1";
  handle.style.border = "1px solid #475569";
  handle.style.boxSizing = "border-box";
  handle.style.zIndex = "2";

  let dragging = false;
  let dragStartClient = 0;
  let dragStartPos = 0;

  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    dragging = false;
    dragStartClient = isH ? e.clientY : e.clientX;
    dragStartPos = isH ? node.divider.y : node.divider.x;

    const onMove = (ev) => {
      const deltaClient = (isH ? ev.clientY : ev.clientX) - dragStartClient;
      if (Math.abs(deltaClient) > 3) dragging = true;
      if (!dragging) return;
      // px -> mm: oś Y jest odwrócona względem ekranu
      const deltaMm = isH ? -deltaClient / (handle._scale || 1) : deltaClient / (handle._scale || 1);
      const mod = getActiveModule();
      if (!mod) return;
      moveSplit(mod, node, dragStartPos + deltaMm);
      renderInteriorEditor();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragging) {
        const mod = getActiveModule();
        if (mod) refreshAfterEdit();
      } else {
        // zwykły klik (bez przeciągnięcia) - pokaż mini-pasek narzędzi dzielnika
        selectNode(node, handle, stage, px, "divider");
      }
    };
    handle._scale = px.toPxLen(1);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  stage.appendChild(handle);
}

function escapeHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- pływający pasek narzędzi ----------

function closeToolbar() {
  const existing = document.getElementById("interior-toolbar");
  if (existing) existing.remove();
  selectedNode = null;
  toolbarMode = null;
}

function selectNode(node, anchorEl, stage, px, mode) {
  closeToolbar();
  selectedNode = node;
  toolbarMode = mode;

  const toolbar = document.createElement("div");
  toolbar.id = "interior-toolbar";
  Object.assign(toolbar.style, {
    position: "absolute",
    zIndex: "10",
    background: "#1e293b",
    borderRadius: "8px",
    padding: "6px",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)",
    maxWidth: "260px",
  });

  const rect = anchorEl.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  toolbar.style.left = Math.max(4, rect.left - stageRect.left + rect.width / 2 - 90) + "px";
  toolbar.style.top = Math.max(30, rect.top - stageRect.top - 42) + "px";

  const addBtn = (label, title, onClick, danger = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerText = label;
    b.title = title;
    Object.assign(b.style, {
      fontFamily: "sans-serif",
      fontSize: "11.5px",
      fontWeight: "bold",
      color: "#fff",
      background: danger ? "#7f1d1d" : "#334155",
      border: "none",
      borderRadius: "5px",
      padding: "7px 9px",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    b.addEventListener("mouseenter", () => { b.style.background = danger ? "#991b1b" : "#475569"; });
    b.addEventListener("mouseleave", () => { b.style.background = danger ? "#7f1d1d" : "#334155"; });
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    toolbar.appendChild(b);
    return b;
  };

  const mod = getActiveModule();

  if (mode === "empty") {
    addBtn("⬍ Podziel poziomo", "Dodaj półkę na środku wysokości", () => {
      splitZoneHorizontal(mod, selectedNode);
      refreshAfterEdit();
    });
    addBtn("⬌ Podziel pionowo", "Dodaj przegrodę na środku szerokości", () => {
      splitZoneVertical(mod, selectedNode);
      refreshAfterEdit();
    });
    addBtn("▭ Drzwi", "Zabuduj wnękę pojedynczymi drzwiami", () => {
      assignFront(mod, selectedNode, "drzwi");
      refreshAfterEdit();
    });
    addBtn("▭▭ Drzwi L/P", "Zabuduj wnękę parą drzwi", () => {
      assignFront(mod, selectedNode, "drzwi-lp");
      refreshAfterEdit();
    });
    appendDrawerPicker(toolbar, mod, "szuflada", "📦 Szuflady zewn.");
    appendDrawerPicker(toolbar, mod, "szuflada-wewnetrzna", "📥 Szuflady wewn.");
    appendAutoShelvesPicker(toolbar, mod, selectedNode);
  } else if (mode === "occupied") {
    const subtype = selectedNode.fronts[0]?.subtype;
    const label = FRONT_LABELS[subtype] || subtype;
    const info = document.createElement("div");
    info.innerText = `${label} × ${selectedNode.fronts.length}`;
    Object.assign(info.style, { color: "#cbd5e1", fontSize: "11px", padding: "6px 4px", fontFamily: "sans-serif" });
    toolbar.appendChild(info);
    if (subtype === "drzwi") {
      const door = selectedNode.fronts[0];
      const isLeft = door.openingSide === "left" || !door.openingSide;
      addBtn(isLeft ? "🔄 Zawias z prawej" : "🔄 Zawias z lewej", "Zmienia kierunek otwierania drzwi", () => {
        door.openingSide = isLeft ? "right" : "left";
        refreshAfterEdit();
      });
    }
    addBtn("🗑️ Usuń front", "Usuwa front, wnęka zostaje pusta", () => {
      // usunięcie frontu = przypisanie "pustego" -> wystarczy usunąć elementy z fronts
      const ids = new Set(selectedNode.fronts.map((f) => f.id));
      mod.elements = mod.elements.filter((el) => !ids.has(el.id));
      refreshAfterEdit();
    }, true);
  } else if (mode === "divider") {
    const isPoziom = selectedNode.axis === "h";
    if (isPoziom) {
      addBtn(
        selectedNode.divider.isStructural ? "🔩 Zmień na ruchomą" : "🔩 Zmień na konstrukcyjną",
        "Konstrukcyjna = na stałe wkręcona, ruchoma = na podpórkach",
        () => { toggleStructural(selectedNode); refreshAfterEdit(); }
      );
      addBtn("🧲 Wyrównaj do innej szafki", "Przełącza na widok 3D i pozwala kliknąć wieniec/półkę innej szafki, do której wyrównać tę półkę", () => {
        const divider = selectedNode.divider;
        closeToolbar();
        toggleInteriorEditor();
        enterAlignMode(mod, divider);
      });
    }
    addBtn("🗑️ Usuń podział", "Usuwa dzielnik i wszystko, co jest w obu powstałych z niego wnękach", () => {
      removeSplit(mod, selectedNode);
      refreshAfterEdit();
    }, true);
  }

  const closeBtn = addBtn("✕", "Zamknij", () => closeToolbar());
  closeBtn.style.background = "transparent";
  closeBtn.style.marginLeft = "auto";

  stage.appendChild(toolbar);
}

function appendDrawerPicker(toolbar, mod, subtype, label) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { display: "flex", alignItems: "center", gap: "4px", background: "#334155", borderRadius: "5px", padding: "3px 3px 3px 9px" });

  const lbl = document.createElement("span");
  lbl.innerText = label;
  Object.assign(lbl.style, { fontFamily: "sans-serif", fontSize: "11.5px", fontWeight: "bold", color: "#fff" });

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.value = "1";
  input.title = "Ile frontów (np. 3 szuflady jedna pod drugą)";
  Object.assign(input.style, { width: "34px", padding: "5px 3px", border: "none", borderRadius: "4px", textAlign: "center", fontSize: "11px" });
  input.addEventListener("click", (e) => e.stopPropagation());

  const go = document.createElement("button");
  go.type = "button";
  go.innerText = "+";
  Object.assign(go.style, { width: "22px", height: "22px", border: "none", borderRadius: "4px", background: "#0284c7", color: "#fff", fontWeight: "bold", cursor: "pointer" });
  go.addEventListener("click", (e) => {
    e.stopPropagation();
    const count = Math.max(1, parseInt(input.value, 10) || 1);
    assignFront(mod, selectedNode, subtype, { distribution: String(count) });
    refreshAfterEdit();
  });

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  wrap.appendChild(go);
  toolbar.appendChild(wrap);
}

// Port 1:1 z menu kontekstowego 3D (render/viewer3d.js) - rozmieszcza N półek
// równomiernie w pustej wnęce, licząc odstępy przez core/shelfMath.js.
function appendAutoShelvesPicker(toolbar, mod, node) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { display: "flex", alignItems: "center", gap: "4px", background: "#334155", borderRadius: "5px", padding: "3px 3px 3px 9px" });

  const lbl = document.createElement("span");
  lbl.innerText = "📚 Półki równo";
  Object.assign(lbl.style, { fontFamily: "sans-serif", fontSize: "11.5px", fontWeight: "bold", color: "#fff" });

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.value = "2";
  input.title = "Ile półek rozmieścić równomiernie w tej wnęce";
  Object.assign(input.style, { width: "34px", padding: "5px 3px", border: "none", borderRadius: "4px", textAlign: "center", fontSize: "11px" });
  input.addEventListener("click", (e) => e.stopPropagation());

  const go = document.createElement("button");
  go.type = "button";
  go.innerText = "+";
  Object.assign(go.style, { width: "22px", height: "22px", border: "none", borderRadius: "4px", background: "#0284c7", color: "#fff", fontWeight: "bold", cursor: "pointer" });
  go.addEventListener("click", (e) => {
    e.stopPropagation();
    const count = Math.max(1, parseInt(input.value, 10) || 1);
    const th = parseFloat(state.project.materials?.boardThickness) || 18;
    const { minX, maxX, minY, maxY } = node.rect;
    const shelves = autoDistributeShelves(maxY - minY, th, count);
    const ts = Date.now();
    shelves.forEach((s, idx) => {
      mod.elements.push({
        id: "poziom-auto-" + ts + "-" + idx,
        typ: "poziom", x: minX, y: minY + s.y, w: maxX - minX, h: th, isStructural: false,
      });
    });
    refreshAfterEdit();
  });

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  wrap.appendChild(go);
  toolbar.appendChild(wrap);
}
