// src/core/roomShape.js
//
// Kształt pomieszczenia: prostokąt width × depth, opcjonalnie z prostokątnym wcięciem
// w jednym narożniku (pokój w kształcie L) - `room.notch = { corner, width, depth }`.
// `corner`: 'tyl-lewy' (narożnik x=0, z=0) | 'tyl-prawy' | 'przod-prawy' | 'przod-lewy';
// `width` wzdłuż osi X, `depth` wzdłuż osi Z. Wcięcie to obszar POZA pokojem (np. ściana
// za szafą wnękową). Czyste funkcje - korzystają z nich 3D (ściany), okno pokoju,
// kontrola projektu i miniplan rzutów ścian.
import { num } from "../utils/math.js";

export const NOTCH_CORNERS = [
  { id: "tyl-lewy", label: "Tylny lewy" },
  { id: "tyl-prawy", label: "Tylny prawy" },
  { id: "przod-prawy", label: "Przedni prawy" },
  { id: "przod-lewy", label: "Przedni lewy" },
];

const TOL = 0.5;

// Prostokąt wcięcia { x0, x1, z0, z1 } albo null (brak, zerowe albo zajmujące cały pokój).
export function roomNotch(room) {
  const n = room?.notch;
  if (!n || !NOTCH_CORNERS.some((c) => c.id === n.corner)) return null;
  const W = num(room.width), D = num(room.depth);
  const w = Math.min(num(n.width), W), d = Math.min(num(n.depth), D);
  if (!(w > 0) || !(d > 0) || w >= W || d >= D) return null;
  const left = n.corner.endsWith("lewy"), back = n.corner.startsWith("tyl");
  return {
    x0: left ? 0 : W - w, x1: left ? w : W,
    z0: back ? 0 : D - d, z1: back ? d : D,
  };
}

// Wierzchołki obrysu [[x, z], ...] w kolejności (0,0) → (W,0) → (W,D) → (0,D).
export function roomPolygon(room) {
  const W = num(room.width), D = num(room.depth);
  const n = roomNotch(room);
  const c = n && room.notch.corner;
  const w = n ? n.x1 - n.x0 : 0, d = n ? n.z1 - n.z0 : 0;
  const pts = [];
  if (c === "tyl-lewy") pts.push([0, d], [w, d], [w, 0]); else pts.push([0, 0]);
  if (c === "tyl-prawy") pts.push([W - w, 0], [W - w, d], [W, d]); else pts.push([W, 0]);
  if (c === "przod-prawy") pts.push([W, D - d], [W - w, D - d], [W - w, D]); else pts.push([W, D]);
  if (c === "przod-lewy") pts.push([w, D], [w, D - d], [0, D - d]); else pts.push([0, D]);
  return pts;
}

// Odcinki ścian: { a: [x,z], b: [x,z], length, normal: [nx, nz] (na zewnątrz pokoju),
// extA, extB } - ext = czy koniec jest narożnikiem wypukłym (tam bryła ściany wydłuża się
// o grubość, żeby narożnik był pełny; we wklęsłym nie, żeby nie wchodziła do pokoju).
export function roomWalls(room) {
  const pts = roomPolygon(room);
  const n = pts.length;
  const dir = (i) => {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const convexAt = (i) => { // wierzchołek i między krawędzią i-1 a i
    const d1 = dir((i - 1 + n) % n), d2 = dir(i);
    return d1[0] * d2[1] - d1[1] * d2[0] > 0;
  };
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const [dx, dz] = dir(i);
    return {
      a, b,
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
      normal: [dz || 0, -dx || 0], // || 0 - bez -0
      extA: convexAt(i),
      extB: convexAt((i + 1) % n),
    };
  });
}

// Czy prostokąt w rzucie { x0, x1, z0, z1 } wchodzi we wcięcie (poza pokój).
export function boxInNotch(box, room) {
  const n = roomNotch(room);
  if (!n) return false;
  return box.x0 < n.x1 - TOL && box.x1 > n.x0 + TOL && box.z0 < n.z1 - TOL && box.z1 > n.z0 + TOL;
}
