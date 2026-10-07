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
import { r1, fmt, KIND, text, line, dash, dimH, dimV, wrap, title, uniq, faceHole, edgeHole, proj, move, prism, solidsSvg, setUnit, unitFor } from "./workshopDrawing.js";

// Formatki z otworami (pozostałe - plecy, półki ruchome - są tylko w tabeli formatek).
export const drawnPanels = (panels) => panels.filter((p) => p.holes.length > 0);

// Rozmiar rysunku (jednostki = mm) - musi się zgadzać z wrap() w funkcjach niżej.
const drawSize = (p) => { const u = unitFor(Math.max(p.length, p.width)); return [p.length + 130 * u, p.width + 112 * u]; };

// Jedna skala dla wszystkich formatek szafki: najmniejsza z listy, przy której każdy rysunek
// mieści się na A4 (ok. 185 × 250 mm).
const SCALES = [4, 5, 10, 20, 25];
export function cabinetDrawingScale(panels) {
  const sizes = drawnPanels(panels).map(drawSize);
  return SCALES.find((n) => sizes.every(([w, h]) => w / n <= 185 && h / n <= 250)) || SCALES[SCALES.length - 1];
}
const scaleNote = (scale) => (scale ? ` · skala 1:${scale}` : "");

// Formatka pionowa (bok, przegroda, trawers pionowy) - widok płaszczyzny. Bok prawy rysowany
// z przodem po prawej (jak na rysunku 2D z wierceniami), reszta z przodem po lewej.
// side - tylko otwory tej strony przegrody ('lewa' / 'prawa'), czoła zawsze.
// landscape - formatka leżąco (dół formatki po lewej, przód u dołu; bok prawy: przód u góry):
// na ekranie wysoki bok słupka mieści się wtedy na szerokość okna z czytelnymi opisami.
export function verticalPanelSVG(panel, startNo = 1, scale = null, side = null, landscape = false) {
  const L = panel.length, H = panel.width;
  const u = landscape ? Math.max(1, Math.max(L, H) / 650) : unitFor(Math.max(L, H));
  setUnit(u);
  const rev = !!panel.frontOnRight;
  const SW = landscape ? H : L, SH = landscape ? L : H;    // wymiary rysunku formatki
  // Punkt formatki (x od przodu, y od dołu) -> współrzędne rysunku.
  const P = landscape
    ? (x, y) => [y, rev ? x : L - x]
    : (x, y) => [rev ? L - x : x, H - y];
  const isTrav = panel.kind === "trawers-pion";
  const label = side ? `${panel.name} — strona ${side}` : panel.kind === "bok" ? `${panel.name} — widok od wewnątrz` : panel.name;
  let b = title(SW / 2, -58 * u, label, `${fmt(L)} × ${fmt(H)} × ${fmt(panel.thickness)} mm · ${panel.qty} szt.${landscape ? " · rysunek leżąco" : scaleNote(scale)}`);
  b += `<rect x="0" y="0" width="${r1(SW)}" height="${r1(SH)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="${r1(1.5 * u)}"/>`;
  if (!isTrav) {
    const lab = { size: 10, color: C.slate400, weight: "bold" };
    if (landscape) {
      const frontY = rev ? 12 * u : SH - 6 * u, backY = rev ? SH - 6 * u : 12 * u;
      b += text(SW / 2, frontY, "PRZÓD", lab) + text(SW / 2, backY, "TYŁ", lab);
      b += text(-8 * u, SH / 2, "DÓŁ", { ...lab, rotate: -90 }) + text(SW + 14 * u, SH / 2, "GÓRA", { ...lab, rotate: -90 });
    } else {
      b += text(rev ? L + 8 * u : -8 * u, H / 2, "PRZÓD", { ...lab, rotate: -90 });
      b += text(rev ? -14 * u : L + 14 * u, H / 2, "TYŁ", { ...lab, rotate: -90 });
    }
  }
  panel.holes.forEach((h, i) => {
    const n = startNo + i;
    if (side && h.side && h.side !== side) return;
    if (h.edge === "dolne") {
      const [sx, sy] = P(h.x, 0);
      b += landscape ? edgeHole(0, sy, 1, 0, h, n) : edgeHole(sx, H, 0, -1, h, n);
    } else if (h.edge === "gorne") {
      const [sx, sy] = P(h.x, H);
      b += landscape ? edgeHole(SW, sy, -1, 0, h, n) : edgeHole(sx, 0, 0, 1, h, n);
    } else if (h.edge === "lewe") b += edgeHole(0, H - h.y, 1, 0, h, n);
    else if (h.edge === "prawe") b += edgeHole(L, H - h.y, -1, 0, h, n);
    else { const [sx, sy] = P(h.x, h.y); b += faceHole(sx, sy, h, n); }
  });
  const visible = panel.holes.filter((h) => !side || !h.side || h.side === side);
  // Położenia: od przodu (x) i od spodu (y). Pionowo: x nad formatką, y w kolumnie po stronie
  // tyłu. Leżąco: y nad formatką, x w kolumnie po prawej.
  const xs = uniq(visible.filter((h) => h.edge !== "lewe" && h.edge !== "prawe").map((h) => h.x));
  const ys = uniq(visible.filter((h) => h.edge !== "dolne" && h.edge !== "gorne").map((h) => h.y));
  const topVals = landscape ? ys.map((y) => [P(0, y)[0], y]) : xs.map((x) => [P(x, 0)[0], x]);
  const sideVals = landscape ? xs.map((x) => [P(x, 0)[1], x]) : ys.map((y) => [P(0, y)[1], y]);
  topVals.forEach(([sx, v], i) => {
    b += line(sx, 0, sx, (-8 - (i % 2) * 12) * u, C.slate300) + text(sx, (-11 - (i % 2) * 12) * u, fmt(v), { size: 10, color: C.slate600 });
  });
  const left = !landscape && rev;
  const colX = left ? -6 * u : SW + 6 * u;
  sideVals.forEach(([sy, v]) => {
    b += line(left ? 0 : SW, sy, left ? colX - 26 * u : colX + 26 * u, sy, C.slate300, dash)
      + text(left ? colX - 30 * u : colX + 30 * u, sy + 4 * u, fmt(v), { size: 10, color: C.slate600, anchor: left ? "end" : "start" });
  });
  if (landscape) b += text(SW / 2, (-11 - 24) * u, "położenia: nad formatką od spodu, z boku od przodu", { size: 9, color: C.slate400 });
  b += dimH(0, SW, SH + 18 * u, fmt(SW)) + dimV(left ? SW + 22 * u : -22 * u, 0, SH, fmt(SH));
  const svg = left ? wrap(-90 * u, -80 * u, SW + 130 * u, SH + 112 * u, b, scale) : wrap(-40 * u, -80 * u, SW + 130 * u, SH + 112 * u, b, landscape ? null : scale);
  setUnit(1);
  return svg;
}

// Formatka pozioma (wieniec, półka, trawers poziomy) - rzut z góry: x w prawo od lewej
// krawędzi, przód u dołu. Otwory w czołach lewym / prawym i w licu (od góry).
export function horizontalPanelSVG(panel, startNo = 1, scale = null) {
  const L = panel.length, Dd = panel.width;
  const u = unitFor(Math.max(L, Dd));
  setUnit(u);
  const Z = (z) => Dd - z;                                // przód (z = 0) u dołu rysunku
  let b = title(L / 2, -58 * u, `${panel.name} — rzut z góry`, `${fmt(L)} × ${fmt(Dd)} × ${fmt(panel.thickness)} mm · ${panel.qty} szt.${scaleNote(scale)}`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(Dd)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  b += text(L / 2, Dd - 6 * u, "PRZÓD", { size: 10, color: C.slate400, weight: "bold" });
  b += text(L / 2, 14 * u, "TYŁ", { size: 10, color: C.slate400, weight: "bold" });
  panel.holes.forEach((h, i) => {
    const n = startNo + i;
    if (h.edge === "lewe") b += edgeHole(0, Z(h.z), 1, 0, h, n);
    else if (h.edge === "prawe") b += edgeHole(L, Z(h.z), -1, 0, h, n);
    else b += faceHole(h.x, Z(h.z), { ...h, orient: "v" }, n);
  });
  uniq(panel.holes.filter((h) => h.edge === "lico").map((h) => h.x)).forEach((x, i) => {
    b += line(x, 0, x, (-8 - (i % 2) * 12) * u, C.slate300) + text(x, (-11 - (i % 2) * 12) * u, fmt(x), { size: 10, color: C.slate600 });
  });
  uniq(panel.holes.map((h) => h.z)).forEach((z) => {
    b += line(L, Z(z), L + 32 * u, Z(z), C.slate300, dash) + text(L + 36 * u, Z(z) + 4 * u, fmt(z), { size: 10, color: C.slate600, anchor: "start" });
  });
  b += text(L + 36 * u, Dd + 12 * u, "od przodu", { size: 9, color: C.slate400, anchor: "start" });
  b += dimH(0, L, Dd + 18 * u, fmt(L)) + dimV(-22 * u, 0, Dd, fmt(Dd));
  const svg = wrap(-40 * u, -80 * u, L + 130 * u, Dd + 112 * u, b, scale);
  setUnit(1);
  return svg;
}

export function panelSVGs(panels, scale) {
  let n = 1;
  const out = [];
  panels.forEach((p) => {
    const start = n;
    n += p.holes.length;
    if (!p.holes.length) return;
    // Wysoka formatka pionowa: na ekranie leżąco (czytelna na szerokość okna), na wydruku pionowo w skali.
    const vertical = (side) => (p.width > 1.4 * p.length && p.kind !== "trawers-pion"
      ? `<div class="screen-only">${verticalPanelSVG(p, start, scale, side, true)}</div><div class="print-only">${verticalPanelSVG(p, start, scale, side)}</div>`
      : verticalPanelSVG(p, start, scale, side));
    if (p.kind === "przegroda") out.push(vertical("lewa"), vertical("prawa"));
    else if (p.kind === "bok" || p.kind === "trawers-pion") out.push(vertical(null));
    else out.push(horizontalPanelSVG(p, start, scale));
  });
  return out;
}

export function cabinetLegendHtml(panels) {
  const kinds = [...new Set(panels.flatMap((p) => p.holes.map((h) => h.kind)))];
  return `<div class="legend">${kinds.map((k) => `<span><i style="background:${KIND[k].color}"></i>${KIND[k].label}</span>`).join("")}
    <span><i class="open" style="border-color:${C.slate600}"></i>przelot</span></div>`;
}

export function cabinetHoleTableHtml(panels, th) {
  const spec = cabinetHoleSpecs(th);
  let n = 0;
  const EDGE = { lewe: "czoło lewe", prawe: "czoło prawe", dolne: "czoło dolne", gorne: "czoło górne" };
  const rows = panels.flatMap((p) => p.holes.map((h) => {
    n++;
    const vertical = p.kind === "bok" || p.kind === "przegroda" || p.kind === "trawers-pion";
    const where = h.edge && h.edge !== "lico" ? `${EDGE[h.edge]} → ${h.to}`
      : h.edge === "lico" ? `lico od wewnątrz → ${h.to}`
      : `płaszczyzna${h.side ? ` (strona ${h.side})` : " (od wewnątrz)"} → ${h.to}`;
    const pos = vertical
      ? (h.edge === "lewe" || h.edge === "prawe" ? `${fmt(h.y)} od spodu, w osi grubości` : h.edge ? `${fmt(h.x)} od przodu, w osi grubości` : `${fmt(h.x)} od przodu, ${fmt(h.y)} od spodu`)
      : (h.edge === "lico" ? `${fmt(h.x)} od lewej, ${fmt(h.z)} od przodu` : `${fmt(h.z)} od przodu, w osi grubości`);
    const size = h.depth == null ? `Ø${fmt(h.d)} przelot${h.note ? ` (${h.note.replace(/^przelot\s*\+?\s*/, "")})` : ""}` : `Ø${fmt(h.d)} × ${fmt(h.depth)}`;
    return `<tr><td>${n}</td><td>${escapeHtml(p.name)}</td><td><i class="dot" style="background:${KIND[h.kind].color}"></i>${escapeHtml(spec[h.kind].label)}</td><td>${size}</td><td>${escapeHtml(where)}</td><td>${pos}</td></tr>`;
  }));
  return `<table class="parts holes"><thead><tr><th>Nr</th><th>Formatka</th><th>Łącznik</th><th>Otwór [mm]</th><th>Gdzie</th><th>Położenie [mm]</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
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
