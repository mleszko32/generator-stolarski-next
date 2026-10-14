// src/core/slopeNiche.js
//
// Zabudowa wnęki pod skosem rzędem szafek (np. poddasze: niska ściana kolanowa z
// lewej, skos, potem płaski sufit). Dwa kształty (niche.shape):
//  'skos'      - szafka pod skosem to szafka pod skos (core/slopeCabinet.js, trapez):
//                niski bok = sufit nad lewą krawędzią minus luz, wysoki = nad prawą
//                (wysokości od podłogi - korpus jest niższy o nóżki);
//                szafki pod płaskim sufitem i z siedziskiem zostają prostokątne,
//  'prostokat' - schodki: każda szafka to zwykły słupek / szafka dolna o wysokości z
//                najniższego punktu sufitu nad nią minus luz. Ustawienia trzymamy w project.slopeNiche, więc po
// pomiarze na miejscu wystarczy zmienić liczby wnęki i przeliczyć zabudowę.
//
// Wnętrze szafek budują funkcje edytora wnętrza (core/zoneTree.js: półki stałe na
// całą szerokość, fronty przez assignFront), więc wynik da się dalej edytować tak
// samo jak ręcznie zrobioną szafkę.
import { createModuleObject } from "./state.js";
import { buildZoneTree, getCabinetInnerRect, assignFront, addEvenShelves } from "./zoneTree.js";
import { getWorktopSettings } from "./worktops.js";
import { num } from "../utils/math.js";

// Sekcje od dołu: { type, count (szuflady), h (docelowa wysokość wnęki), upTo (wierzch
// półki nad wnęką, mm od podłogi), shelves (półki ruchome w środku), rod (drążek, mm
// od podłogi) }. Ostatnia sekcja dostaje resztę wysokości korpusu.
// type: 'szuflady' | 'drzwi' | 'drzwi-lp' | 'otwarta'.
export const DEFAULT_SLOPE_NICHE = {
  width: 3300,        // szerokość wnęki
  depth: 700,         // głębokość wnęki
  carcaseDepth: 650,  // głębokość korpusów
  leftHeight: 1100,   // wysokość ściany kolanowej (x = 0)
  slopeRun: 2500,     // odległość od lewej, na której skos dochodzi do sufitu
  ceilingHeight: 2460,// wysokość płaskiego sufitu
  clearance: 50,      // luz między szafką a skosem
  roundTo: 1,         // zaokrąglenie wysokości szafki w dół (mm)
  shape: 'skos',      // 'skos' (szafki pod skos) | 'prostokat' (schodki)
  modules: [
    { key: 'A', width: 600, seat: true, sections: [{ type: 'szuflady', count: 3 }] },
    { key: 'B', width: 600, sections: [{ type: 'szuflady', count: 3, h: 1020 }, { type: 'otwarta' }] },
    { key: 'C', width: 600, sections: [{ type: 'szuflady', count: 2, h: 680 }, { type: 'otwarta', shelves: 2 }] },
    { key: 'D', width: 700, sections: [{ type: 'szuflady', count: 2, h: 680 }, { type: 'drzwi-lp', shelves: 4 }] },
    { key: 'E', width: 800, sections: [{ type: 'szuflady', count: 2, h: 680 }, { type: 'drzwi-lp', upTo: 2000, rod: 1900 }, { type: 'drzwi-lp' }] },
  ],
};

const SECTION_TYPES = ['szuflady', 'drzwi', 'drzwi-lp', 'otwarta'];

// Ustawienia wnęki z projektu scalone z domyślnymi (głęboka kopia - edycja w oknie nie
// rusza DEFAULT_SLOPE_NICHE).
export function getSlopeNicheSettings(project) {
  const saved = (project && project.slopeNiche) || {};
  const base = JSON.parse(JSON.stringify(DEFAULT_SLOPE_NICHE));
  const s = { ...base, ...saved };
  s.modules = Array.isArray(saved.modules) && saved.modules.length ? JSON.parse(JSON.stringify(saved.modules)) : base.modules;
  return s;
}

// Wysokość sufitu wnęki w odległości x od lewej ściany: liniowo od leftHeight do
// ceilingHeight na odcinku slopeRun, dalej płasko.
export function ceilingAt(niche, x) {
  const run = num(niche.slopeRun);
  const h0 = num(niche.leftHeight), h1 = num(niche.ceilingHeight);
  if (run <= 0 || x >= run) return h1;
  if (x <= 0) return h0;
  return h0 + (h1 - h0) * (x / run);
}

// Najniższy punkt sufitu nad odcinkiem [x0, x1] (sufit może też opadać, gdy ktoś wpisze
// ceilingHeight < leftHeight - wtedy rozstrzyga prawa krawędź).
export function minCeiling(niche, x0, x1) {
  let m = Math.min(ceilingAt(niche, x0), ceilingAt(niche, x1));
  const run = num(niche.slopeRun);
  if (run > x0 && run < x1) m = Math.min(m, ceilingAt(niche, run));
  return m;
}

// Rozmieszczenie szafek od lewej: x, szerokość i wysokość całkowita od podłogi.
export function nicheModuleSlots(niche) {
  const step = Math.max(1, num(niche.roundTo, 1) || 1);
  let x = 0;
  return (niche.modules || []).map((m) => {
    const width = Math.max(150, num(m.width, 600));
    const ceiling = minCeiling(niche, x, x + width);
    const down = (c) => Math.floor((c - num(niche.clearance)) / step) * step;
    const height = down(ceiling);
    const cL = ceilingAt(niche, x), cR = ceilingAt(niche, x + width);
    // Szafka pod skos tylko pod rosnącym skosem (cięciwa sufitu wklęsłego leży pod nim)
    // i bez siedziska (siedzisko musi być poziome).
    const slope = niche.shape !== 'prostokat' && !m.seat && cR - cL >= 20;
    const slot = { key: m.key, x, width, ceiling, height, slope, heightLow: down(cL), heightHigh: slope ? down(cR) : height };
    x += width;
    return slot;
  });
}

// Szerokość szafek minus szerokość wnęki (> 0 = nie mieszczą się, < 0 = zostaje luz).
export function nicheWidthDiff(niche) {
  return (niche.modules || []).reduce((s, m) => s + num(m.width), 0) - num(niche.width);
}

// Wysokości wnęk (światło) sekcji w korpusie: stałe h / upTo, reszta dla sekcji bez
// wymiaru (ostatniej). Gdy stałe się nie mieszczą, skalujemy je proporcjonalnie.
export function sectionHeights(sections, innerH, th, baseY) {
  const n = sections.length;
  const free = innerH - th * (n - 1);
  const out = new Array(n).fill(0);
  let y = baseY + th; // spód bieżącej wnęki, mm od podłogi
  let used = 0;
  for (let i = 0; i < n - 1; i++) {
    const sec = sections[i];
    // upTo = wierzch półki nad sekcją od podłogi, więc zależy od sekcji pod spodem.
    const h = Math.max(0, num(sec.h) > 0 ? num(sec.h) : num(sec.upTo) > 0 ? num(sec.upTo) - th - y : free / n);
    out[i] = h;
    used += h;
    y += h + th;
  }
  out[n - 1] = free - used;
  const MIN = 80;
  if (n > 1 && out[n - 1] < MIN) {
    // Nie mieści się - skalujemy sekcje pod spodem, ostatnia dostaje MIN (albo równy podział).
    const target = Math.max(MIN, free / n);
    const k = (free - target) / used;
    for (let i = 0; i < n - 1; i++) out[i] *= k;
    out[n - 1] = target;
  }
  return out;
}

// Szafki zabudowy (bez dodawania do projektu). Każda dostaje slopeNiche = klucz, żeby
// ponowne przeliczenie wiedziało, które szafki zastąpić. Wymaga state.project z
// ustawieniami płyty (getCabinetInnerRect / assignFront czytają state).
export function buildSlopeNicheModules(niche, project) {
  const th = num(project.materials && project.materials.boardThickness, 18) || 18;
  const worktop = getWorktopSettings(project);
  const slots = nicheModuleSlots(niche);
  return (niche.modules || []).map((spec, idx) => {
    const slot = slots[idx];
    const seat = !!spec.seat;
    const mod = slot.slope ? slopeModuleObject(slot) : createModuleObject(seat ? 'base_cabinet' : 'tall_cabinet');
    mod.id = 'mod-' + Date.now().toString(36) + idx + Math.random().toString(36).slice(2, 6);
    mod.name = `Wnęka ${spec.key}`;
    mod.slopeNiche = spec.key;
    // Wszystkie szafki zabudowy na tych samych nóżkach z cokołem (jak dolne w kuchni),
    // żeby szuflady w sąsiednich szafkach były w jednej linii.
    mod.legs = createModuleObject('tall_cabinet').legs;
    const legH = mod.legs.active ? num(mod.legs.height, 100) : 0;
    const seatTh = seat ? num(worktop.thickness, 38) : 0;
    const H = Math.max(200, slot.heightHigh - legH - seatTh);
    mod.dimensions = { width: slot.width, height: H, depth: num(niche.carcaseDepth, 650) };
    if (slot.slope) mod.slope.lowHeight = Math.max(0, slot.heightLow - legH);
    mod.position = { x: slot.x, y: 0, z: 0 };

    const sections = (spec.sections || []).filter((s) => SECTION_TYPES.includes(s.type));
    if (!sections.length) sections.push({ type: 'drzwi-lp' });
    const inner = getCabinetInnerRect(mod);
    const heights = sectionHeights(sections, inner.maxY - inner.minY, th, legH);

    // Półki stałe między sekcjami (pełna szerokość wnętrza - założenie core/zoneTree.js).
    let y = inner.minY;
    heights.forEach((h, i) => {
      y += h;
      if (i < heights.length - 1) {
        mod.elements.push({ id: `poziom-${spec.key}-${i}-${Math.random().toString(36).slice(2, 7)}`, typ: 'poziom', x: inner.minX, y: Math.round(y * 10) / 10, w: inner.maxX - inner.minX, h: th, isStructural: true });
        y += th;
      }
    });

    // Wnęki od dołu (kolumna liści drzewa) -> fronty / półki / drążek.
    const leaves = [];
    (function walk(n) { if (n.type === 'leaf') leaves.push(n); else { walk(n.a); walk(n.b); } })(buildZoneTree(mod));
    leaves.sort((a, b) => a.rect.minY - b.rect.minY);
    sections.forEach((sec, i) => {
      const leaf = leaves[i];
      if (!leaf) return;
      if (sec.type === 'szuflady') assignFront(mod, leaf, 'szuflada', { distribution: String(Math.max(1, Math.round(num(sec.count, 1)))) });
      else if (sec.type === 'drzwi' || sec.type === 'drzwi-lp') assignFront(mod, leaf, sec.type);
      // Front zostaje na poddrzewie z półkami (zoneTree: front na węźle 'split').
      const shelves = Math.round(num(sec.shelves));
      if (shelves > 0) addEvenShelves(mod, leaf, shelves);
      if (num(sec.rod) > 0) mod.wardrobeRod = { y: Math.round((num(sec.rod) - legH) * 10) / 10 };
    });
    return mod;
  });
}

// Pusta szafka pod skos (trapez, niski bok z lewej) - pola jak w addSlopeModule; nóżki,
// wysokości i lowHeight (korpusu, bez nóżek) ustawia buildSlopeNicheModules.
function slopeModuleObject(slot) {
  return {
    type: 'slope_cabinet',
    rotation: 0,
    backPanel: { type: "nakladane", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 },
    legs: { active: false, height: 100, plinth: false, plinthOffset: 40 },
    front: {},
    slope: { lowSide: 'left', lowHeight: slot.heightLow, drawerBox: 'A' },
    elements: [],
  };
}

// Wstawia (albo przelicza) zabudowę w projekcie: usuwa szafki poprzedniej zabudowy
// (pole slopeNiche), dokłada nowe, zapisuje ustawienia wnęki, powiększa pokój, jeśli wnęka
// się w nim nie mieści, i włącza blaty (siedzisko) z głębokością wnęki, gdy były wyłączone.
// Zwraca liczbę usuniętych szafek.
export function applySlopeNiche(project, niche, modules) {
  const before = project.modules.length;
  project.modules = project.modules.filter((m) => !m.slopeNiche);
  const removed = before - project.modules.length;
  project.modules.push(...modules);
  project.slopeNiche = JSON.parse(JSON.stringify(niche));
  const room = project.room || (project.room = {});
  room.width = Math.max(num(room.width), num(niche.width));
  room.depth = Math.max(num(room.depth), num(niche.depth));
  room.height = Math.max(num(room.height), num(niche.leftHeight), num(niche.ceilingHeight));
  if ((niche.modules || []).some((m) => m.seat) && !(project.worktop && project.worktop.enabled)) {
    project.worktop = { ...(project.worktop || {}), enabled: true, depth: num(niche.depth, 600) };
  }
  return removed;
}

// Długość drążka garderobowego (światło między bokami minus luz na wsporniki).
export function wardrobeRodLength(mod, th = 18) {
  return Math.max(0, num(mod.dimensions && mod.dimensions.width) - 2 * th - 2);
}
