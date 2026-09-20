// src/core/worktops.js
//
// Blaty kuchenne nad rzędami szafek dolnych. Blat układany jest od ściany na 0 (tył
// blatu przy ścianie) i ma stałą głębokość (domyślnie 600 mm), więc nawis z
// przodu wynika z głębokości szafek pod spodem. Rzędy wykrywamy z rzutów ścian
// (core/walls.js): ciągłe szafki dolne/narożne przy tej samej ścianie, z
// tolerancją szczeliny. W narożniku (dwa rzędy dochodzą do tego samego rogu
// pokoju) jeden blat idzie do ściany, drugi jest skrócony o głębokość pierwszego
// - łączenie kątowe 90° (w warsztacie wykonywane frezem "na łyżwę"). Długie ściany
// dzielimy na kawałki mieszczące się w płycie 4100 mm, a kawałki układamy w płytach
// 4100/2050 mm (cięcie liniowe).
import { state } from "./state.js";
import { computeWallLayouts } from "./walls.js";
import { getWorldFootprint } from "./layout.js";

export const WORKTOP_DEFAULTS = {
  enabled: false,
  thickness: 38,
  depth: 600,
  gapTolerance: 10,   // szczelina w rzędzie / od ściany traktowana jako ciągłość
  sideStart: 0,       // wysunięcie blatu poza pierwszą szafkę rzędu (mm)
  sideEnd: 0,
  joint: 'lyzwa',     // 'lyzwa' | 'styk'
  stockLength: 4100,
  halfLength: 2050,
  kerf: 3,
  minPiece: 500,      // najkrótszy kawałek przy dzieleniu długiej ściany
  overrides: {},      // per kawałek: { disabled, length, depth, thickness, start }
  corners: {},        // per narożnik: { through: 'tyl' | ... } - który blat idzie do ściany
};

export function getWorktopSettings(project = state.project) {
  return { ...WORKTOP_DEFAULTS, ...(project.worktop || {}), overrides: { ...(project.worktop?.overrides || {}) }, corners: { ...(project.worktop?.corners || {}) } };
}

export function ensureWorktopDefaults(project) {
  project.worktop = getWorktopSettings(project);
  return project.worktop;
}

const BASE_TYPES = ['base_cabinet', 'corner_cabinet'];
const HANG_MIN = 600;

// [ściana1, koniec1, ściana2, koniec2] - narożniki pokoju, gdzie stykają się ściany
// (patrz core/walls.js: u ściany tylnej=x, prawej=z, przedniej=W-x, lewej=D-z).
const CORNERS = [
  ['tyl', 'low', 'lewa', 'high'],
  ['tyl', 'high', 'prawa', 'low'],
  ['przednia', 'low', 'prawa', 'high'],
  ['przednia', 'high', 'lewa', 'low'],
];

const WALL_LABEL = { tyl: 'tylna', prawa: 'prawa', przednia: 'przednia', lewa: 'lewa' };

// Boki dokładane (state.project.sidePanels) stojące przy ścianie: blat ma je przykrywać
// razem z szafkami. Zwraca przedziały { u0, u1 } w układzie u danej ściany.
function sidePanelIntervals(project, room, wallId, tol) {
  const out = [];
  (project.sidePanels || []).forEach(p => {
    const { worldW, worldD } = getWorldFootprint(p);
    const x = parseFloat(p.position?.x) || 0, z = parseFloat(p.position?.z) || 0;
    const y0 = parseFloat(p.position?.y) || 0;
    if (y0 >= HANG_MIN) return;
    let at, u;
    if (wallId === 'tyl') { at = z; u = [x, x + worldW]; }
    else if (wallId === 'przednia') { at = room.depth - (z + worldD); u = [room.width - (x + worldW), room.width - x]; }
    else if (wallId === 'prawa') { at = room.width - (x + worldW); u = [z, z + worldD]; }
    else { at = x; u = [room.depth - (z + worldD), room.depth - z]; }
    if (at <= tol) out.push({ u0: u[0], u1: u[1] });
  });
  return out;
}

function buildRuns(wall, s, panels = []) {
  const items = wall.items
    .filter(it => BASE_TYPES.includes(it.mod.type) && it.y0 < HANG_MIN && it.mod.worktop !== false)
    .concat(panels.map(p => ({ ...p, panel: true, y1: 0, items: [] })))
    .sort((a, b) => a.u0 - b.u0);
  const runs = [];
  items.forEach(it => {
    const last = runs[runs.length - 1];
    if (last && it.u0 - last.u1 <= s.gapTolerance) {
      last.u1 = Math.max(last.u1, it.u1);
      last.y1 = Math.max(last.y1, it.y1);
      last.items.push(it);
    } else {
      runs.push({ u0: it.u0, u1: it.u1, y1: it.y1, items: [it] });
    }
  });
  // sam bok dokładany bez szafki nie dostaje blatu
  return runs.filter(r => r.items.some(it => !it.panel));
}

// Prostokąt blatu w rzucie z góry (układ świata, mm) dla rzędu/kawałka { wallId, u0, u1, depth }.
export function rectOf(p, room) {
  if (p.wallId === 'tyl') return { x0: p.u0, x1: p.u1, z0: 0, z1: p.depth };
  if (p.wallId === 'przednia') return { x0: room.width - p.u1, x1: room.width - p.u0, z0: room.depth - p.depth, z1: room.depth };
  if (p.wallId === 'prawa') return { x0: room.width - p.depth, x1: room.width, z0: p.u0, z1: p.u1 };
  return { x0: 0, x1: p.depth, z0: room.depth - p.u1, z1: room.depth - p.u0 };
}

// Wynik: { settings, pieces, plan } - pieces to kawałki po podziale na płyty (parts),
// runs to bazowe blaty (przed podziałem), plan = plan cięcia.
export function computeWorktops(project = state.project) {
  const s = getWorktopSettings(project);
  const { room, walls } = computeWallLayouts(project);
  const runsByWall = {};

  walls.forEach(w => {
    const L = w.length;
    runsByWall[w.id] = buildRuns(w, s, sidePanelIntervals(project, room, w.id, s.gapTolerance)).map((r, index) => {
      let u0 = r.u0 - s.sideStart, u1 = r.u1 + s.sideEnd;
      // blat idzie od ściany na 0: koniec rzędu bliski ścianie dochodzi do ściany
      if (r.u0 <= s.gapTolerance) u0 = 0;
      if (L - r.u1 <= s.gapTolerance) u1 = L;
      u0 = Math.max(0, u0); u1 = Math.min(L, u1);
      return {
        key: `${w.id}:${index}`, wallId: w.id, wallLabel: WALL_LABEL[w.id], wallLength: L,
        u0, u1, y: r.y1, depth: s.depth, thickness: s.thickness,
        touchLow: u0 <= 0.5, touchHigh: u1 >= L - 0.5, items: r.items, joins: [],
      };
    });
  });

  // nadpisania użytkownika (długość/początek/głębokość/grubość, pominięcie)
  const runs = [];
  Object.values(runsByWall).flat().forEach(r => {
    const ov = s.overrides[r.key] || {};
    if (ov.disabled) return;
    if (ov.start !== undefined && ov.start !== '') r.u0 = parseFloat(ov.start);
    if (ov.length !== undefined && ov.length !== '') r.u1 = r.u0 + parseFloat(ov.length);
    if (ov.depth !== undefined && ov.depth !== '') r.depth = parseFloat(ov.depth);
    if (ov.thickness !== undefined && ov.thickness !== '') r.thickness = parseFloat(ov.thickness);
    if (r.u1 - r.u0 <= 0) return;
    r.base = { u0: r.u0, u1: r.u1 };   // położenie przed złączami (do przesuwania)
    runs.push(r);
  });

  // złącza: dwa blaty na prostopadłych ścianach, które na siebie zachodzą lub się
  // stykają w planie. Jeden ("przez") zostaje cały, drugi jest skrócony do jego
  // krawędzi (kątowe złącze 90°, w warsztacie "na łyżwę"). Wybór: s.corners[klucz].through
  // = id ściany, której blat idzie przez; domyślnie blat dochodzący do ściany
  // drugiego, a gdy oba lub żaden - dłuższy. Bez tego blaty nachodziłyby na siebie.
  const corners = [];
  const seen = new Set();
  const horizontal = runs.filter(r => r.wallId === 'tyl' || r.wallId === 'przednia');
  const vertical = runs.filter(r => r.wallId === 'lewa' || r.wallId === 'prawa');
  const tol = Math.max(s.gapTolerance, 0.5);
  const sepOf = (r) => rectOf(r, room);
  horizontal.forEach(a => vertical.forEach(b => {
    const ra = sepOf(a), rb = sepOf(b);
    const ox = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
    const oz = Math.min(ra.z1, rb.z1) - Math.max(ra.z0, rb.z0);
    if (ox < -tol || oz < -tol) return;              // za daleko, żeby się łączyć
    if (ox <= 0.5 && oz <= 0.5) return;               // tylko styk narożnikami
    const key = `${a.wallId}-${b.wallId}`;
    const aTouches = b.wallId === 'lewa' ? ra.x0 <= 0.5 : ra.x1 >= room.width - 0.5;
    const bTouches = a.wallId === 'tyl' ? rb.z0 <= 0.5 : rb.z1 >= room.depth - 0.5;
    const forced = s.corners[key]?.through;
    let throughFirst;
    if (forced === a.wallId) throughFirst = true;
    else if (forced === b.wallId) throughFirst = false;
    else if (aTouches !== bTouches) throughFirst = aTouches;
    else throughFirst = (a.u1 - a.u0) >= (b.u1 - b.u0);
    const through = throughFirst ? a : b;
    const other = throughFirst ? b : a;
    const rt = rectOf(through, room);
    // przytnij drugi blat do krawędzi pierwszego (tylko gdy zachodzą na siebie)
    const ro = rectOf(other, room);
    const cx0 = Math.max(rt.x0, ro.x0), cx1 = Math.min(rt.x1, ro.x1);
    const cz0 = Math.max(rt.z0, ro.z0), cz1 = Math.min(rt.z1, ro.z1);
    const toU = other.wallId === 'tyl' ? (x0, x1) => [x0, x1]
      : other.wallId === 'przednia' ? (x0, x1) => [room.width - x1, room.width - x0]
      : other.wallId === 'prawa' ? (z0, z1) => [z0, z1]
      : (z0, z1) => [room.depth - z1, room.depth - z0];
    const horiz = other.wallId === 'tyl' || other.wallId === 'przednia';
    if (cx1 - cx0 > 0.5 && cz1 - cz0 > 0.5) {
      const [c0, c1] = horiz ? toU(cx0, cx1) : toU(cz0, cz1);
      if (c0 <= other.u0 + 0.5 && c1 < other.u1) other.u0 = c1;
      else if (c1 >= other.u1 - 0.5 && c0 > other.u0) other.u1 = c0;
    }
    const joint = s.corners[key]?.joint || s.joint;
    through.joins.push({ corner: key, role: 'przez', with: other.wallLabel, joint });
    other.joins.push({ corner: key, role: 'skrócony', with: through.wallLabel, joint });
    if (!seen.has(key)) {
      seen.add(key);
      const rn = rectOf(other, room);
      // szew: krawędź drugiego blatu zwrócona do pierwszego
      let seam;
      if (horiz) {
        const near = (e) => Math.abs(e - Math.min(Math.max(e, rt.x0), rt.x1));
        const x = near(rn.x0) <= near(rn.x1) ? rn.x0 : rn.x1;
        seam = { x0: x, x1: x, z0: rn.z0, z1: rn.z1 };
      } else {
        const near = (e) => Math.abs(e - Math.min(Math.max(e, rt.z0), rt.z1));
        const z = near(rn.z0) <= near(rn.z1) ? rn.z0 : rn.z1;
        seam = { x0: rn.x0, x1: rn.x1, z0: z, z1: z };
      }
      corners.push({ key, walls: [a.wallId, b.wallId], through: through.wallId, joint, seam });
    }
  }));
  runs.forEach(r => { r.length = Math.max(0, r.u1 - r.u0); });

  const pieces = [];
  runs.forEach(r => {
    const chunks = splitLength(r.length, s.stockLength, s.minPiece);
    let cursor = r.u0;
    chunks.forEach((len, i) => {
      pieces.push({
        key: r.key, part: i + 1, parts: chunks.length, wallId: r.wallId, wallLabel: r.wallLabel,
        u0: cursor, u1: cursor + len, length: len, depth: r.depth, thickness: r.thickness, y: r.y,
        joins: r.joins, seam: chunks.length > 1, base: r.base,
      });
      cursor += len;
    });
  });

  return { settings: s, room, runs, pieces, corners, plan: planStock(pieces, s) };
}

// Dzieli długość na kawałki nie dłuższe niż max: pełne płyty + reszta; jeśli reszta jest
// krótsza niż minPiece, dzieli równo, żeby nie robić kawałka-wiórka.
export function splitLength(len, max, minPiece) {
  if (len <= max) return [len];
  const n = Math.ceil(len / max);
  const rest = len - max * (n - 1);
  if (rest >= minPiece) return [...Array(n - 1).fill(max), rest];
  const each = len / n;
  return Array(n).fill(each);
}

// Cięcie liniowe: kawałki układane w płytach 4100 mm (kerf między kawałkami); płyta,
// z której zużyto nie więcej niż połowę, jest kupowana jako połówka 2050 mm.
// Grupy wg (głębokość × grubość), bo płyta ma stałą szerokość.
export function planStock(pieces, s) {
  const groups = new Map();
  pieces.forEach(p => {
    const k = `${p.depth}x${p.thickness}`;
    if (!groups.has(k)) groups.set(k, { depth: p.depth, thickness: p.thickness, pieces: [] });
    groups.get(k).pieces.push(p);
  });

  const out = [];
  let full = 0, half = 0, wasteMm = 0, oversize = [];
  groups.forEach(g => {
    const sorted = g.pieces.slice().sort((a, b) => b.length - a.length);
    const bins = [];
    sorted.forEach(p => {
      if (p.length > s.stockLength + 0.5) { oversize.push(p); return; }
      const bin = bins.find(b => b.used + (b.used > 0 ? s.kerf : 0) + p.length <= s.stockLength + 0.01);
      if (bin) { bin.used += (bin.used > 0 ? s.kerf : 0) + p.length; bin.items.push(p); }
      else bins.push({ used: p.length, items: [p] });
    });
    bins.forEach(b => {
      const size = b.used <= s.halfLength ? s.halfLength : s.stockLength;
      if (size === s.halfLength) half++; else full++;
      wasteMm += size - b.used;
      out.push({ depth: g.depth, thickness: g.thickness, size, used: b.used, waste: size - b.used, items: b.items });
    });
  });
  return { stocks: out, fullCount: full, halfCount: half, wasteMm, oversize };
}

// Formatki blatów do listy formatek (category "Blat"): długość × głębokość, w nazwie
// grubość, ściana i łączenie.
export function getWorktopParts(project = state.project) {
  const { settings, pieces } = computeWorktops(project);
  if (!settings.enabled) return [];
  return pieces.map(p => {
    const join = p.joins.length
      ? ` - ${p.joins.map(j => `${j.joint === 'lyzwa' ? 'łyżwa' : 'na styk'} ${j.role} (ściana ${j.with})`).join(', ')}`
      : '';
    const seam = p.seam ? ` (kawałek ${p.part}/${p.parts})` : '';
    return {
      name: `Blat ${p.thickness} mm - ściana ${p.wallLabel}${seam}${join}`,
      length: parseFloat(p.length.toFixed(1)),
      width: parseFloat(p.depth.toFixed(1)),
      qty: 1,
      category: 'Blat',
      moduleName: 'Blaty',
    };
  });
}

// Bryły blatów w układzie świata (mm): { x0,x1,y0,y1,z0,z1 } do renderu 3D.
export function worktopBoxes(project = state.project) {
  const { settings, pieces, room } = computeWorktops(project);
  if (!settings.enabled) return [];
  return pieces.map(p => {
    const { x0, x1, z0, z1 } = rectOf(p, room);
    return { x0, x1, y0: p.y, y1: p.y + p.thickness, z0, z1, piece: p };
  });
}
