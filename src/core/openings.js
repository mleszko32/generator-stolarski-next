// src/core/openings.js
//
// Okna, drzwi i inne przeszkody na ścianach pomieszczenia (project.openings).
// Położenie: ściana + `u` = odległość lewej krawędzi od lewego końca ściany
// PATRZĄC OD ŚRODKA POKOJU (ta sama współrzędna co w core/walls.js), szerokość,
// wysokość i `sill` = wysokość dolnej krawędzi nad podłogą. Czysta logika bez
// DOM/Three.js: rysują ją render/wallElevations.js i render/viewer3d.js,
// a kolizje z szafkami sprawdza core/validate.js.
export const OPENING_KINDS = {
  okno: { label: "Okno", width: 1200, height: 1400, sill: 900 },
  drzwi: { label: "Drzwi", width: 900, height: 2050, sill: 0 },
  inne: { label: "Przeszkoda", width: 300, height: 300, sill: 1000 },
};

export const OPENING_WALLS = [
  { id: "tyl", label: "Ściana tylna" },
  { id: "prawa", label: "Ściana prawa" },
  { id: "przednia", label: "Ściana przednia" },
  { id: "lewa", label: "Ściana lewa" },
];

const WALL_IDS = OPENING_WALLS.map((w) => w.id);
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export function newOpening(kind = "okno", wall = "tyl") {
  const k = OPENING_KINDS[kind] || OPENING_KINDS.okno;
  return {
    id: "op-" + Date.now() + Math.random().toString(36).slice(2, 6),
    kind: OPENING_KINDS[kind] ? kind : "okno",
    wall: WALL_IDS.includes(wall) ? wall : "tyl",
    u: 500,
    width: k.width,
    height: k.height,
    sill: k.sill,
  };
}

// Znormalizowana lista przeszkód projektu (odporna na brak pola / złe wartości).
export function getOpenings(project) {
  const list = Array.isArray(project && project.openings) ? project.openings : [];
  return list
    .filter((o) => o && WALL_IDS.includes(o.wall))
    .map((o) => ({
      id: o.id,
      kind: OPENING_KINDS[o.kind] ? o.kind : "okno",
      wall: o.wall,
      u: num(o.u),
      width: Math.max(1, num(o.width, 1)),
      height: Math.max(1, num(o.height, 1)),
      sill: Math.max(0, num(o.sill)),
    }));
}

// Narzędnik do komunikatów: "koliduje z oknem / drzwiami / przeszkodą".
const INSTRUMENTAL = { okno: "oknem", drzwi: "drzwiami", inne: "przeszkodą" };
export function openingInstrumental(op) {
  return INSTRUMENTAL[op.kind] || INSTRUMENTAL.okno;
}

// Miejscownik ściany: "na ścianie tylnej".
export const WALL_LOCATIVE = { tyl: "ścianie tylnej", prawa: "ścianie prawej", przednia: "ścianie przedniej", lewa: "ścianie lewej" };

// Bryła do narysowania w 3D: cienki prostopadłościan przy wewnętrznej licu ściany.
// Układ pokoju jak w render/viewer3d.js: tylna z=0, przednia z=D, lewa x=0, prawa x=W;
// normal = kierunek na zewnątrz pokoju (dla przygaszania razem ze ścianą).
export function openingBox(op, room, thickness = 8) {
  const W = num(room.width), D = num(room.depth);
  const cy = op.sill + op.height / 2;
  const t = thickness;
  switch (op.wall) {
    case "tyl":
      return { cx: op.u + op.width / 2, cy, cz: t / 2, sx: op.width, sy: op.height, sz: t, normal: [0, 0, -1] };
    case "przednia":
      return { cx: W - op.u - op.width / 2, cy, cz: D - t / 2, sx: op.width, sy: op.height, sz: t, normal: [0, 0, 1] };
    case "lewa":
      return { cx: t / 2, cy, cz: D - op.u - op.width / 2, sx: t, sy: op.height, sz: op.width, normal: [-1, 0, 0] };
    default: // prawa
      return { cx: W - t / 2, cy, cz: op.u + op.width / 2, sx: t, sy: op.height, sz: op.width, normal: [1, 0, 0] };
  }
}
