// src/render/slopeInstructions2d.js
//
// Rysunki instrukcji montażu szafki pod skos (dane: engine/slopeDrillings.js): montaż w izometrii
// (rozstrzelony + złożony) i kolejność montażu. Formatki z otworami rysuje cabinetDrawing2d.js
// (verticalPanelSVG / horizontalPanelSVG) - to zwykłe prostokąty, cięcia pod kątem są w opisie
// formatki i na „Rysunkach cięcia i nawiertów”. Bryły z wielokątów widoku od frontu
// (core/slopeCabinet.js: getSlopeCabinetPolygons) wyciągniętych na głębokość płyt.
import { C, FONT } from "./drawingPalette.js";
import { escapeHtml } from "../utils/dom.js";
import { getSlopeCabinetPolygons, getSlopeDividers, getSlopeShelfPieces } from "../core/slopeCabinet.js";
import { r1, text, line, proj, move, prism, solidsSvg } from "./workshopDrawing.js";

// Kolejność wielokątów z getSlopeCabinetPolygons: skos, bok wysoki, [bok niski, dno] albo dno,
// przegrody (getSlopeDividers), półki (getSlopeShelfPieces) - przypisanie do id formatek.
function slopeSolids(mod, panels, project, explode) {
  const th = parseFloat(project.materials && project.materials.boardThickness) || 18;
  const { polys, back, geometry: g } = getSlopeCabinetPolygons(mod, project);
  const byId = (id) => panels.find((p) => p.id === id);
  const no = (id) => panels.findIndex((p) => p.id === id) + 1;
  const ids = ["skos", "bok-wysoki", ...(g.isTriangle ? [] : ["bok-niski"]), "dno"];
  const dividerEls = (mod.elements || []).filter((el) => el.typ === "pion" && getSlopeDividers(mod, th).some((d) => d.el === el)).sort((a, b) => a.x - b.x);
  getSlopeDividers(mod, th).forEach((d) => ids.push(`przegroda-${dividerEls.indexOf(d.el) + 1}`));
  getSlopeShelfPieces(mod, th).forEach((p, i) => ids.push(`polka-${i + 1}`));
  // Wysoki bok w stronę +x przy niskiej stronie po lewej; boki rozsuwane na zewnątrz, skos do góry.
  const highRight = g.lowSide === "left";
  const shiftFor = (id) => {
    if (id === "skos") return [highRight ? -explode * 0.4 : explode * 0.4, explode * 0.6, 0];
    if (id === "bok-wysoki") return [highRight ? explode : -explode, 0, 0];
    if (id === "bok-niski") return [highRight ? -explode : explode, 0, 0];
    return [0, 0, 0];
  };
  const depth = (byId("dno") || { width: 0 }).width;          // głębokość płyt korpusu (bez pleców)
  const solids = [];
  polys.forEach((poly, i) => {
    const id = ids[i];
    const p = id && byId(id);
    if (!p) return;
    const tone = id.startsWith("polka") ? (p.structural ? C.slate200 : C.amber100) : id === "dno" || id === "skos" ? C.slate200 : C.stone200;
    solids.push({ no: no(id), name: p.name, solid: prism(poly.points, "z", 0, p.kind === "polka" ? p.width : depth), shift: shiftFor(id), tone });
  });
  const bp = byId("plecy");
  if (bp) solids.push({ no: no("plecy"), name: bp.name, solid: prism(back, "z", depth, bp.thickness), shift: [0, 0, explode], tone: C.amber100 });
  return solids;
}

export function slopeAssemblySVG(mod, panels, project) {
  const W = parseFloat(mod.dimensions.width) || 0;
  const explode = Math.max(140, W * 0.12);
  const exploded = slopeSolids(mod, panels, project, explode);
  const assembled = slopeSolids(mod, panels, project, 0);
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
  let body = text(pad, 18, "MONTAŻ KORPUSU POD SKOS — WIDOK ROZSTRZELONY", { size: 14, color: C.blue900, weight: "bold", anchor: "start" });
  body += text(oxA + ((bA.x0 + bA.x1) / 2) * sA, 18, "PO ZŁOŻENIU", { size: 12, color: C.blue900, weight: "bold" });
  body += E.svg;
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

// Kolejność montażu szafki pod skos (engine/slopeDrillings.js: getSlopeConstruction).
export function slopeStepsHtml(cons, panels) {
  const has = (prefix) => panels.some((p) => p.id.startsWith(prefix));
  const steps = [
    "Wytnij płyty z końcami ciętymi pod kątem (skos, góra boków i przegród, półki i dno przy skosie) wg „Rysunków cięcia i nawiertów” - pochylenie piły jest w opisie formatki.",
    "Nawierć formatki wg rysunków (pozycje od przodu i od spodu formatki).",
    "Wklej kołki w czoła dolne boków" + (has("przegroda") ? " i przegród" : "") + (cons.fixedShelves ? " oraz w czoła półek stałych" : "") + ".",
    "Połóż dno, postaw na nim bok wysoki" + (has("bok-niski") ? ", bok niski" : "") + (has("przegroda") ? " i przegrody" : "") + " na kołki i przykręć wkrętami od spodu dna.",
    cons.fixedShelves ? "Wstaw półki stałe na kołki i przykręć przez boki / przegrody." : null,
    "Połóż skośną płytę na górne końce boków" + (has("przegroda") ? " i przegród" : "") + (cons.isTriangle ? " (dolny koniec oparty na dnie)" : "") + " i przykręć wkrętami od wierzchu.",
    "Sprawdź przekątne korpusu (kąt prosty przy dnie i wysokim boku).",
    "Przybij lub przykręć plecy o obrysie pod skos od tyłu (wyrównują korpus).",
    cons.legs ? `Przykręć nóżki (${cons.legsHeight} mm)${cons.plinth ? " i zatrzaski cokołu" : ""}.` : null,
    cons.drawers ? "Przykręć prowadnice szuflad w otworach (patrz boki / przegrody); skrzynki szuflad wg instrukcji „Skrzynki szuflad”." : null,
    cons.doors ? "Przykręć prowadniki zawiasów w otworach, zawiasy w puszkach frontów, zawieś drzwi." : null,
    cons.blendy ? "Przykręć blendy (fronty docięte do skosu) od wewnątrz." : null,
    cons.movableShelves ? "Wciśnij podpórki i połóż półki ruchome." : null,
    cons.drawers || cons.doors ? "Wyreguluj fronty (szczeliny równe, także wzdłuż skosu)." : null,
  ].filter(Boolean);
  return `<ol class="steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
}
