import { describe, it, expect } from 'vitest';
import { nearestSnap, snapModulePosition, sweepSelection, getSidePanelBox } from './moduleDrag.js';

const room = { width: 4000, depth: 3000 };
const box = (x, z, w = 600, d = 560, y = 0, h = 720) => ({ x0: x, x1: x + w, y0: y, y1: y + h, z0: z, z1: z + d });

describe('nearestSnap', () => {
  it('wybiera najbliższego kandydata w promieniu', () => {
    expect(nearestSnap(100, [70, 95, 130], 40)).toBe(95);
  });
  it('bez kandydata w promieniu zostawia wartość', () => {
    expect(nearestSnap(100, [0, 200], 40)).toBe(100);
  });
});

describe('snapModulePosition', () => {
  const size = { w: 600, d: 600, h: 720 };

  it('wyrównuje fronty szafek o różnej głębokości', () => {
    // sąsiad głębokości 560 stoi przy ścianie; przeciągana ma 600, front sąsiada na z=560
    const others = [{ x: 0, y: 0, z: 0, w: 600, d: 560, h: 720 }];
    const r = snapModulePosition({ x: 610, y: 0, z: -30 }, size, others, room, 40);
    expect(r.x).toBe(600);
    expect(r.z).toBe(-40); // front 600-głębokiej szafki na linii frontu sąsiada
  });

  it('wyrównuje tyły do sąsiada zamiast wyskakiwać przed linię', () => {
    const others = [{ x: 0, y: 0, z: 200, w: 600, d: 560, h: 720 }];
    const r = snapModulePosition({ x: 605, y: 0, z: 215 }, { w: 600, d: 560, h: 720 }, others, room, 40);
    expect(r).toEqual({ x: 600, y: 0, z: 200 });
  });

  it('nie przyciąga krawędzi X od szafki z innej linii (po drugiej stronie pokoju)', () => {
    const others = [{ x: 1000, y: 0, z: 2400, w: 600, d: 560, h: 720 }];
    const r = snapModulePosition({ x: 1020, y: 0, z: 500 }, size, others, room, 40);
    expect(r.x).toBe(1020);
  });

  it('zablokowana oś nie przyciąga się', () => {
    const r = snapModulePosition({ x: 20, y: 0, z: 20 }, size, [], room, 40, { lockX: true });
    expect(r).toEqual({ x: 20, y: 0, z: 0 });
  });
});

describe('sweepSelection', () => {
  it('zatrzymuje przeciąganą szafkę na sąsiedzie zamiast go przesuwać', () => {
    const r = sweepSelection([box(1200, 0)], { dx: -700, dy: 0, dz: 0 }, [box(0, 0)]);
    expect(r).toEqual({ dx: -600, dy: 0, dz: 0 });
  });

  it('szybki ruch nie przeskakuje przez sąsiada ani nie wypycha przed linię', () => {
    // środkowa szafka 600-1200 szarpnięta mocno w lewo
    const r = sweepSelection([box(600, 0)], { dx: -900, dy: 0, dz: 0 }, [box(0, 0), box(1200, 0)]);
    expect(r).toEqual({ dx: 0, dy: 0, dz: 0 });
  });

  it('ruch po przekątnej ślizga się wzdłuż sąsiada', () => {
    const r = sweepSelection([box(600, 0)], { dx: -100, dy: 0, dz: 300 }, [box(0, 0)]);
    expect(r).toEqual({ dx: 0, dy: 0, dz: 300 });
  });

  it('moduł opuszczany w pionie ląduje na dolnym (piętrowanie)', () => {
    const r = sweepSelection([box(0, 0, 600, 560, 1000, 720)], { dx: 0, dy: -500, dz: 0 }, [box(0, 0)]);
    expect(r.dy).toBe(-280);
  });

  it('wolna droga = pełny ruch', () => {
    const r = sweepSelection([box(600, 0)], { dx: 300, dy: 0, dz: 0 }, [box(0, 0)]);
    expect(r).toEqual({ dx: 300, dy: 0, dz: 0 });
  });
});

describe('bok dokładany przy przeciąganiu szafki', () => {
  const panel = { position: { x: 600, y: 0, z: 0 }, dimensions: { width: 18, height: 820, depth: 560 } };

  it('getSidePanelBox liczy prostopadłościan od podłogi', () => {
    expect(getSidePanelBox(panel)).toEqual({ x0: 600, x1: 618, y0: 0, y1: 820, z0: 0, z1: 560 });
  });

  it('szafka zatrzymuje się na boku zamiast przez niego przenikać', () => {
    const cab = box(1000, 0, 600, 560, 100, 720); // korpus na nóżkach 100 mm
    const r = sweepSelection([cab], { dx: -500, dy: 0, dz: 0 }, [getSidePanelBox(panel)]);
    expect(r.dx).toBe(-382); // lewy bok szafki dokładnie na x = 618
  });

  it('szafka przyciąga się do boku, ale nie w pionie', () => {
    const others = [{ x: 600, y: 0, z: 0, w: 18, d: 560, h: 820, noY: true }];
    const r = snapModulePosition({ x: 630, y: 25, z: 0 }, { w: 600, d: 560, h: 720 }, others, room, 40);
    expect(r.x).toBe(618);
    expect(r.y).toBe(0); // tylko podłoga, nie spód/góra boku
  });
});
