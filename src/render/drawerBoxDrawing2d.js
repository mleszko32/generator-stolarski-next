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
import { r1, fmt, KIND, text, line, dash, dimH, dimV, wrap, title, uniq, faceHole, edgeHole, proj, move, prism, solidsSvg } from "./workshopDrawing.js";
export { cabinetLocatorSVG } from "./workshopDrawing.js";

// Bok widziany od wewnątrz skrzynki: przód po lewej, wymiary od przodu i od spodu.
// Jedna skala dla wszystkich rysunków formatek skrzynki (prawdziwe proporcje między nimi):
// najmniejsza z 1:4 / 1:5 / 1:10 / 1:20, przy której każdy rysunek mieści się na A4
// (ok. 185 × 250 mm pola wydruku). Rozmiary jak w wrap() poszczególnych rysunków.
const SCALES = [4, 5, 10, 20];
export function drawingScale(box) {
  const sizes = box.panels.map((p) => (p.kind === "bok" ? [p.length + 120, p.width + 112]
    : p.kind === "dno" ? [p.length + 150, p.width + 112] : [p.length + 140, p.width + 114]));
  return SCALES.find((n) => sizes.every(([w, h]) => w / n <= 185 && h / n <= 250)) || SCALES[SCALES.length - 1];
}
const scaleNote = (scale) => (scale ? ` · skala 1:${scale}` : "");

export function sideSVG(box, panel, startNo = 1, scale = null) {
  const L = panel.length, H = panel.width, t = box.t, r = box.recess;
  const Y = (y) => H - y;
  let b = title(L / 2, -58, `${panel.name} — widok od wewnątrz`, `${fmt(L)} × ${fmt(H)} × ${fmt(t)} mm · ${panel.qty} szt.${scaleNote(scale)}`);
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
  return wrap(-40, -80, L + 120, H + 112, b, scale);
}

// Dno w rzucie z góry: przód po lewej, lewy bok u góry. Otwory w czołach (krawędziach).
export function bottomSVG(box, panel, startNo = 1, scale = null) {
  const L = panel.length, W = panel.width;
  let b = title(L / 2, -58, `${panel.name} — rzut z góry`, `${fmt(L)} × ${fmt(W)} × ${fmt(box.t)} mm · ${panel.qty} szt.${scaleNote(scale)}`);
  b += `<rect x="0" y="0" width="${r1(L)}" height="${r1(W)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  b += text(-8, W / 2, "PRZÓD", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  b += text(L + 14, W / 2, "TYŁ", { size: 10, color: C.slate400, weight: "bold", rotate: -90 });
  b += text(L / 2, 14, "lewy bok", { size: 9, color: C.slate400 });
  b += text(L / 2, W - 6, "prawy bok", { size: 9, color: C.slate400 });
  panel.holes.forEach((h, i) => {
    if (h.edge === "lico") b += faceHole(h.z, h.x, h, startNo + i);
    else if (h.edge === "lewe") b += edgeHole(h.z, 0, 0, 1, h, startNo + i);
    else if (h.edge === "prawe") b += edgeHole(h.z, W, 0, -1, h, startNo + i);
    else b += edgeHole(L, h.x, -1, 0, h, startNo + i);
  });
  uniq(panel.holes.filter((h) => h.edge === "lewe" || h.edge === "prawe").map((h) => h.z)).forEach((z, i) => {
    b += line(z, 0, z, -8 - (i % 2) * 12, C.slate300) + text(z, -11 - (i % 2) * 12, fmt(z), { size: 10, color: C.slate600 });
  });
  uniq(panel.holes.filter((h) => h.edge === "tylne").map((h) => h.x)).forEach((x) => {
    b += line(L, x, L + 32, x, C.slate300, dash) + text(L + 36, x + 4, fmt(x), { size: 10, color: C.sky600, anchor: "start" });
  });
  uniq(panel.holes.filter((h) => h.edge === "lico" && h.to).map((h) => h.x)).forEach((x) => {
    b += line(L, x, L + 62, x, C.slate300, dash) + text(L + 66, x + 4, fmt(x), { size: 10, color: C.slate600, anchor: "start" });
  });
  b += dimH(0, L, W + 18, fmt(L)) + dimV(-22, 0, W, fmt(W));
  return wrap(-40, -80, L + 150, W + 112, b, scale);
}

// Tył / czoło wewnętrzne widziane od wewnątrz skrzynki (niski bok po lewej w skrzynce B).
export function plateSVG(box, panel, startNo = 1, scale = null) {
  const W = panel.length, H = panel.width;
  const Y = (y) => H - y;
  const pts = panel.points.map(([x, y]) => `${r1(x)},${r1(Y(y))}`).join(" ");
  let b = title(W / 2, -40, `${panel.name}`, `${fmt(W)} × ${fmt(H)} × ${fmt(box.t)} mm · ${panel.qty} szt.${box.isB ? " · niski bok po lewej" : ""}${scaleNote(scale)}`);
  b += `<polygon points="${pts}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  panel.holes.forEach((h, i) => {
    b += h.edge === "lico" ? faceHole(h.x, Y(h.y), h, startNo + i)
      : h.edge === "dolne" ? edgeHole(h.x, Y(0), 0, -1, h, startNo + i)
      : h.edge === "lewe" ? edgeHole(0, Y(h.y), 1, 0, h, startNo + i) : edgeHole(W, Y(h.y), -1, 0, h, startNo + i);
  });
  uniq(panel.holes.filter((h) => h.edge === "lewe").map((h) => h.y)).forEach((y) => {
    b += line(0, Y(y), -26, Y(y), C.slate300, dash) + text(-30, Y(y) + 4, fmt(y), { size: 10, color: C.slate600, anchor: "end" });
  });
  uniq(panel.holes.filter((h) => h.edge === "prawe").map((h) => h.y)).forEach((y) => {
    b += line(W, Y(y), W + 26, Y(y), C.slate300, dash) + text(W + 30, Y(y) + 4, fmt(y), { size: 10, color: C.slate600, anchor: "start" });
  });
  // Położenia łączników w dolnej krawędzi (od lewej) - pod formatką.
  uniq(panel.holes.filter((h) => h.edge === "dolne").map((h) => h.x)).forEach((x) => {
    b += line(x, H, x, H + 10, C.slate300) + text(x, H + 21, fmt(x), { size: 10, color: C.slate600 });
  });
  b += dimH(0, W, H + 40, fmt(W));
  return wrap(-70, -62, W + 140, H + 114, b, scale);
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
      ? `płaszczyzna (od wewnątrz) → ${h.to}${h.groove ? (h.orient === "h" ? ", rowek poziomo" : ", rowek pionowo") : ""}`
      : h.edge === "lico" && h.kind !== "klucz" ? `lico od ${h.face === "spod" ? "spodu" : "góry"} → ${h.to}${h.groove ? ", rowek w poprzek" : ""}`
      : h.edge === "lico" ? (p.kind === "dno" ? "lico od góry (wnętrze szuflady), do rowka" : `lico od wewnątrz skrzynki, do rowka${h.to ? " przy dnie" : ""}`)
      : h.edge === "dolne" ? "czoło dolne → dno"
      : `czoło ${h.edge}${h.kind === "zaczep" ? ", od tyłu" : ""}`;
    const pos = p.kind === "bok" ? `${fmt(h.x)} od przodu, ${fmt(h.y)} od spodu`
      : p.kind === "dno" ? (h.edge === "tylne" ? `${fmt(h.x)} od boku, ${fmt(h.y)} nad spodem dna`
        : h.edge === "lico" && h.to ? `${fmt(h.x)} od lewego boku, ${fmt(h.z)} od przodu (oś ${h.to === "tył" ? "tyłu" : "przodu"})`
        : h.edge === "lico" ? `${fmt(h.z)} od przodu, ${fmt(Math.min(h.x, p.width - h.x))} od krawędzi bocznej` : `${fmt(h.z)} od przodu, w osi grubości`)
      : h.edge === "dolne" ? `${fmt(h.x)} od lewej, w osi grubości`
      : h.edge === "lico" && h.to ? `${fmt(h.x)} od lewej, ${fmt(h.y)} od spodu`
      : h.edge === "lico" ? `${fmt(h.y)} od spodu, ${fmt(Math.min(h.x, p.length - h.x))} od krawędzi` : `${fmt(h.y)} od spodu, w osi grubości`;
    const size = h.groove ? `rowek ${fmt(h.d)} × ${fmt(h.groove)}, gł. ${fmt(h.depth)} (Zeta P2)` : h.depth == null ? `Ø${fmt(h.d)} przelot${h.note && h.note !== "przelot" ? ` (${h.note.replace(/^przelot,?\s*/, "")})` : ""}` : `Ø${fmt(h.d)} × ${fmt(h.depth)}`;
    return `<tr><td>${n}</td><td>${escapeHtml(p.name)}</td><td><i class="dot" style="background:${KIND[h.kind].color}"></i>${escapeHtml(spec[h.kind].label)}</td><td>${size}</td><td>${escapeHtml(where)}</td><td>${pos}</td></tr>`;
  }));
  return `<table class="parts holes"><thead><tr><th>Nr</th><th>Formatka</th><th>Łącznik</th><th>Otwór [mm]</th><th>Gdzie</th><th>Położenie [mm]</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

// Kolejne numery otworów: formatki numerowane po kolei, jak w tabeli.
export function panelStartNumbers(box) {
  let n = 1;
  return box.panels.map((p) => { const s = n; n += p.holes.length; return s; });
}

// ---------------------------------------------------------------------------
// Rysunek montażu w 3D (aksonometria izometryczna): dno, tył i czoło wewnętrzne
// złożone razem, boki odsunięte na boki; przerywane linie montażowe w kolorach
// łączników prowadzą od otworu w boku do formatki, w którą wchodzi łącznik.
// Układ skrzynki: x w poprzek (0 = zewnętrzna strona lewego/niskiego boku), y w górę
// (0 = spód boków), z w głąb (0 = przód). Patrzymy z prawej, z góry, od przodu.
// ---------------------------------------------------------------------------

// Bryły formatek skrzynki (po złożeniu) + przesunięcie boków przy rozstrzeleniu.
function boxSolids(box, explode) {
  const t = box.t, r = box.recess;
  const sides = box.panels.filter((p) => p.kind === "bok");
  const lowSide = sides[0], highSide = sides[1] || sides[0];
  const bottom = box.panels.find((p) => p.id === "dno");
  const back = box.panels.find((p) => p.id === "tyl-przod");
  const L = bottom.length, w = bottom.width, Wo = w + 2 * t;
  const plate = back.points.map(([x, y]) => [t + x, r + t + y]);
  const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  return [
    { no: 1, name: sides.length > 1 ? lowSide.name : "Bok lewy", solid: prism(rect(0, 0, L, lowSide.width), "x", 0, t), shift: [-explode, 0, 0], tone: C.stone200 },
    { no: 2, name: sides.length > 1 ? highSide.name : "Bok prawy", solid: prism(rect(0, 0, L, highSide.width), "x", Wo - t, t), shift: [explode, 0, 0], tone: C.stone200 },
    { no: 3, name: "Dno", solid: prism(rect(t, 0, t + w, L), "y", r, t), shift: [0, 0, 0], tone: C.slate200 },
    { no: 4, name: "Tył/Przód (2 szt.)", solid: prism(plate, "z", L - t, t), shift: [0, 0, 0], tone: C.blue100, off: [34, -30] },
    { no: 4, name: "Tył/Przód (2 szt.)", solid: prism(plate, "z", 0, t), shift: [0, 0, 0], tone: C.blue100, off: [-34, -30] },
  ];
}

export function assemblySVG(box) {
  const t = box.t;
  const explode = Math.max(90, box.skw * 0.22);
  const exploded = boxSolids(box, explode);
  const assembled = boxSolids(box, 0);
  const bounds = (solids) => {
    const pts = solids.flatMap((s) => s.solid.faces.flatMap((f) => f.pts.map((p) => proj(move(p, s.shift)))));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const bE = bounds(exploded), bA = bounds(assembled);
  const W = 760, pad = 24, gap = 30, split = 0.68;
  // Rozstrzelony zajmuje ~2/3 szerokości, złożony resztę (mniejsza skala).
  const sE = (W * split - 2 * pad) / (bE.x1 - bE.x0);
  const sA = Math.min((W * (1 - split) - pad - gap) / (bA.x1 - bA.x0), sE * 0.6);
  const hE = (bE.y1 - bE.y0) * sE, hA = (bA.y1 - bA.y0) * sA;
  const H = Math.max(hE, hA) + 2 * pad + 60;
  const oxE = pad - bE.x0 * sE, oyE = pad + 36 - bE.y0 * sE;
  const oxA = W * split + gap - bA.x0 * sA, oyA = pad + 36 - bA.y0 * sA + (hE - hA) / 2;

  const E = solidsSvg(exploded, sE, oxE, oyE);
  let body = text(pad, 18, "MONTAŻ SKRZYNKI — WIDOK ROZSTRZELONY", { size: 14, color: C.blue900, weight: "bold", anchor: "start" });
  body += text(oxA + ((bA.x0 + bA.x1) / 2) * sA, 18, "PO ZŁOŻENIU", { size: 12, color: C.blue900, weight: "bold" });
  body += E.svg;

  // Linie montażowe: od otworu w boku (strona wewnętrzna) do formatki, w którą wchodzi.
  const sides = box.panels.filter((p) => p.kind === "bok");
  const Wo = box.skw + 2 * t;
  [[sides[0], -explode, t], [sides[1] || sides[0], explode, Wo - t]].forEach(([side, shiftX, innerX]) => {
    side.holes.forEach((h) => {
      const k = KIND[h.kind];
      const a = E.P([innerX, h.y, h.x], [shiftX, 0, 0]);
      const b = E.P([innerX, h.y, h.x], [0, 0, 0]);
      body += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${k.color}" stroke-width="1" stroke-dasharray="4,3"/>`;
      body += `<circle cx="${r1(a[0])}" cy="${r1(a[1])}" r="${r1(Math.max(1.6, (h.d / 2) * sE))}" fill="${h.depth == null ? C.white : k.color}" stroke="${k.color}" stroke-width="1"/>`;
      body += `<circle cx="${r1(b[0])}" cy="${r1(b[1])}" r="1.6" fill="${k.color}"/>`;
    });
  });

  // Numery formatek z odnośnikami (kółko z numerem obok środka bryły).
  const OFF = { 1: [-40, -24], 2: [40, -24], 3: [0, 40] };
  exploded.forEach((s) => {
    const c = E.P(s.solid.center, s.shift);
    const off = s.off || OFF[s.no];
    const lx = c[0] + off[0], ly = c[1] + off[1];
    body += line(c[0], c[1], lx, ly, C.slate500);
    body += `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="9" fill="${C.white}" stroke="${C.blue900}" stroke-width="1.2"/>`;
    body += text(lx, ly + 4, String(s.no), { size: 11, color: C.blue900, weight: "bold" });
  });

  body += solidsSvg(assembled, sA, oxA, oyA).svg;
  const f0 = E.P([Wo / 2, 0, 0], [0, 0, 0]);
  body += text(f0[0] - 20, f0[1] + 30, "↙ PRZÓD", { size: 10, color: C.slate500, weight: "bold" });

  body += text(pad, H - 10, [...new Set(exploded.map((s) => `${s.no} — ${s.name}`))].join("    "), { size: 10, color: C.slate600, anchor: "start" });
  return `<svg viewBox="0 0 ${W} ${r1(H)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}"><rect width="${W}" height="${r1(H)}" fill="${C.white}"/>${body}</svg>`;
}

// Kolejność montażu zależna od sposobu łączenia.
export function assemblyStepsHtml(box) {
  if (box.lamello) {
    const lam = box.lamello;
    const steps = [
      `Ustaw Zeta P2 na głębokość ${lam.depth} (${lam.name}); przy płycie ${fmt(box.t)} mm oś rowka w połowie grubości (płytka 2 mm dla 16 mm). Frezuj oba elementy połączenia od tej samej strony bazowej - wtedy rowki się pokrywają.`,
      "Rowki w czołach formatek tył/przód (4) i dna (3) oraz pasujące rowki w płaszczyźnie boków (1, 2), a także rowki w licu dna (od góry) i w dolnej krawędzi tył/przód - wg rysunków.",
      lam.clamex
        ? `Wywierć otwory Ø6 na klucz (przyrząd Lamello do Clamex P), ${fmt(lam.keyFromEdge)} mm od krawędzi, od strony wnętrza skrzynki, aż do rowka.`
        : null,
      lam.clamex
        ? `Wsuń łączniki ${lam.name} (część z dźwignią w formatkę z otworem), złóż skrzynkę i dociągnij kluczem imbusowym przez otwory Ø6. Połączenie jest rozbieralne; otwory można zakryć zaślepkami.`
        : `Wsuń łączniki ${lam.name} z kroplą kleju (klej podnosi wytrzymałość), złóż skrzynkę - łączniki same dociągną połączenie, ścisków nie trzeba. Połączenie jest nierozbieralne i niewidoczne.`,
      "Sprawdź przekątne skrzynki (kąt prosty).",
      "Przykręć sprzęgła T51.7601 pod dnem z przodu (wg szablonu Blum T65.1000.02), potem front od środka przez czoło wewnętrzne.",
    ].filter(Boolean);
    return `<ol class="steps">${steps.map((st) => `<li>${escapeHtml(st)}</li>`).join("")}</ol>`;
  }
  const dowels = box.join === "kolek_wkret" || box.join === "kolki";
  const glue = box.join !== "konfirmat";
  const fix = { kolek_wkret: "wkręty", konfirmat: "konfirmaty", kolki: "ścisk (kołki na klej)", wkrety: "wkręty" }[box.join];
  const steps = [
    "Nawierć formatki wg rysunków i tabeli otworów (zaczepy tylne w dnie i sprzęgła można wiercić szablonem Blum T65.1000.02).",
    dowels ? "Wklej kołki w czoła dna (3) i obu formatek tył/przód (4) oraz w lico dna pod tył i przód." : null,
    `Połóż bok ${box.isB ? "niski" : "lewy"} (1) wewnętrzną stroną do góry, wstaw w niego dno (3), a na dnie tył i przód (4) — tył i przód połącz od razu z dnem${box.join === "kolki" ? "" : " (wkręty od spodu dna)"}${glue ? " — połączenia na klej" : ""}.`,
    `Nałóż drugi bok (2) i skręć całość: ${fix}. Tył i czoło górą równo z bokami, dno ${fmt(box.recess)} mm nad spodem boków.`,
    "Sprawdź przekątne skrzynki (kąt prosty) i zetrzyj nadmiar kleju.",
    "Przykręć sprzęgła T51.7601 pod dnem z przodu (wg szablonu), potem front od środka przez czoło wewnętrzne.",
  ].filter(Boolean);
  return `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
}
