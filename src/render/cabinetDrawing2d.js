// src/render/cabinetDrawing2d.js
//
// Rysunki instrukcji montażu szafki (dane: engine/cabinetDrillings.js) - w tym samym układzie
// co instrukcja skrzynki szuflady (render/drawerBoxDrawing2d.js), na wspólnych klockach
// render/workshopDrawing.js: formatki z ponumerowanymi otworami w jednej skali, tabela
// otworów, montaż w izometrii (rozstrzelony + złożony), kolejność montażu i "gdzie w
// projekcie" (rzut pokoju z góry i widok ściany z podświetloną szafką).
import { C, FONT } from "./drawingPalette.js";
import { escapeHtml } from "../utils/dom.js";
import { cabinetHoleSpecs } from "../engine/cabinetDrillings.js";
import { lPanelSVG, lPanelFrame } from "./cornerInstructions2d.js";
import { r1, fmt, KIND, text, line, dash, dimH, dimV, wrap, title, uniq, faceHole, edgeHole, proj, move, prism, solidsSvg, setUnit, unitFor, unit, dimText } from "./workshopDrawing.js";

// Formatki z otworami (pozostałe - plecy, półki ruchome - są tylko w tabeli formatek) oraz
// formatki w kształcie L szafki narożnej (półka L bez otworów - rysunek pokazuje wycięcia).
export const drawnPanels = (panels) => panels.filter((p) => p.holes.length > 0 || p.outline);
const isVertical = (p) => p.kind === "bok" || p.kind === "przegroda" || p.kind === "trawers-pion" || p.kind === "listwa";

// Rozmiar rysunku (jednostki = mm) - musi się zgadzać z wrap() w funkcjach niżej.
const drawSize = (p) => {
  if (p.outline) { const fr = lPanelFrame(p); return [fr.w, fr.h]; }
  const u = unitFor(Math.max(p.length, p.width));
  return isVertical(p) ? [p.length + 50 * u + (40 + 3 * 150 + 40) * u, p.width + 112 * u] : [p.length + 130 * u, p.width + 112 * u];
};

// Jedna skala dla wszystkich formatek szafki: najmniejsza z listy, przy której każdy rysunek
// mieści się na A4 (ok. 185 × 250 mm).
const SCALES = [4, 5, 10, 20, 25];
export function cabinetDrawingScale(panels) {
  const sizes = drawnPanels(panels).map(drawSize);
  return SCALES.find((n) => sizes.every(([w, h]) => w / n <= 185 && h / n <= 250)) || SCALES[SCALES.length - 1];
}
const scaleNote = (scale) => (scale ? ` · skala 1:${scale}` : "");

// Formatka pionowa (bok, przegroda, trawers pionowy) - zawsze pionowo, wymiarowana jak bok na
// rysunku 2D z wierceniami (render/viewer2d.js: drawSideDetails): kolumny opisów wysokości po
// stronie tyłu - podpórki półek (z rozstawem oś-oś, [Rc]), prowadnice szuflad, łączniki
// konstrukcyjne ([Rc]) - każdy opis "odległość od bliższej krawędzi DÓŁ/GÓRA (druga)", zawiasy
// opisane przy otworach, odległości od przodu nad formatką. Bok prawy z przodem po prawej.
// side - tylko otwory tej strony przegrody ('lewa' / 'prawa'), czoła zawsze.
const COL_W = 150;
const verticalBox = (L, u, cols) => {
  const labelsW = (40 + Math.max(cols, 1) * COL_W + 40) * u;
  return { labelsW, width: L + 50 * u + labelsW };
};
export function verticalPanelSVG(panel, startNo = 1, scale = null, side = null) {
  const L = panel.length, H = panel.width;
  const u = unitFor(Math.max(L, H));
  setUnit(u);
  const rev = !!panel.frontOnRight;
  const X = (x) => (rev ? L - x : x);
  const Y = (y) => H - y;
  const isTrav = panel.kind === "trawers-pion" || panel.kind === "listwa";
  const label = side ? `${panel.name} — strona ${side}` : panel.kind === "bok" ? `${panel.name} — widok od wewnątrz`
    : panel.kind === "listwa" ? `${panel.name} — od wnętrza, naroże z lewej` : panel.name;
  let b = title(L / 2, -58 * u, label, `${fmt(L)} × ${fmt(H)} × ${fmt(panel.thickness)} mm · ${panel.qty} szt.${scaleNote(scale)}`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(H)}" fill="${C.white}" stroke="${C.slate600}" stroke-width="${r1(1.5 * u)}"/>`;
  if (!isTrav) {
    [[X(15 * u), "PRZÓD"], [X(L - 15 * u), "TYŁ"]].forEach(([x, t]) => {
      b += text(x, H / 2, t, { size: 11, color: C.slate400, weight: "bold", rotate: -90 });
    });
  }
  const visible = panel.holes.filter((h) => !side || !h.side || h.side === side);
  visible.forEach((h) => {
    if (h.edge === "dolne") b += edgeHole(X(h.x), H, 0, -1, h);
    else if (h.edge === "gorne") b += edgeHole(X(h.x), 0, 0, 1, h);
    else if (h.edge === "lewe") b += edgeHole(0, Y(h.y), 1, 0, h);
    else if (h.edge === "prawe") b += edgeHole(L, Y(h.y), -1, 0, h);
    else b += faceHole(X(h.x), Y(h.y), h);
  });

  // Kolumny opisów po stronie tyłu (jak rysunek 2D).
  const face = visible.filter((h) => !h.edge);
  const backEdge = rev ? 0 : L;
  const sgn = rev ? -1 : 1;
  const col = { x: backEdge + sgn * 40 * u, anchor: rev ? "end" : "start", off: sgn * 8 * u };
  let cols = 0;
  const writeCol = (ys, color, rc, opacityFor = () => 1) => {
    ys.forEach((y) => {
      b += `<line x1="${r1(backEdge)}" y1="${r1(Y(y))}" x2="${r1(col.x)}" y2="${r1(Y(y))}" stroke="${color}" stroke-width="${r1(0.5 * u)}" stroke-dasharray="${r1(2 * u)},${r1(2 * u)}"/>`;
      b += `<text x="${r1(col.x + col.off)}" y="${r1(Y(y) + 4 * u)}" font-family="${FONT}" text-anchor="${col.anchor}" opacity="${opacityFor(y)}">${dimText(y, H, color, rc)}</text>`;
    });
    col.x += sgn * COL_W * u;
    cols++;
  };
  const pins = face.filter((h) => h.kind === "podporka");
  if (pins.length) {
    const centers = uniq(pins.filter((h) => h.center).map((h) => h.y));
    // Rozstaw półek oś-oś tuż przy krawędzi tyłu (osobny łańcuszek, jak na rysunku 2D).
    const px = backEdge + sgn * 22 * u;
    for (let i = 0; i < centers.length - 1; i++) {
      const yA = Y(centers[i]), yB = Y(centers[i + 1]);
      b += line(px, yA, px, yB, C.orange700) + line(px - 4 * u, yA, px + 4 * u, yA, C.orange700) + line(px - 4 * u, yB, px + 4 * u, yB, C.orange700);
      const tx = px + sgn * 10 * u, ty = (yA + yB) / 2;
      b += `<text x="${r1(tx)}" y="${r1(ty)}" font-family="${FONT}" font-size="${r1(12 * u)}" fill="${C.orange700}" text-anchor="middle" transform="rotate(-90 ${r1(tx)} ${r1(ty)})">${fmt(centers[i + 1] - centers[i])}<tspan font-size="${r1(9 * u)}"> oś-oś</tspan></text>`;
    }
    writeCol(uniq(pins.map((h) => h.y)), KIND.podporka.color, true, (y) => (centers.includes(r1(y)) ? 1 : 0.6));
  }
  const runners = face.filter((h) => h.kind === "prowadnica");
  if (runners.length) writeCol(uniq(runners.map((h) => h.y)), KIND.prowadnica.color, false);
  const joints = face.filter((h) => h.kind === "wkret");
  if (joints.length) writeCol(uniq(joints.map((h) => h.y)), KIND.wkret.color, true);
  // Zawiasy: opis przy otworach (środek pary prowadnika).
  uniq(face.filter((h) => h.kind === "zawias").map((h) => h.hingeY)).forEach((hy) => {
    b += `<text x="${r1(X(37) + (rev ? -8 : 8) * u)}" y="${r1(Y(hy) + 4 * u)}" font-family="${FONT}" text-anchor="${rev ? "end" : "start"}">${dimText(hy, H, KIND.zawias.color)}</text>`;
  });

  // Odległości od przodu nad formatką.
  uniq(visible.filter((h) => h.edge !== "lewe" && h.edge !== "prawe").map((h) => h.x)).forEach((x, i) => {
    b += text(X(x), (-6 - (i % 2) * 11) * u, fmt(x), { size: 9, color: C.slate500 });
  });
  b += dimH(0, L, H + 18 * u, fmt(L)) + dimV(rev ? L + 22 * u : -22 * u, 0, H, fmt(H));
  b += legendRow(visible, rev ? -verticalBox(L, u, cols).labelsW : -40 * u, H + 44 * u);
  const { labelsW } = verticalBox(L, u, cols);
  const minX = rev ? -labelsW : -50 * u;
  const maxX = rev ? L + 50 * u : L + labelsW;
  const svg = wrap(minX, -80 * u, maxX - minX, H + 112 * u, b, scale);
  setUnit(1);
  return svg;
}

// Legenda kolorów otworów pod formatką (jak na rysunku 2D).
function legendRow(holes, x, y) {
  let out = "";
  const u = unit();
  [...new Set(holes.map((h) => h.kind))].forEach((k) => {
    const st = KIND[k];
    out += `<circle cx="${r1(x + 4 * u)}" cy="${r1(y - 4 * u)}" r="${r1(3 * u)}" fill="${st.color}"/>`;
    out += text(x + 12 * u, y, st.label, { size: 10, color: C.slate600, anchor: "start" });
    x += (22 + st.label.length * 6) * u;
  });
  return out;
}

// Formatka pozioma (wieniec, półka, trawers poziomy) - rzut z góry jak widok wieńca na rysunku 2D
// (render/viewer2d.js: drawPionMountViews): przód u góry, tył u dołu; łączniki w licu (przegrody,
// boki przy wieńcach przelotowych) opisane pod formatką "… mm od lewej" (linia od lewej krawędzi),
// łączniki w czołach (do boków) - odległość od przodu w kolumnie z boku.
export function horizontalPanelSVG(panel, startNo = 1, scale = null) {
  const L = panel.length, Dd = panel.width;
  const u = unitFor(Math.max(L, Dd));
  setUnit(u);
  const Z = (z) => z;                                     // przód (z = 0) u góry rysunku, jak w 2D
  let b = title(L / 2, -58 * u, `${panel.name} — widok z góry`, `${fmt(L)} × ${fmt(Dd)} × ${fmt(panel.thickness)} mm · ${panel.qty} szt.${scaleNote(scale)}`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(Dd)}" fill="${C.white}" stroke="${C.slate600}" stroke-width="${r1(1.5 * u)}"/>`;
  b += text(L / 2, -10 * u, "PRZÓD", { size: 11, color: C.slate400, weight: "bold" });
  b += text(L / 2, Dd + 20 * u, "TYŁ", { size: 11, color: C.slate400, weight: "bold" });
  panel.holes.forEach((h) => {
    if (h.edge === "lewe") b += edgeHole(0, Z(h.z), 1, 0, h);
    else if (h.edge === "prawe") b += edgeHole(L, Z(h.z), -1, 0, h);
    else b += faceHole(h.x, Z(h.z), { ...h, orient: "v" });
  });
  // Łączniki w licu: "… mm od lewej" pod formatką (jak w 2D).
  const lico = panel.holes.filter((h) => h.edge === "lico");
  uniq(lico.map((h) => h.x)).forEach((x, i) => {
    const color = KIND[(lico.find((h) => r1(h.x) === x) || {}).kind || "wkret"].color;
    const yL = Dd + (32 + i * 16) * u;
    b += `<line x1="${r1(x)}" y1="${r1(Dd)}" x2="${r1(x)}" y2="${r1(yL)}" stroke="${color}" stroke-width="${r1(0.75 * u)}" stroke-dasharray="${r1(2 * u)},${r1(2 * u)}"/>`;
    b += line(0, yL, x, yL, color) + `<circle cx="0" cy="${r1(yL)}" r="${r1(2 * u)}" fill="${color}"/>`;
    b += text(x + 4 * u, yL + 12 * u, `${fmt(x)} mm ${panel.fromLabel || "od lewej"}`, { size: 10, color, anchor: "start", weight: "bold" });
  });
  // Łączniki w czołach i pozostałe: odległość od przodu w kolumnie po prawej.
  uniq(panel.holes.map((h) => h.z)).forEach((z) => {
    b += line(L, Z(z), L + 32 * u, Z(z), C.slate300, dash) + text(L + 36 * u, Z(z) + 4 * u, `${fmt(z)}`, { size: 10, color: C.slate600, anchor: "start" });
  });
  b += text(L + 36 * u, -10 * u, "od przodu", { size: 9, color: C.slate400, anchor: "start" });
  const below = Dd + (32 + Math.max(0, uniq(lico.map((h) => h.x)).length) * 16 + 20) * u;
  b += dimH(0, L, below, fmt(L)) + dimV(-22 * u, 0, Dd, fmt(Dd));
  const svg = wrap(-40 * u, -80 * u, L + 130 * u, below + 30 * u + 80 * u, b, scale);
  setUnit(1);
  return svg;
}

export function panelSVGs(panels, scale) {
  let n = 1;
  const out = [];
  panels.forEach((p) => {
    const start = n;
    n += p.holes.length;
    if (p.outline) { out.push(lPanelSVG(p, scale)); return; }
    if (!p.holes.length) return;
    if (p.kind === "przegroda") out.push(verticalPanelSVG(p, start, scale, "lewa"), verticalPanelSVG(p, start, scale, "prawa"));
    else if (isVertical(p)) out.push(verticalPanelSVG(p, start, scale));
    else out.push(horizontalPanelSVG(p, start, scale));
  });
  return out;
}

// Legenda: kolor, łącznik i rozmiary otworów (w płaszczyźnie / w czole) - zastępuje tabelę otworów.
export function cabinetLegendHtml(panels, th) {
  const spec = cabinetHoleSpecs(th);
  const size = (o) => (o.groove ? `rowek ${fmt(o.d)} × ${fmt(o.groove)}, gł. ${fmt(o.depth)}` : o.depth == null ? `Ø${fmt(o.d)} przelot` : `Ø${fmt(o.d)} × ${fmt(o.depth)}`);
  const kinds = [...new Set(panels.flatMap((p) => p.holes.map((h) => h.kind)))];
  return `<div class="legend">${kinds.map((k) => {
    const sp = spec[k] || {};
    const parts = [sp.side || sp.face ? `płaszczyzna ${size(sp.side || sp.face)}` : null, sp.edge ? `czoło ${size(sp.edge)}` : null].filter(Boolean);
    return `<span><i style="background:${KIND[k].color}"></i><b>${escapeHtml(sp.label || KIND[k].label)}</b>${parts.length ? ` - ${parts.join(", ")}` : ""}</span>`;
  }).join("")}
    <span><i class="open" style="border-color:${C.slate600}"></i>pusty znacznik = otwór przelotowy</span></div>`;
}

// ---------------------------------------------------------------------------
// Montaż w izometrii: korpus z bokami odsuniętymi na boki i plecami odsuniętymi do tyłu,
// przerywane linie łączników od otworów w bokach do wieńców / półek stałych.
// ---------------------------------------------------------------------------
function cabinetSolids(mod, panels, project, explode) {
  const th = panels[0] ? panels[0].thickness : 18;
  const W = parseFloat(mod.dimensions.width) || 0, H = parseFloat(mod.dimensions.height) || 0;
  const cons = { joinType: "boki_przelotowe", topType: "pelny", traverseWidth: 100, ...(project.construction || {}), ...(mod.construction || {}) };
  const isFull = cons.joinType === "wience_przelotowe";
  const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const byId = (id) => panels.find((p) => p.id === id);
  const no = (id) => panels.findIndex((p) => p.id === id) + 1;
  const solids = [];
  const side = (id, x0, shiftX) => {
    const p = byId(id);
    solids.push({ no: no(id), name: p.name, solid: prism(rect(0, isFull ? th : 0, p.length, (isFull ? th : 0) + p.width), "x", x0, th), shift: [shiftX, 0, 0], tone: C.stone200 });
  };
  side("bok-lewy", 0, -explode);
  side("bok-prawy", W - th, explode);
  const x0 = isFull ? 0 : th, x1 = isFull ? W : W - th;
  const wd = byId("wieniec-dolny");
  if (wd) solids.push({ no: no("wieniec-dolny"), name: wd.name, solid: prism(rect(x0, 0, x1, wd.width), "y", 0, th), shift: [0, 0, 0], tone: C.slate200 });
  const wg = byId("wieniec-gorny");
  if (wg) solids.push({ no: no("wieniec-gorny"), name: wg.name, solid: prism(rect(x0, 0, x1, wg.width), "y", H - th, th), shift: [0, explode * 0.5, 0], tone: C.slate200 });
  panels.filter((p) => p.id.startsWith("trawers-")).forEach((p) => {
    const front = p.id === "trawers-front";
    const D = parseFloat(mod.dimensions.depth) || 0;
    const solid = p.kind === "trawers-pion"
      ? prism(rect(x0, H - p.width, x1, H), "z", front ? 0 : D - th, th)
      : prism(rect(x0, front ? 0 : D - p.width, x1, front ? p.width : D), "y", H - th, th);
    solids.push({ no: no(p.id), name: p.name, solid, shift: [0, explode * 0.5, 0], tone: C.slate200 });
  });
  (mod.elements || []).filter((e) => e.typ === "poziom").sort((a, b) => a.y - b.y).forEach((s, i) => {
    const p = byId(`polka-${i + 1}`);
    if (!p) return;
    solids.push({ no: no(p.id), name: p.name, solid: prism(rect(s.x, 0, s.x + s.w, p.width), "y", s.y, s.h || th), shift: [0, 0, 0], tone: s.isStructural ? C.slate200 : C.amber100 });
  });
  (mod.elements || []).filter((e) => e.typ === "pion").sort((a, b) => a.x - b.x).forEach((pp, i) => {
    const p = byId(`przegroda-${i + 1}`);
    if (!p) return;
    solids.push({ no: no(p.id), name: p.name, solid: prism(rect(0, pp.y, p.length, pp.y + pp.h), "x", pp.x, pp.w || th), shift: [0, 0, 0], tone: C.stone200 });
  });
  const back = byId("plecy");
  if (back) {
    const D = parseFloat(mod.dimensions.depth) || 0;
    const bt = back.thickness;
    const zb = (mod.backPanel && mod.backPanel.type === "nut") ? D - (parseFloat(mod.backPanel.offset) || 16) - bt : D - bt;
    const bx0 = (W - back.width) / 2, by0 = (H - back.length) / 2;
    solids.push({ no: no("plecy"), name: back.name, solid: prism(rect(bx0, by0, bx0 + back.width, by0 + back.length), "z", zb, bt), shift: [0, 0, explode], tone: C.amber100 });
  }
  return solids;
}

export function cabinetAssemblySVG(mod, panels, project) {
  const W = parseFloat(mod.dimensions.width) || 0;
  const explode = Math.max(120, W * 0.25);
  const exploded = cabinetSolids(mod, panels, project, explode);
  const assembled = cabinetSolids(mod, panels, project, 0);
  const bounds = (solids) => {
    const pts = solids.flatMap((s) => s.solid.faces.flatMap((f) => f.pts.map((p) => proj(move(p, s.shift)))));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const bE = bounds(exploded), bA = bounds(assembled);
  const Wpx = 760, pad = 24, gap = 30, split = 0.66;
  const sE = Math.min((Wpx * split - 2 * pad) / (bE.x1 - bE.x0), 520 / (bE.y1 - bE.y0));
  const sA = Math.min((Wpx * (1 - split) - pad - gap) / (bA.x1 - bA.x0), sE * 0.6);
  const hE = (bE.y1 - bE.y0) * sE, hA = (bA.y1 - bA.y0) * sA;
  const Hpx = Math.max(hE, hA) + 2 * pad + 70;
  const oxE = pad - bE.x0 * sE, oyE = pad + 36 - bE.y0 * sE;
  const oxA = Wpx * split + gap - bA.x0 * sA, oyA = pad + 36 - bA.y0 * sA + (hE - hA) / 2;
  const E = solidsSvg(exploded, sE, oxE, oyE);
  let body = text(pad, 18, "MONTAŻ KORPUSU — WIDOK ROZSTRZELONY", { size: 14, color: C.blue900, weight: "bold", anchor: "start" });
  body += text(oxA + ((bA.x0 + bA.x1) / 2) * sA, 18, "PO ZŁOŻENIU", { size: 12, color: C.blue900, weight: "bold" });
  body += E.svg;
  // Linie łączników: od otworu w boku (strona wewnętrzna) do formatki.
  const th = panels[0] ? panels[0].thickness : 18;
  const cons = { joinType: "boki_przelotowe", ...(project.construction || {}), ...(mod.construction || {}) };
  const yOff = cons.joinType === "wience_przelotowe" ? th : 0;
  [["bok-lewy", -explode, th], ["bok-prawy", explode, W - th]].forEach(([id, shiftX, innerX]) => {
    const p = panels.find((q) => q.id === id);
    (p ? p.holes : []).filter((h) => !h.edge && (h.kind === "wkret" || h.kind === "kolek")).forEach((h) => {
      const k = KIND[h.kind];
      const a = E.P([innerX, h.y + yOff, h.x], [shiftX, 0, 0]);
      const c = E.P([innerX, h.y + yOff, h.x], [0, 0, 0]);
      body += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(c[0])}" y2="${r1(c[1])}" stroke="${k.color}" stroke-width="1" stroke-dasharray="4,3"/>`;
      body += `<circle cx="${r1(a[0])}" cy="${r1(a[1])}" r="${r1(Math.max(1.6, (h.d / 2) * sE))}" fill="${h.depth == null ? C.white : k.color}" stroke="${k.color}" stroke-width="1"/>`;
    });
  });
  // Numery formatek (jak w tabeli formatek).
  exploded.forEach((s, i) => {
    const c = E.P(s.solid.center, s.shift);
    const ang = (i * 2.4) % (2 * Math.PI);
    const lx = c[0] + Math.cos(ang) * 26, ly = c[1] + Math.sin(ang) * 22;
    body += line(c[0], c[1], lx, ly, C.slate500);
    body += `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="9" fill="${C.white}" stroke="${C.blue900}" stroke-width="1.2"/>`;
    body += text(lx, ly + 4, String(s.no), { size: 10, color: C.blue900, weight: "bold" });
  });
  body += solidsSvg(assembled, sA, oxA, oyA).svg;
  return `<svg viewBox="0 0 ${Wpx} ${r1(Hpx)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}"><rect width="${Wpx}" height="${r1(Hpx)}" fill="${C.white}"/>${body}</svg>`;
}

// Kolejność montażu wg konstrukcji (engine/cabinetDrillings.js: getCabinetConstruction).
export function cabinetStepsHtml(cons, panels) {
  const has = (prefix) => panels.some((p) => p.id.startsWith(prefix));
  const fixedShelves = panels.some((p) => p.kind === "polka" && p.structural);
  const steps = [
    "Nawierć formatki wg rysunków i tabeli otworów (pozycje od przodu i od spodu formatki).",
    "Wklej kołki w czoła wieńców" + (fixedShelves ? ", półek stałych" : "") + (has("przegroda") ? " i przegród" : "") + (cons.isFull ? " (przy wieńcach przelotowych: w czoła boków)." : "."),
    cons.isFull
      ? "Połóż wieniec dolny, wstaw w niego boki (na kołki) i przykręć wkrętami od spodu wieńca."
      : "Połóż bok lewy wewnętrzną stroną do góry, wstaw wieniec dolny i " + (cons.topType === "pelny" ? "górny" : "trawersy") + " na kołki.",
    has("przegroda") ? "Wstaw przegrody między wieniec / półki i przykręć je przez wieńce." : null,
    fixedShelves ? "Wstaw półki stałe na kołki." : null,
    cons.backType === "nut" ? "Wsuń plecy w nut (przed zamknięciem korpusu drugim bokiem)." : null,
    cons.isFull
      ? "Nałóż wieniec górny " + (cons.topType === "pelny" ? "" : "/ trawersy ") + "i przykręć wkrętami."
      : "Nałóż bok prawy i skręć korpus wkrętami przez boki.",
    "Sprawdź przekątne korpusu (kąt prosty).",
    cons.backType !== "nut" ? "Przybij lub przykręć plecy od tyłu (wyrównują korpus w kącie prostym)." : null,
    cons.legs ? `Przykręć nóżki (${cons.legsHeight} mm)${cons.plinth ? " i zatrzaski cokołu" : ""}.` : null,
    cons.drawers ? "Przykręć prowadnice szuflad w otworach (patrz bok); skrzynki szuflad wg instrukcji „Skrzynki szuflad”." : null,
    cons.doors ? "Przykręć prowadniki zawiasów w otworach na bokach, zawiasy w puszkach frontów, zawieś drzwi." : null,
    cons.movableShelves ? "Wciśnij podpórki i połóż półki ruchome." : null,
    cons.drawers || cons.doors ? "Wyreguluj fronty (szczeliny równe)." : null,
  ].filter(Boolean);
  return `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
}

// ---------------------------------------------------------------------------
// Gdzie w projekcie: rzut pokoju z góry (wszystkie szafki, ta podświetlona) i widok ściany,
// przy której stoi (core/walls.js: computeWallLayouts).
// ---------------------------------------------------------------------------
export function projectLocatorSVG(layouts, modules, modId, name) {
  const { room, walls, plan } = layouts;
  const idx = modules.findIndex((m) => m.id === modId);
  // Rzut z góry
  const sP = Math.min(240 / room.width, 200 / room.depth);
  const pW = room.width * sP, pD = room.depth * sP, pad = 24, top = 44;
  let b = text(pad, 16, name, { size: 13, color: C.blue900, weight: "bold", anchor: "start" });
  b += text(pad, 32, "rzut z góry · ściana tylna u góry", { size: 10, color: C.slate500, anchor: "start" });
  b += `<rect x="${pad}" y="${top}" width="${r1(pW)}" height="${r1(pD)}" fill="${C.white}" stroke="${C.slate700}" stroke-width="2"/>`;
  plan.forEach((f, i) => {
    const on = i === idx;
    b += `<rect x="${r1(pad + f.x * sP)}" y="${r1(top + f.z * sP)}" width="${r1(f.w * sP)}" height="${r1(f.d * sP)}" fill="${on ? C.orange600 : C.slate200}" fill-opacity="${on ? 0.6 : 1}" stroke="${on ? C.orange700 : C.slate400}" stroke-width="${on ? 2 : 0.8}"/>`;
  });
  let width = pW + 2 * pad, height = pD + top + 20;
  // Widok ściany, przy której stoi szafka
  const wall = walls.find((w) => w.items.some((it) => it.mod.id === modId));
  if (wall) {
    const ox = width + 20;
    const sW = Math.min(360 / wall.length, 220 / (room.height || 2600));
    const wW = wall.length * sW, wH = (room.height || 2600) * sW, wy = top;
    const Y = (y) => wy + wH - y * sW;
    b += text(ox, 32, `${wall.label} · widok od środka pokoju`, { size: 10, color: C.slate500, anchor: "start" });
    b += `<rect x="${ox}" y="${wy}" width="${r1(wW)}" height="${r1(wH)}" fill="${C.white}" stroke="${C.slate700}" stroke-width="2"/>`;
    wall.items.forEach((it) => {
      const on = it.mod.id === modId;
      b += `<rect x="${r1(ox + it.u0 * sW)}" y="${r1(Y(it.y1))}" width="${r1((it.u1 - it.u0) * sW)}" height="${r1((it.y1 - it.y0) * sW)}" fill="${on ? C.orange600 : C.slate100}" fill-opacity="${on ? 0.45 : 1}" stroke="${on ? C.orange700 : C.slate500}" stroke-width="${on ? 2 : 0.8}"/>`;
      (it.fronts || []).forEach((f) => {
        b += `<rect x="${r1(ox + f.u0 * sW)}" y="${r1(Y(f.y1))}" width="${r1((f.u1 - f.u0) * sW)}" height="${r1((f.y1 - f.y0) * sW)}" fill="none" stroke="${on ? C.orange700 : C.slate400}" stroke-width="0.6"/>`;
      });
    });
    width = ox + wW + pad;
    height = Math.max(height, wH + top + 20);
  }
  return `<svg viewBox="0 0 ${r1(width)} ${r1(height)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" class="locator" style="width:${r1(width)}px;height:${r1(height)}px"><rect width="${r1(width)}" height="${r1(height)}" fill="${C.white}"/>${b}</svg>`;
}
