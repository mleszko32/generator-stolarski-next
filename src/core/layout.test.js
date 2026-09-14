import { describe, it, expect, beforeEach } from "vitest";
import { recalculateLayout, recalculateAllLayouts, getTraverseConfig, getWorldFootprint, clampModuleToRoom, migrateLegacyRoom, restModuleOnNeighbors } from "./layout.js";
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

  it("rezerwuje miejsce na blendę prawą, żeby nie przenikała przez daleką ścianę", () => {
    const mod = baseModule({
      position: { x: 5000, y: 0, z: 0 },
      fillers: { right: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 600 - 50); // room.width - worldW - blenda prawa
  });

  it("rezerwuje miejsce na blendę lewą, żeby nie przenikała przez bliską ścianę", () => {
    const mod = baseModule({
      position: { x: -200, y: 0, z: 0 },
      fillers: { left: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(50); // nie 0 - blenda lewa potrzebuje własnych 50mm
  });

  it("nieaktywna blenda nie ogranicza pozycji", () => {
    const mod = baseModule({
      position: { x: 5000, y: 0, z: 0 },
      fillers: { right: { active: false, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 600);
  });

  // Obrót co 90° obraca lokalny układ modułu (lewa/prawa) względem pokoju -
  // patrz komentarz w clampModuleToRoom. Bez tego blenda modułu obróconego
  // przenikała przez ścianę, mimo że sama funkcja "znała" już blendy
  // (zgłoszony bug na konkretnym zapisanym projekcie).
  it("obrót 180° zamienia strony - blenda prawa zagraża BLISKIEJ ścianie X", () => {
    const mod = baseModule({
      position: { x: -200, y: 0, z: 0 },
      rotation: 180,
      fillers: { right: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(50);
  });

  it("obrót 180° - blenda lewa zagraża DALEKIEJ ścianie X", () => {
    const mod = baseModule({
      position: { x: 5000, y: 0, z: 0 },
      rotation: 180,
      fillers: { left: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 600 - 50);
  });

  it("obrót 90° - blendy L/R działają na osi Z (bliska/daleka), nie na X", () => {
    const mod = baseModule({
      position: { x: 5000, y: 0, z: -200 },
      rotation: 90,
      fillers: { left: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.x).toBe(3500 - 513); // X liczone bez blend, jak zwykły odcisk
    expect(mod.position.z).toBe(50); // blenda lewa zagraża bliskiej ścianie Z
  });

  it("obrót 270° - blenda prawa zagraża bliskiej ścianie Z, lewa dalekiej", () => {
    const mod = baseModule({
      position: { x: 0, y: 0, z: -200 },
      rotation: 270,
      fillers: { right: { active: true, width: 50 } },
    });
    clampModuleToRoom(mod);
    expect(mod.position.z).toBe(50);
  });
});

describe("restModuleOnNeighbors", () => {
  beforeEach(() => setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 } })));

  it("dosuwa moduł stawiany NA drugim (ten sam ślad X/Z), zamiast zostawić go zatopionym", () => {
    const bottom = baseModule({ id: "bottom", position: { x: 0, y: 0, z: 0 } }); // 600x720x513
    const top = baseModule({ id: "top", position: { x: 0, y: 700, z: 0 } }); // wpisano "700" zamiast 720 - 20mm zatopione
    setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 }, modules: [bottom, top] }));
    restModuleOnNeighbors(top);
    expect(top.position.y).toBe(720);
  });

  it("dosuwa moduł stawiany POD drugim analogicznie w dół", () => {
    const top = baseModule({ id: "top", position: { x: 0, y: 720, z: 0 } });
    const bottom = baseModule({ id: "bottom", position: { x: 0, y: 20, z: 0 } }); // powinno być y=0
    setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 }, modules: [top, bottom] }));
    restModuleOnNeighbors(bottom);
    expect(bottom.position.y).toBe(0);
  });

  it("nie rusza modułu, gdy sąsiad jest obok (w rzędzie), nie pod/nad nim", () => {
    const a = baseModule({ id: "a", position: { x: 0, y: 0, z: 0 } });
    const b = baseModule({ id: "b", position: { x: 600, y: 0, z: 0 } }); // stykają się krawędzią w X, ten sam Y
    setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 }, modules: [a, b] }));
    restModuleOnNeighbors(b);
    expect(b.position.x).toBe(600);
    expect(b.position.y).toBe(0);
  });

  it("nie rusza modułu bez rzeczywistego nakładania (osobno stojące szafki)", () => {
    const a = baseModule({ id: "a", position: { x: 0, y: 0, z: 0 } });
    const b = baseModule({ id: "b", position: { x: 2000, y: 0, z: 2000 } });
    setProject(freshProject({ room: { width: 3500, height: 2600, depth: 3000 }, modules: [a, b] }));
    restModuleOnNeighbors(b);
    expect(b.position.x).toBe(2000);
    expect(b.position.y).toBe(0);
    expect(b.position.z).toBe(2000);
  });
});

describe("migrateLegacyRoom", () => {
  const LEGACY = { width: 3500, height: 2600, depth: 600 };

  it("nie rusza pokoju, który nie jest martwym placeholderem sprzed funkcji (nawet jeśli szafki wystają)", () => {
    const project = {
      room: { width: 1000, height: 2600, depth: 1000 }, // celowo mały, ale to NIE sygnatura legacy
      modules: [baseModule({ position: { x: 5000, y: 0, z: 0 } })],
    };
    migrateLegacyRoom(project);
    expect(project.room).toEqual({ width: 1000, height: 2600, depth: 1000 });
  });

  it("bez modułów: zamienia martwy placeholder na nowy, realny DEFAULT_ROOM", () => {
    const project = { room: { ...LEGACY }, modules: [] };
    migrateLegacyRoom(project);
    expect(project.room).toEqual({ width: 4000, height: 2600, depth: 3000 });
  });

  it("z modułami: dopasowuje pokój do istniejącego układu (z zapasem, zaokrąglone do 10mm)", () => {
    const project = {
      room: { ...LEGACY },
      modules: [
        baseModule({
          position: { x: 4500, y: 0, z: 3200 },
          dimensions: { width: 600, height: 2200, depth: 513 },
          legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
        }),
      ],
    };
    migrateLegacyRoom(project);
    expect(project.room).toEqual({ width: 5300, height: 2600, depth: 3920 });
  });
});
