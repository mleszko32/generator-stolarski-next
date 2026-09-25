// src/core/sidePanelSnap.js
//
// Przyciąganie boku dokładanego (state.project.sidePanels) do szafek i innych
// boków przy przeciąganiu w 3D. Bok jest cienki (grubość płyty) i ma stać
// DOKŁADNIE przy boku szafki: bez szczeliny i bez wchodzenia w korpus. Wcześniej
// przyciągał się tylko krawędziami "koniec do końca" (i to bez blend), więc przy
// szafce z blendą zostawała szczelina, a upuszczony nad szafką bok po prostu w nią
// wchodził. Czysta logika bez Three.js - wołana z render/viewer3d.js i testowana
// w core/sidePanelSnap.test.js.
import { state, DEFAULT_ROOM } from "./state.js";
import { getWorldFootprint, getModuleBox } from "./layout.js";

const EPS = 0.5;
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const overlap1d = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Obrys szafki w pokoju RAZEM z blendami (mod.fillers.left/right). Kierunek
// "lewa/prawa" jest w lokalnym układzie modułu, więc zależy od obrotu (patrz
// komentarz przy clampModuleToRoom w core/layout.js): 0° lewa -> -X, 180° lewa -> +X,
// 90° lewa -> -Z, 270° lewa -> +Z (prawa - odwrotnie).
export function getModuleBoxWithFillers(mod) {
  const b = getModuleBox(mod);
  const f = mod.fillers || {};
  const leftW = f.left && f.left.active ? num(f.left.width, 50) : 0;
  const rightW = f.right && f.right.active ? num(f.right.width, 50) : 0;
  const rot = ((num(mod.rotation) % 360) + 360) % 360;
  const box = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: num(mod.position && mod.position.y), y1: b.y1 };
  if (rot === 0) { box.x0 -= leftW; box.x1 += rightW; }
  else if (rot === 180) { box.x0 -= rightW; box.x1 += leftW; }
  else if (rot === 90) { box.z0 -= leftW; box.z1 += rightW; }
  else if (rot === 270) { box.z0 -= rightW; box.z1 += leftW; }
  return box;
}

// Zwraca { x, z } - położenie lewego-tylnego rogu boku po przyciągnięciu.
// x, z: proponowane położenie (np. z myszy). snapDist: zasięg przyciągania w mm.
export function snapSidePanel(panel, x, z, project = state.project, snapDist = 40) {
  const room = project.room || DEFAULT_ROOM;
  const roomW = num(room.width, DEFAULT_ROOM.width);
  const roomD = num(room.depth, DEFAULT_ROOM.depth);
  const { worldW, worldD } = getWorldFootprint(panel);
  const py0 = num(panel.position && panel.position.y);
  const py1 = py0 + num(panel.dimensions && panel.dimensions.height);

  const boxes = [];
  (project.modules || []).forEach((m) => {
    boxes.push({ ...getModuleBoxWithFillers(m), corner: m.type === "corner_cabinet" });
  });
  (project.sidePanels || []).forEach((p) => {
    if (p.id === panel.id) return;
    const fp = getWorldFootprint(p);
    const px = num(p.position && p.position.x), pz = num(p.position && p.position.z);
    const py = num(p.position && p.position.y);
    boxes.push({ x0: px, x1: px + fp.worldW, z0: pz, z1: pz + fp.worldD, y0: py, y1: py + num(p.dimensions && p.dimensions.height), corner: false });
  });
  // tylko obiekty, które dzielą z bokiem jakiś przedział wysokości
  const near = boxes.filter((b) => overlap1d(py0, py1, b.y0, b.y1) > EPS);

  let sx = x, sz = z;

  let snappedX = false, snappedZ = false;
  const inX = (v) => v >= -EPS && v <= roomW - worldW + EPS;
  const inZ = (v) => v >= -EPS && v <= roomD - worldD + EPS;

  // Dwa przebiegi: X zależy od tego, z którymi szafkami bok się pokrywa w głąb (Z),
  // a Z od tego, do których szafek bok już przylega w X.
  for (let pass = 0; pass < 2; pass++) {
    let best = null;
    near.forEach((b) => {
      if (overlap1d(sz, sz + worldD, b.z0, b.z1) <= EPS) return;
      [b.x1, b.x0 - worldW].forEach((c) => {
        if (!inX(c)) return; // poza pokojem - nie przyciągamy
        const d = Math.abs(sx - c);
        if (d < snapDist && (!best || d < best.d)) best = { c, d };
      });
    });
    if (best) { sx = best.c; snappedX = true; }

    best = null;
    near.forEach((b) => {
      if (overlap1d(sx - 1, sx + worldW + 1, b.x0, b.x1) <= 0) return;
      // wyrównanie tyłu z tyłem, przodu z przodem oraz "koniec do końca"
      [b.z0, b.z1 - worldD, b.z1, b.z0 - worldD].forEach((c) => {
        if (!inZ(c)) return;
        const d = Math.abs(sz - c);
        if (d < snapDist && (!best || d < best.d)) best = { c, d };
      });
    });
    if (best) { sz = best.c; snappedZ = true; }
  }

  // Ściany pokoju - tylko dla osi, na której bok nie złapał żadnej szafki (szafka ma pierwszeństwo).
  if (!snappedX) {
    if (Math.abs(sx) < snapDist) sx = 0;
    else if (Math.abs(sx + worldW - roomW) < snapDist) sx = roomW - worldW;
  }
  if (!snappedZ) {
    if (Math.abs(sz) < snapDist) sz = 0;
    else if (Math.abs(sz + worldD - roomD) < snapDist) sz = roomD - worldD;
  }

  // Bok nie może wchodzić w korpus (ani w inny bok). Jeśli nachodzi, szukamy
  // NAJBLIŻSZEGO wolnego miejsca przy krawędzi któregoś obiektu: najpierw w bok (X) -
  // tak stoi bok dokładany - a dopiero gdy się nie da, w głąb (Z). Miejsce musi być
  // w pokoju i nie kolidować z niczym innym (bok wciśnięty między dwie szafki bez
  // szczeliny trafia więc na koniec rzędu, a nie do środka jednej z nich).
  const collides = (x, z) => near.some((b) => !b.corner
    && overlap1d(x, x + worldW, b.x0, b.x1) > EPS
    && overlap1d(z, z + worldD, b.z0, b.z1) > EPS);
  if (collides(sx, sz)) {
    const nearest = (cands, cur) => cands.reduce((best, c) => (best === null || Math.abs(c - cur) < Math.abs(best - cur) ? c : best), null);
    const xFree = [];
    const zFree = [];
    near.forEach((b) => {
      [b.x1, b.x0 - worldW].forEach((c) => { if (inX(c) && !collides(c, sz)) xFree.push(c); });
      [b.z1, b.z0 - worldD].forEach((c) => { if (inZ(c) && !collides(sx, c)) zFree.push(c); });
    });
    const bx = nearest(xFree, sx);
    if (bx !== null) sx = bx;
    else {
      const bz = nearest(zFree, sz);
      if (bz !== null) sz = bz;
    }
  }

  sx = Math.max(0, Math.min(roomW - worldW, sx));
  sz = Math.max(0, Math.min(roomD - worldD, sz));
  return { x: Math.round(sx * 100) / 100, z: Math.round(sz * 100) / 100 };
}
