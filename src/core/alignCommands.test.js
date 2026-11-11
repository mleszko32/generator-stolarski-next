import { describe, it, expect } from 'vitest';
import { moveSelectionOf, moveSelection, selectionGaps, setSelectionGap, pushSelection, alignSelection, packSelection, worldDir } from './alignCommands.js';

const cab = (id, x, z = 0, extra = {}) => ({
  id, type: 'base_cabinet', rotation: 0, legs: { active: false },
  dimensions: { width: 600, height: 720, depth: 560 },
  position: { x, y: 0, z },
  ...extra,
});
const project = (modules, sidePanels = []) => ({ room: { width: 4000, height: 2600, depth: 3000 }, modules, sidePanels });
const sel = (...ids) => ({ moduleIds: new Set(ids), panelIds: new Set() });

describe('worldDir', () => {
  it('kierunki względem obrotu szafki', () => {
    expect(worldDir(0, 'right')).toEqual({ axis: 'x', sign: 1 });
    expect(worldDir(90, 'back')).toEqual({ axis: 'x', sign: 1 });
    expect(worldDir(270, 'left')).toEqual({ axis: 'z', sign: 1 });
    expect(worldDir(180, 'front')).toEqual({ axis: 'z', sign: -1 });
  });
});

describe('moveSelectionOf', () => {
  it('dokłada boki z grupy zaznaczonych szafek, bez zaznaczenia bierze aktywną', () => {
    const p = project([cab('a', 0, 0, { groupId: 'g' })], [{ id: 'p1', groupId: 'g' }, { id: 'p2' }]);
    const s = moveSelectionOf({ project: p, selectedModules: new Set(['a']), selectedSidePanels: new Set() });
    expect([...s.panelIds]).toEqual(['p1']);
    expect([...moveSelectionOf({ project: p, activeModuleId: 'a' }).moduleIds]).toEqual(['a']);
  });
});

describe('moveSelection', () => {
  it('zatrzymuje się na sąsiedzie i w ścianie', () => {
    const p = project([cab('a', 0), cab('b', 605)]);
    expect(moveSelection(p, sel('b'), { dx: -10 }).dx).toBe(-5);
    expect(p.modules[1].position.x).toBe(600);
    moveSelection(p, sel('a'), { dz: -10 });
    expect(p.modules[0].position.z).toBe(0);
  });
});

describe('odstępy', () => {
  it('czyta i ustawia odstęp od sąsiada', () => {
    const p = project([cab('a', 0), cab('b', 900)]);
    expect(selectionGaps(p, sel('b'), 'b').left).toMatchObject({ gap: 300, wall: false });
    expect(setSelectionGap(p, sel('b'), 'b', 'left', 50)).toBe(true);
    expect(p.modules[1].position.x).toBe(650);
  });
  it('strony liczą się względem obrotu szafki', () => {
    // szafka przy prawej ścianie (rot 90): odcisk 560 × 600, jej lewa strona to -Z
    const p = project([cab('a', 3440, 400, { rotation: 90 })]);
    expect(selectionGaps(p, sel('a'), 'a').left).toMatchObject({ gap: 400, wall: true });
    expect(selectionGaps(p, sel('a'), 'a').back).toMatchObject({ gap: 0, wall: true });
  });
});

describe('pushSelection', () => {
  it('dosuwa do sąsiada', () => {
    const p = project([cab('a', 0), cab('b', 1500)]);
    expect(pushSelection(p, sel('b'), 'b', 'left')).toBe(true);
    expect(p.modules[1].position.x).toBe(600);
  });
  it('w tył zostawia szczelinę od ściany', () => {
    const p = project([cab('a', 0, 800)]);
    pushSelection(p, sel('a'), 'a', 'back');
    expect(p.modules[0].position.z).toBe(50);
    expect(pushSelection(p, sel('a'), 'a', 'back')).toBe(false);
  });
});

describe('alignSelection', () => {
  it('zrównuje fronty i góry z szafką odniesienia', () => {
    const p = project([cab('a', 0, 50), cab('b', 600, 0, { dimensions: { width: 600, height: 900, depth: 320 } })]);
    alignSelection(p, sel('a', 'b'), 'a', 'front');
    expect(p.modules[1].position.z).toBe(290); // 50 + 560 - 320
    alignSelection(p, sel('a', 'b'), 'a', 'bottom');
    expect(p.modules[1].position.y).toBe(0);
    expect(alignSelection(p, sel('a'), 'a', 'left')).toBe(false);
  });
});

describe('packSelection', () => {
  it('zsuwa rząd wokół szafki odniesienia', () => {
    const p = project([cab('a', 100), cab('b', 900), cab('c', 2000)]);
    expect(packSelection(p, sel('a', 'b', 'c'), 'b')).toBe(true);
    expect(p.modules.map((m) => m.position.x)).toEqual([300, 900, 1500]);
  });
  it('rząd wychodzący za ścianę wraca do pokoju', () => {
    const p = project([cab('a', 100), cab('b', 300)]);
    packSelection(p, sel('a', 'b'), 'b');
    expect(p.modules.map((m) => m.position.x)).toEqual([0, 600]);
  });
});
