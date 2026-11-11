import { describe, it, expect } from 'vitest';
import { nearestSnap, snapModulePosition, sweepSelection, getSidePanelBox, pickSnap, dragGaps, nudgeSelection } from './moduleDrag.js';

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
    expect(r).toMatchObject({ x: 600, y: 0, z: 200 });
  });

  it('nie przyciąga krawędzi X od szafki z innej linii (po drugiej stronie pokoju)', () => {
    const others = [{ x: 1000, y: 0, z: 2400, w: 600, d: 560, h: 720 }];
    const r = snapModulePosition({ x: 1020, y: 0, z: 500 }, size, others, room, 40);
    expect(r.x).toBe(1020);
  });

  it('zablokowana oś nie przyciąga się', () => {
    const r = snapModulePosition({ x: 20, y: 0, z: 20 }, size, [], room, 40, { lockX: true });
    expect(r).toMatchObject({ x: 20, y: 0, z: 0 });
  });
});

describe('przyciąganie - rangi, zaznaczenie, lico frontów, szczelina', () => {
  const size = { w: 600, d: 560, h: 720 };

  it('styk wygrywa ze zrównaniem krawędzi, chyba że to drugie jest wyraźnie bliżej', () => {
    expect(pickSnap(100, [{ v: 110, kind: 'touch' }, { v: 94, kind: 'align' }], 40).kind).toBe('touch');
    expect(pickSnap(100, [{ v: 130, kind: 'touch' }, { v: 98, kind: 'align' }], 40).kind).toBe('align');
    expect(pickSnap(100, [{ v: 150, kind: 'touch' }], 40)).toBe(null);
  });

  it('zwraca, co złapało (linia styku z sąsiadem)', () => {
    const o = { x: 0, y: 0, z: 0, w: 600, d: 560, h: 720 };
    const r = snapModulePosition({ x: 612, y: 0, z: 300 }, size, [o], room, 40);
    expect(r.x).toBe(600);
    expect(r.guides).toEqual([{ axis: 'x', kind: 'touch', line: 600, other: o }, { axis: 'y', kind: 'wall', line: 0, other: null }]);
  });

  it('przyciąga skrajna krawędź przeciąganej grupy, nie tylko kliknięta szafka', () => {
    // razem z klikniętą szafką jedzie szafka po jej lewej (dx = -600); sąsiad kończy się na 600
    const o = { x: 0, y: 0, z: 0, w: 600, d: 560, h: 720 };
    const sel = [{ dx: -600, dy: 0, dz: 0, w: 600, d: 560, h: 720 }];
    const r = snapModulePosition({ x: 1215, y: 0, z: 0 }, size, [o], room, 40, { selection: sel });
    expect(r.x).toBe(1200);
  });

  it('szczelina od ściany za plecami szafki', () => {
    const r = snapModulePosition({ x: 1000, y: 0, z: 42 }, size, [], room, 40, { rotation: 0, wallGap: 50 });
    expect(r.z).toBe(50);
    const r90 = snapModulePosition({ x: 3395, y: 0, z: 1000 }, { w: 560, d: 600, h: 720 }, [], room, 40, { rotation: 90, wallGap: 50 });
    expect(r90.x).toBe(4000 - 560 - 50);
  });

  it('krawędź szafki staje na licu frontów prostopadłego ciągu', () => {
    // ciąg przy tylnej ścianie: korpus do z = 560, fronty do 580; szafka przy prawej ścianie (rot 90)
    const o = { x: 2800, y: 0, z: 0, w: 600, d: 560, h: 720, rot: 0, front: 20 };
    const r = snapModulePosition({ x: 3440, y: 0, z: 590 }, { w: 560, d: 600, h: 720 }, [o], room, 40, { rotation: 90, front: 20 });
    expect(r.z).toBe(580);
    expect(r.guides.find((g) => g.axis === 'z').kind).toBe('front');
  });

  it('w pionie zrównuje góry z sąsiadem stojącym obok', () => {
    const o = { x: 0, y: 1400, z: 0, w: 600, d: 320, h: 720 };
    const r = snapModulePosition({ x: 600, y: 1210, z: 0 }, { w: 600, d: 320, h: 900 }, [o], room, 40);
    expect(r.y).toBe(1220); // góra 2120 = góra sąsiada
  });

  it('próg 0 (Ctrl) niczego nie przyciąga', () => {
    const o = { x: 0, y: 0, z: 0, w: 600, d: 560, h: 720 };
    const r = snapModulePosition({ x: 603, y: 2, z: 3 }, size, [o], room, 0);
    expect(r).toMatchObject({ x: 603, y: 2, z: 3, guides: [] });
  });
});

describe('dragGaps', () => {
  it('odstęp do sąsiada z lewej i do ściany z prawej', () => {
    const g = dragGaps([box(900, 0)], [box(0, 0)], room);
    expect(g.xMin).toMatchObject({ gap: 300, wall: false });
    expect(g.xMax).toMatchObject({ gap: 2500, wall: true });
    expect(g.zMin).toMatchObject({ gap: 0, wall: true });
    expect(g.xMin.a.x).toBe(900);
    expect(g.xMin.b.x).toBe(600);
  });
  it('szafka z innej wysokości nie jest sąsiadem', () => {
    const g = dragGaps([box(900, 0)], [box(0, 0, 600, 320, 1400, 720)], room);
    expect(g.xMin).toMatchObject({ gap: 900, wall: true });
  });
});

describe('nudgeSelection', () => {
  it('zatrzymuje się na sąsiedzie i na ścianie', () => {
    expect(nudgeSelection([box(605, 0)], { dx: -10 }, [box(0, 0)], room).dx).toBe(-5);
    expect(nudgeSelection([box(3395, 0)], { dx: 10 }, [], room).dx).toBe(5);
    expect(nudgeSelection([box(1000, 0)], { dz: -10 }, [], room).dz).toBe(0);
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
