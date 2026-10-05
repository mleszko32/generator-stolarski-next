import { describe, it, expect } from "vitest";
import { getSlopeGeometry, getSlopeDividers, getSlopeShelfPieces, getSlopeCabinetParts, getSlopeCabinetPolygons } from "./slopeCabinet.js";

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

  it("formatki korpusu: skos, bok wysoki, wieniec dolny docięte pod kątem", () => {
    const parts = getSlopeCabinetParts(mod(), config);
    expect(part(parts, "Skos")).toMatchObject({ length: 1414.2, width: 597, qty: 1 });
    expect(part(parts, "Skos").name).toContain("krótsza 1378.2");
    expect(part(parts, "Bok wysoki")).toMatchObject({ length: 974.5, width: 597 });
    expect(part(parts, "Bok wysoki").name).toContain("krótsza 956.5");
    expect(part(parts, "Wieniec dolny")).toMatchObject({ length: 956.5 });
    expect(part(parts, "Wieniec dolny").name).toContain("krótsza 938.5");
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
  it("trapez: niski bok i wieniec dolny między bokami", () => {
    const g = getSlopeGeometry(mod({ lowHeight: 400 }));
    expect(g.isTriangle).toBe(false);
    const parts = getSlopeCabinetParts(mod({ lowHeight: 400 }), config);
    expect(part(parts, "Bok niski")).toMatchObject({ length: 389.8 });
    expect(part(parts, "Bok niski").name).toContain("krótsza 379");
    expect(part(parts, "Wieniec dolny")).toMatchObject({ length: 964, name: "Wieniec dolny" });
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
