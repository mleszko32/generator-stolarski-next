import { describe, it, expect, beforeEach } from "vitest";
import { recalculateLayout, recalculateAllLayouts, getTraverseConfig, getWorldFootprint, clampModuleToRoom } from "./layout.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

// Pełny korpus 600 x 720, płyta 18 -> wnętrze baseZone 18..582 / 18..702.
const FULL_ZONE = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };

function drawerStack(distribution) {
  const count = distribution.split(":").length;
  return Array.from({ length: count }, (_, i) => ({
    id: `front-${i}`,
    typ: "front",
    subtype: "szuflada",
    frontIndex: i,
    gap: 3,
    distribution,
    baseZone: { ...FULL_ZONE },
  }));
}

describe("recalculateLayout", () => {
  beforeEach(() => setProject(freshProject()));

  it("nakładane drzwi na pełną wnękę: front zachodzi na korpus pomniejszony o luzy", () => {
    const mod = baseModule({
      elements: [{ id: "d", typ: "front", subtype: "drzwi", frontIndex: 0, gap: 3, baseZone: { ...FULL_ZONE } }],
    });
    setProject(freshProject({ modules: [mod] }));

    recalculateLayout(mod);
    const d = mod.elements[0];

    // luzy z fixture: boki 1.5, dół 0, góra 5; płyta 18
    expect(d.x).toBeCloseTo(1.5);
    expect(d.w).toBeCloseTo(564 + 16.5 + 16.5);
    expect(d.y).toBeCloseTo(0);
    expect(d.h).toBeCloseTo(684 + 18 + 13);
  });

  it("dystrybucja 1:1:1 dzieli wysokość równo i szczelnie kafelkuje fronty", () => {
    const elements = drawerStack("1:1:1");
    const mod = baseModule({ elements });
    setProject(freshProject({ modules: [mod] }));

    recalculateLayout(mod);

    const [a, b, c] = elements;
    const totalH = a.h + b.h + c.h + 2 * 3; // + szczeliny
    expect(a.h).toBeCloseTo(b.h);
    expect(b.h).toBeCloseTo(c.h);
    expect(a.y).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(a.y + a.h + 3);
    expect(c.y).toBeCloseTo(b.y + b.h + 3);
    expect(totalH).toBeCloseTo(715); // (702-18) + dół 18 + góra 13
    for (const el of elements) {
      expect(el.x).toBeCloseTo(1.5);
      expect(el.w).toBeCloseTo(597);
    }
  });

  it("stała strefa w dystrybucji (np. 200:1fr) trzyma zadaną wysokość", () => {
    const elements = drawerStack("200:1");
    // drawerStack użył ':' -> ["200","1"]; 200 > 10 => fixed, 1 <= 10 => fr
    const mod = baseModule({ elements });
    setProject(freshProject({ modules: [mod] }));

    recalculateLayout(mod);
    expect(elements[0].h).toBeCloseTo(200);
    expect(elements[1].h).toBeCloseTo(715 - 200 - 3);
  });

  it("nie dotyka elementów nie-frontowych", () => {
    const shelf = { id: "s", typ: "poziom", y: 350, isStructural: true };
    const mod = baseModule({ elements: [shelf] });
    setProject(freshProject({ modules: [mod] }));

    recalculateLayout(mod);
    expect(shelf).toEqual({ id: "s", typ: "poziom", y: 350, isStructural: true });
  });

  it("recalculateAllLayouts przelicza każdy moduł projektu", () => {
    const m1 = baseModule({ id: "m1", elements: drawerStack("1:1") });
    const m2 = baseModule({ id: "m2", elements: drawerStack("1:1:1") });
    setProject(freshProject({ modules: [m1, m2] }));

    recalculateAllLayouts();
    expect(m1.elements.every((e) => typeof e.h === "number")).toBe(true);
    expect(m2.elements.every((e) => typeof e.h === "number")).toBe(true);
  });
});

describe("getTraverseConfig", () => {
  it("bez konfiguracji: oba trawersy aktywne, wspólna szerokość", () => {
    const trav = getTraverseConfig({ traverseWidth: 100 });
    expect(trav).toEqual({ front: { active: true, width: 100 }, rear: { active: true, width: 100 } });
  });

  it("nadpisanie szerokości jednego trawersu nie rusza drugiego", () => {
    const trav = getTraverseConfig({ traverseWidth: 100, traverses: { front: { width: 60 } } });
    expect(trav.front).toEqual({ active: true, width: 60 });
    expect(trav.rear).toEqual({ active: true, width: 100 });
  });

  it("pozwala wyłączyć jeden trawers (tylko przedni albo tylko tylny)", () => {
    const onlyFront = getTraverseConfig({ traverseWidth: 100, traverses: { rear: { active: false } } });
    expect(onlyFront.front.active).toBe(true);
    expect(onlyFront.rear.active).toBe(false);

    const onlyRear = getTraverseConfig({ traverseWidth: 100, traverses: { front: { active: false } } });
    expect(onlyRear.front.active).toBe(false);
    expect(onlyRear.rear.active).toBe(true);
  });

  it("nie pozwala wyłączyć obu naraz (zabezpieczenie przed korpusem bez wieńca)", () => {
    const trav = getTraverseConfig({ traverseWidth: 100, traverses: { front: { active: false }, rear: { active: false } } });
    expect(trav.front.active || trav.rear.active).toBe(true);
  });
});

describe("getWorldFootprint", () => {
  const dims = { width: 600, height: 720, depth: 513 };

  it("rotation 0: odcisk = surowe wymiary", () => {
    expect(getWorldFootprint({ dimensions: dims, rotation: 0 })).toEqual({ worldW: 600, worldD: 513, rotation: 0 });
  });

  it("rotation 180: odcisk = surowe wymiary (obrót w płaszczyźnie, bez zamiany osi)", () => {
    expect(getWorldFootprint({ dimensions: dims, rotation: 180 })).toEqual({ worldW: 600, worldD: 513, rotation: 180 });
  });

  it("rotation 90: szerokość i głębokość zamieniają się miejscami", () => {
    expect(getWorldFootprint({ dimensions: dims, rotation: 90 })).toEqual({ worldW: 513, worldD: 600, rotation: 90 });
  });

  it("rotation 270: szerokość i głębokość zamieniają się miejscami", () => {
    expect(getWorldFootprint({ dimensions: dims, rotation: 270 })).toEqual({ worldW: 513, worldD: 600, rotation: 270 });
  });

  it("brak pola rotation traktowany jak 0 (stare moduły sprzed tej funkcji)", () => {
    expect(getWorldFootprint({ dimensions: dims })).toEqual({ worldW: 600, worldD: 513, rotation: 0 });
  });
});

describe("clampModuleToRoom", () => {
  beforeEach(() => setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 } })));

  it("nie rusza modułu, który mieści się w pokoju", () => {
    const mod = baseModule({ position: { x: 100, y: 0, z: 200 } });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(100);
    expect(mod.position.z).toBe(200);
  });

  it("ścina pozycję, gdy moduł wystaje poza daleką ścianę (X/Z)", () => {
    const mod = baseModule({ position: { x: 5000, y: 0, z: 5000 } });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 600); // room.width - worldW
    expect(mod.position.z).toBe(3000 - 513); // room.depth - worldD
  });

  it("ścina ujemną pozycję do 0 (np. po ręcznym wpisaniu)", () => {
    const mod = baseModule({ position: { x: -200, y: 0, z: -50 } });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(0);
    expect(mod.position.z).toBe(0);
  });

  it("uwzględnia obrót - odcisk 90° zamienia W/D przy liczeniu granicy", () => {
    const mod = baseModule({ position: { x: 5000, y: 0, z: 0 }, rotation: 90 });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 513); // worldW po obrocie = lokalna głębokość (513)
  });
});
