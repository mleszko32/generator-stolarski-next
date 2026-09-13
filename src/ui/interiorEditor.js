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
import { getActiveModule } from "../core/state.js";
import {
  buildZoneTree,
  splitZoneHorizontal,
  splitZoneVertical,
  removeSplit,
  toggleStructural,
  assignFront,
  moveSplit,
  addEvenShelves,
} from "../core/zoneTree.js";
import { update3D, enterAlignMode, areFrontsVisible } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { initPropertiesPanel } from "./properties.js";

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
let toolbarMode = null; // null | 'empty' | 'occupied' | 'divider'

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

// Rysuje węzeł drzewa. Front (jeśli jest) może być przypisany do węzła
// 'split', nie tylko 'leaf' (patrz core/zoneTree.js) - dlatego overlay frontu
// i rekurencja w głąb (dzielniki/wnęki zagnieżdżone ZA tym frontem) są od
// siebie niezależne: front rysuje się jako tło całego node.rect, a wszystko
// zagnieżdżone rysuje się NA WIERZCHU (później w DOM = wyżej wizualnie),
// więc dalej można kliknąć i edytować to, co jest za frontem.
// `parentH`/`parentV` = najbliższy węzeł 'split' (odpowiednio osi 'h'/'v'),
// którego dzielnik rządzi wysokością/szerokością aktualnie renderowanego
// węzła - przekazywane w dół rekurencji, PODMIENIANE tylko gdy mijamy split
// tej samej osi (split przeciwnej osi nie zmienia np. zakresu Y, więc
// "kto rządzi wysokością" zostaje ten sam, sprzed tego splitu). Używane przez
// appendDimTag(), żeby wiedzieć, który dzielnik przesunąć przy edycji wymiaru.
function renderNode(node, stage, px, insideFront = false, parentH = null, parentV = null) {
  const hasFront = node.fronts.length > 0;
  // "Ukryj fronty zewn." (render/viewer3d.js) ukrywa fronty tu tak samo jak
  // w podglądzie 3D - front nadal istnieje (klik dalej otwiera "occupied"),
  // ale rysuje się przezroczyście, żeby dało się zobaczyć, co jest za nim.
  const frontsHidden = hasFront && !areFrontsVisible();
  if (hasFront) {
    renderFrontOverlay(node, stage, px, parentH, parentV, frontsHidden);
  }
  if (node.type === "leaf") {
    if (!hasFront) renderLeaf(node, stage, px, insideFront, parentH, parentV);
    return;
  }
  const nextParentH = node.axis === "h" ? node : parentH;
  const nextParentV = node.axis === "v" ? node : parentV;
  const nestedInsideFront = insideFront || (hasFront && !frontsHidden);
  renderNode(node.a, stage, px, nestedInsideFront, nextParentH, nextParentV);
  renderNode(node.b, stage, px, nestedInsideFront, nextParentH, nextParentV);
  renderDividerHandle(node, stage, px);
}

// Czy `node` leży po stronie 'a' (dół/lewo) czy 'b' (góra/prawo) dzielnika
// węzła `parentSplit` - działa niezależnie od głębokości zagnieżdżenia, bo
// split PROSTOPADŁEJ osi nie zmienia zakresu tej osi (patrz core/zoneTree.js).
function dividerSide(node, parentSplit, isH) {
  if (!parentSplit) return null;
  return isH
    ? Math.abs(node.rect.maxY - parentSplit.divider.y) < 3 ? "a" : "b"
    : Math.abs(node.rect.maxX - parentSplit.divider.x) < 3 ? "a" : "b";
}

// Rysuje wymiary wnęki jak na rysunku technicznym: linia ze strzałkami na
// obu końcach (szerokość - wzdłuż dołu, wysokość - wzdłuż prawej krawędzi),
// przerwana "okienkiem" z liczbą (edytowalną, patrz appendDimNumber) i kłódką
// blokującą ją przed automatycznym dociąganiem, gdy gdzie indziej w drzewie
// coś innego się zmieni (core/zoneTree.js: divider.lockA/B). Wymiar bez
// dzielnika, który by nim rządził (np. cała, niepodzielona jeszcze wnęka),
// rysuje się tą samą linią ze strzałkami, ale liczba zostaje statyczna
// (nie ma czego przesuwać).
function appendDimTag(parentEl, node, parentH, parentV) {
  appendDimLine(parentEl, true, node, parentV, dividerSide(node, parentV, false));
  appendDimLine(parentEl, false, node, parentH, dividerSide(node, parentH, true));
}

const DIM_MARGIN = 7; // px od krawędzi wnęki, żeby strzałki nie nachodziły na jej ramkę

function appendDimLine(parentEl, isH, node, parentSplit, side) {
  const valueMm = isH ? node.rect.maxX - node.rect.minX : node.rect.maxY - node.rect.minY;
  const locked = !!parentSplit && (side === "a" ? !!parentSplit.divider.lockA : !!parentSplit.divider.lockB);
  const color = !parentSplit ? "#94a3b8" : locked ? "#b45309" : "#0284c7";

  const line = document.createElement("div");
  Object.assign(line.style, { position: "absolute", pointerEvents: "none" });
  if (isH) {
    Object.assign(line.style, { left: DIM_MARGIN + "px", right: DIM_MARGIN + "px", bottom: "4px", height: "1px", background: color });
  } else {
    Object.assign(line.style, { top: DIM_MARGIN + "px", bottom: DIM_MARGIN + "px", right: "4px", width: "1px", background: color });
  }

  const arrow = (atStart) => {
    const a = document.createElement("div");
    Object.assign(a.style, { position: "absolute", width: "0", height: "0" });
    if (isH) {
      a.style.top = "-3px";
      Object.assign(a.style, { borderTop: "3px solid transparent", borderBottom: "3px solid transparent" });
      if (atStart) { a.style.left = "0"; a.style.borderRight = `5px solid ${color}`; }
      else { a.style.right = "0"; a.style.borderLeft = `5px solid ${color}`; }
    } else {
      a.style.left = "-3px";
      Object.assign(a.style, { borderLeft: "3px solid transparent", borderRight: "3px solid transparent" });
      if (atStart) { a.style.top = "0"; a.style.borderBottom = `5px solid ${color}`; }
      else { a.style.bottom = "0"; a.style.borderTop = `5px solid ${color}`; }
    }
    return a;
  };
  line.appendChild(arrow(true));
  line.appendChild(arrow(false));
  parentEl.appendChild(line);

  // "Okienko" - przerywa linię tam, gdzie siedzi liczba, dokładnie jak na
  // rysunku technicznym. Osobny element (nie dziecko `line`, które ma
  // pointer-events:none), wyśrodkowany na linii przez transform.
  const windowEl = document.createElement("div");
  Object.assign(windowEl.style, {
    position: "absolute",
    background: "rgba(255,255,255,0.95)",
    border: `1px solid ${color}`,
    borderRadius: "3px",
    padding: "0 3px",
    fontSize: "9px",
    fontFamily: "sans-serif",
    lineHeight: "13px",
    display: "flex",
    alignItems: "center",
    gap: "1px",
    whiteSpace: "nowrap",
  });
  if (isH) {
    Object.assign(windowEl.style, { left: "50%", bottom: "4px", transform: "translate(-50%, 50%)" });
  } else {
    Object.assign(windowEl.style, { top: "50%", right: "4px", transform: "translate(50%, -50%)" });
  }
  windowEl.addEventListener("click", (e) => e.stopPropagation());
  parentEl.appendChild(windowEl);

  appendDimNumber(windowEl, valueMm, parentSplit, side, (mm) => {
    const mod = getActiveModule();
    if (isH) {
      const newX = side === "a" ? node.rect.minX + mm : node.rect.maxX - mm - parentSplit.divider.w;
      moveSplit(mod, parentSplit, newX);
    } else {
      const newY = side === "a" ? node.rect.minY + mm : node.rect.maxY - mm - parentSplit.divider.h;
      moveSplit(mod, parentSplit, newY);
    }
    refreshAfterEdit();
  });
}

function appendDimNumber(container, valueMm, parentSplit, side, onCommit) {
  const rounded = Math.round(valueMm);
  if (!parentSplit) {
    const span = document.createElement("span");
    span.innerText = rounded;
    container.appendChild(span);
    return;
  }

  const locked = side === "a" ? !!parentSplit.divider.lockA : !!parentSplit.divider.lockB;

  const numSpan = document.createElement("span");
  numSpan.innerText = rounded;
  numSpan.title = "Kliknij, żeby wpisać dokładny wymiar";
  Object.assign(numSpan.style, {
    cursor: "pointer",
    borderBottom: "1px dotted #0284c7",
    color: locked ? "#b45309" : "#0284c7",
    fontWeight: locked ? "bold" : "normal",
  });
  numSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.type = "number";
    input.value = rounded;
    Object.assign(input.style, { width: "36px", fontSize: "9px", padding: "0 2px", verticalAlign: "middle" });
    input.addEventListener("click", (ev) => ev.stopPropagation());
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") input.blur();
      if (ev.key === "Escape") { input.value = rounded; input.blur(); }
    });
    input.addEventListener("blur", () => {
      const mm = parseFloat(input.value);
      if (Number.isFinite(mm) && mm > 0 && Math.round(mm) !== rounded) onCommit(mm);
      else if (input.parentNode) input.parentNode.replaceChild(numSpan, input);
    });
    container.replaceChild(input, numSpan);
    input.focus();
    input.select();
  });

  const lockBtn = document.createElement("span");
  lockBtn.innerText = locked ? "🔒" : "🔓";
  lockBtn.title = locked
    ? "Odblokuj ten wymiar (znów będzie się dostosowywał automatycznie)"
    : "Zablokuj ten wymiar (nie zmieni się, gdy dostosowują się inne wnęki)";
  Object.assign(lockBtn.style, { cursor: "pointer", fontSize: "8px" });
  lockBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (side === "a") parentSplit.divider.lockA = !locked; else parentSplit.divider.lockB = !locked;
    refreshAfterEdit();
  });

  container.appendChild(numSpan);
  container.appendChild(lockBtn);
}

// `insideFront` = ta pusta wnęka leży wewnątrz regionu, który ma już
// przypisany front na wyższym poziomie drzewa (patrz renderNode) - front
// rysuje się jako tło pod spodem, więc tu NIE możemy dać nieprzezroczystego
// wypełnienia, bo zasłoniłoby front (i jego etykietę/wymiar) całkowicie.
// Zamiast tego tylko przerywana ramka, żeby dało się kliknąć i dodać kolejny
// podział, a front dalej było widać "przez" tę wnękę.
function renderLeaf(node, stage, px, insideFront = false, parentH = null, parentV = null) {
  const { minX, maxX, minY, maxY } = node.rect;
  const el = document.createElement("div");
  const idleBg = insideFront ? "transparent" : "#f8fafc";
  const hoverBg = insideFront ? "rgba(224,242,254,0.55)" : "#e0f2fe";

  Object.assign(el.style, {
    position: "absolute",
    left: px.toPxX(minX) + "px",
    top: px.toPxY(maxY) + "px",
    width: px.toPxLen(maxX - minX) + "px",
    height: px.toPxLen(maxY - minY) + "px",
    boxSizing: "border-box",
    border: insideFront ? "1px dashed rgba(100,116,139,0.6)" : "1px dashed #cbd5e1",
    background: idleBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "11px",
    color: insideFront ? "#475569" : "#94a3b8",
    transition: "background .12s",
  });
  el.dataset.leaf = "1";
  el.innerText = "+ pusta wnęka";

  el.addEventListener("mouseenter", () => { el.style.background = hoverBg; });
  el.addEventListener("mouseleave", () => { el.style.background = idleBg; });
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectNode(node, el, stage, px, "empty");
  });

  stage.appendChild(el);
  appendDimTag(el, node, parentH, parentV);
}

// Rysuje front (jeden albo kilka, np. 3 szuflady jedna nad drugą) rozpięty na
// CAŁYM node.rect - node może być 'leaf' ALBO 'split' (patrz komentarz przy
// renderNode). Przy kilku frontach w tej samej wnęce sam prostokąt node.rect
// zostaje tylko celem kliknięcia (cała grupa to jeden front w sensie "Usuń
// front"/kierunek otwierania) - realny podział rysują osobne, nieklikalne
// boksy niżej, każdy na własnej pozycji z layoutu.
// `hidden` = przycisk "Ukryj fronty zewn." (render/viewer3d.js) jest aktywny -
// front nadal ISTNIEJE i klik na niego dalej otwiera "occupied" (żeby dało
// się go np. usunąć czy zmienić), ale rysuje się przezroczyście, żeby dało
// się zobaczyć, co jest realnie za nim (dokładnie to samo, co ten przycisk
// robi już w podglądzie 3D).
function renderFrontOverlay(node, stage, px, parentH = null, parentV = null, hidden = false) {
  const { minX, maxX, minY, maxY } = node.rect;
  const isMultiFront = node.fronts.length > 1;
  // Węzeł 'split' ma zagnieżdżoną, klikalną zawartość (dzielniki, puste
  // pod-wnęki) rysowaną NA WIERZCHU tego overlayu (patrz renderNode) - duża
  // wyśrodkowana etykieta kolidowałaby wtedy wizualnie z ich własnymi "+
  // pusta wnęka", więc dla takich węzłów etykieta frontu idzie do rogu.
  const hasNestedContent = node.type === "split";
  const colors = FRONT_COLORS[node.fronts[0].subtype] || { fill: "#f1f5f9", border: "#94a3b8" };
  const badgeStyle = hidden || hasNestedContent;

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    left: px.toPxX(minX) + "px",
    top: px.toPxY(maxY) + "px",
    width: px.toPxLen(maxX - minX) + "px",
    height: px.toPxLen(maxY - minY) + "px",
    boxSizing: "border-box",
    border: hidden ? "1px dashed rgba(100,116,139,0.6)" : isMultiFront ? `1px dashed ${colors.border}` : `1.5px solid ${colors.border}`,
    background: hidden ? "transparent" : isMultiFront ? "transparent" : colors.fill,
    display: isMultiFront || badgeStyle ? "block" : "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "11px",
    color: colors.border,
  });
  el.dataset.leaf = "1";

  if (!isMultiFront) {
    const labelText = (FRONT_LABELS[node.fronts[0].subtype] || node.fronts[0].subtype) + (hidden ? " (ukryty)" : "");
    if (badgeStyle) {
      const badge = document.createElement("div");
      badge.innerText = labelText;
      Object.assign(badge.style, {
        position: "absolute",
        left: "4px",
        top: "2px",
        fontSize: "10px",
        fontWeight: "bold",
        color: colors.border,
        background: "rgba(255,255,255,0.85)",
        padding: "0 4px",
        borderRadius: "3px",
        pointerEvents: "none",
      });
      el.appendChild(badge);
    } else {
      el.innerText = labelText;
    }
  } else if (hidden) {
    const label = FRONT_LABELS[node.fronts[0].subtype] || node.fronts[0].subtype;
    const badge = document.createElement("div");
    badge.innerText = `${label} ×${node.fronts.length} (ukryte)`;
    Object.assign(badge.style, {
      position: "absolute",
      left: "4px",
      top: "2px",
      fontSize: "10px",
      fontWeight: "bold",
      color: colors.border,
      background: "rgba(255,255,255,0.85)",
      padding: "0 4px",
      borderRadius: "3px",
      pointerEvents: "none",
    });
    el.appendChild(badge);
  }

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectNode(node, el, stage, px, "occupied");
  });

  stage.appendChild(el);
  appendDimTag(el, node, parentH, parentV);

  if (isMultiFront && !hidden) {
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
    // Podziel/półki równo można dodać TYLKO wtedy, gdy ta wnęka jeszcze nie ma
    // żadnego wewnętrznego podziału (node.type === 'leaf') - front przetrwa
    // (patrz core/zoneTree.js). Jeśli podział już istnieje, kolejny dodaje się
    // klikając bezpośrednio w konkretną, pustą pod-wnękę (widoczną "przez"
        // ten front, bo rysuje się na wierzchu - patrz renderNode).
    if (selectedNode.type === "leaf") {
      addBtn("⬍ Podziel poziomo", "Dodaj półkę za frontem (front zostaje)", () => {
        splitZoneHorizontal(mod, selectedNode);
        refreshAfterEdit();
      });
      addBtn("⬌ Podziel pionowo", "Dodaj przegrodę za frontem (front zostaje)", () => {
        splitZoneVertical(mod, selectedNode);
        refreshAfterEdit();
      });
      appendAutoShelvesPicker(toolbar, mod, selectedNode);
    }
    addBtn("🗑️ Usuń front", "Usuwa front, wnęka zostaje pusta", () => {
      // usunięcie frontu = przypisanie "pustego" -> wystarczy usunąć elementy z fronts
      const ids = new Set(selectedNode.fronts.map((f) => f.id));
      mod.elements = mod.elements.filter((el) => !ids.has(el.id));
      refreshAfterEdit();
    }, true);
  } else if (mode === "divider") {
    const isPoziom = selectedNode.axis === "h";
    const isStruct = !!selectedNode.divider.isStructural;
    addBtn(
      isPoziom
        ? (isStruct ? "🔩 Zmień na ruchomą" : "🔩 Zmień na konstrukcyjną")
        : (isStruct ? "🔩 Usuń mocowanie (kołek+wkręt)" : "🔩 Zamontuj na kołek+wkręt"),
      isPoziom
        ? "Konstrukcyjna = na stałe wkręcona, ruchoma = na podpórkach"
        : "Kołek + wkręt mocuje przegrodę na stałe do wieńca/półki nad i pod nią (dodaje nawierty w rysunku technicznym)",
      () => { toggleStructural(selectedNode); refreshAfterEdit(); }
    );
    if (isPoziom) {
      addBtn("🧲 Wyrównaj do innej szafki", "Przełącza na widok 3D i pozwala kliknąć wieniec/półkę innej szafki, do której wyrównać tę półkę", () => {
        const divider = selectedNode.divider;
        closeToolbar();
        toggleInteriorEditor();
        enterAlignMode(mod, divider);
      });
    }
    addBtn("🗑️ Usuń podział", "Usuwa dzielnik i wszystko, co jest w obu powstałych z niego wnękach (front na całości, jeśli był, zostaje)", () => {
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

  // Zwykła liczba (np. "3") = tyle samo w sobie równych frontów - ale to to
  // samo pole obsługuje też pełną składnię podziału z layoutu (core/layout.js:
  // wartości <=10 to wagi "fr" - proporcjonalny podział reszty miejsca, >10 to
  // sztywne mm), np. "1:1:141" = dwa równe fronty na dole + górny sztywno
  // 141mm. To dokładnie ta sama notacja co dawniej w menu kontekstowym 3D
  // (usuniętym w tej sesji) i w konfiguratorze Blum.
  const input = document.createElement("input");
  input.type = "text";
  input.value = "1";
  input.title = "Podział, np. 3 (trzy równe) albo 1:1:141 (dwa równe + górny sztywno 141mm)";
  input.placeholder = "np. 1:1:141";
  Object.assign(input.style, { width: "64px", padding: "5px 3px", border: "none", borderRadius: "4px", textAlign: "center", fontSize: "11px" });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => e.stopPropagation());

  const go = document.createElement("button");
  go.type = "button";
  go.innerText = "+";
  Object.assign(go.style, { width: "22px", height: "22px", border: "none", borderRadius: "4px", background: "#0284c7", color: "#fff", fontWeight: "bold", cursor: "pointer" });
  go.addEventListener("click", (e) => {
    e.stopPropagation();
    const distribution = input.value.trim() || "1";
    assignFront(mod, selectedNode, subtype, { distribution });
    refreshAfterEdit();
  });

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  wrap.appendChild(go);
  toolbar.appendChild(wrap);
}

// Rozmieszcza N półek równomiernie w wnęce (pustej albo już obsadzonej
// frontem - patrz core/zoneTree.js: addEvenShelves) - odstępy liczone przez
// core/shelfMath.js.
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
    addEvenShelves(mod, node, count);
    refreshAfterEdit();
  });

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  wrap.appendChild(go);
  toolbar.appendChild(wrap);
}
