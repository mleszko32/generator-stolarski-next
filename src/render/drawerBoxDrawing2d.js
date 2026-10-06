// src/render/drawerBoxDrawing2d.js
//
// Rysunki warsztatowe skrzynki szuflady drewnianej (MOVENTO) z otworami - dane z
// core/drawerBoxBuild.js. Skala 1 jednostka = 1 mm, otwory w prawdziwej średnicy,
// położenia podane od jednej bazy (przód / spód formatki), otwory ponumerowane i
// opisane w tabeli pod rysunkami. Samodzielne SVG (osobne okno, druk) - kolory i
// font z drawingPalette.js.
import { C, FONT } from "./drawingPalette.js";
import { escapeHtml } from "../utils/dom.js";
import { holeSpecs } from "../core/drawerBoxBuild.js";

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(r1(v)).replace(".", ",");

const KIND = {
  wkret: { color: C.purple600, label: "wkręt" },
  konfirmat: { color: C.violet600, label: "konfirmat" },
  kolek: { color: C.green600, label: "kołek" },
  zaczep: { color: C.sky600, label: "zaczep prowadnicy" },
};

const text = (x, y, t, { size = 11, color = C.slate700, anchor = "middle", weight = "normal", rotate = 0 } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}"${rotate ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : ""}>${escapeHtml(t)}</text>`;
const line = (x1, y1, x2, y2, color = C.slate500, extra = "") =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="0.8" ${extra}/>`;
const dash = 'stroke-dasharray="3,2"';

function dimH(x1, x2, y, label, color = C.slate600) {
  return line(x1, y, x2, y, color) + line(x1, y - 4, x1, y + 4, color) + line(x2, y - 4, x2, y + 4, color)
    + text((x1 + x2) / 2, y - 4, label, { size: 11, color });
}
function dimV(x, y1, y2, label, color = C.slate600) {
  return line(x, y1, x, y2, color) + line(x - 4, y1, x + 4, y1, color) + line(x - 4, y2, x + 4, y2, color)
    + text(x - 6, (y1 + y2) / 2, label, { size: 11, color, rotate: -90 });
}
const wrap = (minX, minY, w, h, body) =>
  `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">`
  + `<rect x="${r1(minX)}" y="${r1(minY)}" width="${r1(w)}" height="${r1(h)}" fill="${C.white}"/>${body}</svg>`;
const title = (x, y, t, sub) => text(x, y, t.toUpperCase(), { size: 14, color: C.blue900, weight: "bold" })
  + (sub ? text(x, y + 15, sub, { size: 11, color: C.slate500 }) : "");
const uniq = (arr) => [...new Set(arr.map(r1))].sort((a, b) => a - b);

// Otwór w płaszczyźnie: kółko w prawdziwej średnicy + numer obok.
function faceHole(cx, cy, h, n) {
  const k = KIND[h.kind];
  return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(h.d / 2)}" fill="${h.depth == null ? C.white : k.color}" stroke="${k.color}" stroke-width="1.2"/>`
    + text(cx + h.d / 2 + 2, cy - h.d / 2 - 1, String(n), { size: 9, color: k.color, anchor: "start", weight: "bold" });
}
// Otwór w czole: zarys kanału od krawędzi w głąb płyty (dx, dy - kierunek w głąb).
function edgeHole(x, y, dx, dy, h, n) {
  const k = KIND[h.kind], half = h.d / 2, L = h.depth;
  const pts = dx
    ? [[x, y - half], [x + dx * L, y - half], [x + dx * L, y + half], [x, y + half]]
    : [[x - half, y], [x - half, y + dy * L], [x + half, y + dy * L], [x + half, y]];
  return `<polygon points="${pts.map((p) => p.map(r1).join(",")).join(" ")}" fill="${k.color}" fill-opacity="0.25" stroke="${k.color}" stroke-width="1"/>`
    + text(x + dx * (L + 3) + (dy ? half + 2 : 0), y + dy * (L + 3) + (dx ? -half - 1 : 9), String(n), { size: 9, color: k.color, anchor: dx < 0 ? "end" : "start", weight: "bold" });
}

// Bok widziany od wewnątrz skrzynki: przód po lewej, wymiary od przodu i od spodu.
export function sideSVG(box, panel, startNo = 1) {
  const L = panel.length, H = panel.width, t = box.t, r = box.recess;
  const Y = (y) => H - y;
  let b = title(L / 2, -58, `${panel.name} — widok od wewnątrz`, `${fmt(L)} × ${fmt(H)} × ${fmt(t)} mm · ${panel.qty} szt.`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(H)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  // Gdzie stoją sąsiednie formatki (cienko, przerywane).
  b += `<rect x="0" y="0" width="${t}" height="${r1(H - r - t)}" fill="none" stroke="${C.slate400}" ${dash}/>`;
  b += `<rect x="${r1(L - t)}" y="0" width="${t}" height="${r1(H - r - t)}" fill="none" stroke="${C.slate400}" ${dash}/>`;
  b += `<rect x="0" y="${r1(Y(r + t))}" width="${r1(L)}" height="${t}" fill="none" stroke="${C.slate400}" ${dash}/>`;
  b += text(t + 4, 12, "czoło wewn.", { size: 9, color: C.slate400, anchor: "start" });
  b += text(L - t - 4, 12, "tył", { size: 9, color: C.slate400, anchor: "end" });
  b += text(L / 2, Y(r + t) + t / 2 + 3, "dno", { size: 9, color: C.slate400 });
  b += text(-8, H / 2, "PRZÓD", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  b += text(L + 14, H / 2, "TYŁ", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  panel.holes.forEach((h, i) => { b += faceHole(h.x, Y(h.y), h, startNo + i); });
  // Odległości od przodu nad bokiem, wysokości w kolumnie po prawej.
  uniq(panel.holes.map((h) => h.x)).forEach((x, i) => {
    b += line(x, 0, x, -8 - (i % 2) * 12, C.slate300) + text(x, -11 - (i % 2) * 12, fmt(x), { size: 10, color: C.slate600 });
  });
  uniq(panel.holes.map((h) => h.y)).forEach((y) => {
    b += line(L, Y(y), L + 32, Y(y), C.slate300, dash) + text(L + 36, Y(y) + 4, fmt(y), { size: 10, color: C.slate600, anchor: "start" });
  });
  b += dimH(0, L, H + 18, fmt(L)) + dimV(-22, 0, H, fmt(H));
  return wrap(-40, -80, L + 120, H + 112, b);
}

// Dno w rzucie z góry: przód po lewej, lewy bok u góry. Otwory w czołach (krawędziach).
export function bottomSVG(box, panel, startNo = 1) {
  const L = panel.length, W = panel.width;
  let b = title(L / 2, -58, `${panel.name} — rzut z góry`, `${fmt(L)} × ${fmt(W)} × ${fmt(box.t)} mm · ${panel.qty} szt.`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(W)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  b += text(-8, W / 2, "PRZÓD", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  b += text(L + 14, W / 2, "TYŁ", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  b += text(L / 2, 14, "lewy bok", { size: 9, color: C.slate400 });
  b += text(L / 2, W - 6, "prawy bok", { size: 9, color: C.slate400 });
  panel.holes.forEach((h, i) => {
    if (h.edge === "lewe") b += edgeHole(h.z, 0, 0, 1, h, startNo + i);
    else if (h.edge === "prawe") b += edgeHole(h.z, W, 0, -1, h, startNo + i);
    else b += edgeHole(L, h.x, -1, 0, h, startNo + i);
  });
  uniq(panel.holes.filter((h) => h.edge !== "tylne").map((h) => h.z)).forEach((z, i) => {
    b += line(z, 0, z, -8 - (i % 2) * 12, C.slate300) + text(z, -11 - (i % 2) * 12, fmt(z), { size: 10, color: C.slate600 });
  });
  uniq(panel.holes.filter((h) => h.edge === "tylne").map((h) => h.x)).forEach((x) => {
    b += line(L, x, L + 32, x, C.slate300, dash) + text(L + 36, x + 4, fmt(x), { size: 10, color: C.sky600, anchor: "start" });
  });
  b += dimH(0, L, W + 18, fmt(L)) + dimV(-22, 0, W, fmt(W));
  return wrap(-40, -80, L + 120, W + 112, b);
}

// Tył / czoło wewnętrzne widziane od wewnątrz skrzynki (niski bok po lewej w skrzynce B).
export function plateSVG(box, panel, startNo = 1) {
  const W = panel.length, H = panel.width;
  const Y = (y) => H - y;
  const pts = panel.points.map(([x, y]) => `${r1(x)},${r1(Y(y))}`).join(" ");
  let b = title(W / 2, -40, `${panel.name}`, `${fmt(W)} × ${fmt(H)} × ${fmt(box.t)} mm · ${panel.qty} szt.${box.isB ? " · niski bok po lewej" : ""}`);
  b += `<polygon points="${pts}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  panel.holes.forEach((h, i) => {
    b += h.edge === "lewe" ? edgeHole(0, Y(h.y), 1, 0, h, startNo + i) : edgeHole(W, Y(h.y), -1, 0, h, startNo + i);
  });
  uniq(panel.holes.filter((h) => h.edge === "lewe").map((h) => h.y)).forEach((y) => {
    b += line(0, Y(y), -26, Y(y), C.slate300, dash) + text(-30, Y(y) + 4, fmt(y), { size: 10, color: C.slate600, anchor: "end" });
  });
  uniq(panel.holes.filter((h) => h.edge === "prawe").map((h) => h.y)).forEach((y) => {
    b += line(W, Y(y), W + 26, Y(y), C.slate300, dash) + text(W + 30, Y(y) + 4, fmt(y), { size: 10, color: C.slate600, anchor: "start" });
  });
  b += dimH(0, W, H + 18, fmt(W));
  return wrap(-70, -62, W + 140, H + 92, b);
}

// Legenda rodzajów otworów obecnych w skrzynce.
export function legendHtml(box) {
  const kinds = [...new Set(box.panels.flatMap((p) => p.holes.map((h) => h.kind)))];
  return `<div class="legend">${kinds.map((k) => `<span><i style="background:${KIND[k].color}"></i>${KIND[k].label}</span>`).join("")}
    <span><i class="open" style="border-color:${C.slate600}"></i>przelot</span></div>`;
}

// Tabela otworów: numer, formatka, rodzaj, Ø × głębokość, gdzie, położenie.
export function holeTableHtml(box, settings) {
  const spec = holeSpecs(settings, box.t);
  let n = 0;
  const rows = box.panels.flatMap((p) => p.holes.map((h) => {
    n++;
    const where = p.kind === "bok"
      ? `płaszczyzna (od wewnątrz) → ${h.to}`
      : `czoło ${h.edge}${h.kind === "zaczep" ? ", od tyłu" : ""}`;
    const pos = p.kind === "bok" ? `${fmt(h.x)} od przodu, ${fmt(h.y)} od spodu`
      : p.kind === "dno" ? (h.edge === "tylne" ? `${fmt(h.x)} od boku, ${fmt(h.y)} nad spodem dna` : `${fmt(h.z)} od przodu, w osi grubości`)
      : `${fmt(h.y)} od spodu, w osi grubości`;
    const size = h.depth == null ? `Ø${fmt(h.d)} przelot${h.note && h.note !== "przelot" ? ` (${h.note.replace(/^przelot,?\s*/, "")})` : ""}` : `Ø${fmt(h.d)} × ${fmt(h.depth)}`;
    return `<tr><td>${n}</td><td>${escapeHtml(p.name)}</td><td><i class="dot" style="background:${KIND[h.kind].color}"></i>${escapeHtml(spec[h.kind].label)}</td><td>${size}</td><td>${escapeHtml(where)}</td><td>${pos}</td></tr>`;
  }));
  return `<table class="parts holes"><thead><tr><th>Nr</th><th>Formatka</th><th>Łącznik</th><th>Otwór [mm]</th><th>Gdzie</th><th>Położenie [mm]</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

// Kolejne numery otworów: formatki numerowane po kolei, jak w tabeli.
export function panelStartNumbers(box) {
  let n = 1;
  return box.panels.map((p) => { const s = n; n += p.holes.length; return s; });
}
