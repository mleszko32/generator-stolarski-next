// src/render/wallElevations.js
//
// Rzut ściany pomieszczenia (widok z wewnątrz na ścianę) jako SVG w milimetrach:
// obrys ściany, szafki z frontami, cokół/nóżki, wymiary szerokości (szafki i
// odstępy) w rzędzie pod podłogą, wymiar całkowity, poziomy wysokości (linie
// pomocnicze z opisem po lewej) oraz wymiary pionowe przy prawej krawędzi
// (cokół, korpus, odstęp do sufitu). Dane liczy core/walls.js.
import { escapeHtml } from '../utils/dom.js';
import { computeWallLayouts } from '../core/walls.js';
import { computeWorktops } from '../core/worktops.js';

const NAVY = '#1e3a8a';
const ORANGE = '#d97706';
const GRAY = '#64748b';

const TYPE_PREFIX = { base_cabinet: 'D', upper_cabinet: 'W', tall_cabinet: 'S', corner_cabinet: 'N' };

// Kod szafki na rzucie: typ + szerokość (D600 = dolna 600, W800 = wisząca 800,
// S = słupek, N = narożna - dla narożnej szerokość ramienia na tej ścianie).
function moduleCode(item) {
  return `${TYPE_PREFIX[item.mod.type] || 'M'}${Math.round(item.u1 - item.u0)}`;
}

function moduleLabel(item) {
  const name = (item.mod.name || '').trim();
  return item.kind === 'corner' && name ? `${name} (ramię ${item.arm})` : name;
}

const WALL_EDGE = { tyl: 'top', prawa: 'right', przednia: 'bottom', lewa: 'left' };

// Miniplan pokoju z zaznaczoną ścianą i strzałką kierunku patrzenia.
function planInset(wallId, room, plan, x0, y0, size, fs) {
  const k = size / Math.max(room.width, room.depth);
  const pw = room.width * k, ph = room.depth * k;
  let s = `<rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="#f8fafc" stroke="#94a3b8" stroke-width="${fs * 0.1}" />`;
  plan.forEach(p => {
    s += `<rect x="${x0 + p.x * k}" y="${y0 + p.z * k}" width="${p.w * k}" height="${p.d * k}" fill="#cbd5e1" stroke="#64748b" stroke-width="${fs * 0.06}" />`;
  });
  const e = WALL_EDGE[wallId];
  const t = fs * 0.35;
  const cx = x0 + pw / 2, cy = y0 + ph / 2;
  if (e === 'top') s += `<line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0}" stroke="#dc2626" stroke-width="${t}" /><path d="M${cx - fs * 0.6} ${y0 + fs * 2.2} L${cx} ${y0 + fs * 0.9} L${cx + fs * 0.6} ${y0 + fs * 2.2}" fill="none" stroke="#dc2626" stroke-width="${fs * 0.15}" />`;
  if (e === 'bottom') s += `<line x1="${x0}" y1="${y0 + ph}" x2="${x0 + pw}" y2="${y0 + ph}" stroke="#dc2626" stroke-width="${t}" /><path d="M${cx - fs * 0.6} ${y0 + ph - fs * 2.2} L${cx} ${y0 + ph - fs * 0.9} L${cx + fs * 0.6} ${y0 + ph - fs * 2.2}" fill="none" stroke="#dc2626" stroke-width="${fs * 0.15}" />`;
  if (e === 'left') s += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 + ph}" stroke="#dc2626" stroke-width="${t}" /><path d="M${x0 + fs * 2.2} ${cy - fs * 0.6} L${x0 + fs * 0.9} ${cy} L${x0 + fs * 2.2} ${cy + fs * 0.6}" fill="none" stroke="#dc2626" stroke-width="${fs * 0.15}" />`;
  if (e === 'right') s += `<line x1="${x0 + pw}" y1="${y0}" x2="${x0 + pw}" y2="${y0 + ph}" stroke="#dc2626" stroke-width="${t}" /><path d="M${x0 + pw - fs * 2.2} ${cy - fs * 0.6} L${x0 + pw - fs * 0.9} ${cy} L${x0 + pw - fs * 2.2} ${cy + fs * 0.6}" fill="none" stroke="#dc2626" stroke-width="${fs * 0.15}" />`;
  return s;
}

export function generateWallSVG(wall, room, meta = {}) {
  const L = wall.length;
  const Hroom = room.height;
  const fs = Math.max(22, Math.round(L * 0.0125));
  const tick = fs * 0.35;
  const rowGap = fs * 2.2;

  // Szafki dzielimy na dolne (stoją przy podłodze) i górne (wiszące, spód korpusu
  // powyżej 600 mm) - każda grupa ma OSOBNY łańcuch wymiarów: dolne pod podłogą,
  // górne nad ścianą. Wewnątrz grupy szafki, które nachodzą na siebie w poziomie,
  // trafiają do kolejnych rzędów, żeby wymiary się nie nakładały.
  const HANG_MIN = 600;
  const splitRows = (list) => {
    const rows = [];
    list.slice().sort((a, b) => a.u0 - b.u0).forEach(it => {
      let r = rows.find(row => row[row.length - 1].u1 <= it.u0 + 0.5);
      if (!r) { r = []; rows.push(r); }
      r.push(it);
    });
    return rows;
  };
  const floorRows = splitRows(wall.items.filter(it => it.y0 < HANG_MIN));
  const hangRows = splitRows(wall.items.filter(it => it.y0 >= HANG_MIN));

  const mLeft = fs * 9, mRight = fs * 13;
  const mTop = fs * 15 + (hangRows.length ? fs * 2.6 + rowGap * (hangRows.length - 1) : 0);
  const mBottom = fs * 3 + rowGap * (Math.max(1, floorRows.length) + 1) + fs * 2 + fs * 5;
  const vbW = L + mLeft + mRight;
  const vbH = Hroom + mTop + mBottom;
  const ox = mLeft;
  const yTop = mTop;                        // SVG y sufitu
  const Y = (h) => yTop + (Hroom - h);      // wysokość nad podłogą -> SVG y
  const X = (u) => ox + u;

  let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto; background:#fff;" font-family="'Segoe UI', sans-serif">`;

  // miniplan z zaznaczoną ścianą (prawy górny róg)
  if (meta.plan) svg += planInset(wall.id, room, meta.plan, ox + L - fs * 13, fs * 1.2, fs * 13, fs);

  // tytuł
  svg += `<text x="${ox}" y="${fs * 1.6}" font-size="${fs * 1.3}" font-weight="bold" fill="#0f172a">${escapeHtml(wall.label.toUpperCase())} <tspan font-weight="normal" font-size="${fs}" fill="${GRAY}">(widok od środka pokoju) · ${Math.round(L)} × ${Math.round(Hroom)} mm</tspan></text>`;

  // ściana
  svg += `<rect x="${X(0)}" y="${Y(Hroom)}" width="${L}" height="${Hroom}" fill="#f8fafc" stroke="#94a3b8" stroke-width="${fs * 0.12}" />`;
  svg += `<line x1="${X(0) - fs}" y1="${Y(0)}" x2="${X(L) + fs}" y2="${Y(0)}" stroke="#334155" stroke-width="${fs * 0.22}" />`;

  if (wall.items.length === 0) {
    svg += `<text x="${X(L / 2)}" y="${Y(Hroom / 2)}" font-size="${fs * 1.4}" fill="#94a3b8" text-anchor="middle">brak szafek przy tej ścianie</text>`;
  }

  // szafki
  wall.items.forEach(it => {
    const w = it.u1 - it.u0;
    // nóżki/cokół (od podłogi do spodu korpusu)
    if (it.y0 > it.floorY) {
      svg += `<rect x="${X(it.u0)}" y="${Y(it.y0)}" width="${w}" height="${it.y0 - it.floorY}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="${fs * 0.08}" />`;
    }
    svg += `<rect x="${X(it.u0)}" y="${Y(it.y1)}" width="${w}" height="${it.y1 - it.y0}" fill="#ffffff" stroke="#334155" stroke-width="${fs * 0.14}" />`;
    it.fronts.forEach(f => {
      const isDrawer = (f.subtype || '').includes('szuflada');
      svg += `<rect x="${X(f.u0)}" y="${Y(f.y1)}" width="${f.u1 - f.u0}" height="${f.y1 - f.y0}" fill="${isDrawer ? '#eff6ff' : '#f0fdf4'}" stroke="${isDrawer ? '#3b82f6' : '#22c55e'}" stroke-width="${fs * 0.08}" />`;
    });
    const fit = (t) => escapeHtml(t.length * fs * 0.55 > w ? t.slice(0, Math.max(3, Math.floor(w / (fs * 0.55)) - 1)) + '…' : t);
    svg += `<text x="${X((it.u0 + it.u1) / 2)}" y="${Y(it.y1) + fs * 1.5}" font-size="${fs * 1.05}" font-weight="bold" fill="#0f172a" text-anchor="middle">${moduleCode(it)}</text>`;
    const label = moduleLabel(it);
    if (label) svg += `<text x="${X((it.u0 + it.u1) / 2)}" y="${Y(it.y1) + fs * 2.7}" font-size="${fs * 0.8}" fill="#475569" text-anchor="middle">${fit(label)}</text>`;
  });

  // blaty (core/worktops.js): przekrój blatu nad szafkami, z opisem długości
  (meta.worktops || []).filter(t => t.wallId === wall.id).forEach(t => {
    svg += `<rect x="${X(t.u0)}" y="${Y(t.y + t.thickness)}" width="${t.length}" height="${t.thickness}" fill="#d6b48a" stroke="#7c5a34" stroke-width="${fs * 0.12}" />`;
    svg += `<text x="${X((t.u0 + t.u1) / 2)}" y="${Y(t.y + t.thickness) - fs * 0.5}" font-size="${fs * 0.85}" fill="#7c5a34" text-anchor="middle">blat ${Math.round(t.length)} × ${Math.round(t.depth)} × ${t.thickness}</text>`;
  });

  // poziomy wysokości (linie pomocnicze po lewej) - góry szafek i spód korpusów
  const levels = new Set();
  wall.items.forEach(it => { levels.add(Math.round(it.y1)); if (it.y0 > 0) levels.add(Math.round(it.y0)); });
  [...levels].sort((a, b) => a - b).forEach(h => {
    svg += `<line x1="${X(0) - fs * 2.2}" y1="${Y(h)}" x2="${X(L)}" y2="${Y(h)}" stroke="#94a3b8" stroke-width="${fs * 0.05}" stroke-dasharray="${fs * 0.6},${fs * 0.4}" />`;
    svg += `<text x="${X(0) - fs * 2.5}" y="${Y(h) + fs * 0.35}" font-size="${fs * 0.9}" fill="${NAVY}" text-anchor="end">+${h}</text>`;
  });

  // wymiary poziome
  const dimH = (u0, u1, y, label, color) => {
    let s = `<line x1="${X(u0)}" y1="${y}" x2="${X(u1)}" y2="${y}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
    s += `<line x1="${X(u0)}" y1="${y - tick}" x2="${X(u0)}" y2="${y + tick}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
    s += `<line x1="${X(u1)}" y1="${y - tick}" x2="${X(u1)}" y2="${y + tick}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
    const cramped = (u1 - u0) < fs * 3;
    s += `<text x="${X((u0 + u1) / 2)}" y="${y - fs * 0.45}" font-size="${cramped ? fs * 0.7 : fs * 0.95}" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text>`;
    return s;
  };

  // Łańcuch jednego rzędu: odstęp od ściany / szafka / odstęp / szafka ... / odstęp do
  // ściany. Odstępy (pomarańczowe) między szafkami, żeby było widać wolne miejsce.
  const chain = (row, y) => {
    let out = '';
    let cursor = 0;
    row.forEach(it => {
      const u0 = Math.max(0, it.u0), u1 = Math.min(L, it.u1);
      if (u0 - cursor > 0.5) out += dimH(cursor, u0, y, `${Math.round(u0 - cursor)}`, ORANGE);
      out += dimH(u0, u1, y, `${Math.round(u1 - u0)}`, NAVY);
      cursor = Math.max(cursor, u1);
    });
    if (L - cursor > 0.5 && row.length > 0) out += dimH(cursor, L, y, `${Math.round(L - cursor)}`, ORANGE);
    return out;
  };
  const rowLabel = (text, y) => `<text x="${X(0) - fs * 0.6}" y="${y + fs * 0.3}" font-size="${fs * 0.8}" fill="${GRAY}" text-anchor="end">${text}</text>`;

  // dolne: pod podłogą, od najbliższego podłodze rzędu w dół
  const yFloor0 = Y(0) + fs * 2.4;
  floorRows.forEach((row, i) => {
    const y = yFloor0 + i * rowGap;
    svg += chain(row, y) + rowLabel('dolne', y);
  });
  const yOverall = yFloor0 + Math.max(1, floorRows.length) * rowGap;
  svg += dimH(0, L, yOverall, `${Math.round(L)} mm`, '#0f172a');

  // górne: nad ścianą (nad sufitem), od najbliższego ściany rzędu w górę
  hangRows.forEach((row, i) => {
    const y = Y(Hroom) - fs * 2.4 - i * rowGap;
    svg += chain(row, y) + rowLabel('górne', y);
  });

  // pionowo: przestrzeń między górą szafki dolnej a spodem górnej (np. blat -> szafki
  // wiszące), w miejscu, gdzie obie się pokrywają w poziomie
  wall.items.forEach(up => {
    if (up.y0 < HANG_MIN) return;
    wall.items.forEach(low => {
      if (low === up || low.y0 >= HANG_MIN) return;
      const ov0 = Math.max(up.u0, low.u0), ov1 = Math.min(up.u1, low.u1);
      if (ov1 - ov0 < fs * 2 || up.y0 - low.y1 < 1) return;
      const x = X(ov0 + Math.min(fs * 3, (ov1 - ov0) / 2));
      svg += `<line x1="${x}" y1="${Y(low.y1)}" x2="${x}" y2="${Y(up.y0)}" stroke="${ORANGE}" stroke-width="${fs * 0.1}" />`;
      svg += `<line x1="${x - tick}" y1="${Y(low.y1)}" x2="${x + tick}" y2="${Y(low.y1)}" stroke="${ORANGE}" stroke-width="${fs * 0.1}" />`;
      svg += `<line x1="${x - tick}" y1="${Y(up.y0)}" x2="${x + tick}" y2="${Y(up.y0)}" stroke="${ORANGE}" stroke-width="${fs * 0.1}" />`;
      svg += `<text x="${x + fs * 0.7}" y="${(Y(low.y1) + Y(up.y0)) / 2 + fs * 0.35}" font-size="${fs * 0.95}" font-weight="bold" fill="${ORANGE}">${Math.round(up.y0 - low.y1)}</text>`;
    });
  });

  // Wysokość korpusu: po jednym wymiarze na każdą wysokość (para spód/góra),
  // przy prawej krawędzi ostatniej takiej szafki - tylko gdy obok jest miejsce.
  {
    const groups = new Map();
    wall.items.forEach(it => {
      const k = Math.round(it.y0) + '|' + Math.round(it.y1);
      if (!groups.has(k) || it.u1 > groups.get(k).u1) groups.set(k, it);
    });
    groups.forEach(it => {
      const blocked = wall.items.some(o => o !== it && o.u0 < it.u1 + fs * 5 && o.u1 > it.u1 && o.y0 < it.y1 && o.y1 > it.y0);
      if (blocked || it.u1 + fs * 5 > L) return;
      const x = X(it.u1) + fs * 1.6;
      svg += `<line x1="${x}" y1="${Y(it.y0)}" x2="${x}" y2="${Y(it.y1)}" stroke="${NAVY}" stroke-width="${fs * 0.1}" />`;
      svg += `<line x1="${x - tick}" y1="${Y(it.y0)}" x2="${x + tick}" y2="${Y(it.y0)}" stroke="${NAVY}" stroke-width="${fs * 0.1}" />`;
      svg += `<line x1="${x - tick}" y1="${Y(it.y1)}" x2="${x + tick}" y2="${Y(it.y1)}" stroke="${NAVY}" stroke-width="${fs * 0.1}" />`;
      svg += `<text x="${x + fs * 0.7}" y="${(Y(it.y0) + Y(it.y1)) / 2 + fs * 0.35}" font-size="${fs * 0.95}" font-weight="bold" fill="${NAVY}">${Math.round(it.y1 - it.y0)}</text>`;
    });
  }

  // wymiary pionowe przy prawej krawędzi: cokół / korpus najwyższej szafki / do sufitu
  if (wall.items.length > 0) {
    const tallest = wall.items.reduce((a, b) => (b.y1 > a.y1 ? b : a));
    const xv = X(L) + fs * 2.2;
    const dimV = (h0, h1, label, color, dx = 0) => {
      const x = xv + dx;
      let s = `<line x1="${x}" y1="${Y(h0)}" x2="${x}" y2="${Y(h1)}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
      s += `<line x1="${x - tick}" y1="${Y(h0)}" x2="${x + tick}" y2="${Y(h0)}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
      s += `<line x1="${x - tick}" y1="${Y(h1)}" x2="${x + tick}" y2="${Y(h1)}" stroke="${color}" stroke-width="${fs * 0.1}" />`;
      s += `<text x="${x + fs * 0.7}" y="${(Y(h0) + Y(h1)) / 2 + fs * 0.35}" font-size="${fs * 0.95}" font-weight="bold" fill="${color}">${label}</text>`;
      return s;
    };
    if (tallest.y0 > tallest.floorY) svg += dimV(tallest.floorY, tallest.y0, `${Math.round(tallest.y0 - tallest.floorY)}`, GRAY);
    svg += dimV(tallest.y0, tallest.y1, `${Math.round(tallest.y1 - tallest.y0)}`, NAVY);
    if (Hroom - tallest.y1 > 0.5) svg += dimV(tallest.y1, Hroom, `${Math.round(Hroom - tallest.y1)}`, ORANGE);
    svg += dimV(0, Hroom, `${Math.round(Hroom)}`, '#0f172a', fs * 5.2);
  }

  // kartusz (tabelka rysunkowa) na dole
  const yT = vbH - fs * 4.2;
  svg += `<line x1="${ox}" y1="${yT}" x2="${ox + L}" y2="${yT}" stroke="#334155" stroke-width="${fs * 0.12}" />`;
  const cell = (x, label, value) => `<text x="${x}" y="${yT + fs * 1.3}" font-size="${fs * 0.75}" fill="${GRAY}">${label}</text><text x="${x}" y="${yT + fs * 2.7}" font-size="${fs * 1.05}" font-weight="bold" fill="#0f172a">${escapeHtml(value)}</text>`;
  svg += cell(ox, 'PROJEKT', meta.projectName || 'bez nazwy');
  svg += cell(ox + L * 0.34, 'RZUT', `${wall.label} (od środka pokoju)`);
  svg += cell(ox + L * 0.62, 'JEDNOSTKI', 'mm, rysunek w skali dopasowanej do strony');
  svg += cell(ox + L * 0.9, 'DATA', meta.date || '');
  svg += `<text x="${ox + L}" y="${yT + fs * 3.9}" font-size="${fs * 0.7}" fill="${GRAY}" text-anchor="end">Kody: D dolna, W wisząca, S słupek, N narożna + szerokość na tej ścianie</text>`;

  svg += `</svg>`;
  return svg;
}

export function generateAllWallSVGs(project) {
  const { room, walls, plan } = computeWallLayouts(project);
  const wt = computeWorktops(project);
  const meta = { worktops: wt.settings.enabled ? wt.pieces : [], plan, projectName: project.name, date: new Date().toLocaleDateString('pl-PL') };
  return walls.map(w => ({ wall: w, room, svg: generateWallSVG(w, room, meta) }));
}
