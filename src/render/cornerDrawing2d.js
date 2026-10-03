// src/render/cornerDrawing2d.js
//
// Rysunki 2D szafki narożnej (boki z wierceniami, wieńce/półki w kształcie L, fronty,
// wykrój formatki) - wydzielone z render/viewer2d.js, z którego biorą wspólne helpery
// opisu wymiarów.
import { fmtMm, round1 } from '../utils/math.js';
import { escapeHtml } from '../utils/dom.js';
import { getCornerPartsGeometry, getCornerWieniecHoles, getCornerShelfHoles, getCornerDoorHinges } from '../engine/cornerParts.js';
import { formatVal, getDimText } from './viewer2d.js';

// Rysunki formatek szafki narożnej (boki + listwa) w stylu rysunku boku
// zwykłej szafki (generateSidePanelSVG): biały panel, fioletowe otwory łączeń
// (wkręt r=1.5, kołek r=4), pomarańczowe podpórki półek z linią pomocniczą i
// opisem DÓŁ/GÓRA. Każdy element ma PRZÓD po lewej, TYŁ po prawej.
// side = { name, depth, height, bottom, holes (podpórki), joints (łączenia) }
// - wysokości otworów liczone od dołu KORPUSU (bottom = dół elementu), żeby
// otwory boków i listwy się zgrywały.
function generateCornerSidesHolesSVG(sides) {
  const gap = 40, pad = 40, textW = 200;
  const maxH = Math.max(...sides.map(s => (s.bottom || 0) + s.height));
  const totalW = sides.reduce((sum, s) => sum + s.depth + textW + gap, 0) + pad * 2 - gap;
  const totalH = maxH + pad * 2 + 50;
  const PURPLE = '#9333ea', ORANGE = '#ea580c';
  let svg = `<svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc" font-family="'Segoe UI', sans-serif">`;
  let ox = pad;
  const top = pad + 30;
  const yOf = (y) => top + maxH - y;
  sides.forEach(s => {
    const bottom = s.bottom || 0;
    svg += `<text x="${ox + s.depth / 2}" y="${pad + 10}" font-size="16" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${escapeHtml(s.name.toUpperCase())}</text>`;
    svg += `<text x="${ox + s.depth / 2}" y="${pad + 26}" font-size="11" fill="#64748b" text-anchor="middle">${fmtMm(s.height)} × ${fmtMm(s.depth)} mm</text>`;
    svg += `<rect x="${ox}" y="${yOf(bottom + s.height)}" width="${s.depth}" height="${s.height}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
    // Podpis na środku formatki (listwa wąska - pionowo).
    const scx = ox + s.depth / 2, scy = yOf(bottom + s.height / 2);
    const narrow = s.depth < 200;
    svg += `<text x="${scx}" y="${scy}" font-size="${narrow ? 22 : 34}" fill="#0f172a" font-weight="bold" text-anchor="middle"${narrow ? ` transform="rotate(-90 ${scx} ${scy})"` : ''}>${escapeHtml(s.name.toUpperCase())}</text>`;
    svg += `<text x="${ox}" y="${yOf(bottom + s.height) - 6}" font-size="10" fill="#94a3b8" font-weight="bold">PRZÓD</text>`;
    svg += `<text x="${ox + s.depth}" y="${yOf(bottom + s.height) - 6}" font-size="10" fill="#94a3b8" font-weight="bold" text-anchor="end">TYŁ</text>`;

    (s.joints || []).forEach(j => {
      svg += `<circle cx="${ox + j.x}" cy="${yOf(j.y)}" r="${j.type === 'dowel' ? 4 : 1.5}" fill="${PURPLE}" />`;
    });

    // Otwory pod płytki zawiasów (zielone, jak w rysunku boku zwykłej szafki):
    // dwa co 32 mm wokół wysokości zawiasu, opis wysokości obok.
    (s.hingePlates || []).forEach(hp => {
      [-16, 16].forEach(dy => {
        svg += `<circle cx="${ox + hp.x}" cy="${yOf(hp.y + dy)}" r="2.5" fill="#16a34a" />`;
      });
      svg += `<text x="${ox + hp.x + 12}" y="${yOf(hp.y) + 4}" font-family="sans-serif">${getDimText(hp.y - bottom, s.height, '#16a34a')}</text>`;
    });

    const rightX = ox + s.depth;
    const maxX = Math.max(...(s.holes.length ? s.holes.map(h => h.x) : [0]));
    s.holes.forEach(h => {
      svg += `<circle cx="${ox + h.x}" cy="${yOf(h.y)}" r="2.5" fill="${ORANGE}" opacity="${h.isCenter ? 1 : 0.6}" />`;
      if (h.x === maxX) {
        svg += `<line x1="${rightX}" y1="${yOf(h.y)}" x2="${rightX + 30}" y2="${yOf(h.y)}" stroke="${ORANGE}" stroke-width="0.5" stroke-dasharray="2,2" />`;
        svg += `<text x="${rightX + 36}" y="${yOf(h.y) + 4}" font-family="sans-serif" opacity="${h.isCenter ? 1 : 0.6}">${getDimText(h.y - bottom, s.height, ORANGE, true)}</text>`;
      }
    });
    ox += s.depth + textW + gap;
  });
  svg += `</svg>`;
  return svg;
}

// Rysunek formatki L szafki narożnej (wieniec albo półka) w stylu rysunków
// zwykłych szafek: biały obrys, fioletowe otwory (wkręt r=1.5, kołek r=4) z
// liniami pomocniczymi i opisami, wymiary całkowite i wycięcia. Układ
// formatki: 0,0 = tylny róg, X wzdłuż ramienia A, Y wzdłuż ramienia B, przód
// to krawędzie wycięcia w rogu (depthA/depthB).
// notch = {w, h} - wycięcie na listwę w tylnym rogu (tylko półka).
function generateCornerPartSVG({ blankA, blankB, depthA, depthB, notch = null, holes = [], title, subtitle }) {
  const M = 130;
  const ox = M, oy = M;
  const vbW = blankA + M * 2, vbH = blankB + M * 2;
  const PURPLE = '#9333ea', NAVY = '#1e3a8a', RED = '#dc2626';
  const outline = notch
    ? [[0, notch.h], [notch.w, notch.h], [notch.w, 0], [blankA, 0], [blankA, depthA], [depthB, depthA], [depthB, blankB], [0, blankB]]
    : [[0, 0], [blankA, 0], [blankA, depthA], [depthB, depthA], [depthB, blankB], [0, blankB]];
  const pts = outline.map(([x, y]) => `${ox + x},${oy + y}`).join(' ');

  let svg = `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc" font-family="'Segoe UI', sans-serif">`;
  svg += `<text x="${ox + blankA / 2}" y="34" font-size="20" font-weight="bold" fill="${NAVY}" text-anchor="middle">${escapeHtml(title)} (WIDOK Z GÓRY)</text>`;
  svg += `<text x="${ox + blankA / 2}" y="56" font-size="14" fill="#64748b" text-anchor="middle">${escapeHtml(subtitle)}</text>`;
  svg += `<polygon points="${pts}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;

  if (notch) {
    svg += `<rect x="${ox}" y="${oy}" width="${notch.w}" height="${notch.h}" fill="#fee2e2" stroke="${RED}" stroke-width="1" stroke-dasharray="4,3" />`;
    svg += `<text x="${ox + notch.w + 8}" y="${oy + notch.h + 14}" font-size="12" font-weight="bold" fill="${RED}">wycięcie na listwę ${fmtMm(notch.w)}×${fmtMm(notch.h)} mm</text>`;
  }

  // Podpis na środku (jak "RZUT SZAFKI Z GÓRY" w rzucie) - co to za formatka.
  const lcx = ox + blankA / 2, lcy = oy + depthA / 2;
  svg += `<text x="${lcx}" y="${lcy}" font-size="44" fill="#0f172a" font-weight="bold" text-anchor="middle">${escapeHtml(title)}</text>`;
  svg += `<text x="${lcx}" y="${lcy + 34}" font-size="22" fill="#334155" text-anchor="middle">${escapeHtml(subtitle.split(' · ')[0])}</text>`;

  // PRZÓD = krawędzie wycięcia w rogu, TYŁ = ściany.
  svg += `<text x="${ox + (depthB + blankA) / 2}" y="${oy + depthA + 16}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">PRZÓD</text>`;
  svg += `<text x="${ox + depthB + 16}" y="${oy + (depthA + blankB) / 2}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1" transform="rotate(-90 ${ox + depthB + 16} ${oy + (depthA + blankB) / 2})">PRZÓD</text>`;
  svg += `<text x="${ox + blankA / 2}" y="${oy - 8}" font-size="11" fill="#94a3b8" font-weight="bold" text-anchor="middle" letter-spacing="1">TYŁ</text>`;

  holes.forEach(h => {
    svg += `<circle cx="${ox + h.x}" cy="${oy + h.y}" r="${h.type === 'dowel' ? 4 : 1.5}" fill="${PURPLE}" />`;
  });

  // Linie pomocnicze i opisy pozycji wkrętów (jak w widoku wieńca zwykłej
  // szafki): przy boku ramienia A - odległość od tyłu, przy boku B - od lewej.
  const seen = new Set();
  holes.filter(h => h.type === 'screw').forEach(h => {
    if (h.side === 'A') {
      const key = 'A' + round1(h.y);
      if (seen.has(key)) return; seen.add(key);
      svg += `<line x1="${ox + h.x}" y1="${oy + h.y}" x2="${ox + blankA + 40}" y2="${oy + h.y}" stroke="${PURPLE}" stroke-width="0.75" stroke-dasharray="2,2" />`;
      svg += `<text x="${ox + blankA + 46}" y="${oy + h.y + 4}" font-size="11" font-weight="bold" fill="${PURPLE}">${formatVal(h.y)} <tspan font-size="9" font-weight="normal">od tyłu</tspan></text>`;
    } else if (h.side === 'B') {
      const key = 'B' + round1(h.x);
      if (seen.has(key)) return; seen.add(key);
      svg += `<line x1="${ox + h.x}" y1="${oy + h.y}" x2="${ox + h.x}" y2="${oy + blankB + 40}" stroke="${PURPLE}" stroke-width="0.75" stroke-dasharray="2,2" />`;
      svg += `<text x="${ox + h.x}" y="${oy + blankB + 54}" font-size="11" font-weight="bold" fill="${PURPLE}" text-anchor="middle">${formatVal(h.x)} <tspan font-size="9" font-weight="normal">od lewej</tspan></text>`;
    }
  });
  holes.filter(h => h.type === 'dowel' && h.side === 'batten').forEach(h => {
    svg += `<text x="${ox + h.x}" y="${oy + h.y + 22}" font-size="10" font-weight="bold" fill="${PURPLE}" text-anchor="middle">${formatVal(h.x)}</text>`;
  });

  // Wymiary całkowite, głębokości i wycięcie w rogu (kolory jak w rzucie z góry:
  // głębokość - granat, wycięcie A - pomarańczowy, wycięcie B - zielony).
  const dimH = (x1, x2, y, label, c = NAVY) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${c}" stroke-width="1" />` +
    `<text x="${(x1 + x2) / 2}" y="${y - 7}" font-size="13" font-weight="bold" fill="${c}" text-anchor="middle">${label}</text>`;
  const dimV = (y1, y2, x, label, c = NAVY) =>
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="${c}" stroke-width="1" />` +
    `<line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="${c}" stroke-width="1" />` +
    `<text x="${x - 7}" y="${(y1 + y2) / 2}" font-size="13" font-weight="bold" fill="${c}" text-anchor="middle" transform="rotate(-90 ${x - 7} ${(y1 + y2) / 2})">${label}</text>`;
  svg += dimH(ox, ox + blankA, oy - 32, `${fmtMm(blankA)} mm`);
  svg += dimV(oy, oy + blankB, ox - 36, `${fmtMm(blankB)} mm`);
  svg += dimV(oy, oy + depthA, ox + blankA + 110, `${fmtMm(depthA)} mm`);
  svg += dimH(ox, ox + depthB, oy + blankB + 84, `${fmtMm(depthB)} mm`);
  const cutW = blankA - depthB, cutH = blankB - depthA;
  if (cutH > 0) svg += dimV(oy + depthA, oy + blankB, ox + blankA + 110, `wycięcie ${fmtMm(cutH)} mm`, '#16a34a');
  if (cutW > 0) svg += dimH(ox + depthB, ox + blankA, oy + blankB + 84, `wycięcie ${fmtMm(cutW)} mm`, '#d97706');
  if (notch) {
    svg += dimH(ox, ox + notch.w, oy + notch.h + 34, `${fmtMm(notch.w)}`, RED);
    svg += dimV(oy, oy + notch.h, ox + notch.w + 44, `${fmtMm(notch.h)}`, RED);
  }

  svg += `</svg>`;
  return svg;
}

// Komplet rysunków formatek szafki narożnej pod rzutem z góry: wieniec (z
// otworami łączeń), półka (z wycięciem na listwę, tylko gdy są półki) oraz
// boki i listwa (łączenia + podpórki półek). Zwraca HTML z nagłówkami.
// Rysunek frontu narożnika z otworami pod puszki zawiasów (fi 35, 22,5 mm od
// krawędzi zawiasów) - układ jak w rysunku frontów zwykłej szafki.
// door = element z getCornerDoorHinges: { front, arm, side, atBok, bifoldSecondary, hinges }.
function generateCornerFrontSVG(door, doorName) {
  const f = door.front;
  const w = parseFloat(f.w) || 0, h = parseFloat(f.h) || 0;
  const M = 150;
  const ox = M, oy = M;
  const GREEN = '#16a34a', NAVY = '#1e3a8a';
  const isLeft = door.side === 'left';
  const sub = door.bifoldSecondary
    ? 'skrzydło łączone zawiasem 60° (Blum 79T8500), bez zawiasów przy korpusie'
    : `zawiasy ${isLeft ? 'od strony narożnika' : 'od strony boku korpusu'}`;
  let svg = `<svg viewBox="0 0 ${w + M * 2} ${h + M * 2}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc" font-family="'Segoe UI', sans-serif">`;
  svg += `<text x="${ox + w / 2}" y="34" font-size="20" font-weight="bold" fill="${NAVY}" text-anchor="middle">${escapeHtml(doorName)} (WIDOK OD PRZODU)</text>`;
  svg += `<text x="${ox + w / 2}" y="56" font-size="14" fill="#64748b" text-anchor="middle">${fmtMm(w)} × ${fmtMm(h)} mm · ${escapeHtml(sub)}</text>`;
  svg += `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="#ffffff" stroke="#475569" stroke-width="1.5" />`;
  svg += `<rect x="${isLeft ? ox : ox + w - 6}" y="${oy}" width="6" height="${h}" fill="#dc2626" opacity="0.7" />`;
  svg += `<text x="${ox + w / 2}" y="${oy + h / 2}" font-size="36" font-weight="bold" fill="#0f172a" text-anchor="middle">${escapeHtml(doorName.split(' — ')[0].toUpperCase())}</text>`;
  door.hinges.forEach(hg => {
    const cx = isLeft ? ox + hg.cupXOffset : ox + w - hg.cupXOffset;
    const cy = oy + h - hg.relY;
    const c = hg.isAdjusted ? '#ea580c' : GREEN;
    svg += `<circle cx="${cx}" cy="${cy}" r="17.5" fill="#fcfdfd" stroke="${c}" stroke-width="1.5" />`;
    svg += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${c}" />`;
    const tx = isLeft ? cx + 26 : cx - 26;
    svg += `<text x="${tx}" y="${cy + 4}" text-anchor="${isLeft ? 'start' : 'end'}" font-family="sans-serif">${getDimText(hg.relY, h, c)}</text>`;
  });
  svg += `<text x="${isLeft ? ox + 12 : ox + w - 12}" y="${oy - 8}" font-size="11" font-weight="bold" fill="#dc2626" text-anchor="${isLeft ? 'start' : 'end'}">ZAWIASY</text>`;
  svg += `</svg>`;
  return svg;
}

export function generateCornerPartsDrawings(mod) {
  const g = getCornerPartsGeometry(mod);
  const h2 = (t) => `<h3 style="font-size:14px; color:#1e3a8a; margin:18px 0 6px;">${t}</h3>`;
  let html = h2('Wieniec narożny (dolny + górny)');
  html += generateCornerPartSVG({
    ...g.wieniec, holes: getCornerWieniecHoles(mod),
    title: 'WIENIEC', subtitle: `2 szt. (dolny + górny) · ${fmtMm(g.wieniec.blankA)} × ${fmtMm(g.wieniec.blankB)} mm`,
  });
  if (g.shelfCount > 0) {
    html += h2('Półka narożna');
    html += generateCornerPartSVG({
      ...g.polka,
      title: 'PÓŁKA', subtitle: `${g.shelfCount} szt. · ${fmtMm(g.polka.blankA)} × ${fmtMm(g.polka.blankB)} mm · przód cofnięty o 5 mm`,
    });
  }
  html += h2('Boki i listwa narożna');
  html += generateCornerSidesHolesSVG(getCornerShelfHoles(mod));
  const doors = getCornerDoorHinges(mod);
  if (doors.length > 0) {
    html += h2('Fronty z zawiasami');
    doors.sort((a, b) => a.arm.localeCompare(b.arm) || (a.front.y || 0) - (b.front.y || 0)).forEach((d, i) => {
      const name = `Front ramię ${d.arm}${doors.filter(x => x.arm === d.arm).length > 1 ? ' ' + (i + 1) : ''} — drzwi ${d.side === 'left' ? 'lewe' : 'prawe'}`;
      html += generateCornerFrontSVG(d, name);
    });
  }
  return html;
}

// Wykrój formatki narożnej w kształcie L (Wieniec narożny / Półka narożna,
// engine/cornerParts.js: getCornerCorpusParts) - do tej pory ich cut-listowy
// opis "naroże do wycięcia - patrz rysunek 3D" nie odsyłał do żadnego
// realnego, drukowalnego rysunku (tylko do interaktywnej sceny 3D) -
// zgłoszony brak. Pokazuje pełny prostokątny blank legA×legB (linia
// przerywana) i faktyczny obrys L po docięciu (linia ciągła, wypełniona) -
// różnica między nimi to prostokąt (legA-depthB)×(legB-depthA) do odcięcia
// z jednego rogu. Ramiona mają NIEZALEŻNE głębokości (zgłoszona korekta,
// core/layout.js: getCornerDepths) - narożny prostokąt ma rogi (depthB,
// depthA), nie (depth,depth) jak przy wspólnej głębokości.
//
// Główne wymiary (Ramię A/B, Głęb. A/B, Wycięcie A/B) celowo liczone od
// PEŁNEGO korpusu (legA/legB), 1:1 z polami w konfiguratorze - inna baza
// (np. pomniejszona formatka) dawała inną liczbę niż użytkownik właśnie
// wpisał, co wyglądało jak błąd (zgłoszona korekta - "wpisałem 500 a na
// rysunku jest 482"). Sam wieniec/półka siedzi MIĘDZY bokami (boki
// przelotowe), więc realna formatka jest mniejsza o grubość boku (th) na
// dalszej krawędzi każdego ramienia (patrz engine/cabinet.js:
// getCornerCorpusParts, render/cornerCabinet3d.js: renderCornerCabinet `shape`) -
// pokazana tu jako DODATKOWY, cieńszy obrys wewnątrz + boki narysowane na
// swoim realnym miejscu, żeby było widać skąd bierze się różnica, bez
// zmiany głównych wymiarów.
// extra = { title, subtitle, holes }: podpis na środku rysunku (co to za
// część) i otwory łączeń (kołek/wkręt) w układzie formatki - wieniec dostaje
// otwory, półka wycięcie (notch) zamiast nich.
export function generateCornerBlankSVG(legA, legB, depthA, depthB, th = 18, notch = null, extra = null) {
  const blankA = legA - th;
  const blankB = legB - th;
  // Rozmiary w SVG są w "mm" viewBoxa, skalowanym przez CSS do szerokości
  // kontenera (ui/cornerConfigModal.js, ui/properties.js: print) - stały
  // rozmiar czcionki/linii w mm (np. 13) wychodził nieczytelnie mały przy
  // typowych wymiarach szafki (800-1200mm zmieszczone w np. 500px szerokości
  // ekranu = kilka pikseli). Liczymy je więc jako UŁAMEK najmniejszego boku,
  // żeby tekst/linie zostały czytelne niezależnie od wymiarów szafki i
  // rozmiaru kontenera.
  const unit = Math.max(1, Math.min(legA, legB, depthA || legA, depthB || legB));
  const fs = Math.round(unit * 0.075); // font-size bazowy
  const fsSmall = Math.round(unit * 0.062);
  const fsTiny = Math.round(unit * 0.052);
  const strokeThick = Math.max(2, Math.round(unit * 0.01));
  const strokeThin = Math.max(1, Math.round(unit * 0.005));
  // Wszystkie wymiary (Ramię A/B, Głęb. A/B, Wycięcie A/B) leżą NA ZEWNĄTRZ
  // konturu, żadna linia/etykieta nie przecina wypełnienia ani obrysu
  // (zgłoszony bug: wcześniej głębokości rysowały się W ŚRODKU kształtu).
  // Prawy i dolny bok mieszczą PO DWA wymiary naraz (głębokość + wycięcie) w
  // osobnych, odizolowanych pasach - margines musi być na tyle duży, żeby
  // oba pasy plus ich tekst zmieściły się bez zachodzenia na siebie
  // (zgłoszony bug: przy zbyt ciasnym marginesie linie/kreski pomocnicze
  // zasłaniały tekst sąsiedniego wymiaru).
  const margin = Math.round(unit * 0.55);

  const vbW = legA + margin * 2;
  const vbH = legB + margin * 2;
  const ox = margin, oy = margin;

  const cutW = legA - depthB; // szerokość odcinanego rogu (wyznaczona przez głębokość ramienia B)
  const cutH = legB - depthA; // wysokość odcinanego rogu (wyznaczona przez głębokość ramienia A)

  // notch = {w, h}: wycięcie w tylnym rogu (0,0) na listwę narożną - tylko
  // półka (wieniec nie ma go, bo listwa stoi MIĘDZY wieńcami).
  const outline = (a, b) => (notch
    ? [[0, notch.h], [notch.w, notch.h], [notch.w, 0], [a, 0], [a, depthA], [depthB, depthA], [depthB, b], [0, b]]
    : [[0, 0], [a, 0], [a, depthA], [depthB, depthA], [depthB, b], [0, b]]
  ).map(([x, y]) => `${ox + x},${oy + y}`).join(' ');
  const pts = outline(legA, legB);

  let svg =`<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">`;

  // Pełny prostokątny blank (przerywany) - to jest to, co realnie zamawia
  // się/tnie z płyty jako pierwszy krok (patrz Lista formatek: legA×legB).
  svg += `<rect x="${ox}" y="${oy}" width="${legA}" height="${legB}" fill="none" stroke="#94a3b8" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 4},${strokeThick * 3}" />`;

  // Róg do odcięcia - zakreskowany, czerwona ramka, żeby jednoznacznie
  // pokazać co znika. Sam wymiar wycięcia (Wycięcie A/B) rysuje się NA
  // ZEWNĄTRZ konturu niżej (dół/prawo, jako ciąg dalszy Głęb. B/A) - tu w
  // środku zostaje tylko krótka etykieta "ODCIĄĆ", i to wyłącznie gdy się
  // realnie mieści (zgłoszony bug: przy wąskim wycięciu dłuższy tekst z
  // wymiarami "WxH mm" wychodził poza czerwony prostokąt i nakładał się na
  // czarny obrys bryły, wyglądając jak przekreślenie).
  if (cutW > 0 && cutH > 0) {
    svg += `<rect x="${ox + depthB}" y="${oy + depthA}" width="${cutW}" height="${cutH}" fill="#fee2e2" stroke="#dc2626" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 2.5},${strokeThick * 2}" />`;
    if (cutW > fs * 3 && cutH > fs * 1.5) {
      svg += `<text x="${ox + depthB + cutW / 2}" y="${oy + depthA + cutH / 2}" font-size="${fs}" fill="#b91c1c" font-weight="bold" text-anchor="middle" dominant-baseline="middle">ODCIĄĆ</text>`;
    }
  }

  // Realny obrys L po docięciu - wypełniony, na wierzchu.
  svg += `<polygon points="${pts}" fill="#fef3c7" stroke="#334155" stroke-width="${strokeThick * 1.3}" />`;
  if (notch) {
    svg += `<rect x="${ox}" y="${oy}" width="${notch.w}" height="${notch.h}" fill="#fee2e2" stroke="#dc2626" stroke-width="${strokeThick}" stroke-dasharray="${strokeThick * 2.5},${strokeThick * 2}" />`;
    svg += `<text x="${ox + notch.w + fsTiny * 0.6}" y="${oy + notch.h + fsTiny * 3.4}" font-size="${fsTiny}" fill="#b91c1c" font-weight="bold">wycięcie na listwę ${fmtMm(notch.w)}×${fmtMm(notch.h)} mm</text>`;
  }

  // Boki (płyty boczne, ui/właściwe formatki "Bok (L/P)" w Liście formatek) -
  // narysowane na swoim realnym miejscu (dalsza krawędź każdego ramienia),
  // żeby było widać, DLACZEGO formatka wieńca (linia przerywana fioletowa
  // niżej) jest węższa niż cały korpus - to właśnie w to miejsce wchodzi
  // (boki przelotowe, wieniec między nimi), a nie osobny, niezależny
  // "ubytek". Tylko wizualny kontekst, nie osobna formatka do zamawiania tu.
  const COLOR_BOK = '#78716c';
  svg += `<rect x="${ox + legA - th}" y="${oy}" width="${th}" height="${depthA}" fill="#e7e5e4" stroke="${COLOR_BOK}" stroke-width="${strokeThin}" />`;
  svg += `<rect x="${ox}" y="${oy + legB - th}" width="${depthB}" height="${th}" fill="#e7e5e4" stroke="${COLOR_BOK}" stroke-width="${strokeThin}" />`;
  if (th > fsTiny * 2) {
    svg += `<text x="${ox + legA - th / 2}" y="${oy + depthA / 2}" font-size="${fsTiny}" fill="${COLOR_BOK}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${ox + legA - th / 2} ${oy + depthA / 2})">bok</text>`;
    svg += `<text x="${ox + depthB / 2}" y="${oy + legB - th / 2}" font-size="${fsTiny}" fill="${COLOR_BOK}" text-anchor="middle" dominant-baseline="middle">bok</text>`;
  }

  // Formatka wieńca/półki (linia przerywana fioletowa) - obrys L wsunięty o
  // grubość boku (th) od dalszej krawędzi każdego ramienia (siedzi MIĘDZY
  // bokami, patrz komentarz nad funkcją). To realny rozmiar do zamówienia -
  // patrz Lista formatek: "Wieniec narożny {blankA}x{blankB}". Rysowany jako
  // DODATKOWY kontur na wierzchu głównego obrysu, nie zamiast niego, żeby
  // główne wymiary (Ramię/Głęb./Wycięcie) zostały 1:1 z konfiguratorem.
  if (!extra?.plain && blankA > depthB && blankB > depthA) {
    const blankPts = outline(blankA, blankB);
    svg += `<polygon points="${blankPts}" fill="none" stroke="#7c3aed" stroke-width="${strokeThin * 1.5}" stroke-dasharray="${strokeThin * 3},${strokeThin * 2}" />`;
    svg += `<text x="${ox + blankA - fsTiny * 0.6}" y="${oy + fsTiny * 1.4}" font-size="${fsTiny}" fill="#7c3aed" font-weight="bold" text-anchor="end">${notch ? 'Formatka półki' : 'Formatka wieńca'}:${fmtMm(blankA)}×${fmtMm(blankB)} mm (-${fmtMm(th)} mm bok)</text>`;
  }

  if (extra?.holes?.length) {
    const rScrew = Math.max(3, unit * 0.011);
    const rDowel = Math.max(4, unit * 0.016);
    extra.holes.forEach(h => {
      const isDowel = h.type === 'dowel';
      svg += `<circle cx="${ox + h.x}" cy="${oy + h.y}" r="${isDowel ? rDowel : rScrew}" fill="${isDowel ? '#bbf7d0' : '#94a3b8'}" stroke="${isDowel ? '#16a34a' : '#475569'}" stroke-width="${strokeThin}" />`;
    });
    const lx = ox + depthB / 2, lyy = oy + depthA / 2 + fs * 3.2;
    svg += `<circle cx="${lx - fs * 3}" cy="${lyy - fsTiny * 0.3}" r="${rScrew}" fill="#94a3b8" stroke="#475569" stroke-width="${strokeThin}" /><text x="${lx - fs * 2.4}" y="${lyy}" font-size="${fsTiny}" fill="#475569">wkręt</text>`;
    svg += `<circle cx="${lx + fs * 0.6}" cy="${lyy - fsTiny * 0.3}" r="${rDowel}" fill="#bbf7d0" stroke="#16a34a" stroke-width="${strokeThin}" /><text x="${lx + fs * 1.4}" y="${lyy}" font-size="${fsTiny}" fill="#475569">kołek</text>`;
  }
  if (extra?.title) {
    const cx = extra.plain ? ox + legA / 2 : ox + depthB / 2, cy = oy + depthA / 2;
    svg += `<text x="${cx}" y="${cy - fs * 0.2}" font-size="${extra.plain ? fs * 1.05 : fs * 1.5}" fill="#0f172a" font-weight="bold" text-anchor="middle">${escapeHtml(extra.title)}</text>`;
    if (extra.subtitle) svg += `<text x="${cx}" y="${cy + fs * 1.2}" font-size="${fs}" fill="#334155" text-anchor="middle">${escapeHtml(extra.subtitle)}</text>`;
  }

  // Wymiary - proste kolorowe linie TUŻ PRZY odpowiadającym im fragmencie
  // obrysu (nie przez środek, ale też bez kresek pomocniczych/łańcuchowania -
  // zgłoszony bug: przy dwóch wymiarach na tym samym boku linie/kreski
  // pomocnicze zaczęły zasłaniać tekst). Każdy wymiar dostaje WŁASNY,
  // odizolowany "pas" na zewnątrz konturu - głębokości bliżej bryły,
  // wycięcia dalej - i własny kolor (jak na szkicu): głębokość A/B na
  // czerwono, wycięcie A na pomarańczowo, wycięcie B na zielono, Ramię A/B
  // (wynikowe) w neutralnym granacie.
  const laneGap = margin * 0.16; // odległość linii pierwszego pasa od obrysu
  const laneStep = margin * 0.42; // odległość między pasami (gdy są 2 na tym samym boku)
  // Odstęp TEKSTU od jego własnej linii - musi być wyraźnie większy niż
  // sama wysokość czcionki, bo polskie litery z ogonkami (ę, ą) mają
  // description sięgający niżej niż zwykłe descendery, a przy zbyt małym
  // odstępie linia zdawała się "przekreślać" tekst (zgłoszony bug, drugi
  // raz - poprzedni odstęp 0.35-0.9×fsSmall wciąż był za mały).
  const textGap = fsSmall * 1.3;

  const dimH = (x1, x2, y, label, color, textSide) => {
    let s = `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="${strokeThick}" />`;
    const ty = y + (textSide === 'below' ? textGap : -textGap);
    s += `<text x="${(x1 + x2) / 2}" y="${ty}" font-size="${fsSmall}" fill="${color}" font-weight="bold" text-anchor="middle">${label}</text>`;
    return s;
  };
  const dimV = (y1, y2, x, label, color, textSide) => {
    let s = `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="${strokeThick}" />`;
    const ty = (y1 + y2) / 2;
    const tx = x + (textSide === 'left' ? -textGap : textGap);
    s += `<text x="${tx}" y="${ty}" font-size="${fsSmall}" fill="${color}" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${tx} ${ty})">${label}</text>`;
    return s;
  };

  const COLOR_LEG = '#1e3a8a';
  const COLOR_DEPTH = '#dc2626';
  const COLOR_CUT_A = '#d97706';
  const COLOR_CUT_B = '#16a34a';

  // Góra: Ramię A (cały korpus, 1:1 z konfiguratorem)
  svg += dimH(ox, ox + legA, oy - laneGap, `Ramię A: ${fmtMm(legA)} mm`, COLOR_LEG);
  // Lewo: Ramię B (cały korpus, 1:1 z konfiguratorem)
  svg += dimV(oy, oy + legB, ox - laneGap, `Ramię B: ${fmtMm(legB)} mm`, COLOR_LEG, 'left');

  // Prawo, dwa oddzielne pasy (bliższy = głębokość A, dalszy = wycięcie B) -
  // NIE łańcuchowo/stykająco się, każdy ma własny odstęp od obrysu, żeby ich
  // linie/etykiety się nie stykały.
  svg += dimV(oy, oy + depthA, ox + legA + laneGap, `Głęb. A: ${fmtMm(depthA)} mm`, COLOR_DEPTH, 'right');
  if (cutH > 0) {
    svg += dimV(oy + depthA, oy + legB, ox + legA + laneGap + laneStep, `Wycięcie B: ${fmtMm(cutH)} mm`, COLOR_CUT_B, 'right');
  }

  // Dół, tak samo dwa oddzielne pasy (bliższy = głębokość B, dalszy = wycięcie A).
  svg += dimH(ox, ox + depthB, oy + legB + laneGap, `Głęb. B: ${fmtMm(depthB)} mm`, COLOR_DEPTH, 'below');
  if (cutW > 0) {
    svg += dimH(ox + depthB, ox + legA, oy + legB + laneGap + laneStep, `Wycięcie A: ${fmtMm(cutW)} mm`, COLOR_CUT_A, 'below');
  }

  svg += `</svg>`;
  return svg;
}
