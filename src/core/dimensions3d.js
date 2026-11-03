// src/core/dimensions3d.js
//
// Wymiary w widoku 3D (przycisk „Wymiary” w render/viewer3d.js, rysuje render/dimensions3d.js).
// Czysta logika: z projektu liczy odcinki wymiarowe w mm w układzie pokoju (x w prawo, y w górę,
// z od ściany tylnej), tak jak łańcuchy na rysunkach technicznych:
//  - wzdłuż każdej ściany: łańcuch szerokości szafek stojących (na podłodze) i osobno wiszących
//    (z blendami i bokami dokładanymi tego rzędu), z przerwami między nimi, plus wymiar całkowity,
//  - przy prawym końcu ściany: łańcuch wysokości (podłoga, cokół, korpusy, sufit),
//  - zaznaczona szafka: szerokość, wysokość, głębokość i odległości do sąsiadów / ścian.
// Szafki narożne (dwa ramiona) i skośne pomijamy w łańcuchach - mają własne rysunki.
import { getWorldFootprint } from "./layout.js";
import { getRoom } from "./walls.js";
import { frontAllowance } from "./wallFill.js";

// Spód rzędu wiszącego: szafka zaczynająca się wyżej to szafka wisząca / nadstawka.
const HANG_MIN = 600;
const EPS = 1;

// Oś „wzdłuż ściany” i kierunek „do pokoju” dla obrotu szafki (tył przy ścianie).
const AXES = {
  0: { along: "x", out: "z", sign: 1 },
  90: { along: "z", out: "x", sign: -1 },
  180: { along: "x", out: "z", sign: -1 },
  270: { along: "z", out: "x", sign: 1 },
};

const rotOf = (o) => ((parseFloat(o.rotation) || 0) % 360 + 360) % 360;
const num = (v) => parseFloat(v) || 0;

// Prostokąt obiektu na podłodze + zakres wysokości.
function boxOf(o, project) {
  const { worldW, worldD } = getWorldFootprint(o);
  const x0 = num(o.position && o.position.x), z0 = num(o.position && o.position.z);
  const legH = o.legs && o.legs.active ? num(o.legs.height) : 0;
  const floorY = num(o.position && o.position.y);
  const y0 = floorY + legH;
  const y1 = y0 + num(o.dimensions && o.dimensions.height);
  const isModule = !!o.elements;
  return { o, isModule, x0, x1: x0 + worldW, z0, z1: z0 + worldD, floorY, y0, y1, fa: isModule ? frontAllowance(project, o) : 0 };
}

// Punkt w układzie pokoju z (wzdłuż, y, do pokoju).
const point = (ax, along, y, out) => (ax.along === "x" ? { x: along, y, z: out } : { x: out, y, z: along });

const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

// Kolejne punkty -> odcinki łańcucha (pomija odcinki < 1 mm).
function chain(points, make) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const len = points[i] - points[i - 1];
    if (len >= EPS) out.push(make(points[i - 1], points[i], len));
  }
  return out;
}

const uniqSorted = (vals) => {
  const s = [...vals].sort((a, b) => a - b);
  return s.filter((v, i) => i === 0 || v - s[i - 1] >= EPS);
};

// opts.offset - odsunięcie łańcucha przed lico frontów (mm), opts.step - odstęp kolejnych linii.
export function computeDimensions(project, activeModuleId = null, { offset = 150, step = 130 } = {}) {
  const room = getRoom(project);
  const segments = [];
  const mods = (project.modules || []).filter((m) => m.type !== "corner_cabinet" && m.type !== "slope_cabinet");
  const panels = project.sidePanels || [];

  // --- Łańcuchy wzdłuż ścian (po obrocie) ---
  Object.keys(AXES).map(Number).forEach((rot) => {
    const ax = AXES[rot];
    const boxes = [...mods, ...panels].filter((o) => rotOf(o) === rot).map((o) => boxOf(o, project));
    if (!boxes.some((b) => b.isModule)) return;
    const a0 = (b) => (ax.along === "x" ? b.x0 : b.z0);
    const a1 = (b) => (ax.along === "x" ? b.x1 : b.z1);
    // Lico frontów rzędu: najdalej wysunięty obiekt (z frontem) w stronę pokoju.
    const faceOf = (b) => (ax.sign > 0 ? (ax.out === "z" ? b.z1 : b.x1) + b.fa : (ax.out === "z" ? b.z0 : b.x0) - b.fa);
    const pickFace = (list) => (ax.sign > 0 ? Math.max(...list.map(faceOf)) : Math.min(...list.map(faceOf)));

    const rows = [
      { key: "dolne", list: boxes.filter((b) => b.y0 < HANG_MIN && b.floorY < HANG_MIN) },
      { key: "gorne", list: boxes.filter((b) => b.floorY >= HANG_MIN || b.y0 >= HANG_MIN) },
    ];
    rows.forEach(({ key, list }) => {
      if (!list.some((b) => b.isModule)) return;
      const pts = uniqSorted(list.flatMap((b) => [a0(b), a1(b)]));
      const face = pickFace(list.filter((b) => b.isModule));
      const y = key === "dolne" ? 0 : Math.max(...list.map((b) => b.y1)) + 80;
      const out1 = face + ax.sign * offset;
      const out2 = face + ax.sign * (offset + step);
      segments.push(...chain(pts, (p, q, len) => ({ kind: "chain", row: key, a: point(ax, p, y, out1), b: point(ax, q, y, out1), label: fmt(len), tick: "y" })));
      if (pts.length > 2) {
        const p = pts[0], q = pts[pts.length - 1];
        segments.push({ kind: "total", row: key, a: point(ax, p, y, out2), b: point(ax, q, y, out2), label: fmt(q - p), tick: "y" });
      }
    });

    // Wysokości przy końcu ściany (największe „wzdłuż”).
    const end = Math.max(...boxes.map(a1)) + offset;
    const face = pickFace(boxes.filter((b) => b.isModule));
    const ys = uniqSorted([0, room.height, ...boxes.flatMap((b) => [b.floorY, b.y0, b.y1])].filter((v) => v >= 0 && v <= room.height));
    segments.push(...chain(ys, (p, q, len) => ({ kind: "height", a: point(ax, end, p, face), b: point(ax, end, q, face), label: fmt(len), tick: ax.along })));
  });

  // --- Zaznaczona szafka ---
  const active = mods.find((m) => m.id === activeModuleId);
  if (active) {
    const rot = rotOf(active);
    const ax = AXES[rot] || AXES[0];
    const b = boxOf(active, project);
    const a0 = ax.along === "x" ? b.x0 : b.z0, a1 = ax.along === "x" ? b.x1 : b.z1;
    const back = ax.sign > 0 ? (ax.out === "z" ? b.z0 : b.x0) : (ax.out === "z" ? b.z1 : b.x1);
    const front = ax.sign > 0 ? (ax.out === "z" ? b.z1 : b.x1) : (ax.out === "z" ? b.z0 : b.x0);
    const W = num(active.dimensions.width), H = num(active.dimensions.height), D = num(active.dimensions.depth);
    const faceOut = front + ax.sign * (b.fa + 40);
    segments.push({ kind: "active", a: point(ax, a0, b.y1 + 60, faceOut), b: point(ax, a1, b.y1 + 60, faceOut), label: fmt(W), tick: "y" });
    segments.push({ kind: "active", a: point(ax, a0 - 60, b.y0, faceOut), b: point(ax, a0 - 60, b.y1, faceOut), label: fmt(H), tick: ax.along });
    segments.push({ kind: "active", a: point(ax, a0, b.y1 + 60, back), b: point(ax, a0, b.y1 + 60, front), label: fmt(D), tick: "y" });

    // Odległości w lewo / w prawo do najbliższego obiektu w tym samym pasie wysokości albo do ściany.
    const wallEnd = ax.along === "x" ? room.width : room.depth;
    const others = [...mods, ...panels].filter((o) => o !== active).map((o) => boxOf(o, project))
      .filter((o) => o.y0 < b.y1 - EPS && o.y1 > b.y0 + EPS)
      .filter((o) => {
        // nachodzi „w poprzek” (ten sam pas przy ścianie)
        const p0 = ax.out === "z" ? o.z0 : o.x0, p1 = ax.out === "z" ? o.z1 : o.x1;
        const q0 = ax.out === "z" ? b.z0 : b.x0, q1 = ax.out === "z" ? b.z1 : b.x1;
        return p0 < q1 - EPS && p1 > q0 + EPS;
      });
    const o0 = (o) => (ax.along === "x" ? o.x0 : o.z0), o1 = (o) => (ax.along === "x" ? o.x1 : o.z1);
    const leftLimit = Math.max(0, ...others.map(o1).filter((v) => v <= a0 + EPS));
    const rightLimit = Math.min(wallEnd, ...others.map(o0).filter((v) => v >= a1 - EPS));
    const yMid = b.y0 + H / 2;
    if (a0 - leftLimit >= EPS) segments.push({ kind: "gap", a: point(ax, leftLimit, yMid, faceOut), b: point(ax, a0, yMid, faceOut), label: fmt(a0 - leftLimit), tick: "y" });
    if (rightLimit - a1 >= EPS) segments.push({ kind: "gap", a: point(ax, a1, yMid, faceOut), b: point(ax, rightLimit, yMid, faceOut), label: fmt(rightLimit - a1), tick: "y" });
  }
  return segments;
}
