// src/render/slopeDrawing2d.js
//
// Rysunki cięcia szafki pod skos (dane: core/slopeCabinet.js):
// - płyty korpusu (skos, boki, dno, przegrody, półki) - prostokąty z końcami
//   ciętymi przez grubość: widok na grubość z kątem pochylenia piły + widok płyty,
// - fronty, blendy i plecy - obrys z długościami boków i kątami.
// Samodzielne SVG (osobne okno, druk) - kolory i font z drawingPalette.js.
import { C, FONT } from './drawingPalette.js';
import { escapeHtml } from '../utils/dom.js';
import { getDimText } from './viewer2d.js';

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(r1(v)).replace('.', ',');
const MAX_SAW_TILT = 45;   // typowa piła formatowa nie pochyla się bardziej

const text = (x, y, t, { size = 12, color = C.slate700, anchor = 'middle', weight = 'normal' } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${escapeHtml(t)}</text>`;
const line = (x1, y1, x2, y2, color = C.slate500, extra = '') =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="1" ${extra}/>`;

// Wymiar poziomy: linia z kreskami na końcach i opis nad nią.
function dimH(x1, x2, y, label, color = C.slate600) {
  return line(x1, y, x2, y, color) + line(x1, y - 4, x1, y + 4, color) + line(x2, y - 4, x2, y + 4, color)
    + text((x1 + x2) / 2, y - 5, label, { size: 11, color });
}

// Płyta z cięciem przez grubość. b - wynik getSlopeBoards.
export function slopeBoardSVG(b, qty = 1) {
  const W = 760, pad = 40;
  const s = (W - 2 * pad) / b.length;
  const X = (v) => pad + (v - Math.min(b.a[0], b.b[0])) * s;
  const tEdge = 34;                   // grubość w widoku na grubość (nie w skali)
  const yB = 70, yA = yB + tEdge;     // B - górna linia, A - dolna
  const planH = Math.max(40, Math.min(150, b.width * s));
  const yPlan = yA + 70;
  const H = yPlan + planH + 50;
  const warn = (t) => t > MAX_SAW_TILT;
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:${W}px">`;
  svg += `<rect width="${W}" height="${H}" fill="${C.white}"/>`;
  svg += text(pad, 22, `${b.name} — ${qty} szt.`, { anchor: 'start', size: 14, weight: 'bold', color: C.slate900 });
  svg += text(pad, 40, `Wymiar formatki ${fmt(b.length)} × ${fmt(b.width)} mm, grubość ${fmt(b.th)} mm`, { anchor: 'start', size: 12, color: C.slate600 });

  // Widok na grubość: dwie powierzchnie płyty i ścięte końce.
  const poly = [[X(b.a[0]), yA], [X(b.a[1]), yA], [X(b.b[1]), yB], [X(b.b[0]), yB]];
  svg += `<polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="${C.amber100}" stroke="${C.slate800}" stroke-width="1.5"/>`;
  // Strona od wnętrza szafki - pogrubiona niebieska krawędź (przy przegrodach
  // i półkach obie strony są w środku, więc obie zaznaczone).
  const inA = b.inside === 'a' || b.inside === 'both', inB = b.inside === 'b' || b.inside === 'both';
  const insideEdge = (x1, x2, y) => `<line x1="${r1(x1)}" y1="${y}" x2="${r1(x2)}" y2="${y}" stroke="${C.blue600}" stroke-width="4"/>`;
  if (inA) svg += insideEdge(X(b.a[0]), X(b.a[1]), yA);
  if (inB) svg += insideEdge(X(b.b[0]), X(b.b[1]), yB);
  const sideTxt = (label, side, inside) => `${label}${side ? ` — ${side}` : ''}${inside && b.inside !== 'both' ? ' (WNĘTRZE)' : ''}`;
  svg += text(X(b.b[0]) + 6, yB + 13, sideTxt(b.bLabel, b.bSide, inB), { anchor: 'start', size: 10, color: inB ? C.blue700 : C.slate500, weight: inB ? 'bold' : 'normal' });
  svg += text(X(b.a[0]) + 6, yA - 5, sideTxt(b.aLabel, b.aSide, inA), { anchor: 'start', size: 10, color: inA ? C.blue700 : C.slate500, weight: inA ? 'bold' : 'normal' });
  svg += dimH(X(b.b[0]), X(b.b[1]), yB - 10, `${b.bLabel}: ${fmt(b.b[1] - b.b[0])}`);
  svg += dimH(X(b.a[0]), X(b.a[1]), yA + 22, `${b.aLabel}: ${fmt(b.a[1] - b.a[0])}`);
  if (b.inside) {
    const legend = b.inside === 'both'
      ? 'obie strony są wewnątrz szafki (niebieskie krawędzie)'
      : 'niebieska krawędź = strona od wnętrza szafki';
    svg += text(W - pad, 22, legend, { anchor: 'end', size: 11, color: C.blue700 });
  }

  // Opisy końców: pochylenie piły (od cięcia prostopadłego).
  const endNote = (tilt, label, x, anchor) => {
    if (!tilt) return text(x, yA + 46, `${label}: cięcie proste`, { anchor, size: 11, color: C.slate500 });
    const col = warn(tilt) ? C.red700 : C.blue700;
    const extra = warn(tilt) ? ` — więcej niż ${MAX_SAW_TILT}°!` : '';
    return text(x, yA + 46, `${label}: piła ${fmt(tilt)}°${extra}`, { anchor, size: 11, color: col, weight: 'bold' });
  };
  svg += endNote(b.tiltStart, b.startLabel, pad, 'start');
  svg += endNote(b.tiltEnd, b.endLabel, W - pad, 'end');

  // Widok płyty z góry (w skali): dłuższa krawędź i szerokość; przerywana linia
  // pokazuje, gdzie kończy się krótsza krawędź na ściętym końcu.
  const x0 = pad, x1 = pad + b.length * s;
  svg += `<rect x="${x0}" y="${yPlan}" width="${r1(x1 - x0)}" height="${r1(planH)}" fill="${C.slate50}" stroke="${C.slate800}" stroke-width="1.5"/>`;
  const offStart = Math.abs(b.a[0] - b.b[0]) * s, offEnd = Math.abs(b.a[1] - b.b[1]) * s;
  if (offStart > 0.5) svg += line(x0 + offStart, yPlan, x0 + offStart, yPlan + planH, C.slate500, 'stroke-dasharray="5,4"');
  if (offEnd > 0.5) svg += line(x1 - offEnd, yPlan, x1 - offEnd, yPlan + planH, C.slate500, 'stroke-dasharray="5,4"');
  svg += dimH(x0, x1, yPlan + planH + 20, `${fmt(b.length)} (dłuższa krawędź), krótsza ${fmt(b.short)}`);
  svg += text(x1 + 6, yPlan + planH / 2 + 4, fmt(b.width), { anchor: 'start', size: 11, color: C.slate600 });
  svg += `</svg>`;
  return svg;
}

// Obrys płyty (front, blenda, plecy). shape - wynik getSlopeShapes.
export function slopeShapeSVG(shape) {
  const W = 760, pad = 60;
  const pts = shape.points;
  const bw = Math.max(...pts.map((p) => p[0])), bh = Math.max(...pts.map((p) => p[1]));
  const s = Math.min((W - 2 * pad) / bw, 320 / bh);
  const H = bh * s + 2 * pad + 40;
  const P = ([x, y]) => [pad + x * s, 50 + pad + (bh - y) * s];   // y w górę
  const scr = pts.map(P);
  let svg = `<svg viewBox="0 0 ${W} ${r1(H)}" xmlns="http://www.w3.org/2000/svg" style="max-width:${W}px">`;
  svg += `<rect width="${W}" height="${r1(H)}" fill="${C.white}"/>`;
  svg += text(20, 22, `${shape.name} — ${shape.qty} szt.`, { anchor: 'start', size: 14, weight: 'bold', color: C.slate900 });
  svg += text(20, 40, `Prostokąt opisany ${fmt(bw)} × ${fmt(bh)} mm (szer. × wys.), widok od frontu`, { anchor: 'start', size: 12, color: C.slate600 });
  const fill = shape.category === 'Plecy' ? C.slate100 : C.blue50;
  svg += `<polygon points="${scr.map((p) => p.map(r1).join(',')).join(' ')}" fill="${fill}" stroke="${C.slate800}" stroke-width="1.5"/>`;

  // Środek obrysu - do odsuwania opisów na zewnątrz.
  const cx = scr.reduce((a, p) => a + p[0], 0) / scr.length;
  const cy = scr.reduce((a, p) => a + p[1], 0) / scr.length;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const a = scr[i], b = scr[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = mx - cx, dy = my - cy, dl = Math.hypot(dx, dy) || 1;
    svg += text(mx + (dx / dl) * 16, my + (dy / dl) * 16 + 4, fmt(len), { size: 12, color: C.slate800, weight: 'bold' });

    // Kąt wewnętrzny w wierzchołku p (pomijamy kąty proste).
    const prev = pts[(i - 1 + n) % n];
    const v1 = [prev[0] - p[0], prev[1] - p[1]], v2 = [q[0] - p[0], q[1] - p[1]];
    const ang = Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))) * 180 / Math.PI;
    if (Math.abs(ang - 90) > 0.5) {
      const ex = a[0] - cx, ey = a[1] - cy, el = Math.hypot(ex, ey) || 1;
      svg += text(a[0] - (ex / el) * 26, a[1] - (ey / el) * 26 + 4, `${fmt(ang)}°`, { size: 11, color: C.blue700 });
    }
  }
  svg += `</svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Nawierty szafki pod skos (dane: core/slopeCabinet.js: getSlopeDrillings) -
// rysowane tak samo jak bok zwykłej szafki (render/viewer2d.js: drawSideDetails):
// skala 1 jednostka = 1 mm, otwory w prawdziwej średnicy, wysokości opisane
// w kolumnach obok płyty (getDimText: bliższa krawędź + druga w nawiasie, [Rc]),
// rozstaw półek oś-oś; rzuty dna i skosu jak rzut wieńca z łącznikami.
// ---------------------------------------------------------------------------

const HOLE = {
  drawer: { color: C.sky600, r: 2.5, label: 'prowadnica szuflady' },
  shelf: { color: C.orange600, r: 2.5, label: 'podpórka półki' },
  screw: { color: C.purple600, r: 1.5, label: 'konfirmat' },
  dowel: { color: C.purple600, r: 4, label: 'kołek' },
  hinge: { color: C.green600, r: 2.5, label: 'zawias' },
};

const svgWrap = (minX, minY, w, h, body) =>
  `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" style="width:100%;height:auto;max-width:760px">`
  + `<rect x="${r1(minX)}" y="${r1(minY)}" width="${r1(w)}" height="${r1(h)}" fill="${C.white}"/>${body}</svg>`;

function legendSvg(types, x, y) {
  let out = '';
  [...new Set(types)].forEach((t) => {
    const st = HOLE[t];
    out += `<circle cx="${x + 4}" cy="${y - 4}" r="${Math.max(st.r, 2.5)}" fill="${st.color}"/>`;
    out += `<text x="${x + 12}" y="${y}" font-size="11" fill="${C.slate600}">${st.label}</text>`;
    x += 22 + st.label.length * 6.5;
  });
  return out;
}

// Ściana płyty pionowej, front po lewej (jak "BOK LEWY" zwykłej szafki).
export function slopeFaceSVG(face) {
  const D = face.width, H = face.height;
  const sy = (y) => H - y;                     // y od dołu płyty -> współrzędna SVG
  let body = '';
  body += `<text x="${D / 2}" y="-44" font-size="16" fill="${C.blue900}" font-weight="bold" text-anchor="middle">${escapeHtml(`${face.name} — strona ${face.side}`.toUpperCase())} <tspan font-size="11" fill="${C.slate500}" font-weight="normal">${fmt(D)} × ${fmt(H)} mm</tspan></text>`;
  if (face.note) body += `<text x="${D / 2}" y="-28" font-size="11" fill="${C.blue700}" text-anchor="middle">${escapeHtml(face.note)}</text>`;
  body += `<rect x="0" y="0" width="${D}" height="${r1(H)}" fill="${C.white}" stroke="${C.slate600}" stroke-width="1.5"/>`;
  [[15, 'PRZÓD'], [D - 15, 'TYŁ']].forEach(([x, t]) => {
    body += `<text x="${x}" y="${r1(H / 2)}" font-size="11" fill="${C.slate400}" font-weight="bold" transform="rotate(-90, ${x}, ${r1(H / 2)})" text-anchor="middle" letter-spacing="1">${t}</text>`;
  });

  // Otwory
  face.holes.forEach((h) => {
    const st = HOLE[h.type];
    if (h.type === 'hinge') {
      [-16, 16].forEach((dy) => { body += `<circle cx="${r1(h.x)}" cy="${r1(sy(h.y + dy))}" r="${st.r}" fill="${st.color}"/>`; });
      body += `<text x="${r1(h.x + 8)}" y="${r1(sy(h.y) + 4)}" text-anchor="start">${getDimText(h.y, H, st.color)}</text>`;
      return;
    }
    body += `<circle cx="${r1(h.x)}" cy="${r1(sy(h.y))}" r="${st.r}" fill="${st.color}"/>`;
  });

  // Kolumny opisów: prowadnice i łączniki z prawej, podpórki półek z lewej -
  // jak przy boku skrajnym zwykłej szafki.
  const uniq = (arr) => [...new Set(arr.map((v) => r1(v)))].sort((a, b) => a - b);
  const drawerYs = uniq(face.holes.filter((h) => h.type === 'drawer').map((h) => h.y));
  const corpusYs = uniq(face.holes.filter((h) => h.type === 'screw').map((h) => h.y));
  const shelfAll = face.holes.filter((h) => h.type === 'shelf');
  const shelfCenters = uniq(shelfAll.filter((h) => h.center).map((h) => h.y));
  const right = { edgeX: D, x: D + 40, anchor: 'start', off: 8 };
  const left = { edgeX: 0, x: -40, anchor: 'end', off: -8 };
  const writeCol = (c, ys, color, rc, opacityFor = () => 1) => {
    ys.forEach((y) => {
      body += `<line x1="${c.edgeX}" y1="${r1(sy(y))}" x2="${c.x}" y2="${r1(sy(y))}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,2"/>`;
      body += `<text x="${c.x + c.off}" y="${r1(sy(y) + 4)}" font-size="12" text-anchor="${c.anchor}" opacity="${opacityFor(y)}">${getDimText(y, H, color, rc)}</text>`;
    });
  };
  let rightCols = 0;
  if (drawerYs.length) { writeCol(right, drawerYs, C.sky600, false); right.x += 120; rightCols++; }
  if (corpusYs.length) { writeCol(right, corpusYs, C.purple600, true); right.x += 120; rightCols++; }
  if (shelfCenters.length) {
    const all = uniq(shelfAll.map((h) => h.y));
    writeCol(left, all, C.orange600, true, (y) => (shelfCenters.includes(y) ? 1 : 0.6));
    // Rozstaw półek oś-oś przy krawędzi płyty.
    for (let i = 0; i < shelfCenters.length - 1; i++) {
      const yA = sy(shelfCenters[i]), yB = sy(shelfCenters[i + 1]), px = -26;
      body += `<line x1="${px}" y1="${r1(yA)}" x2="${px}" y2="${r1(yB)}" stroke="${C.orange700}" stroke-width="1"/>`;
      [yA, yB].forEach((yy) => { body += `<line x1="${px - 4}" y1="${r1(yy)}" x2="${px + 4}" y2="${r1(yy)}" stroke="${C.orange700}" stroke-width="1.4"/>`; });
      const ty = (yA + yB) / 2;
      body += `<text x="${px - 6}" y="${r1(ty)}" font-size="12" fill="${C.orange700}" text-anchor="middle" transform="rotate(-90 ${px - 6} ${r1(ty)})">${fmt(shelfCenters[i + 1] - shelfCenters[i])}<tspan font-size="9" fill="${C.orange800}"> oś-oś</tspan></text>`;
    }
  }
  // Odległości od frontu nad płytą.
  uniq(face.holes.map((h) => h.x)).forEach((x, i) => {
    body += `<text x="${x}" y="${-6 - (i % 2) * 11}" font-size="9" fill="${C.slate500}" text-anchor="middle">${fmt(x)}</text>`;
  });
  body += legendSvg(face.holes.map((h) => h.type), 0, H + 26);

  const minX = shelfCenters.length ? -250 : -20;
  const maxX = D + 40 + Math.max(rightCols, 1) * 120 + 80;
  return svgWrap(minX, -70, maxX - minX, H + 108, body);
}

// Rzut płyty poziomej / skośnej z łącznikami - jak rzut wieńca zwykłej szafki
// (render/viewer2d.js: drawPionMountViews): przód u góry, wymiary pozycji pod spodem.
export function slopePlanSVG(plan) {
  const L = plan.length, D = plan.width;
  const color = C.purple600;
  // Długie płyty (dno, skos ~2 m) - napisy i znaczniki powiększone proporcjonalnie,
  // żeby po zmieszczeniu rysunku na kartce były czytelne jak rzut wieńca ~600 mm.
  const k = Math.max(1, L / 700);
  const f = (n) => r1(n * k);
  let body = '';
  body += `<text x="${r1(L / 2)}" y="${f(-40)}" font-size="${f(16)}" fill="${C.blue900}" font-weight="bold" text-anchor="middle">${escapeHtml(plan.name.toUpperCase())} (WIDOK Z GÓRY) — ${fmt(L)} × ${fmt(D)} mm</text>`;
  body += `<rect x="0" y="0" width="${r1(L)}" height="${D}" fill="${C.white}" stroke="${C.slate600}" stroke-width="${f(1.5)}"/>`;
  body += `<text x="${r1(L / 2)}" y="${f(-10)}" font-size="${f(11)}" fill="${C.slate400}" font-weight="bold" text-anchor="middle" letter-spacing="1">PRZÓD</text>`;
  body += `<text x="${r1(L / 2)}" y="${r1(D + 20 * k)}" font-size="${f(11)}" fill="${C.slate400}" font-weight="bold" text-anchor="middle" letter-spacing="1">TYŁ</text>`;
  const xs = new Set();
  plan.holes.forEach((h) => {
    body += `<circle cx="${r1(h.x)}" cy="${r1(h.z)}" r="${f(HOLE[h.type].r)}" fill="${color}"/>`;
    if (h.type === 'screw') xs.add(r1(h.x));
  });
  const sorted = [...xs].sort((a, b) => a - b);
  sorted.forEach((x, i) => {
    const base = r1(D + (32 + i * 16) * k);
    body += `<line x1="${x}" y1="${D}" x2="${x}" y2="${base}" stroke="${color}" stroke-width="${f(0.75)}" stroke-dasharray="${f(2)},${f(2)}"/>`;
    body += `<line x1="0" y1="${base}" x2="${x}" y2="${base}" stroke="${color}" stroke-width="${f(0.5)}"/>`;
    body += `<circle cx="0" cy="${base}" r="${f(2)}" fill="${color}"/>`;
    // Przy prawym końcu płyty napis po lewej stronie linii, żeby nie wychodził poza rysunek.
    const nearEnd = x > L * 0.6;
    body += `<text x="${r1(nearEnd ? x - 4 * k : x + 4 * k)}" y="${r1(base + 12 * k)}" font-size="${f(10)}" fill="${color}" font-weight="bold" text-anchor="${nearEnd ? 'end' : 'start'}">${fmt(x)} mm ${escapeHtml(plan.fromLabel)}</text>`;
  });
  if (!plan.holes.length) body += `<text x="${r1(L / 2)}" y="${D / 2}" font-size="${f(14)}" fill="${C.slate500}" text-anchor="middle">brak łączników</text>`;
  // Legenda (powiększona jak reszta opisów).
  let lx = 0;
  const ly = r1(D + (50 + sorted.length * 16) * k);
  [...new Set(plan.holes.map((h) => h.type))].forEach((t) => {
    const st = HOLE[t];
    body += `<circle cx="${r1(lx + 4 * k)}" cy="${r1(ly - 4 * k)}" r="${f(Math.max(st.r, 2.5))}" fill="${st.color}"/>`;
    body += `<text x="${r1(lx + 12 * k)}" y="${ly}" font-size="${f(11)}" fill="${C.slate600}">${st.label}</text>`;
    lx += (22 + st.label.length * 6.5) * k;
  });
  return svgWrap(-20 * k, -62 * k, L + 220 * k, D + (130 + sorted.length * 16) * k, body);
}
