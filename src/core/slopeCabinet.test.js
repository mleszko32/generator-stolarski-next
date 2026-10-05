import { describe, it, expect, beforeEach } from "vitest";
import {
  getSlopeGeometry, getSlopeInnerRect, getSlopeDividers, getSlopeShelfPieces, getSlopeCabinetParts,
  getSlopeCabinetPolygons, clipFrontRect, getSlopeFronts, getSlopeFrontParts, getSlopeDrawerHardware,
  getSlopeFrontSettings, getSlopeBoards, insetPolygon, getSlopeShapes, buildSlopeElements, migrateSlopeModule,
} from "./slopeCabinet.js";
import { recalculateLayout } from "./layout.js";
import { buildZoneTree, assignFront } from "./zoneTree.js";
import { freshProject, setProject } from "../test/fixtures.js";

const config = { materials: { boardThickness: 18, backThickness: 3 } };

// Szafka pod skos z wnętrzem jak z edytora 2D: przegrody (lewa ściana, rzeczywiste x),
// półki (spód) i szuflada w każdej wnęce. Ustawia projekt i przelicza układ frontów.
function slopeMod({ width = 1000, height = 1000, depth = 600, lowSide = "left", lowHeight = 0, drawerBox = "A", dividers = [], shelves = [], front = {} } = {}) {
  const mod = {
    id: "skos", name: "Skos", type: "slope_cabinet",
    dimensions: { width, height, depth }, position: { x: 0, y: 0, z: 0 },
    legs: { active: false }, front, slope: { lowSide, lowHeight, drawerBox }, elements: [],
  };
  const project = freshProject({ modules: [mod] });
  project.front.drawerSystem = "movento_katalog";
  setProject(project);
  mod.elements = buildSlopeElements(mod, 18, dividers, shelves, 3);
  recalculateLayout(mod);
  return mod;
}
const cfg = () => ({ ...config, front: { gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 }, drawerSystem: "movento_katalog" } });
const part = (parts, prefix) => parts.find((p) => p.name.startsWith(prefix));

// Trójkąt 1000 x 1000: kąt 45°, pionowa grubość skosu c = 18·√2 ≈ 25,46 mm.
describe("szafka pod skos - trójkąt 45°", () => {
  it("geometria i prostokąt wnętrza do najwyższego miejsca pod skosem", () => {
    const m = slopeMod();
    const g = getSlopeGeometry(m);
    expect(g.isTriangle).toBe(true);
    expect(g.angle).toBeCloseTo(45, 5);
    expect(g.c).toBeCloseTo(25.456, 2);
    const r = getSlopeInnerRect(m);
    expect(r.minX).toBe(0);
    expect(r.maxX).toBe(982);
    expect(r.minY).toBe(18);
    expect(r.maxY).toBeCloseTo(956.5, 1);
  });

  it("formatki korpusu przy dnie nakładanym: skos i bok stoją na dnie", () => {
    const parts = getSlopeCabinetParts(slopeMod(), config);
    // Skos: wierzch od x = 18 (dno) do 1000 pod 45°, spód od x = 43,46 (956,54 / cos 45° = 1352,75).
    expect(part(parts, "Skos")).toMatchObject({ length: 1388.8, width: 597, qty: 1 });
    expect(part(parts, "Skos").name).toBe("Skos (wieniec skośny) (cięcie 45° i 45°, krótsza 1352.8)");
    expect(part(parts, "Bok wysoki")).toMatchObject({ length: 956.5, width: 597 });
    expect(part(parts, "Bok wysoki").name).toContain("krótsza 938.5");
    // Dno na całą szerokość, koniec przy skosie docięty równo z linią skosu.
    expect(part(parts, "Dno")).toMatchObject({ length: 1000 });
    expect(part(parts, "Dno").name).toContain("krótsza 982");
    expect(part(parts, "Bok niski")).toBeUndefined();
    // Plecy zwężone o 2 mm z każdej strony; w ostrym rogu 45° przyprostokątna
    // krótsza o 2 + 2 / tg 22,5° = 6,83 mm.
    expect(part(parts, "Plecy")).toMatchObject({ length: 993.2, width: 993.2, category: "Plecy" });
  });

  it("przegroda z edytora jest przycinana skosem (wyższa ściana od strony wysokiej)", () => {
    const m = slopeMod({ dividers: [500] });
    const [d] = getSlopeDividers(m);
    expect(d.hLeft).toBeCloseTo(456.5, 1);
    expect(d.hRight).toBeCloseTo(474.5, 1);
    expect(part(getSlopeCabinetParts(m, config), "Przegroda")).toMatchObject({ length: 474.5, width: 597 });
  });

  it("półka w kolumnie przy skosie docięta pod kątem, w drugiej kolumnie prosta", () => {
    const pieces = getSlopeShelfPieces(slopeMod({ dividers: [500], shelves: [300] }));
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces;
    expect(a.x1 - a.x0Bottom).toBeCloseTo(174.5, 1);
    expect(a.x1 - a.x0Top).toBeCloseTo(156.5, 1);
    expect(b.x1 - b.x0Bottom).toBeCloseTo(464, 5);
  });

  it("pomija przegrodę za nisko pod skosem i nie wstawia półki nad skosem", () => {
    expect(getSlopeDividers(slopeMod({ dividers: [40] }))).toHaveLength(0);
    expect(getSlopeShelfPieces(slopeMod({ shelves: [990] }))).toHaveLength(0);
  });
});

describe("szafka pod skos - trapez i strona skosu", () => {
  it("trapez: niski bok stoi na dnie, dno prostokątne na całą szerokość", () => {
    const m = slopeMod({ lowHeight: 400 });
    expect(getSlopeGeometry(m).isTriangle).toBe(false);
    const parts = getSlopeCabinetParts(m, config);
    expect(part(parts, "Bok niski")).toMatchObject({ length: 371.8 });
    expect(part(parts, "Bok niski").name).toContain("krótsza 361");
    expect(part(parts, "Dno")).toMatchObject({ length: 1000, name: "Dno (wieniec dolny)" });
  });

  it("za niska niska strona liczy się jak trójkąt", () => {
    expect(getSlopeGeometry(slopeMod({ lowHeight: 30 })).isTriangle).toBe(true);
  });

  it("skos po prawej z lustrzanym wnętrzem daje te same formatki korpusu", () => {
    const left = getSlopeCabinetParts(slopeMod({ dividers: [500], shelves: [300] }), config);
    const right = getSlopeCabinetParts(slopeMod({ lowSide: "right", dividers: [482], shelves: [300] }), config);
    expect(right).toEqual(left);
  });

  it("wielokąty 3D: skos po prawej jest odbiciem lustrzanym", () => {
    const l = getSlopeCabinetPolygons(slopeMod());
    const r = getSlopeCabinetPolygons(slopeMod({ lowSide: "right" }));
    expect(r.polys).toHaveLength(l.polys.length);
    expect(l.back).toContainEqual([0, 0]);
    expect(r.back).toContainEqual([1000, 0]);
    expect(r.back).toContainEqual([0, 1000]);
  });
});

describe("szafka pod skos - stare wnętrze (kolumny/półki) zamieniane na elementy", () => {
  beforeEach(() => setProject(freshProject()));
  const legacy = (slope) => ({ type: "slope_cabinet", dimensions: { width: 1000, height: 1000, depth: 600 }, front: {}, elements: [], slope: { lowSide: "left", lowHeight: 0, ...slope } });

  it("kolumny z resztą -> przegrody, półki i szuflady w mod.elements", () => {
    const m = legacy({ columns: [null, 300, 300], shelves: [300] });
    expect(migrateSlopeModule(m, 18, 3)).toBe(true);
    expect(m.elements.filter((e) => e.typ === "pion").map((e) => e.x)).toEqual([346, 664]);
    expect(m.elements.some((e) => e.typ === "poziom")).toBe(true);
    expect(m.elements.some((e) => e.typ === "front")).toBe(true);
    expect(m.slope.columns).toBeUndefined();
    expect(migrateSlopeModule(m, 18, 3)).toBe(false);
  });

  it("starsze pozycje przegród (dividers) też", () => {
    const m = legacy({ dividers: [500] });
    migrateSlopeModule(m, 18, 3);
    expect(m.elements.filter((e) => e.typ === "pion").map((e) => e.x)).toEqual([500]);
  });
});

describe("szafka pod skos - kształty frontów (clipFrontRect)", () => {
  it("prostokąt, gdy skos jest ponad frontem", () => {
    expect(clipFrontRect(0, 100, 0, 50, 200, 1).kind).toBe("prostokat");
  });
  it("trapez: skos przecina oba pionowe boki", () => {
    expect(clipFrontRect(0, 100, 0, 300, 100, 1)).toMatchObject({ kind: "trapez", hLow: 100, hHigh: 200 });
  });
  it("ścięty róg: skos przecina bok i górę", () => {
    expect(clipFrontRect(0, 100, 0, 150, 100, 1)).toMatchObject({ kind: "scietyRog", hLow: 100, wTop: 50 });
  });
  it("skośny bok: skos przecina dół i górę", () => {
    expect(clipFrontRect(100, 300, 0, 100, -150, 1)).toMatchObject({ kind: "skosnyBok", wBottom: 150, wTop: 50 });
  });
  it("trójkąt i brak frontu", () => {
    expect(clipFrontRect(100, 300, 0, 200, -150, 1)).toMatchObject({ kind: "trojkat", w: 150, h: 150 });
    expect(clipFrontRect(100, 300, 0, 200, -500, 1).kind).toBe("brak");
  });
});

describe("szafka pod skos - fronty i szuflady z wnętrza", () => {
  // Jak na rysunku z Fusiona: trójkąt 2000 x 1500, przegrody 646 i 1314, półki 500 i 1000.
  const fusion = (opts = {}) => slopeMod({ width: 2000, height: 1500, dividers: [646, 1314], shelves: [500, 1000], ...opts });
  // Typy frontów od lewej, od dołu.
  const types = (m) => getSlopeFronts(m, cfg()).sort((a, b) => a.el.x - b.el.x || a.el.y - b.el.y).map((f) => f.type);
  const at = (m, x, y) => getSlopeFronts(m, cfg()).find((f) => f.el.x <= x && x <= f.el.x + f.el.w && f.el.y <= y && y <= f.el.y + f.el.h);

  it("trójkąty to blendy, reszta szuflady", () => {
    expect(types(fusion())).toEqual(["blenda", "szuflada", "blenda", "szuflada", "szuflada", "blenda"]);
  });

  it("skos po prawej (lustro) - te same typy, trzy blendy", () => {
    const r = types(fusion({ lowSide: "right", dividers: [668, 1336] }));
    expect([...r].sort()).toEqual([...types(fusion())].sort());
    expect(r.filter((t) => t === "blenda")).toHaveLength(3);
  });

  it("blendę można wymusić na dowolnym froncie", () => {
    const m = fusion();
    at(m, 1000, 200).el.slopeBlenda = true;
    expect(at(m, 1000, 200).type).toBe("blenda");
    expect(getSlopeDrawerHardware(m, cfg())).toHaveLength(2);
  });

  it("dwie szuflady jedna nad drugą w jednej wnęce (z edytora, bez półki)", () => {
    const m = fusion();
    const leaves = [];
    const walk = (n) => (n.type === "leaf" ? leaves.push(n) : (walk(n.a), walk(n.b)));
    walk(buildZoneTree(m));
    const leaf = leaves.find((l) => l.rect.minX > 1300 && l.rect.minY < 50);
    assignFront(m, leaf, "szuflada", { distribution: "2" });
    recalculateLayout(m);
    const inLeaf = getSlopeFronts(m, cfg()).filter((f) => f.el.baseZone.minX > 1300 && f.el.baseZone.minY < 50);
    expect(inLeaf).toHaveLength(2);
    inLeaf.forEach((f) => expect(f.type).toBe("szuflada"));
    expect(getSlopeDrawerHardware(m, cfg())).toHaveLength(4);
  });

  it("skrzynka A: prostokątna, wysokość od niższej strony", () => {
    const parts = getSlopeFrontParts(fusion(), cfg());
    expect(parts.filter((p) => p.name.startsWith("Front szuflady"))).toHaveLength(3);
    expect(parts.filter((p) => p.name.startsWith("Blenda"))).toHaveLength(3);
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438")).toMatchObject({ length: 570, width: 438, qty: 2 });
    expect(getSlopeDrawerHardware(fusion(), cfg())).toEqual(Array(3).fill("Prowadnice Blum MOVENTO 766H (60 kg) NL-580 + sprzęgła T51.7601"));
  });

  it("skrzynka B: boki różnej wysokości i tył trapezowy; bez skosu - zwykła skrzynka", () => {
    const parts = getSlopeFrontParts(fusion({ drawerBox: "B" }), cfg());
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438-459 (niski)")).toMatchObject({ width: 438, qty: 1 });
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438-459 (wysoki)")).toMatchObject({ width: 459, qty: 1 });
    expect(parts.find((p) => p.name.startsWith("Tył szuflady skos W686 NL580 H438-459"))).toMatchObject({ length: 608, width: 430 });
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H459")).toMatchObject({ qty: 2 });
  });

  it("skrzynka B przy systemie metalowym liczy się jako A", () => {
    const m = fusion({ drawerBox: "B", front: { drawerSystem: "merivobox" } });
    expect(at(m, 1000, 200).drawer.boxType).toBe("A");
  });

  it("luzy jak w zwykłej szafce: luz prawy odsłania wysoki bok", () => {
    const base = at(fusion(), 1600, 200).shape.w;
    const open = at(fusion({ front: { clearance: { right: 18 } } }), 1600, 200).shape.w;
    expect(base - open).toBeCloseTo(16.5, 5);
  });

  it("fronty wpuszczane: w obrysie korpusu, krótsza szuflada", () => {
    const f = at(fusion({ front: { type: "wpuszczane" } }), 1600, 200);
    expect(f.z.front).toBe(0);
    expect(f.drawer.comps.nominalLength).toBe(550);
  });

  it("luz pod skosem mierzony prostopadle do płyty", () => {
    const a = at(fusion(), 1000, 200).shape.hLow;
    const b = at(fusion({ front: { clearance: { slope: 10 } } }), 1000, 200).shape.hLow;
    // 7 mm więcej prostopadle = 7 / cos(36,87°) = 8,75 mm w pionie
    expect(a - b).toBeCloseTo(8.75, 5);
  });

  it("ustawienia frontów: domyślne z projektu, moduł je nadpisuje", () => {
    const m = fusion();
    expect(getSlopeFrontSettings(m, cfg())).toMatchObject({ isInset: false, gap: 3, cLeft: 1.5, cRight: 1.5, cBottom: 0, cSlope: 3 });
    expect(getSlopeFrontSettings({ ...m, front: { gap: 2, clearance: { bottom: 2 } } }, cfg())).toMatchObject({ gap: 2, cBottom: 2, cSlope: 2, cLeft: 1.5 });
  });

  it("drzwi pod skosem: trapezowe drzwi, trójkąt dalej blenda", () => {
    const m = fusion();
    m.elements.filter((e) => e.typ === "front").forEach((e) => { e.subtype = "drzwi"; });
    recalculateLayout(m);
    const t = types(m);
    expect(t.filter((x) => x === "drzwi")).toHaveLength(3);
    expect(t.filter((x) => x === "blenda")).toHaveLength(3);
    expect(getSlopeFrontParts(m, cfg()).some((p) => p.name.startsWith("Drzwi"))).toBe(true);
  });
});

describe("szafka pod skos - cięcia przez grubość (pochylenie piły)", () => {
  // 2000 x 1500, trójkąt: kąt skosu 36,87°, więc 90° - kąt = 53,13°.
  const boards = () => getSlopeBoards(slopeMod({ width: 2000, height: 1500, dividers: [646, 1314], shelves: [500, 1000] }), config);
  const one = (name) => boards().find((b) => b.name === name);

  it("boki i przegrody: piła pochylona o kąt skosu u góry", () => {
    expect(one("Bok wysoki").tiltEnd).toBeCloseTo(36.87, 2);
    expect(one("Bok wysoki").tiltStart).toBe(0);
    boards().filter((b) => b.name === "Przegroda").forEach((b) => expect(b.tiltEnd).toBeCloseTo(36.87, 2));
  });

  it("półki i dno przy skosie: piła pochylona o 90° minus kąt skosu", () => {
    expect(one("Dno (wieniec dolny)").tiltStart).toBeCloseTo(53.13, 2);
    const cut = boards().filter((b) => b.name === "Półka" && b.tiltStart > 0);
    expect(cut).toHaveLength(2);
    cut.forEach((b) => expect(b.tiltStart).toBeCloseTo(53.13, 2));
  });

  it("skośna płyta: dół na dnie 53,13°, góra przy wysokim boku 36,87°", () => {
    const s = one("Skos (wieniec skośny)");
    expect(s.tiltStart).toBeCloseTo(53.13, 2);
    expect(s.tiltEnd).toBeCloseTo(36.87, 2);
  });
});

describe("szafka pod skos - obrysy do rysunków", () => {
  it("insetPolygon zwęża kwadrat o 2 mm z każdej strony", () => {
    const r = insetPolygon([[0, 0], [100, 0], [100, 100], [0, 100]], 2);
    r.forEach((p, i) => [[2, 2], [98, 2], [98, 98], [2, 98]][i].forEach((v, j) => expect(p[j]).toBeCloseTo(v, 6)));
  });

  it("kształty: fronty nieprostokątne i plecy, lustrzane dla skosu po prawej", () => {
    const left = getSlopeShapes(slopeMod({ width: 2000, height: 1500, dividers: [646, 1314], shelves: [500, 1000] }), cfg());
    const right = getSlopeShapes(slopeMod({ width: 2000, height: 1500, lowSide: "right", dividers: [668, 1336], shelves: [500, 1000] }), cfg());
    expect(left.filter((s) => s.category === "Plecy")).toHaveLength(1);
    expect(left.filter((s) => s.category === "Front").reduce((n, s) => n + s.qty, 0)).toBe(5);
    expect(right.reduce((n, s) => n + s.qty, 0)).toBe(left.reduce((n, s) => n + s.qty, 0));
    const lb = left.find((s) => s.category === "Plecy").points;
    const rb = right.find((s) => s.category === "Plecy").points;
    expect(Math.max(...lb.filter((p) => p[1] > 1000).map((p) => p[0]))).toBeGreaterThan(1900);
    expect(Math.min(...rb.filter((p) => p[1] > 1000).map((p) => p[0]))).toBeLessThan(100);
  });
});

describe("szafka pod skos - skrzynki w edytorze Wnętrze 2D", () => {
  it("blenda nie ma skrzynki, szuflada ma skrzynkę pod skosem", async () => {
    const { getDrawerBoxRect } = await import("./drawerBoxes.js");
    const m = slopeMod({ width: 2000, height: 1500, dividers: [646, 1314], shelves: [500, 1000] });
    const fronts = getSlopeFronts(m, cfg());
    const blenda = fronts.find((f) => f.type === "blenda");
    const drawer = fronts.find((f) => f.type === "szuflada" && f.shape.kind === "scietyRog");
    expect(getDrawerBoxRect(m, blenda.el, { materials: { boardThickness: 18, backThickness: 3 }, front: cfg().front })).toBeNull();
    const r = getDrawerBoxRect(m, drawer.el, { materials: { boardThickness: 18, backThickness: 3 }, front: cfg().front });
    const bz = drawer.el.baseZone;
    expect(r.x0).toBeGreaterThan(bz.minX);
    expect(r.x1).toBeLessThan(bz.maxX);
    // Skrzynka drewniana: od luzu pod szufladą, wysokość = bok.
    expect(r.y0).toBe(drawer.drawer.yBase);
    expect(r.y1 - r.y0).toBe(drawer.drawer.comps.sideHeight);
  });
});
