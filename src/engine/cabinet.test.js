import { describe, it, expect, beforeEach } from "vitest";
import { calculateParts, calculateAllProjectParts } from "./cabinet.js";
import { calculateProjectHardware } from "./hardware.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { drawerSystems } from "../core/drawerSystems.js";
import { buildSlopeElements } from "../core/slopeCabinet.js";

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

  it("dzieli cokół pełnej ściany (6 × 600) na części mieszczące się na arkuszu, na stykach szafek", () => {
    setProject(
      freshProject({
        modules: [0, 1, 2, 3, 4, 5].map((i) => baseModule({ id: `m${i}`, position: { x: i * 600, y: 0, z: 0 } })),
      })
    );
    const parts = calculateAllProjectParts();
    const plinths = parts.filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths.map((p) => p.length)).toEqual([1800, 1800]);
    expect(plinths.map((p) => p.name)).toEqual(["Cokół dolny (Odcinek 1, część 1/2)", "Cokół dolny (Odcinek 1, część 2/2)"]);
  });

  it("dłuższy bok arkusza z project.cutPlan decyduje o podziale", () => {
    setProject(
      freshProject({
        cutPlan: { sheetW: 4100, sheetH: 2070, trim: 10 },
        modules: [0, 1, 2, 3, 4, 5].map((i) => baseModule({ id: `m${i}`, position: { x: i * 600, y: 0, z: 0 } })),
      })
    );
    const plinths = calculateAllProjectParts().filter((p) => p.name.startsWith("Cokół dolny"));
    expect(plinths).toHaveLength(1);
    expect(plinths[0]).toMatchObject({ name: "Cokół dolny (Odcinek 1)", length: 3600 });
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

    const dno = parts.find((p) => p.name.startsWith("Dno szuflady NL"));
    expect(dno.name).toBe("Dno szuflady NL500"); // głęb. wnętrza 510 -> NL 500
    expect(dno).toMatchObject({ length: 474, width: 513 });

    const tyl = parts.find((p) => p.name.startsWith("Tył szuflady"));
    expect(tyl.name).toBe("Tył szuflady (E)"); // wariant wysoki
    expect(tyl).toMatchObject({ length: 513, width: 184 });
  });
});

describe("front wpuszczany: pozycja otworów prowadnicy dolnej szuflady", () => {
  // Front wpuszczany nie zjeżdża na wieniec dolny (patrz core/layout.js, gałąź
  // isBottomOuter) - el.y jest już liczone od wnętrza. Bez poprawki w
  // getFrontsAndDrawers/dY (render/viewer3d.js) prowadnica dolnej szuflady
  // wychodziła o całą grubość płyty (18mm) za wysoko przy froncie wpuszczanym,
  // mimo że wymiary formatek (cutlist) się nie zmieniały - stąd wizualnie
  // "unosząca się" szuflada w 3D.
  const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };
  const railOffset = drawerSystems.merivobox.mounting.railOffset;
  const board = 18;
  const drawerFront = () => ({
    id: "f0", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3, distribution: "1", baseZone: { ...zone },
  });

  it("front nakładany: prowadnica siedzi na el.y + grubość płyty (zjeżdża na wieniec)", () => {
    const mod = baseModule({ elements: [drawerFront()] });
    setProject(freshProject({ modules: [mod] }));
    const { mountingData } = calculateParts();
    const slideY = mountingData.find((m) => m.type === "drawer").slideSideHoles[0].y;
    expect(slideY).toBeCloseTo(mod.elements[0].y + board + railOffset);
  });

  it("front wpuszczany: prowadnica siedzi wprost na el.y, BEZ dodatkowej grubości płyty", () => {
    const mod = baseModule({ front: { type: "wpuszczane" }, elements: [drawerFront()] });
    setProject(freshProject({ modules: [mod] }));
    const { mountingData } = calculateParts();
    const slideY = mountingData.find((m) => m.type === "drawer").slideSideHoles[0].y;
    expect(slideY).toBeCloseTo(mod.elements[0].y + railOffset);
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
    const tyl = parts.find((p) => p.name.startsWith("Tył szuflady"));
    expect(tyl.name).toBe("Tył szuflady (N)");
    expect(tyl.width).toBe(69);
  });
});

describe("calculateProjectHardware", () => {
  it("liczy nóżki (4/szafkę) i faktyczne zestawy złączy korpusowych", () => {
    setProject(freshProject({ modules: [baseModule()] }));
    const hw = calculateProjectHardware();

    expect(hw.find((h) => h.name.startsWith("Nóżka regulowana"))).toMatchObject({ qty: 4 });
    // głęb. 513: 3 zestawy na połączenie (37 / 261 / 476) x 2 boki x 2 wieńce = 12
    expect(hw.find((h) => h.name.startsWith("Złącze korpusowe"))).toMatchObject({ qty: 12 });
  });

  it("półka stała dokłada swoje zestawy złączy, płytka szafka ma ich mniej", () => {
    const shelf = { id: "s1", typ: "poziom", x: 18, w: 564, y: 300, h: 18, isStructural: true };
    setProject(freshProject({ modules: [baseModule({ elements: [shelf] })] }));
    expect(calculateProjectHardware().find((h) => h.name.startsWith("Złącze korpusowe"))).toMatchObject({ qty: 18 });
    setProject(freshProject({ modules: [baseModule({ dimensions: { width: 600, height: 720, depth: 320 } })] }));
    expect(calculateProjectHardware().find((h) => h.name.startsWith("Złącze korpusowe"))).toMatchObject({ qty: 8 });
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

describe("nawierty kołek+wkręt przegrody pionowej (isStructural) w wieńcach", () => {
  it("przegroda na kołek+wkręt, rozpięta na całą wysokość, generuje nawierty w wieńcu dolnym i górnym", () => {
    const mod = baseModule({
      elements: [
        { id: "p0", typ: "pion", x: 291, y: 18, w: 18, h: 684, isStructural: true },
      ],
    });
    setProject(freshProject({ modules: [mod] }));

    const { mountingData } = calculateParts();
    const mounts = mountingData.filter((m) => m.type === "wieniec-mount");
    expect(mounts.map((m) => m.panelKey).sort()).toEqual(["wieniec-dolny", "wieniec-gorny"]);

    const bottom = mounts.find((m) => m.panelKey === "wieniec-dolny");
    // środek przegrody (x=291, w=18) -> 300, wieniec "wpuszczony" między boki
    // (domyślny joinType) zaczyna się od X=th(18), więc względem NIEGO to 282.
    expect(bottom.holes[0].x).toBeCloseTo(282);
    expect(bottom.holes).toHaveLength(6); // 3x (screw+dowel) - przód, środek (głęb. > 250 mm odstępu), tył
  });

  it("nie generuje nawiertów, gdy przegroda nie jest oznaczona jako isStructural", () => {
    const mod = baseModule({
      elements: [
        { id: "p0", typ: "pion", x: 291, y: 18, w: 18, h: 684, isStructural: false },
      ],
    });
    setProject(freshProject({ modules: [mod] }));

    const { mountingData } = calculateParts();
    expect(mountingData.some((m) => m.type === "wieniec-mount")).toBe(false);
  });
});

describe("Szuflada Blum MOVENTO (skrzynka drewniana)", () => {
  const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };
  const drawer = (extra = {}) => ({
    id: "f0", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3, distribution: "1", baseZone: { ...zone }, ...extra,
  });

  it("formatki: 2 boki, dno i tył/przód × 2 z wpisaną wysokością boku", () => {
    const mod = baseModule({ front: { drawerSystem: "movento_katalog" }, elements: [drawer({ drawerSideHeight: 150 })] });
    setProject(freshProject({ modules: [mod] }));
    const { parts } = calculateParts();
    const p = (prefix) => parts.find((x) => x.name.startsWith(prefix));
    // LW = 564, NL = 500 (głębokość wieńca 510 - 5) -> SKW 522, SKL 490
    expect(p("Bok szuflady")).toMatchObject({ length: 490, width: 150, qty: 2, category: "Szuflada" });
    expect(p("Dno szuflady")).toMatchObject({ length: 490, width: 522, qty: 1 });
    // tył i czoło wewnętrzne to ta sama formatka - jeden wiersz "Tył/Przód" × 2
    expect(p("Tył/Przód szuflady")).toMatchObject({ length: 522, width: 121, qty: 2 });
    expect(p("Czoło wewn.")).toBeUndefined();
  });

  it("okucia: komplet prowadnic MOVENTO z sprzęgłami zamiast kompletu szuflady", () => {
    const mod = baseModule({ front: { drawerSystem: "movento_katalog" }, elements: [drawer()] });
    setProject(freshProject({ modules: [mod] }));
    const hw = calculateProjectHardware();
    const list = Array.isArray(hw) ? hw : Object.values(hw);
    expect(list.some((h) => /MOVENTO 760H \(40 kg\) NL-500 \+ sprzęgła T51\.7601/.test(h.name))).toBe(true);
  });
});

describe("Szafka pod skos w liście formatek i okuć projektu", () => {
  it("korpus, fronty, blendy i komplety prowadnic trafiają do list projektu", () => {
    const mod = {
      id: "skos-1", name: "Skos", type: "slope_cabinet",
      dimensions: { width: 2000, height: 1500, depth: 600 }, position: { x: 0, y: 0, z: 0 },
      legs: { active: false }, front: { drawerSystem: "movento_katalog" }, elements: [],
      slope: { lowSide: "left", lowHeight: 0 },
    };
    setProject(freshProject({ modules: [mod] }));
    // Wnętrze jak z edytora Wnętrze 2D: przegrody 646 i 1314, półki 500 i 1000.
    mod.elements = buildSlopeElements(mod, 18, [646, 1314], [500, 1000], 3);
    const parts = calculateAllProjectParts();
    expect(parts.some((p) => p.name.startsWith("Skos (wieniec skośny)"))).toBe(true);
    expect(parts.filter((p) => p.name.startsWith("Blenda skos")).length).toBeGreaterThan(0);
    expect(parts.some((p) => p.name.startsWith("Front szuflady"))).toBe(true);
    const hw = Object.values(calculateProjectHardware());
    const runners = hw.find((h) => h.name.includes("MOVENTO 766H (60 kg) NL-580"));
    expect(runners).toMatchObject({ qty: 3 });
  });
});

describe("formatki szuflad z szafek o różnej szerokości się sumują", () => {
  // Zgłoszony błąd: nazwa zawierała szerokość szafki (Bok szuflady W570... / W581...),
  // więc identyczne boki 690 × 350 z dwóch szafek nie łączyły się w jeden wiersz.
  it("boki MOVENTO o tych samych wymiarach w jednym wierszu, niezależnie od szafki", () => {
    const drawer = (id) => ({
      id, typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3, distribution: "1",
      baseZone: { minX: 18, maxX: 0, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" },
    });
    const a = baseModule({ id: "a", name: "A", dimensions: { width: 600, height: 720, depth: 513 }, elements: [drawer("fa")] });
    const b = baseModule({ id: "b", name: "B", position: { x: 600, y: 0, z: 0 }, dimensions: { width: 700, height: 720, depth: 513 }, elements: [drawer("fb")] });
    a.elements[0].baseZone.maxX = 582;
    b.elements[0].baseZone.maxX = 682;
    const project = freshProject({ modules: [a, b] });
    project.front.drawerSystem = "movento_katalog";
    setProject(project);
    const sides = calculateAllProjectParts().filter((p) => p.name.startsWith("Bok szuflady"));
    expect(sides).toHaveLength(1);
    expect(sides[0].qty).toBe(4);
    expect(sides[0].name).not.toMatch(/W\d/);
  });
});
