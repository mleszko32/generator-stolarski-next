// src/render/slopeNicheDrawing.js
//
// Widok z przodu zabudowy wnęki pod skosem (core/slopeNiche.js): obrys wnęki ze skosem,
// szafki z cokołem, frontami, półkami i drążkiem oraz wymiary (szerokości szafek, wysokości
// od podłogi, luz pod skosem, ściana kolanowa, sufit, długość skosu). Samodzielne SVG
// (okno + druk) - kolory z drawingPalette.js. Fronty muszą mieć policzony layout
// (recalculateLayout) przed wywołaniem.
import { C, FONT_UI } from "./drawingPalette.js";
import { ceilingAt, nicheModuleSlots } from "../core/slopeNiche.js";
import { escapeHtml } from "../utils/dom.js";
import { num } from "../utils/math.js";

const r1 = (v) => Math.round(v * 10) / 10;

export function generateSlopeNicheSVG(niche, modules, opts = {}) {
  const th = opts.boardThickness || 18;
  const seatTh = opts.seatThickness || 0;
  const W = num(niche.width), run = num(niche.slopeRun);
  const hMax = Math.max(num(niche.leftHeight), num(niche.ceilingHeight));
  const PAD_L = 260, PAD_R = 260, PAD_T = 260, PAD_B = 330;
  const vbW = W + PAD_L + PAD_R, vbH = hMax + PAD_T + PAD_B;
  // Układ: x od lewej ściany wnęki, y od podłogi w górę.
  const X = (x) => r1(PAD_L + x);
  const Y = (y) => r1(PAD_T + hMax - y);

  const fs = 46, fsS = 38;
  let s = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; background:${C.white};" font-family="${FONT_UI}">`;
  s += `<defs><marker id="sn-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9" fill="none" stroke="${C.slate600}" stroke-width="1.5"/></marker></defs>`;

  const line = (x1, y1, x2, y2, color = C.slate600, w = 3, dash = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const text = (x, y, t, { size = fs, anchor = 'middle', rot = 0, color = C.slate800, weight = 400 } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}" font-weight="${weight}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${escapeHtml(String(t))}</text>`;
  // Wymiar poziomy (y w px ekranu) i pionowy (x w px ekranu) z liniami pomocniczymi.
  const dimH = (x1, x2, y, label, ext = []) => {
    let o = ext.map(([ex, ey]) => line(ex, ey, ex, y + 12, C.slate400, 2)).join('');
    o += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.slate600}" stroke-width="2.5" marker-start="url(#sn-arr)" marker-end="url(#sn-arr)"/>`;
    return o + text((x1 + x2) / 2, y - 12, label, { size: fsS });
  };
  const dimV = (x, y1, y2, label, side = -1) => {
    let o = `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${C.slate600}" stroke-width="2.5" marker-start="url(#sn-arr)" marker-end="url(#sn-arr)"/>`;
    // Napis obrócony o -90°: jego linia bazowa leży pionowo, po lewej (side -1) albo prawej stronie linii.
    const tx = side < 0 ? x - 12 : x + 12 + fsS * 0.8;
    return o + text(r1(tx), r1((y1 + y2) / 2), label, { size: fsS, rot: -90 });
  };

  // Wnęka: podłoga, ściany, skos, sufit.
  const outline = [[0, 0], [W, 0], [W, num(niche.ceilingHeight)], [Math.min(run, W), ceilingAt(niche, Math.min(run, W))], [0, num(niche.leftHeight)]];
  s += `<polygon points="${outline.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}" fill="${C.slate50}" stroke="${C.slate800}" stroke-width="5"/>`;

  // Szafki.
  const slots = nicheModuleSlots(niche);
  modules.forEach((mod, i) => {
    const slot = slots[i];
    if (!slot) return;
    const x0 = slot.x, w = num(mod.dimensions.width), H = num(mod.dimensions.height);
    const legH = mod.legs && mod.legs.active ? num(mod.legs.height, 100) : 0;
    const plinthOff = mod.legs && mod.legs.plinth ? num(mod.legs.plinthOffset, 40) : 0;
    if (legH > 0) s += `<rect x="${X(x0)}" y="${Y(legH)}" width="${w}" height="${legH}" fill="${C.slate200}" stroke="${C.slate500}" stroke-width="2"/>`;
    if (legH > 0 && plinthOff) s += text(X(x0 + w / 2), Y(legH / 2) + fsS / 3, 'cokół', { size: fsS * 0.8, color: C.slate500 });
    // Korpus.
    s += `<rect x="${X(x0)}" y="${Y(legH + H)}" width="${w}" height="${H}" fill="${C.white}" stroke="${C.slate700}" stroke-width="3"/>`;
    // Półki (ruchome za drzwiami - przerywane).
    (mod.elements || []).filter((el) => el.typ === 'poziom').forEach((el) => {
      const y = legH + num(el.y);
      s += `<rect x="${X(x0 + num(el.x))}" y="${Y(y + th)}" width="${r1(num(el.w))}" height="${th}" fill="${C.slate300}" stroke="${C.slate500}" stroke-width="1.5"${el.isStructural ? '' : ' stroke-dasharray="8 6"'}/>`;
    });
    // Fronty.
    (mod.elements || []).filter((el) => el.typ === 'front').forEach((el) => {
      const fx = x0 + num(el.x), fy = legH + num(el.y), fw = num(el.w), fh = num(el.h);
      const isDrawer = String(el.subtype).startsWith('szuflada');
      s += `<rect x="${X(fx)}" y="${Y(fy + fh)}" width="${r1(fw)}" height="${r1(fh)}" fill="${isDrawer ? C.amber100 : C.blue50}" fill-opacity="0.75" stroke="${isDrawer ? C.amber700 : C.blue700}" stroke-width="2.5"/>`;
      if (isDrawer) {
        s += line(X(fx + fw / 2 - 60), Y(fy + fh - 40), X(fx + fw / 2 + 60), Y(fy + fh - 40), C.amber700, 5);
      } else {
        // Strona zawiasów: linie otwierania od strony zawiasu do klamki.
        const left = el.subtype === 'drzwi-lp' ? String(el.id).includes('-L-') : (el.openingSide || 'left') === 'left';
        const hx = left ? fx : fx + fw, ox = left ? fx + fw : fx;
        s += `<polyline points="${X(ox)},${Y(fy + fh)} ${X(hx)},${Y(fy + fh / 2)} ${X(ox)},${Y(fy)}" fill="none" stroke="${C.blue500}" stroke-width="1.5" stroke-dasharray="10 8"/>`;
      }
      if (fh > 120) s += text(X(fx + fw / 2), Y(fy + fh / 2) + fsS / 3, `${r1(fw)}×${r1(fh)}`, { size: fsS * 0.8, color: isDrawer ? C.amber700 : C.blue700 });
    });
    // Drążek.
    if (mod.wardrobeRod) {
      const ry = legH + num(mod.wardrobeRod.y);
      s += line(X(x0 + th), Y(ry), X(x0 + w - th), Y(ry), C.violet600, 6, '18 10');
      s += text(X(x0 + w / 2), Y(ry) - 14, `drążek ${r1(ry)}`, { size: fsS * 0.8, color: C.violet600 });
    }
    // Siedzisko / blat.
    if (mod.type === 'base_cabinet' && seatTh > 0) {
      s += `<rect x="${X(x0)}" y="${Y(legH + H + seatTh)}" width="${w}" height="${seatTh}" fill="${C.wood}" stroke="${C.woodDark}" stroke-width="2"/>`;
    }
    const total = legH + H + (mod.type === 'base_cabinet' ? seatTh : 0);
    // Oznaczenie szafki nad nią i luz pod skosem przy lewej krawędzi.
    s += text(X(x0 + w / 2), Y(total) - 30, `${slot.key}  H ${r1(total)}`, { size: fs, weight: 700 });
    s += text(X(x0) + 10, Y(total) - 80, `luz ${r1(ceilingAt(niche, x0) - total)}`, { size: fsS * 0.75, anchor: 'start', color: C.slate500 });
    // Wysokość szafki od podłogi - wymiar pionowy przy prawym boku szafki.
    s += dimV(X(x0 + w) - 40, Y(0), Y(total), `${r1(total)}`, -1);
  });

  // Wymiary poziome pod spodem: szafki i całość.
  const yRow1 = Y(0) + 110, yRow2 = Y(0) + 230;
  slots.forEach((slot) => {
    s += dimH(X(slot.x), X(slot.x + slot.width), yRow1, `${slot.key}: ${slot.width}`, [[X(slot.x), Y(0)], [X(slot.x + slot.width), Y(0)]]);
  });
  s += dimH(X(0), X(W), yRow2, `wnęka ${W}`, [[X(0), Y(0)], [X(W), Y(0)]]);
  // Nad wnęką: długość skosu i płaskiego sufitu.
  const yTop = Y(hMax) - 130;
  if (run > 0 && run < W) {
    s += dimH(X(0), X(run), yTop, `skos ${run}`, [[X(0), Y(num(niche.leftHeight))], [X(run), Y(num(niche.ceilingHeight))]]);
    s += dimH(X(run), X(W), yTop, `sufit płaski ${W - run}`, [[X(W), Y(num(niche.ceilingHeight))]]);
  }
  // Wysokości ścian.
  s += dimV(X(0) - 90, Y(0), Y(num(niche.leftHeight)), `${num(niche.leftHeight)}`, -1);
  s += dimV(X(W) + 90, Y(0), Y(num(niche.ceilingHeight)), `${num(niche.ceilingHeight)}`, 1);
  s += text(X(W / 2), vbH - 30, `Widok z przodu — głębokość wnęki ${num(niche.depth)}, korpusy ${num(niche.carcaseDepth)}, płyta ${th} mm`, { size: fsS, color: C.slate600 });
  return s + '</svg>';
}
