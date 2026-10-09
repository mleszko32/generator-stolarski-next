// src/render/cornerInstructions2d.js
//
// Rysunki instrukcji montażu szafki narożnej (dane: engine/cornerDrillings.js) - to, czego nie
// ma zwykła szafka (render/cabinetDrawing2d.js): formatka w kształcie L (wieniec, półka) z
// otworami, montaż w izometrii (rozstrzelony + złożony) i kolejność montażu. Boki i listwę
// rysuje verticalPanelSVG z cabinetDrawing2d.js. Klocki z render/workshopDrawing.js.
import { C, FONT } from "./drawingPalette.js";
import { escapeHtml } from "../utils/dom.js";
import { r1, fmt, KIND, text, line, dash, dimH, dimV, wrap, title, faceHole, edgeHole, proj, move, prism, solidsSvg, setUnit, unitFor, uniq } from "./workshopDrawing.js";

// Ramka rysunku formatki L (jednostki = mm) - wspólna dla rysunku i doboru skali.
export function lPanelFrame(panel) {
  const { blankA, blankB } = panel.outline;
  const u = unitFor(Math.max(blankA, blankB));
  return { u, minX: -60 * u, minY: -80 * u, w: blankA + 180 * u, h: blankB + 200 * u };
}

// Obrys L w układzie formatki (0,0 = tylny róg, x wzdłuż ramienia A, y wzdłuż ramienia B).
export function lOutline({ blankA, blankB, depthA, depthB, notch }) {
  const pts = notch
    ? [[0, notch.h], [notch.w, notch.h], [notch.w, 0]]
    : [[0, 0]];
  return [...pts, [blankA, 0], [blankA, depthA], [depthB, depthA], [depthB, blankB], [0, blankB]];
}

// Formatka L - rzut z góry: tyły (ściany) u góry i z lewej, przód w wewnętrznym narożu.
// Łączniki w czołach końców ramion opisane odległością od przodu (jak czoła wieńca zwykłej
// szafki), kołki listwy - odległością od naroża.
export function lPanelSVG(panel, scale = null) {
  const o = panel.outline;
  const { u, minX, minY, w, h } = lPanelFrame(panel);
  setUnit(u);
  const sub = `${fmt(o.blankA)} × ${fmt(o.blankB)} × ${fmt(panel.thickness)} mm · ${panel.qty} szt.${scale ? ` · skala 1:${scale}` : ""}`;
  let b = title(o.blankA / 2, -58 * u, `${panel.name} — widok z góry`, sub);
  // Formatka do wycięcia (prostokąt) przerywaną linią, docięty obrys L ciągłą.
  b += `<rect x="0" y="0" width="${r1(o.blankA)}" height="${r1(o.blankB)}" fill="none" stroke="${C.slate300}" stroke-width="${r1(0.8 * u)}" stroke-dasharray="${r1(5 * u)},${r1(4 * u)}"/>`;
  b += `<polygon points="${lOutline(o).map((p) => p.map(r1).join(",")).join(" ")}" fill="${C.white}" stroke="${C.slate600}" stroke-width="${r1(1.5 * u)}"/>`;
  b += text(o.blankA / 2, -10 * u, "TYŁ — ściana ramienia A", { size: 11, color: C.slate400, weight: "bold" });
  b += text(-10 * u, o.blankB / 2, "TYŁ — ściana ramienia B", { size: 11, color: C.slate400, weight: "bold", rotate: -90 });
  b += text((o.depthB + o.blankA) / 2, o.depthA + 16 * u, "PRZÓD", { size: 11, color: C.slate400, weight: "bold" });
  b += text(o.depthB + 16 * u, (o.depthA + o.blankB) / 2, "PRZÓD", { size: 11, color: C.slate400, weight: "bold", rotate: 90 });
  b += text((o.depthB + o.blankA) / 2, o.depthA / 2 + 5 * u, "RAMIĘ A", { size: 13, color: C.slate300, weight: "bold" });
  b += text(o.depthB / 2, (o.depthA + o.blankB) / 2, "RAMIĘ B", { size: 13, color: C.slate300, weight: "bold", rotate: -90 });
  if (o.notch) b += text(o.notch.w + 6 * u, o.notch.h + 14 * u, `wycięcie ${fmt(o.notch.w)} × ${fmt(o.notch.h)} na listwę`, { size: 10, color: C.red600, anchor: "start" });

  panel.holes.forEach((hl) => {
    if (hl.edge === "koniec-A") b += edgeHole(o.blankA, hl.y, -1, 0, hl);
    else if (hl.edge === "koniec-B") b += edgeHole(hl.x, o.blankB, 0, -1, hl);
    else b += faceHole(hl.x, hl.y, hl);
  });
  // Czoło końca ramienia A: odległości od przodu w kolumnie z prawej.
  const endA = panel.holes.filter((hl) => hl.edge === "koniec-A");
  uniq(endA.map((hl) => hl.y)).forEach((y) => {
    const hl = endA.find((q) => r1(q.y) === y);
    b += line(o.blankA, y, o.blankA + 32 * u, y, C.slate300, dash) + text(o.blankA + 36 * u, y + 4 * u, fmt(hl.z), { size: 10, color: C.slate600, anchor: "start" });
  });
  if (endA.length) b += text(o.blankA + 36 * u, -10 * u, "od przodu", { size: 9, color: C.slate400, anchor: "start" });
  // Czoło końca ramienia B: odległości od przodu pod formatką (pionowo).
  const endB = panel.holes.filter((hl) => hl.edge === "koniec-B");
  uniq(endB.map((hl) => hl.x)).forEach((x) => {
    const hl = endB.find((q) => r1(q.x) === x);
    b += line(x, o.blankB, x, o.blankB + 32 * u, C.slate300, dash) + text(x + 4 * u, o.blankB + 36 * u, fmt(hl.z), { size: 10, color: C.slate600, anchor: "end", rotate: -90 });
  });
  if (endB.length) b += text(o.depthB + 6 * u, o.blankB + 46 * u, "od przodu", { size: 9, color: C.slate400, anchor: "start" });
  // Kołki listwy w licu.
  const lico = panel.holes.filter((hl) => hl.edge === "lico");
  if (lico.length) {
    b += text(o.notch ? o.notch.w + 6 * u : 6 * u, 40 * u, `kołki listwy ${panel.faceSide || ""}: ${uniq(lico.map((hl) => hl.x)).map(fmt).join(" / ")} mm od naroża, ${fmt(lico[0].y)} mm od tyłu`,
      { size: 10, color: KIND.kolek.color, anchor: "start", weight: "bold" });
  }
  // Wymiary: całość ramion i głębokości ramion.
  b += dimH(0, o.blankA, -26 * u, fmt(o.blankA)) + dimV(-26 * u, 0, o.blankB, fmt(o.blankB));
  b += dimV(o.blankA + 22 * u + (endA.length ? 70 * u : 0), 0, o.depthA, fmt(o.depthA));
  b += dimH(0, o.depthB, o.blankB + 22 * u + (endB.length ? 70 * u : 0), fmt(o.depthB));
  const svg = wrap(minX, minY, w, h, b, scale);
  setUnit(1);
  return svg;
}

// ---------------------------------------------------------------------------
// Montaż w izometrii. Lokalny układ narożnika (render/cornerCabinet3d.js): X wzdłuż ramienia A,
// Z wzdłuż ramienia B, 0,0 = tylny róg. Rzut izometryczny widzi ściany +x i -z, więc z = legB - Z:
// front ramienia A (normalna +Z) i front ramienia B (normalna +X) są oba widoczne.
// ---------------------------------------------------------------------------
function cornerSolids(mod, panels, explode) {
  const byId = (id) => panels.find((p) => p.id === id);
  const no = (id) => panels.findIndex((p) => p.id === id) + 1;
  const bok = byId("bok-a");
  const th = bok ? bok.thickness : 18;
  const legA = parseFloat(mod.dimensions.width) || 860, legB = parseFloat(mod.dimensions.legB) || 860;
  const H = parseFloat(mod.dimensions.height) || 720;
  const depthA = parseFloat(mod.dimensions.depth) || 540, depthB = parseFloat(mod.dimensions.depthB) || depthA;
  const bt = (byId("plecy-a") || byId("plecy-b") || { thickness: 3 }).thickness;
  const Zi = (Z) => legB - Z;
  const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const solids = [];
  const add = (id, solid, shift, tone) => { const p = byId(id); if (p) solids.push({ no: no(id), name: p.name, solid, shift, tone }); };

  add("bok-a", prism(rect(Zi(depthA), 0, Zi(bt), H), "x", legA - th, th), [explode, 0, 0], C.stone200);
  add("bok-b", prism(rect(bt, 0, depthB, H), "z", Zi(legB), th), [0, 0, -explode], C.stone200);
  const lPoly = (o, y0) => lOutline(o).map(([x, y]) => [x + bt, Zi(y0 + y + bt)]);
  const wd = byId("wieniec-dolny");
  if (wd) add("wieniec-dolny", prism(lPoly(wd.outline, 0), "y", 0, th), [0, 0, 0], C.slate200);
  const wg = byId("wieniec-gorny");
  if (wg) add("wieniec-gorny", prism(lPoly(wg.outline, 0), "y", H - th, th), [0, explode * 0.6, 0], C.slate200);
  add("listwa", prism(rect(bt, th, bt + 100, H - th), "z", Zi(bt + th), th), [0, 0, 0], C.stone200);
  const shelf = byId("polka-l");
  if (shelf) {
    (mod.elements || []).filter((e) => e.typ === "poziom-narozny").forEach((e) => {
      solids.push({ no: no("polka-l"), name: shelf.name, solid: prism(lPoly(shelf.outline, 0), "y", parseFloat(e.y) || 0, th), shift: [0, 0, 0], tone: C.amber100 });
    });
  }
  add("plecy-a", prism(rect(bt, 0, legA - th, H), "z", Zi(bt), bt), [0, 0, explode], C.amber100);
  add("plecy-b", prism(rect(Zi(legB - th), 0, Zi(bt), H), "x", 0, bt), [-explode, 0, 0], C.amber100);
  return { solids, legA, legB, H, depthA, depthB, th, Zi };
}

export function cornerAssemblySVG(mod, panels) {
  const legA = parseFloat(mod.dimensions.width) || 860;
  const explode = Math.max(140, legA * 0.22);
  const E0 = cornerSolids(mod, panels, explode);
  const exploded = E0.solids;
  const assembled = cornerSolids(mod, panels, 0).solids;
  const bounds = (solids) => {
    const pts = solids.flatMap((s) => s.solid.faces.flatMap((f) => f.pts.map((p) => proj(move(p, s.shift)))));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const bE = bounds(exploded), bA = bounds(assembled);
  const Wpx = 760, pad = 24, gap = 30, split = 0.64;
  const sE = Math.min((Wpx * split - 2 * pad) / (bE.x1 - bE.x0), 520 / (bE.y1 - bE.y0));
  const sA = Math.min((Wpx * (1 - split) - pad - gap) / (bA.x1 - bA.x0), sE * 0.6);
  const hE = (bE.y1 - bE.y0) * sE, hA = (bA.y1 - bA.y0) * sA;
  const Hpx = Math.max(hE, hA) + 2 * pad + 70;
  const oxE = pad - bE.x0 * sE, oyE = pad + 36 - bE.y0 * sE;
  const oxA = Wpx * split + gap - bA.x0 * sA, oyA = pad + 36 - bA.y0 * sA + (hE - hA) / 2;
  const E = solidsSvg(exploded, sE, oxE, oyE);
  let body = text(pad, 18, "MONTAŻ KORPUSU NAROŻNEGO — WIDOK ROZSTRZELONY", { size: 14, color: C.blue900, weight: "bold", anchor: "start" });
  body += text(oxA + ((bA.x0 + bA.x1) / 2) * sA, 18, "PO ZŁOŻENIU", { size: 12, color: C.blue900, weight: "bold" });
  body += E.svg;
  // Linie łączników: od otworu w boku (strona wewnętrzna) do wieńca.
  const { th, depthA, depthB, legB, Zi } = E0;
  const lines = [
    ["bok-a", [explode, 0, 0], (h) => [legA - th, h.y, Zi(depthA - h.x)]],
    ["bok-b", [0, 0, -explode], (h) => [depthB - h.x, h.y, Zi(legB - th)]],
  ];
  lines.forEach(([id, shift, at]) => {
    const p = panels.find((q) => q.id === id);
    (p ? p.holes : []).filter((h) => !h.edge && (h.kind === "wkret" || h.kind === "kolek")).forEach((h) => {
      const k = KIND[h.kind];
      const a = E.P(at(h), shift), c = E.P(at(h), [0, 0, 0]);
      body += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(c[0])}" y2="${r1(c[1])}" stroke="${k.color}" stroke-width="1" stroke-dasharray="4,3"/>`;
      body += `<circle cx="${r1(a[0])}" cy="${r1(a[1])}" r="${r1(Math.max(1.6, (h.d / 2) * sE))}" fill="${h.depth == null ? C.white : k.color}" stroke="${k.color}" stroke-width="1"/>`;
    });
  });
  // Numery formatek (jak w tabeli formatek) - półki L o tym samym numerze tylko raz.
  const seen = new Set();
  exploded.forEach((s, i) => {
    if (seen.has(s.no)) return;
    seen.add(s.no);
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

// Kolejność montażu szafki narożnej (engine/cornerDrillings.js: getCornerConstruction).
export function cornerStepsHtml(cons) {
  const steps = [
    "Wytnij naroża wieńców" + (cons.cornerShelves ? " i półek (półki: też wycięcie na listwę)" : "") + " wg rysunków formatek L.",
    "Nawierć formatki wg rysunków (pozycje od przodu i od spodu formatki, w listwie - od naroża).",
    "Wklej kołki w czoła wieńców na końcach ramion i w otwory listwy narożnej w wieńcu dolnym.",
    "Połóż wieniec dolny, wstaw listwę narożną na kołki w tylnym rogu (płasko przy ścianie ramienia A).",
    "Postaw boki ramion A i B na kołki wieńca dolnego i przykręć wkrętami przez boki.",
    cons.backType === "nut" ? "Wsuń plecy w nuty boków (krawędź przy narożu opiera się na listwie)." : null,
    "Nałóż wieniec górny (kołki w boki i w listwę) i przykręć wkrętami przez boki.",
    "Sprawdź kąt prosty obu ramion (przekątne) i pion listwy.",
    cons.backType !== "nut" ? "Przybij lub przykręć plecy ramion A i B do boków, wieńców i listwy narożnej - stykają się na listwie." : "Przykręć krawędzie pleców do listwy narożnej.",
    cons.legs ? `Przykręć ${cons.legCount} nóżek (${cons.legsHeight} mm): w tylnym rogu i po dwie na końcach ramion${cons.plinth ? ", potem zatrzaski cokołu" : ""}.` : null,
    cons.armParts ? "Wstaw półki / przegrody w ramionach (otwory pod nie ustal na miejscu)." : null,
    cons.cornerShelves ? "Wciśnij podpórki w boki i listwę, połóż półki narożne L." : null,
    cons.hingesOnSides ? "Przykręć prowadniki zawiasów w otworach na bokach ramion." : null,
    cons.doors ? (cons.bifold
      ? "Zawiasy w puszkach frontów; skrzydło przy boku zawieś na boku, drugie połącz z nim zawiasami frontu łamanego."
      : "Zawiasy w puszkach frontów, zawieś drzwi.") : null,
    cons.drawers ? "Szuflady w ramionach: prowadnice i skrzynki wg instrukcji „Skrzynki szuflad”." : null,
    cons.doors || cons.drawers ? "Wyreguluj fronty - w narożu fronty ramion nie mogą o siebie zahaczać." : null,
  ].filter(Boolean);
  return `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
}
