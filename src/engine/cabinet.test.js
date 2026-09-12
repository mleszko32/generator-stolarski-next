import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateParts,
  calculateAllProjectParts,
  calculateProjectHardware,
} from "./cabinet.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const find = (parts, name) => parts.find((p) => p.name === name);

describe("calculateParts — pojedyncza szafka bez wnętrza", () => {
  beforeEach(() => {
    setProject(freshProject({ modules: [baseModule()] }));
  });

  it("liczy boki, wieńce i plecy dla korpusu 600x720x513 (płyta 18, HDF 3)", () => {
    const { parts } = calculateParts();

    // Bok L/P: wysokość = wys. korpusu, głębokość = głęb. - grubość HDF
    expect(find(parts, "Bok (L/P)")).toMatchObject({ length: 720, width: 510, qty: 2 });

    // wieniec górny + dolny agregują się do jednej pozycji qty 2
    expect(find(parts, "W600")).toMatchObject({ length: 564, width: 510, qty: 2 });

    // plecy nakładane = wymiar zewnętrzny - 4
    expect(find(parts, "Plecy 720x600")).toMatchObject({ length: 716, width: 596, qty: 1 });
  });

  it("zwraca dane montażowe (nawierty korpusu) dla widoku 2D", () => {
    const { mountingData } = calculateParts();
    expect(mountingData.some((m) => m.type === "corpus")).toBe(true);
  });
});

describe("calculateAllProjectParts — cały projekt", () => {
  beforeEach(() => {
    setProject(freshProject({ modules: [baseModule()] }));
  });

  it("dokłada cokół dla szafki na nóżkach z cokołem", () => {
    const parts = calculateAllProjectParts();
    const plinth = parts.find((p) => p.name.startsWith("Cokół dolny"));
    expect(plinth).toMatchObject({ length: 600, width: 100, qty: 1 });
  });

  it("scala cokół dwóch stykających się szafek w jeden odcinek", () => {
    setProject(
      freshProject({
        modules: [
          baseModule({ id: "m1", position: { x: 0, y: 0, z: 0 } }),
          baseModule({ id: "m2", position: { x: 600, y: 0, z: 0 } }),
        ],
      })
    );
    const parts = calculateAllProjectParts();
    const plinths = parts.filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths).toHaveLength(1);
    expect(plinths[0]).toMatchObject({ length: 1200, qty: 1 });
  });

  it("scala cokół dwóch szafek obróconych o 90° pod tą samą ścianą wzdłuż Z (nie X)", () => {
    setProject(
      freshProject({
        modules: [
          baseModule({ id: "m1", position: { x: 0, y: 0, z: 0 }, rotation: 90 }),
          baseModule({ id: "m2", position: { x: 0, y: 0, z: 600 }, rotation: 90 }),
        ],
      })
    );
    const parts = calculateAllProjectParts();
    const plinths = parts.filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths).toHaveLength(1);
    expect(plinths[0]).toMatchObject({ length: 1200, qty: 1 });
  });

  it("NIE scala cokołów dwóch szafek o różnym rotation, nawet stykających się po X", () => {
    setProject(
      freshProject({
        modules: [
          baseModule({ id: "m1", position: { x: 0, y: 0, z: 0 }, rotation: 0 }),
          baseModule({ id: "m2", position: { x: 600, y: 0, z: 0 }, rotation: 90 }),
        ],
      })
    );
    const parts = calculateAllProjectParts();
    const plinths = parts.filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths).toHaveLength(2);
  });
});

describe("integracja layout -> drawerMath -> lista formatek", () => {
  beforeEach(() => {
    const mod = baseModule({
      elements: [
        {
          id: "f0",
          typ: "front",
          subtype: "szuflada",
          frontIndex: 0,
          gap: 3,
          distribution: "1",
          baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
        },
      ],
    });
    setProject(freshProject({ modules: [mod] }));
  });

  it("pojedyncza szuflada MERIVOBOX generuje front, dno i tył o wymiarach z katalogu", () => {
    const { parts } = calculateParts();

    const front = parts.find((p) => p.category === "Front");
    expect(front.name).toBe("Front szuflady");
    expect(front.length).toBeGreaterThan(700); // ~715 mm na pełną wnękę

    const dno = parts.find((p) => p.name.startsWith("Dno W600 NL"));
    expect(dno.name).toBe("Dno W600 NL500"); // głęb. wnętrza 510 -> NL 500
    expect(dno).toMatchObject({ length: 474, width: 513 });

    const tyl = parts.find((p) => p.name.startsWith("Tył W600"));
    expect(tyl.name).toBe("Tył W600 (E)"); // wariant wysoki
    expect(tyl).toMatchObject({ length: 513, width: 184 });
  });
});

describe("Trawersy górne (przedni/tylny)", () => {
  it("dwa trawersy tej samej szerokości agregują się w jedną pozycję qty:2 (jak dotychczas)", () => {
    const mod = baseModule({ construction: { topType: "trawersy_poziom", traverseWidth: 80 } });
    setProject(freshProject({ modules: [mod] }));
    const { parts } = calculateParts();
    const trav = parts.filter((p) => p.name.startsWith("Trawers górny"));
    expect(trav).toHaveLength(1);
    expect(trav[0]).toMatchObject({ qty: 2, width: 80 });
  });

  it("różna szerokość przedniego i tylnego trawersu daje dwie osobne pozycje", () => {
    const mod = baseModule({
      construction: { topType: "trawersy_poziom", traverseWidth: 100, traverses: { front: { width: 60 } } },
    });
    setProject(freshProject({ modules: [mod] }));
    const { parts } = calculateParts();
    const trav = parts.filter((p) => p.name.startsWith("Trawers górny"));
    expect(trav).toHaveLength(2);
    expect(trav.map((p) => p.width).sort((a, b) => a - b)).toEqual([60, 100]);
  });

  it("wyłączenie tylnego trawersu zostawia tylko przedni (tylko-przedni / tylko-tylny)", () => {
    const mod = baseModule({
      construction: { topType: "trawersy_poziom", traverseWidth: 100, traverses: { rear: { active: false } } },
    });
    setProject(freshProject({ modules: [mod] }));
    const { parts } = calculateParts();
    const trav = parts.filter((p) => p.name.startsWith("Trawers górny"));
    expect(trav).toHaveLength(1);
    expect(trav[0].qty).toBe(1);
  });
});

describe("front.forceVariant wymusza realny wariant systemu (klucz katalogu, nie litera typu)", () => {
  it("wymuszona bardzo niska wysokość ogranicza otwory frontu mimo dużej dostępnej przestrzeni", () => {
    const mod = baseModule({
      front: { drawerSystem: "antaro" },
      elements: [
        {
          id: "f0",
          typ: "front",
          subtype: "szuflada",
          frontIndex: 0,
          gap: 3,
          distribution: "1",
          forceVariant: "bardzoniska", // antaro: bardzoniska = 69mm < 200mm
          baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
        },
      ],
    });
    setProject(freshProject({ modules: [mod] }));

    const { parts, mountingData } = calculateParts();
    const drawer = mountingData.find((m) => m.type === "drawer");
    // Front ma pełną wysokość wnęki (~684mm) - bez uwzględnienia forceVariant
    // dostałby 3 otwory (próg to 200mm); z nim: tylko 2.
    expect(drawer.frontHoles).toHaveLength(2);

    // I samo wymuszenie faktycznie dotarło do getDrawerComponents (a nie zostało
    // po drodze odrzucone jako "za mało miejsca") - tył szuflady ma wysokość
    // bardzoniskiego wariantu antaro (typ N, 69mm), a nie auto-dobranego wyższego.
    const tyl = parts.find((p) => p.name.startsWith("Tył W600"));
    expect(tyl.name).toBe("Tył W600 (N)");
    expect(tyl.width).toBe(69);
  });
});

describe("calculateProjectHardware", () => {
  it("liczy nóżki (4/szafkę) i złącza korpusowe (8/szafkę)", () => {
    setProject(freshProject({ modules: [baseModule()] }));
    const hw = calculateProjectHardware();

    expect(hw.find((h) => h.name.startsWith("Nóżka regulowana"))).toMatchObject({ qty: 4 });
    expect(hw.find((h) => h.name.startsWith("Złącze korpusowe"))).toMatchObject({ qty: 8 });
  });

  it("nóżka z ręcznie nadpisaną wysokością liczy się osobno od pozostałych trzech", () => {
    const mod = baseModule({
      legs: { active: true, height: 100, plinth: true, plinthOffset: 40, heightOverrides: { 0: 90 } },
    });
    setProject(freshProject({ modules: [mod] }));
    const hw = calculateProjectHardware();

    expect(hw.find((h) => h.name === "Nóżka regulowana H-100")).toMatchObject({ qty: 3 });
    expect(hw.find((h) => h.name === "Nóżka regulowana H-90")).toMatchObject({ qty: 1 });
  });

  it("dokłada komplet prowadnic dla szafki z szufladą", () => {
    const mod = baseModule({
      elements: [
        {
          id: "f0",
          typ: "front",
          subtype: "szuflada",
          frontIndex: 0,
          gap: 3,
          distribution: "1",
          baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
        },
      ],
    });
    setProject(freshProject({ modules: [mod] }));

    const hw = calculateProjectHardware();
    expect(hw.some((h) => h.name.startsWith("Komplet szuflady (MERIVOBOX"))).toBe(true);
  });
});
