// src/core/walls.js
//
// Rzuty ścian pomieszczenia (widok z wewnątrz pokoju na daną ścianę): które
// szafki stoją przy której ścianie i w jakim przedziale poziomym/pionowym. Czysta
// logika bez DOM - rysuje ją render/wallElevations.js.
//
// Układ pokoju (render/viewer3d.js): ściana tylna z=0, przednia z=depth, lewa x=0,
// prawa x=width. Obrót szafki (mod.rotation, co 90°) mówi, którą ścianą jest jej
// tył: 0° - tylna, 90° - prawa, 180° - przednia, 270° - lewa (front szafki jest
// zawsze zwrócony do pokoju). Współrzędna pozioma rzutu u rośnie w prawo dla
// widza patrzącego na ścianę od środka: tylna u=x, prawa u=z, przednia
// u=szerokość-x, lewa u=głębokość-z.
import { state, DEFAULT_ROOM } from "./state.js";
import { getWorldFootprint, getCornerDepths } from "./layout.js";
import { getOpenings } from "./openings.js";

export const WALLS = [
  { id: 'tyl', label: 'Ściana tylna' },
  { id: 'prawa', label: 'Ściana prawa' },
  { id: 'przednia', label: 'Ściana przednia' },
  { id: 'lewa', label: 'Ściana lewa' },
];

const ROT_TO_WALL = { 0: 'tyl', 90: 'prawa', 180: 'przednia', 270: 'lewa' };

// Szafka narożna: [ściana, narożnik na wysokim końcu u?] dla ramion A i B przy
// danym obrocie. Wyprowadzone z obrotu lokalnego narożnika (ramię A wzdłuż +x,
// ramię B wzdłuż +z) wokół środka bryły o -rotation.
const CORNER_MAP = {
  0: { A: ['tyl', false], B: ['lewa', true] },
  90: { A: ['prawa', false], B: ['tyl', true] },
  180: { A: ['przednia', false], B: ['prawa', true] },
  270: { A: ['lewa', false], B: ['przednia', true] },
};

export function wallLength(room, id) {
  return (id === 'tyl' || id === 'przednia') ? room.width : room.depth;
}

function uInterval(id, room, x, z, wW, wD) {
  switch (id) {
    case 'tyl': return [x, x + wW];
    case 'przednia': return [room.width - (x + wW), room.width - x];
    case 'prawa': return [z, z + wD];
    default: return [room.depth - (z + wD), room.depth - z];
  }
}

function frontsOf(mod) {
  return (mod.elements || []).filter(el => el.typ === 'front' && el.subtype !== 'szuflada-wewnetrzna');
}

export function getRoom(project = state.project) {
  const r = project.room || DEFAULT_ROOM;
  return {
    width: parseFloat(r.width) || DEFAULT_ROOM.width,
    depth: parseFloat(r.depth) || DEFAULT_ROOM.depth,
    height: parseFloat(r.height) || DEFAULT_ROOM.height,
  };
}

// Zwraca { room, walls: [{ id, label, length, items }] } - items posortowane po u0.
// wall.openings: [{ id, kind, wall, u, width, height, sill }] (okna/drzwi/przeszkody z project.openings).
// item: { mod, kind: 'cabinet'|'corner', arm, u0, u1, floorY, y0, y1, fronts: [{u0,u1,y0,y1,subtype}] }
// floorY = spód nóżek nad podłogą, y0 = spód korpusu, y1 = góra korpusu.
export function computeWallLayouts(project = state.project) {
  const room = getRoom(project);
  const walls = WALLS.map(w => ({ ...w, length: wallLength(room, w.id), items: [] }));
  const byId = Object.fromEntries(walls.map(w => [w.id, w]));

  (project.modules || []).forEach(mod => {
    const rot = ((parseFloat(mod.rotation) || 0) % 360 + 360) % 360;
    const x = parseFloat(mod.position?.x) || 0;
    const z = parseFloat(mod.position?.z) || 0;
    const { worldW, worldD } = getWorldFootprint(mod);
    const legH = (mod.legs && mod.legs.active) ? (parseFloat(mod.legs.height) || 0) : 0;
    const floorY = parseFloat(mod.position?.y) || 0;
    const y0 = floorY + legH;
    const H = parseFloat(mod.dimensions?.height) || 0;
    const y1 = y0 + H;

    if (mod.type === 'corner_cabinet') {
      const { depthA, depthB } = getCornerDepths(mod);
      ['A', 'B'].forEach(arm => {
        const [wallId, cornerHigh] = (CORNER_MAP[rot] || CORNER_MAP[0])[arm];
        const [u0, u1] = uInterval(wallId, room, x, z, worldW, worldD);
        const otherDepth = arm === 'A' ? depthB : depthA;
        const fronts = frontsOf(mod).filter(el => el.cornerArm === arm).map(el => {
          const off = otherDepth + (parseFloat(el.x) || 0);
          const w = parseFloat(el.w) || 0;
          const fu0 = cornerHigh ? u1 - (off + w) : u0 + off;
          return { u0: fu0, u1: fu0 + w, y0: y0 + (parseFloat(el.y) || 0), y1: y0 + (parseFloat(el.y) || 0) + (parseFloat(el.h) || 0), subtype: el.subtype };
        });
        byId[wallId].items.push({ mod, kind: 'corner', arm, u0, u1, floorY, y0, y1, fronts });
      });
      return;
    }

    const wallId = ROT_TO_WALL[rot] || 'tyl';
    const [u0, u1] = uInterval(wallId, room, x, z, worldW, worldD);
    const fronts = frontsOf(mod).map(el => {
      const fw = parseFloat(el.w) || 0;
      const fu0 = u0 + (parseFloat(el.x) || 0);
      const fy0 = y0 + (parseFloat(el.y) || 0);
      return { u0: fu0, u1: fu0 + fw, y0: fy0, y1: fy0 + (parseFloat(el.h) || 0), subtype: el.subtype };
    });
    byId[wallId].items.push({ mod, kind: 'cabinet', arm: null, u0, u1, floorY, y0, y1, fronts });
  });

  walls.forEach(w => w.items.sort((a, b) => a.u0 - b.u0));

  // Okna, drzwi i przeszkody (core/openings.js) przypięte do swoich ścian.
  const openings = getOpenings(project);
  walls.forEach(w => { w.openings = openings.filter(o => o.wall === w.id); });

  // Obrysy szafek w rzucie z góry (x w prawo, z w dół, ściana tylna u góry) -
  // do miniplanu z oznaczeniem, na którą ścianę patrzy dany rzut.
  const plan = (project.modules || []).map(mod => {
    const { worldW, worldD } = getWorldFootprint(mod);
    return { x: parseFloat(mod.position?.x) || 0, z: parseFloat(mod.position?.z) || 0, w: worldW, d: worldD };
  });
  return { room, walls, plan };
}
