import { describe, it, expect } from "vitest";
import { getSlopeGeometry, getSlopeDividers, getSlopeShelfPieces, getSlopeCabinetParts, getSlopeCabinetPolygons, getSlopeColumns, getSlopeSettings } from "./slopeCabinet.js";

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
