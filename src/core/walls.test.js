import { describe, it, expect, beforeEach } from 'vitest';
import { state, addCornerModule } from './state.js';
import { computeWallLayouts } from './walls.js';
import { freshProject, baseModule, setProject } from '../test/fixtures.js';

const room = { width: 4000, depth: 3000, height: 2600 };

function mod(id, x, z, rotation, w = 600, d = 513) {
  return baseModule({
    id, name: id, rotation,
    dimensions: { width: w, height: 720, depth: d },
    position: { x, y: 0, z },
    elements: [{ id: id + '-f', typ: 'front', subtype: 'drzwi', x: 1.5, y: 2, w: w - 3, h: 715 }],
  });
}

const wall = (layout, id) => layout.walls.find(w => w.id === id);

describe('rzuty ścian - przypisanie szafek do ścian', () => {
  beforeEach(() => {
    setProject(freshProject({ room, modules: [] }));
  });

  it('boki dokładane, blendy i panele poziome trafiają do wall.panels (zmywarka nie)', () => {
    state.project.sidePanels = [
      { id: 'b', kind: 'blenda', rotation: 270, position: { x: 0, y: 100, z: 1000 }, dimensions: { width: 50, height: 2580, depth: 98 } },
      { id: 's', rotation: 0, position: { x: 2342, y: 100, z: 0 }, dimensions: { width: 18, height: 2580, depth: 583 } },
      { id: 'p', kind: 'poziomy', rotation: 0, position: { x: 0, y: 1520, z: 0 }, dimensions: { width: 2340, height: 18, depth: 320 } },
      { id: 'z', kind: 'zmywarka', rotation: 0, position: { x: 600, y: 0, z: 0 }, dimensions: { width: 600, height: 880, depth: 513 } },
    ];
    const layout = computeWallLayouts();
    const lewa = wall(layout, 'lewa').panels, tyl = wall(layout, 'tyl').panels;
    // lewa: u = głębokość - z
    expect(lewa).toHaveLength(1);
    expect(lewa[0]).toMatchObject({ kind: 'blenda', u0: 1950, u1: 2000, y0: 100, y1: 2680 });
    expect(tyl.map(p => p.kind)).toEqual(['bok', 'poziomy']);
    expect(tyl[0]).toMatchObject({ u0: 2342, u1: 2360 });
    expect(tyl[1]).toMatchObject({ u0: 0, u1: 2340, y0: 1520, y1: 1538 });
  });

  it('płyta daleko od ściany z obrotu idzie na najbliższą ścianę (półka przy ścianie przedniej z obrotem 0)', () => {
    state.project.sidePanels = [
      { id: 'p', kind: 'poziomy', rotation: 0, position: { x: 1000, y: 900, z: 2750 }, dimensions: { width: 1300, height: 40, depth: 250 } },
    ];
    const layout = computeWallLayouts();
    expect(wall(layout, 'tyl').panels).toHaveLength(0);
    expect(wall(layout, 'przednia').panels[0]).toMatchObject({ u0: 1700, u1: 3000 });
  });

  it('rotacja 0 -> ściana tylna, u = x', () => {
    state.project.modules = [mod('a', 500, 0, 0)];
    const it = wall(computeWallLayouts(), 'tyl').items[0];
    expect([it.u0, it.u1]).toEqual([500, 1100]);
    expect(it.y0).toBe(100);
    expect(it.y1).toBe(820);
  });

  it('rotacja 180 -> ściana przednia, u = szerokość - x (od lewej widza)', () => {
    state.project.modules = [mod('a', 500, 2487, 180)];
    const it = wall(computeWallLayouts(), 'przednia').items[0];
    expect([it.u0, it.u1]).toEqual([4000 - 1100, 4000 - 500]);
  });

  it('rotacja 90 -> ściana prawa (u = z), rotacja 270 -> lewa (u = głębokość - z)', () => {
    state.project.modules = [mod('r', 3487, 400, 90), mod('l', 0, 400, 270)];
    const lay = computeWallLayouts();
    const r = wall(lay, 'prawa').items[0];
    const l = wall(lay, 'lewa').items[0];
    // szafka obrócona o 90/270 zajmuje w osi z swoją szerokość (worldD = width)
    expect([r.u0, r.u1]).toEqual([400, 1000]);
    expect([l.u0, l.u1]).toEqual([3000 - 1000, 3000 - 400]);
  });

  it('fronty mają współrzędne względem początku szafki', () => {
    state.project.modules = [mod('a', 500, 0, 0)];
    const f = wall(computeWallLayouts(), 'tyl').items[0].fronts[0];
    expect(f.u0).toBe(501.5);
    expect(f.u1).toBe(501.5 + 597);
    expect(f.y0).toBe(102);
  });

  it('półki (typ poziom) też mają współrzędne względem początku szafki, jak fronty', () => {
    const m = mod('a', 500, 0, 0);
    m.elements.push({ id: 'a-s', typ: 'poziom', x: 18, y: 350, w: 564, h: 18, isStructural: false });
    state.project.modules = [m];
    const s = wall(computeWallLayouts(), 'tyl').items[0].shelves[0];
    expect(s.u0).toBe(518);
    expect(s.u1).toBe(518 + 564);
    expect(s.y0).toBe(450); // y0 szafki (100, nóżki) + el.y (350)
    expect(s.y1).toBe(468);
  });

  it('szafka narożna trafia na dwie ściany (rotacja 0: tylna i lewa)', () => {
    const corner = addCornerModule();
    corner.position = { x: 0, y: 0, z: 0 };
    corner.rotation = 0;
    const lay = computeWallLayouts();
    expect(wall(lay, 'tyl').items.some(i => i.kind === 'corner' && i.arm === 'A')).toBe(true);
    expect(wall(lay, 'lewa').items.some(i => i.kind === 'corner' && i.arm === 'B')).toBe(true);
    const a = wall(lay, 'tyl').items.find(i => i.arm === 'A');
    expect(a.u1 - a.u0).toBe(860);
  });
});
