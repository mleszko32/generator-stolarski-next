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
