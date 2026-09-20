import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state.js';
import { computeWorktops, splitLength, planStock, getWorktopParts, worktopBoxes, WORKTOP_DEFAULTS } from './worktops.js';
import { freshProject, baseModule, setProject } from '../test/fixtures.js';

const room = { width: 4000, depth: 3000, height: 2600 };

const base = (id, x, z, rotation = 0, w = 600) => baseModule({
  id, name: id, rotation, dimensions: { width: w, height: 720, depth: 513 }, position: { x, y: 0, z },
});

function project(modules, worktop = {}) {
  setProject(freshProject({ room, modules, worktop: { enabled: true, ...worktop } }));
}

describe('blaty - wykrywanie rzędów i wymiary', () => {
  beforeEach(() => setProject(freshProject({ room, modules: [] })));

  it('domyślnie wyłączone i bez formatek', () => {
    setProject(freshProject({ room, modules: [base('a', 0, 0)] }));
    expect(WORKTOP_DEFAULTS.enabled).toBe(false);
    expect(getWorktopParts()).toEqual([]);
  });

  it('ciągły rząd szafek daje jeden blat 600 mm głębokości od ściany, grubość 38', () => {
    project([base('a', 0, 0), base('b', 600, 0), base('c', 1200, 0)]);
    const { pieces } = computeWorktops();
    expect(pieces).toHaveLength(1);
    const p = pieces[0];
    expect([p.u0, p.u1, p.length, p.depth, p.thickness]).toEqual([0, 1800, 1800, 600, 38]);
    expect(p.y).toBe(820); // góra korpusu 100 (nóżki) + 720
  });

  it('szczelina większa niż tolerancja rozdziela blaty, mniejsza je łączy', () => {
    project([base('a', 0, 0), base('b', 700, 0)]);
    expect(computeWorktops().pieces).toHaveLength(2);
    project([base('a', 0, 0), base('b', 605, 0)]);
    expect(computeWorktops().pieces).toHaveLength(1);
  });

  it('blat idzie od ściany: rząd blisko ściany rozciąga się do ściany', () => {
    project([base('a', 5, 0)]);
    expect(computeWorktops().pieces[0].u0).toBe(0);
  });

  it('nadpisania: wyłączenie i własna długość, głębokość i grubość', () => {
    project([base('a', 0, 0), base('b', 600, 0)], { overrides: { 'tyl:0': { length: 1000, depth: 650, thickness: 28 } } });
    const p = computeWorktops().pieces[0];
    expect([p.length, p.depth, p.thickness]).toEqual([1000, 650, 28]);
    project([base('a', 0, 0)], { overrides: { 'tyl:0': { disabled: true } } });
    expect(computeWorktops().pieces).toHaveLength(0);
  });

  it('szafki wiszące i słupki nie dostają blatu', () => {
    const upper = baseModule({ id: 'u', type: 'upper_cabinet', dimensions: { width: 600, height: 720, depth: 320 }, position: { x: 0, y: 1450, z: 0 }, legs: { active: false } });
    project([upper]);
    expect(computeWorktops().pieces).toHaveLength(0);
  });
});

describe('blaty - narożnik na łyżwę i dzielenie', () => {
  it('dwa rzędy w rogu pokoju: dłuższy idzie do ściany, krótszy skrócony o głębokość', () => {
    // ściana tylna: x 0..1800 ; ściana lewa (rotacja 270): z 0..? szafki z=0.. oparte o x=0
    const left = (id, z) => base(id, 0, z, 270);
    project([base('a', 0, 0), base('b', 600, 0), base('c', 1200, 0), left('l1', 600), left('l2', 1200)]);
    const { pieces, corners } = computeWorktops();
    const tyl = pieces.find(p => p.wallId === 'tyl');
    const lewa = pieces.find(p => p.wallId === 'lewa');
    expect(corners).toHaveLength(1);
    expect(tyl.length).toBe(1800);
    // lewa: szafki na z 600..1800 -> u = D - z: blat od narożnika (z=0) do 1800, skrócony o 600
    expect(lewa.length).toBe(1200);
    expect(tyl.joins[0].role).toBe('przez');
    expect(lewa.joins[0].role).toBe('skrócony');
  });

  it('gdy oba rzędy dotykają rogu, wymuszona ściana "przez" decyduje o skracaniu', () => {
    // narożna szafka w rogu daje rzędy dotykające obu ścian (ramię A na tylnej, B na lewej)
    const left = (id, z) => base(id, 0, z, 270);
    project([base('a', 0, 0), base('b', 600, 0), left('l0', 0), left('l1', 600)], { corners: { 'tyl-lewa': { through: 'lewa' } } });
    const { pieces } = computeWorktops();
    expect(pieces.find(p => p.wallId === 'lewa').joins[0].role).toBe('przez');
    const tyl = pieces.find(p => p.wallId === 'tyl');
    expect(tyl.joins[0].role).toBe('skrócony');
    expect(tyl.u0).toBe(600);
  });

  it('długi blat >4100 dzieli się na kawałki, a reszta nie jest wiórkiem', () => {
    expect(splitLength(3000, 4100, 500)).toEqual([3000]);
    expect(splitLength(5000, 4100, 500)).toEqual([4100, 900]);
    const even = splitLength(4300, 4100, 500);
    expect(even).toEqual([2150, 2150]);
  });

  it('plan cięcia: pakuje kawałki w płyty 4100 z kerfem, a mało zużyte płyty to połówki', () => {
    const mk = (length) => ({ depth: 600, thickness: 38, length });
    const s = { stockLength: 4100, halfLength: 2050, kerf: 3 };
    const plan = planStock([mk(3000), mk(1000), mk(1500)], s);
    // 3000+3+1000 = 4003 na pierwszej płycie, 1500 na drugiej (połówka)
    expect(plan.fullCount).toBe(1);
    expect(plan.halfCount).toBe(1);
    expect(plan.stocks[0].used).toBe(4003);
  });

  it('formatki i bryły 3D odpowiadają kawałkom', () => {
    project([base('a', 0, 0), base('b', 600, 0)]);
    const parts = getWorktopParts();
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ length: 1200, width: 600, category: 'Blat', qty: 1 });
    expect(parts[0].name).toContain('38 mm');
    const [b] = worktopBoxes();
    expect([b.x0, b.x1, b.z0, b.z1, b.y0, b.y1]).toEqual([0, 1200, 0, 600, 820, 858]);
  });
});
