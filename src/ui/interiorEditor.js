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
//
// createZoneEditor({ getContainer, getMod, cornerArm }) to FABRYKA jednej
// instancji tego edytora - potrzebna, odkąd edytor da się osadzić więcej niż
// raz naraz (ui/cornerConfigModal.js: dwie instancje obok siebie, po jednej
// na ramię szafki narożnej). `cornerArm` (undefined dla zwykłego modułu,
// 'A'/'B' dla ramienia narożnika) przechodzi dalej do core/zoneTree.js
// (buildZoneTree/splitZoneHorizontal/splitZoneVertical/addEvenShelves/
// assignFront), które filtrują/znakują elementy po tym polu. Stan pływającego
// paska narzędzi (selectedNode/toolbarMode/toolbarEl) żyje W ZAMKNIĘCIU danej
// instancji, nie na poziomie modułu - dwie otwarte naraz instancje (dwa
// ramiona w modalu) mają całkowicie niezależne paski narzędzi.
//
// Główny edytor wnętrza aplikacji (kontener #editor-interior-container,
// zawsze aktywny moduł, bez cornerArm) to jedna, stała instancja tej fabryki
// - eksportowane niżej `toggleInteriorEditor`/`renderInteriorEditor`/
// `renderInteriorEditorIfVisible`/`isInteriorEditorVisible` są cienkimi
// wrapperami wokół niej, więc zachowanie dla istniejących wywołań (main.js,
// ui/properties.js, ui/sidebar.js, render/viewer3d.js) jest identyczne jak
// przed wprowadzeniem fabryki.
import { fmtMm } from "../utils/math.js";
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
  resizeAlongAxis,
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
// Strona zawiasów drzwi ('left' = zawiasy z lewej). Para L/P ma ją w id.
function hingeSideOf(front) {
  if (front.subtype === "drzwi-lp") return front.id.includes("-L-") ? "left" : "right";
  if (front.subtype === "drzwi") return front.openingSide === "right" ? "right" : "left";
  return null;
}

// Etykieta frontu z informacją o stronie zawiasów (dla pojedynczych drzwi i
// drzwi z pary L/P) - wcześniej wszystkie drzwi były podpisane tak samo.
function frontLabelText(front) {
  const base = FRONT_LABELS[front.subtype] || front.subtype;
  const side = hingeSideOf(front);
  if (!side) return base;
  if (front.subtype === "drzwi-lp") return `Drzwi ${side === "left" ? "lewe" : "prawe"}`;
  return `Drzwi ${side === "left" ? "lewe" : "prawe"} · zawiasy ${side === "left" ? "z lewej" : "z prawej"}`;
}

const FRONT_COLORS = {
  drzwi: { fill: "#eff6ff", border: "#2563eb" },
  "drzwi-lp": { fill: "#eff6ff", border: "#2563eb" },
  szuflada: { fill: "#fff7ed", border: "#d97706" },
  "szuflada-wewnetrzna": { fill: "#fff7ed", border: "#c2410c" },
};

function escapeHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DIM_MARGIN = 7; // px od krawędzi wnęki, żeby strzałki nie nachodziły na jej ramkę

export function createZoneEditor({ getContainer, getMod, cornerArm }) {
  let selectedNode = null; // węzeł drzewa aktualnie pod pływającym paskiem
  let toolbarMode = null; // null | 'empty' | 'occupied' | 'divider'
  let toolbarEl = null; // pływający pasek TEJ instancji (nie document.getElementById - patrz komentarz na górze pliku)
  let currentTree = null; // korzeń ostatnio zbudowanego drzewa (render()) - potrzebny appendDimLine, żeby znaleźć łańcuch dzielników do resizeAlongAxis
  let viewportRef = null; // stały (nieskalowany) kontener zdarzeń pan/zoom TEJ instancji - tu (nie do `stage`) trafia pływający pasek, żeby nie skalował się z przybliżeniem
  // Widok (przesunięcie/zoom) - TRWA między kolejnymi render() tego samego
  // modułu (np. po dodaniu półki), żeby edycja nie zerowała przybliżenia.
  // {x:0,y:0,scale:1} = dokładnie to samo dopasowanie do okna co dawniej
  // (scale/originX/originTop liczone niżej w render()) - pan/zoom to
  // DODATKOWA transformacja NA WIERZCHU tego dopasowania, nie zamiast niego.
  let view = { x: 0, y: 0, scale: 1 };
  let lastModId = null; // zmiana aktywnego modułu = reset widoku (patrz render())
  let worldEl = null; // ostatnio narysowany <div> ze skalowaną treścią - potrzebny applyViewTransform() wołanemu z dala od render() (drag/scroll)

  function isVisible() {
    const el = getContainer();
    return !!el && el.style.display !== "none";
  }

  function renderIfVisible() {
    if (isVisible()) render();
  }

  function refreshAfterEdit() {
    selectedNode = null;
    toolbarMode = null;
    update3D();
    updateSidebar();
    initPropertiesPanel();
    render();
  }

  function render() {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = "";
    toolbarEl = null;

    const mod = getMod();
    if (!mod) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-family:sans-serif;">Wybierz szafkę, żeby edytować jej wnętrze</div>`;
      return;
    }

    // Inny moduł niż ostatnio narysowany (np. kliknięcie innej szafki na
    // liście) - zerujemy pan/zoom, bo poprzednie przesunięcie/przybliżenie
    // prawie na pewno nie ma sensu dla zupełnie innej bryły. Edycja TEGO
    // SAMEGO modułu (dodanie półki itd. -> refreshAfterEdit -> render())
    // NIE zeruje widoku - `view` żyje w zamknięciu instancji, przetrwa.
    if (mod.id !== lastModId) {
      view = { x: 0, y: 0, scale: 1 };
      lastModId = mod.id;
    }

    const tree = buildZoneTree(mod, { cornerArm });
    currentTree = tree;

    // Obrys "z kontekstem" (boki/wieńce) do narysowania jako tło (shell,
    // niżej) - dla zwykłego modułu to CAŁA bryła (0..width, 0..height), żeby
    // grubość boków było widać jako margines wokół strefy wnęk (tree.rect,
    // zaczynającej się od th). Ramię szafki narożnej nie ma dziś osobno
    // policzonej "pełnej bryły" - tree.rect już JEST tym, co pokazujemy.
    const outer = cornerArm
      ? tree.rect
      : { minX: 0, maxX: parseFloat(mod.dimensions.width) || 600, minY: 0, maxY: parseFloat(mod.dimensions.height) || 720 };
    const W = outer.maxX - outer.minX;
    const H = outer.maxY - outer.minY;
    const pad = 40;
    const availW = Math.max(container.clientWidth - pad * 2, 100);
    const availH = Math.max(container.clientHeight - pad * 2, 100);
    const scale = Math.min(availW / Math.max(W, 1), availH / Math.max(H, 1));
    const originX = (container.clientWidth - W * scale) / 2;
    const originTop = (container.clientHeight - H * scale) / 2;

    // mm -> px: X wprost (przesunięte o outer.minX), Y odwrócone (dół strefy
    // = duże piksele)
    const toPxX = (mmX) => originX + (mmX - outer.minX) * scale;
    const toPxY = (mmY) => originTop + (outer.maxY - mmY) * scale;
    const toPxLen = (mm) => mm * scale;
    const px = { toPxX, toPxY, toPxLen };

    // viewport = stały, nieskalowany kontener na zdarzenia (pan/zoom, klik w
    // tło) i na pływający pasek narzędzi. world = jego dziecko, wszystko, co
    // widać na rysunku - dostaje transform translate(view.x,view.y)
    // scale(view.scale) (patrz applyViewTransform), więc pan/zoom nie rusza
    // ANI JEDNEJ linijki logiki rysowania niżej (renderNode i cała reszta
    // liczy pozycje tak jak dawniej, w "dopasowanych do okna" px).
    const viewport = document.createElement("div");
    Object.assign(viewport.style, { position: "absolute", inset: "0", overflow: "hidden", fontFamily: "sans-serif", userSelect: "none", cursor: "grab" });
    viewportRef = viewport;

    const world = document.createElement("div");
    Object.assign(world.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" });
    worldEl = world;
    applyViewTransform();

    // obrys całej szafki/ramienia (boki/wieńce) dla kontekstu
    const shell = document.createElement("div");
    Object.assign(shell.style, {
      position: "absolute",
      left: toPxX(outer.minX) + "px",
      top: toPxY(outer.maxY) + "px",
      width: toPxLen(W) + "px",
      height: toPxLen(H) + "px",
      border: "2px solid #334155",
      background: "#ffffff",
      boxSizing: "border-box",
    });
    world.appendChild(shell);

    renderNode(tree, world, px, mod);
    viewport.appendChild(world);

    // tytuł/podpowiedź - w viewport (NIE w world), żeby nie skalował się z
    // przybliżeniem i został czytelny w rogu niezależnie od poziomu zoomu
    const title = document.createElement("div");
    const titleSuffix = cornerArm ? ` — ramię ${cornerArm}` : "";
    title.innerHTML = `🗂️ Wnętrze: <b>${escapeHtml(mod.name)}${titleSuffix}</b> <span style="color:#94a3b8; font-weight:normal;">— klik w wnękę: podziel / obsadź · klik w dzielnik: przesuń / usuń · przeciągnij tło: przesuń · scroll: przybliż</span>`;
    Object.assign(title.style, { position: "absolute", top: "10px", left: "16px", fontSize: "13px", color: "#1e3a8a", pointerEvents: "none" });
    viewport.appendChild(title);

    appendZoomControls(viewport);

    container.appendChild(viewport);

    // klik na tło (viewport/world/shell, nie na wnękę/dzielnik/pasek) =
    // zamknij pływający pasek. Sam mousedown-drag do przesuwania widoku (niżej)
    // już przy starcie zamyka pasek, więc nie trzeba tu odróżniać kliku od
    // zakończenia przeciągnięcia - closeToolbar() wywołane dwa razy jest nieszkodliwe.
    viewport.addEventListener("click", (e) => {
      if (e.target === viewport || e.target === world || e.target === shell) closeToolbar();
    });

    // Przeciąganie TŁA przesuwa widok (pan) - tylko gdy mousedown zaczyna się
    // na tle (nie na wnęce/dzielniku/pasku, które mają własne handlery i same
    // wołają stopPropagation tam, gdzie to ważne - tu i tak sprawdzamy target).
    viewport.addEventListener("mousedown", (e) => {
      if (e.target !== viewport && e.target !== world && e.target !== shell) return;
      closeToolbar();
      const start = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
      viewport.style.cursor = "grabbing";
      const onMove = (ev) => {
        view.x = start.vx + (ev.clientX - start.mx);
        view.y = start.vy + (ev.clientY - start.my);
        applyViewTransform();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        viewport.style.cursor = "grab";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    // Kółko myszy = zoom "pod kursorem" (punkt pod kursorem zostaje w tym
    // samym miejscu ekranu) - ten sam mechanizm co niedawno dodany
    // zoomToCursor w podglądzie 3D (render/viewer3d.js).
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      closeToolbar();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = view.scale;
      const newScale = Math.min(6, Math.max(0.15, oldScale * (e.deltaY > 0 ? 1 / 1.12 : 1.12)));
      view.x = mx - ((mx - view.x) / oldScale) * newScale;
      view.y = my - ((my - view.y) / oldScale) * newScale;
      view.scale = newScale;
      applyViewTransform();
      updateZoomLabel();
    }, { passive: false });

    viewport.addEventListener("dblclick", (e) => {
      if (e.target === viewport || e.target === world || e.target === shell) resetView();
    });
  }

  function applyViewTransform() {
    if (worldEl) worldEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  function resetView() {
    view = { x: 0, y: 0, scale: 1 };
    render();
  }

  let zoomLabelEl = null;
  function updateZoomLabel() {
    if (zoomLabelEl) zoomLabelEl.innerText = Math.round(view.scale * 100) + "%";
  }

  // Kontrolki przybliżenia (+/-/dopasuj) w rogu viewportu - poza `world`, więc
  // mają zawsze ten sam, normalny rozmiar niezależnie od poziomu zoomu.
  function appendZoomControls(viewport) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute", right: "10px", bottom: "10px", zIndex: "150",
      display: "flex", flexDirection: "column", gap: "5px", alignItems: "stretch",
    });
    const mkBtn = (label, title, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerText = label;
      b.title = title;
      Object.assign(b.style, {
        width: "28px", height: "28px", border: "1px solid #cbd5e1", borderRadius: "6px",
        background: "#fff", color: "#334155", fontWeight: "bold", fontSize: "14px", cursor: "pointer",
      });
      b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      wrap.appendChild(b);
      return b;
    };
    mkBtn("+", "Przybliż", () => { view.scale = Math.min(6, view.scale * 1.25); applyViewTransform(); updateZoomLabel(); });
    mkBtn("–", "Oddal", () => { view.scale = Math.max(0.15, view.scale / 1.25); applyViewTransform(); updateZoomLabel(); });
    mkBtn("⤢", "Dopasuj widok (albo podwójny klik na tle)", () => resetView());

    zoomLabelEl = document.createElement("div");
    zoomLabelEl.innerText = Math.round(view.scale * 100) + "%";
    Object.assign(zoomLabelEl.style, {
      textAlign: "center", fontSize: "10.5px", fontWeight: "bold", color: "#64748b",
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "2px 0",
    });
    wrap.appendChild(zoomLabelEl);

    viewport.appendChild(wrap);
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
  function renderNode(node, stage, px, mod, insideFront = false, parentH = null, parentV = null) {
    const hasFront = node.fronts.length > 0;
    // "Ukryj fronty zewn." (render/viewer3d.js) ukrywa fronty tu tak samo jak
    // w podglądzie 3D - front nadal istnieje (klik dalej otwiera "occupied"),
    // ale rysuje się przezroczyście, żeby dało się zobaczyć, co jest za nim.
    const frontsHidden = hasFront && !areFrontsVisible();
    if (hasFront) {
      renderFrontOverlay(node, stage, px, mod, parentH, parentV, frontsHidden);
    }
    if (node.type === "leaf") {
      if (!hasFront) renderLeaf(node, stage, px, mod, insideFront, parentH, parentV);
      return;
    }
    const nextParentH = node.axis === "h" ? node : parentH;
    const nextParentV = node.axis === "v" ? node : parentV;
    const nestedInsideFront = insideFront || (hasFront && !frontsHidden);
    renderNode(node.a, stage, px, mod, nestedInsideFront, nextParentH, nextParentV);
    renderNode(node.b, stage, px, mod, nestedInsideFront, nextParentH, nextParentV);
    renderDividerHandle(node, stage, px, mod);
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
  // editFront: pojedynczy front zajmujący CAŁY node.rect (renderFrontOverlay,
  // node.fronts.length===1) - pozwala wpisać wymiar z ręki nawet bez
  // dzielnika, który by nim rządził (zgłoszona prośba: "wykorzystajmy te
  // rysunki frontów... wpisywanie z ręki wymiarów w tych kwadracikach").
  // Zapisuje się jako front.forceW/forceH (core/layout.js:
  // recalculateLayout już to czyta - ten sam mechanizm co "Wymuś
  // szerokość/wysokość" w ui/properties.js, zakładka Front). Dla pustej
  // wnęki (renderLeaf) albo grupy >1 frontów w tej samej strefie
  // (dystrybucja szuflad) editFront jest `null` - wymiar zostaje statyczny,
  // bo nie ma jednego jasnego frontu do nadpisania.
  function appendDimTag(parentEl, node, mod, parentH, parentV, editFront = null) {
    appendDimLine(parentEl, true, node, mod, parentV, dividerSide(node, parentV, false), editFront);
    appendDimLine(parentEl, false, node, mod, parentH, dividerSide(node, parentH, true), editFront);
  }

  function appendDimLine(parentEl, isH, node, mod, parentSplit, side, editFront = null) {
    // Dla edytowalnego frontu bez dzielnika (editFront, patrz appendDimTag)
    // liczba pokazuje PRAWDZIWY, gotowy wymiar frontu (front.w/h, już z
    // zakładem/nadkładem) - nie surowy wymiar wnęki (node.rect) jak wszędzie
    // indziej - bo to właśnie front.w/h nadpisuje wpisana tu wartość
    // (forceW/forceH), więc pokazywana liczba musi się z nią zgadzać jeden
    // do jednego (inaczej wpisanie tej samej liczby, co widoczna, zmieniałoby
    // realny wymiar frontu - myląco).
    const valueMm = (!parentSplit && editFront)
      ? (isH ? editFront.w : editFront.h)
      : (isH ? node.rect.maxX - node.rect.minX : node.rect.maxY - node.rect.minY);
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
      if (!parentSplit && editFront) {
        // Front bez dzielnika (patrz appendDimTag) - liczba wpisana z ręki
        // idzie wprost na front.forceW/forceH, nie na pozycję dzielnika
        // (którego tu nie ma).
        editFront[isH ? "forceW" : "forceH"] = mm;
      } else {
        // resizeAlongAxis (core/zoneTree.js) zamiast bezpośredniego moveSplit -
        // gdy najbliższy sąsiad jest zablokowany (kłódka), zmiana przechodzi
        // przez niego (zostaje bez zmian) do pierwszej odblokowanej wnęki dalej
        // w tym samym rzędzie/kolumnie, zamiast po prostu resize'ować sąsiada.
        // isH=true tutaj oznacza wymiar SZEROKOŚCI, czyli rządzą nim dzielniki
        // PIONOWE (oś 'v') - stąd wantH=!isH.
        resizeAlongAxis(mod, currentTree, node, !isH, mm, valueMm);
      }
      refreshAfterEdit();
    }, editFront ? { front: editFront, axis: isH ? "forceW" : "forceH" } : null);
  }

  function appendDimNumber(container, valueMm, parentSplit, side, onCommit, editInfo = null) {
    const rounded = fmtMm(valueMm);
    if (!parentSplit) {
      if (!editInfo) {
        const span = document.createElement("span");
        span.innerText = rounded;
        container.appendChild(span);
        return;
      }
      // Front bez dzielnika, który by rządził tym wymiarem (np. cała wnęka
      // ramienia narożnika) - da się mimo to wpisać wartość z ręki, zapisuje
      // się jako front.forceW/forceH (ten sam mechanizm co "Wymuś szerokość/
      // wysokość" w ui/properties.js, zakładka Front - core/layout.js:
      // recalculateLayout).
      const isForced = editInfo.front[editInfo.axis] !== undefined && editInfo.front[editInfo.axis] !== null;
      const forcedSpan = document.createElement("span");
      forcedSpan.innerText = rounded;
      forcedSpan.title = "Kliknij, żeby wpisać dokładny wymiar";
      Object.assign(forcedSpan.style, {
        cursor: "pointer",
        borderBottom: "1px dotted #7c3aed",
        color: isForced ? "#6d28d9" : "#94a3b8",
        fontWeight: isForced ? "bold" : "normal",
      });
      forcedSpan.addEventListener("click", (e) => {
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
          if (Number.isFinite(mm) && mm > 0 && Math.abs(mm - valueMm) > 0.05) onCommit(mm);
          else if (input.parentNode) input.parentNode.replaceChild(forcedSpan, input);
        });
        container.replaceChild(input, forcedSpan);
        input.focus();
        input.select();
      });
      container.appendChild(forcedSpan);
      if (isForced) {
        const resetBtn = document.createElement("span");
        resetBtn.innerText = "↺";
        resetBtn.title = "Wróć do automatycznego wymiaru";
        Object.assign(resetBtn.style, { cursor: "pointer", fontSize: "9px", color: "#6d28d9" });
        resetBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          delete editInfo.front[editInfo.axis];
          refreshAfterEdit();
        });
        container.appendChild(resetBtn);
      }
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
        if (Number.isFinite(mm) && mm > 0 && Math.abs(mm - valueMm) > 0.05) onCommit(mm);
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
  function renderLeaf(node, stage, px, mod, insideFront = false, parentH = null, parentV = null) {
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
      selectNode(node, el, stage, px, mod, "empty");
    });

    stage.appendChild(el);
    appendDimTag(el, node, mod, parentH, parentV);
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
  function renderFrontOverlay(node, stage, px, mod, parentH = null, parentV = null, hidden = false) {
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
      const labelText = frontLabelText(node.fronts[0]) + (hidden ? " (ukryty)" : "");
      const hingeSide = hingeSideOf(node.fronts[0]);
      if (hingeSide && !hidden) {
        // Czerwony pasek na krawędzi zawiasów - od razu widać, po której stronie są.
        const bar = document.createElement("div");
        bar.title = hingeSide === "left" ? "Zawiasy z lewej" : "Zawiasy z prawej";
        Object.assign(bar.style, {
          position: "absolute", top: "0", bottom: "0", width: "5px",
          [hingeSide === "left" ? "left" : "right"]: "0",
          background: "#dc2626", pointerEvents: "none",
        });
        el.appendChild(bar);
      }
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
        // appendChild zamiast innerText - innerText skasowałby dodany wyżej pasek zawiasów.
        el.appendChild(document.createTextNode(labelText));
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
      selectNode(node, el, stage, px, mod, "occupied");
    });

    stage.appendChild(el);
    appendDimTag(el, node, mod, parentH, parentV, isMultiFront ? null : node.fronts[0]);

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
        const boxSide = hingeSideOf(front);
        if (boxSide) {
          const bar = document.createElement("div");
          Object.assign(bar.style, {
            position: "absolute", top: "0", bottom: "0", width: "4px",
            [boxSide === "left" ? "left" : "right"]: "0", background: "#dc2626",
          });
          box.appendChild(bar);
        }
        box.appendChild(document.createTextNode(frontLabelText(front)));
        stage.appendChild(box);
      });
    }
  }

  function renderDividerHandle(node, stage, px, mod) {
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
        moveSplit(mod, node, dragStartPos + deltaMm);
        render();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (dragging) {
          refreshAfterEdit();
        } else {
          // zwykły klik (bez przeciągnięcia) - pokaż mini-pasek narzędzi dzielnika
          selectNode(node, handle, stage, px, mod, "divider");
        }
      };
      handle._scale = px.toPxLen(1);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    stage.appendChild(handle);
  }

  // ---------- pływający pasek narzędzi ----------

  function closeToolbar() {
    if (toolbarEl) toolbarEl.remove();
    toolbarEl = null;
    selectedNode = null;
    toolbarMode = null;
  }

  function selectNode(node, anchorEl, stage, px, mod, mode) {
    closeToolbar();
    selectedNode = node;
    toolbarMode = mode;

    const toolbar = document.createElement("div");
    toolbarEl = toolbar;
    Object.assign(toolbar.style, {
      position: "absolute",
      // Wyżej niż uiOverlay (Przezroczysty/Ukryj fronty/Podgląd 3D, patrz
      // render/viewer3d.js - z-index: 100) - inaczej na wąskim ekranie te
      // przyciski, nachodzące na górę toolbara, zasłaniały go całkowicie.
      zIndex: "200",
      background: "#1e293b",
      borderRadius: "8px",
      padding: "6px",
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)",
      maxWidth: "260px",
    });

    // Pozycja liczona względem viewportRef (NIE stage/world) i tam też
    // dopinany pasek (niżej) - world ma transform pan/zoom, więc pozycjonowanie
    // czy dopięcie względem niego skalowałoby/przesuwało pasek razem z
    // przybliżeniem. getBoundingClientRect() zawsze zwraca już przeliczone
    // współrzędne na ekranie (po transformie), więc różnica względem
    // NIEskalowanego viewportRef daje poprawną pozycję w zwykłych px.
    const rect = anchorEl.getBoundingClientRect();
    const stageRect = viewportRef.getBoundingClientRect();
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

    if (mode === "empty") {
      // Pozioma półka WEWNĄTRZ jednego ramienia byłaby prostym prostokątem
      // ograniczonym do tego ramienia - w realnej stolarce półka w szafce
      // narożnej ma być w KSZTAŁCIE L, wspólna dla obu ramion na danej
      // wysokości (zgłoszona korekta), więc dla ramienia narożnika (cornerArm)
      // ten przycisk jest wyłączony - półki narożne dodaje się osobną sekcją
      // w ui/cornerConfigModal.js (wspólną dla Ramienia A i B), nie tutaj.
      if (!cornerArm) {
        addBtn("⬍ Podziel poziomo", "Dodaj półkę na środku wysokości", () => {
          splitZoneHorizontal(mod, selectedNode, cornerArm);
          refreshAfterEdit();
        });
      }
      addBtn("⬌ Podziel pionowo", "Dodaj przegrodę na środku szerokości", () => {
        splitZoneVertical(mod, selectedNode, cornerArm);
        refreshAfterEdit();
      });
      addBtn("▭ Drzwi", "Zabuduj wnękę pojedynczymi drzwiami", () => {
        assignFront(mod, selectedNode, "drzwi", { cornerArm });
        refreshAfterEdit();
      });
      addBtn("▭▭ Drzwi L/P", "Zabuduj wnękę parą drzwi", () => {
        assignFront(mod, selectedNode, "drzwi-lp", { cornerArm });
        refreshAfterEdit();
      });
      appendDrawerPicker(toolbar, mod, "szuflada", "📦 Szuflady zewn.");
      appendDrawerPicker(toolbar, mod, "szuflada-wewnetrzna", "📥 Szuflady wewn.");
      if (!cornerArm) appendAutoShelvesPicker(toolbar, mod, selectedNode);
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
        if (!cornerArm) {
          addBtn("⬍ Podziel poziomo", "Dodaj półkę za frontem (front zostaje)", () => {
            splitZoneHorizontal(mod, selectedNode, cornerArm);
            refreshAfterEdit();
          });
        }
        addBtn("⬌ Podziel pionowo", "Dodaj przegrodę za frontem (front zostaje)", () => {
          splitZoneVertical(mod, selectedNode, cornerArm);
          refreshAfterEdit();
        });
        if (!cornerArm) appendAutoShelvesPicker(toolbar, mod, selectedNode);
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
      if (isPoziom && !cornerArm) {
        // Wyrównanie do wieńca/półki INNEGO modułu ma sens tylko dla zwykłego
        // modułu (przełącza się na widok 3D CAŁEGO projektu) - ramię szafki
        // narożnej nie ma dziś takiego trybu.
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

    viewportRef.appendChild(toolbar);
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
      assignFront(mod, selectedNode, subtype, { distribution, cornerArm });
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
      addEvenShelves(mod, node, count, cornerArm);
      refreshAfterEdit();
    });

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    wrap.appendChild(go);
    toolbar.appendChild(wrap);
  }

  return { render, renderIfVisible, isVisible };
}

// ---------- instancja główna (zwykły edytor wnętrza aktywnego modułu) ----------

const mainEditor = createZoneEditor({
  getContainer: () => document.getElementById("editor-interior-container"),
  getMod: getActiveModule,
  cornerArm: undefined,
});

export function isInteriorEditorVisible() {
  return mainEditor.isVisible();
}

export function toggleInteriorEditor() {
  const interior = document.getElementById("editor-interior-container");
  const viewer3d = document.getElementById("editor-3d-container");
  if (!interior) return;
  const showing = interior.style.display === "none" || !interior.style.display;
  interior.style.display = showing ? "block" : "none";
  if (viewer3d) viewer3d.style.display = showing ? "none" : "block";
  if (showing) mainEditor.render();
}

// Wołane z update3D()/updateSidebar()/initPropertiesPanel() — czyli tam,
// gdzie cała reszta aplikacji już dziś odświeża swoje panele po zmianie
// stanu (patrz CLAUDE.md: "Update flow"). Tanie, gdy panel jest ukryty.
export function renderInteriorEditorIfVisible() {
  mainEditor.renderIfVisible();
}

export function renderInteriorEditor() {
  mainEditor.render();
}
