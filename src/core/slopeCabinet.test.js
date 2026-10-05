import { describe, it, expect } from "vitest";
import { getSlopeGeometry, getSlopeDividers, getSlopeShelfPieces, getSlopeCabinetParts, getSlopeCabinetPolygons, getSlopeColumns, getSlopeSettings, clipFrontRect, getSlopeFronts, getSlopeFrontParts, getSlopeDrawerHardware, getSlopeFrontSettings } from "./slopeCabinet.js";

const config = { materials: { boardThickness: 18, backThickness: 3 } };
const mod = (slope = {}, dims = {}) => ({
  type: "slope_cabinet",
  dimensions: { width: 1000, height: 1000, depth: 600, ...dims },
  slope: { lowSide: "left", lowHeight: 0, dividers: [], shelves: [], ...slope },
});
const part = (parts, prefix) => parts.find((p) => p.name.startsWith(prefix));

// Trójkąt 1000 x 1000: kąt 45°, pionowa grubość skosu c = 18·√2 ≈ 25,46 mm.
describe("szafka pod skos - trójkąt 45°", () => {
  it("geometria: kąt i grubość skosu w pionie", () => {
    const g = getSlopeGeometry(mod());
    expect(g.isTriangle).toBe(true);
    expect(g.angle).toBeCloseTo(45, 5);
    expect(g.c).toBeCloseTo(25.456, 2);
  });

  it("formatki korpusu przy dnie nakładanym: skos i bok stoją na dnie", () => {
    const parts = getSlopeCabinetParts(mod(), config);
    // Skos: wierzch od x = 18 (dno) do 1000 pod 45°, spód od x = 43,46 (956,54 / cos 45° = 1352,75).
    expect(part(parts, "Skos")).toMatchObject({ length: 1388.8, width: 597, qty: 1 });
    expect(part(parts, "Skos").name).toContain("krótsza 1352.8");
    expect(part(parts, "Bok wysoki")).toMatchObject({ length: 956.5, width: 597 });
    expect(part(parts, "Bok wysoki").name).toContain("krótsza 938.5");
    // Dno na całą szerokość, koniec przy skosie docięty równo z linią skosu.
    expect(part(parts, "Dno")).toMatchObject({ length: 1000 });
    expect(part(parts, "Dno").name).toContain("krótsza 982");
    expect(part(parts, "Bok niski")).toBeUndefined();
    expect(part(parts, "Plecy")).toMatchObject({ length: 996, width: 996, category: "Plecy" });
  });

  it("przegroda od wieńca do skosu, wyższa ściana od strony wysokiej", () => {
    const [d] = getSlopeDividers(mod({ dividers: [500] }));
    expect(d.hLeft).toBeCloseTo(456.5, 1);
    expect(d.hRight).toBeCloseTo(474.5, 1);
    const p = part(getSlopeCabinetParts(mod({ dividers: [500] }), config), "Przegroda");
    expect(p).toMatchObject({ length: 474.5, width: 597 });
  });

  it("półka dzielona przegrodą; kawałek przy skosie docięty pod kątem", () => {
    const pieces = getSlopeShelfPieces(mod({ dividers: [500], shelves: [300] }));
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces;
    expect(a.x1 - a.x0Bottom).toBeCloseTo(174.5, 1);
    expect(a.x1 - a.x0Top).toBeCloseTo(156.5, 1);
    expect(b.x1 - b.x0Bottom).toBeCloseTo(464, 5);
    expect(b.x1 - b.x0Top).toBeCloseTo(464, 5);
    const shelves = getSlopeCabinetParts(mod({ dividers: [500], shelves: [300] }), config).filter((p) => p.name.startsWith("Półka"));
    expect(shelves.map((p) => p.width)).toEqual([592, 592]);
  });

  it("pomija przegrodę, która pod skosem byłaby za niska, i półkę ponad skosem", () => {
    expect(getSlopeDividers(mod({ dividers: [40] }))).toHaveLength(0);
    expect(getSlopeShelfPieces(mod({ shelves: [990] }))).toHaveLength(0);
  });
});

describe("szafka pod skos - trapez i strona skosu", () => {
  it("trapez: niski bok stoi na dnie, dno prostokątne na całą szerokość", () => {
    const g = getSlopeGeometry(mod({ lowHeight: 400 }));
    expect(g.isTriangle).toBe(false);
    const parts = getSlopeCabinetParts(mod({ lowHeight: 400 }), config);
    expect(part(parts, "Bok niski")).toMatchObject({ length: 371.8 });
    expect(part(parts, "Bok niski").name).toContain("krótsza 361");
    expect(part(parts, "Dno")).toMatchObject({ length: 1000, name: "Dno (wieniec dolny)" });
  });

  it("za niska niska strona liczy się jak trójkąt", () => {
    expect(getSlopeGeometry(mod({ lowHeight: 30 })).isTriangle).toBe(true);
  });

  it("skos po prawej: przegroda mierzona od lewej daje te same formatki co lustrzana", () => {
    const left = getSlopeCabinetParts(mod({ dividers: [500] }), config);
    const right = getSlopeCabinetParts(mod({ lowSide: "right", dividers: [482] }), config);
    expect(right).toEqual(left);
  });

  it("wielokąty 3D: skos po prawej jest odbiciem lustrzanym", () => {
    const l = getSlopeCabinetPolygons(mod());
    const r = getSlopeCabinetPolygons(mod({ lowSide: "right" }));
    expect(r.polys).toHaveLength(l.polys.length);
    // Wierzchołek skosu przy podłodze: po lewej x = 0, po prawej x = 1000.
    expect(l.back).toContainEqual([0, 0]);
    expect(r.back).toContainEqual([1000, 0]);
    expect(r.back).toContainEqual([0, 1000]);
  });
});

describe("szafka pod skos - kolumny (przegrody)", () => {
  it("reszta wylicza się z szerokości; przegrody między kolumnami", () => {
    // trójkąt, skos po lewej: wnętrze od 0 (czubek) do 982
    const c = getSlopeColumns(mod({ columns: [null, 300, 300] }));
    expect(c.autoWidth).toBeCloseTo(982 - 600 - 36, 5);
    expect(c.dividers).toEqual([346, 664]);
  });

  it("stare dane (dividers) zamieniają się na kolumny z resztą przy skosie", () => {
    expect(getSlopeSettings(mod({ dividers: [500] })).columns).toEqual([null, 464]);
    expect(getSlopeSettings(mod({ lowSide: "right", dividers: [482] })).columns).toEqual([464, null]);
    expect(getSlopeColumns(mod({ lowSide: "right", dividers: [482] })).dividers).toEqual([482]);
  });

  it("skos po prawej: te same kolumny w odwróconej kolejności dają te same formatki", () => {
    const left = getSlopeCabinetParts(mod({ columns: [null, 300, 300], shelves: [300] }), config);
    const right = getSlopeCabinetParts(mod({ lowSide: "right", columns: [300, 300, null], shelves: [300] }), config);
    expect(right).toEqual(left);
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

describe("szafka pod skos - fronty i szuflady", () => {
  // Jak na rysunku z Fusiona: trójkąt 2000 x 1500, 3 kolumny, 2 półki, MOVENTO.
  const cfg = { materials: { boardThickness: 18, backThickness: 3 }, front: { gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 }, drawerSystem: "movento_katalog" } };
  const m = (slope = {}, front = {}) => ({
    type: "slope_cabinet", dimensions: { width: 2000, height: 1500, depth: 600 }, front,
    slope: { lowSide: "left", lowHeight: 0, columns: [null, 650, 650], shelves: [500, 1000], ...slope },
  });
  const types = (mm) => Object.fromEntries(getSlopeFronts(mm, cfg).map((f) => [f.key, f.type]));

  it("trójkąty to blendy, reszta szuflady", () => {
    expect(types(m())).toEqual({
      "c0-r0": "blenda",
      "c1-r0": "szuflada", "c1-r1": "blenda",
      "c2-r0": "szuflada", "c2-r1": "szuflada", "c2-r2": "blenda",
    });
  });

  it("skos po prawej (kolumny odwrócone) - te same wnęki w lustrze", () => {
    expect(types(m({ lowSide: "right", columns: [650, 650, null] }))).toEqual({
      "c2-r0": "blenda",
      "c1-r0": "szuflada", "c1-r1": "blenda",
      "c0-r0": "szuflada", "c0-r1": "szuflada", "c0-r2": "blenda",
    });
  });

  it("typ wnęki można wymusić", () => {
    const mm = m({ cellTypes: { "c1-r0": "blenda", "c0-r0": "brak" } });
    expect(types(mm)["c1-r0"]).toBe("blenda");
    expect(types(mm)["c0-r0"]).toBe("brak");
    expect(getSlopeDrawerHardware(mm, cfg)).toHaveLength(2);
  });

  it("skrzynka A: prostokątna, wysokość od niższej strony", () => {
    const parts = getSlopeFrontParts(m(), cfg);
    expect(parts.filter((p) => p.name.startsWith("Front szuflady"))).toHaveLength(3);
    expect(parts.filter((p) => p.name.startsWith("Blenda"))).toHaveLength(3);
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438")).toMatchObject({ length: 570, width: 438, qty: 2 });
    expect(getSlopeDrawerHardware(m(), cfg)).toEqual(Array(3).fill("Prowadnice Blum MOVENTO 766H (60 kg) NL-580 + sprzęgła T51.7601"));
  });

  it("skrzynka B: boki różnej wysokości i tył trapezowy; bez skosu - zwykła skrzynka", () => {
    const parts = getSlopeFrontParts(m({ drawerBox: "B" }), cfg);
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438-459 (niski)")).toMatchObject({ width: 438, qty: 1 });
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H438-459 (wysoki)")).toMatchObject({ width: 459, qty: 1 });
    expect(parts.find((p) => p.name.startsWith("Tył szuflady skos W686 NL580 H438-459"))).toMatchObject({ length: 608, width: 430 });
    // Szuflada przy wysokim boku, której skos nie dosięga: zwykła skrzynka.
    expect(parts.find((p) => p.name === "Bok szuflady W686 NL580 H459")).toMatchObject({ qty: 2 });
  });

  it("skrzynka B przy systemie metalowym liczy się jako A", () => {
    const f = getSlopeFronts(m({ drawerBox: "B" }, { drawerSystem: "merivobox" }), cfg).find((x) => x.key === "c1-r0");
    expect(f.drawer.boxType).toBe("A");
  });
});

describe("szafka pod skos - luzy frontów jak w zwykłej szafce", () => {
  const cfg = { materials: { boardThickness: 18, backThickness: 3 }, front: { gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 }, drawerSystem: "movento_katalog" } };
  const m = (front = {}) => ({
    type: "slope_cabinet", dimensions: { width: 2000, height: 1500, depth: 600 }, front,
    slope: { lowSide: "left", lowHeight: 0, columns: [null, 650, 650], shelves: [500, 1000] },
  });
  const cell = (mm, key) => getSlopeFronts(mm, cfg).find((f) => f.key === key);

  it("luz prawy odsłania wysoki bok (nakładane)", () => {
    const base = cell(m(), "c2-r0").shape.w;
    const open = cell(m({ clearance: { right: 18 } }), "c2-r0").shape.w;
    expect(base - open).toBeCloseTo(16.5, 5);
  });

  it("wpuszczane: front w świetle wnęki, krótsza szuflada", () => {
    const f = cell(m({ type: "wpuszczane" }), "c2-r0");
    expect(f.inset).toBe(true);
    expect(f.shape).toMatchObject({ kind: "prostokat", w: 647, h: 480.5 });
    expect(f.drawer.comps.nominalLength).toBe(550);
  });

  it("luz pod skosem mierzony prostopadle do płyty", () => {
    const a = cell(m(), "c1-r0").shape.hLow;
    const b = cell(m({ clearance: { slope: 10 } }), "c1-r0").shape.hLow;
    // 7 mm więcej prostopadle = 7 / cos(36,87°) = 8,75 mm w pionie
    expect(a - b).toBeCloseTo(8.75, 5);
  });

  it("domyślne ustawienia z projektu, moduł je nadpisuje", () => {
    expect(getSlopeFrontSettings(m(), cfg)).toMatchObject({ isInset: false, gap: 3, cLeft: 1.5, cRight: 1.5, cBottom: 0, cSlope: 3 });
    expect(getSlopeFrontSettings(m({ gap: 2, clearance: { bottom: 2 } }), cfg)).toMatchObject({ gap: 2, cBottom: 2, cSlope: 2, cLeft: 1.5 });
  });
});
