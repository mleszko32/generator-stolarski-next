// src/render/slopeDrawing2d.js
//
// Rysunki cięcia szafki pod skos (dane: core/slopeCabinet.js):
// - płyty korpusu (skos, boki, dno, przegrody, półki) - prostokąty z końcami
//   ciętymi przez grubość: widok na grubość z kątem pochylenia piły + widok płyty,
// - fronty, blendy i plecy - obrys z długościami boków i kątami.
// Samodzielne SVG (osobne okno, druk) - kolory i font z drawingPalette.js.
import { C, FONT } from './drawingPalette.js';
import { escapeHtml } from '../utils/dom.js';

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
  svg += text(X(b.b[0]) + 6, yB + 13, b.bLabel, { anchor: 'start', size: 10, color: C.slate500 });
  svg += text(X(b.a[0]) + 6, yA - 5, b.aLabel, { anchor: 'start', size: 10, color: C.slate500 });
  svg += dimH(X(b.b[0]), X(b.b[1]), yB - 10, `${b.bLabel}: ${fmt(b.b[1] - b.b[0])}`);
  svg += dimH(X(b.a[0]), X(b.a[1]), yA + 22, `${b.aLabel}: ${fmt(b.a[1] - b.a[0])}`);

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
