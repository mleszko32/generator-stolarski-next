import { describe, it, expect } from "vitest";
import { edgeKey, getPartEdges, withEdges, partEdgeBandingMm, totalEdgeBandingMeters, describeEdges } from "./edgeBanding.js";

const bok = { category: "Korpus", name: "Bok (L/P)", length: 720, width: 510, qty: 2 };
const plecy = { category: "Plecy", name: "Plecy 720x600", length: 716, width: 596, qty: 1 };

describe("okleina - reguły domyślne", () => {
  it("formatka korpusu jest oklejana dookoła, plecy wcale", () => {
    expect(getPartEdges(bok)).toEqual([true, true, true, true]);
    expect(getPartEdges(plecy)).toEqual([false, false, false, false]);
    expect(partEdgeBandingMm(bok)).toBe(2 * (720 + 510));
    expect(partEdgeBandingMm(plecy)).toBe(0);
  });
});

describe("okleina - wybór krawędzi", () => {
  it("liczy tylko wybrane krawędzie (2 dłuższe = 2 × długość)", () => {
    const rules = withEdges({}, bok, [true, true, false, false]);
    expect(partEdgeBandingMm(bok, rules)).toBe(2 * 720);
    const one = withEdges({}, bok, [true, false, false, false]);
    expect(partEdgeBandingMm(bok, one)).toBe(720);
    const mixed = withEdges({}, bok, [true, false, true, false]);
    expect(partEdgeBandingMm(bok, mixed)).toBe(720 + 510);
  });

  it("wybór dotyczy wszystkich identycznych formatek (klucz kategoria|nazwa|wymiary)", () => {
    const rules = withEdges({}, bok, [true, false, false, false]);
    const other = { ...bok, qty: 5 };
    expect(edgeKey(other)).toBe(edgeKey(bok));
    expect(getPartEdges(other, rules)).toEqual([true, false, false, false]);
    // inna formatka nie jest dotknięta
    expect(getPartEdges({ ...bok, length: 700 }, rules)).toEqual([true, true, true, true]);
  });

  it("wybór równy regule domyślnej usuwa wpis; plecy można oklejać na życzenie", () => {
    let rules = withEdges({}, bok, [true, false, false, false]);
    expect(Object.keys(rules)).toHaveLength(1);
    rules = withEdges(rules, bok, [true, true, true, true]);
    expect(rules).toEqual({});

    const backs = withEdges({}, plecy, [true, true, true, true]);
    expect(partEdgeBandingMm(plecy, backs)).toBe(2 * (716 + 596));
  });

  it("withEdges nie mutuje przekazanej mapy", () => {
    const rules = { x: [true, true, true, true] };
    withEdges(rules, bok, [false, false, false, false]);
    expect(Object.keys(rules)).toEqual(["x"]);
  });

  it("suma w metrach uwzględnia ilość sztuk i wybór krawędzi", () => {
    const rules = withEdges({}, bok, [true, true, false, false]);
    expect(totalEdgeBandingMeters([bok], rules)).toBeCloseTo((2 * 720 * 2) / 1000, 5);
    expect(totalEdgeBandingMeters([bok])).toBeCloseTo((2 * (720 + 510) * 2) / 1000, 5);
  });
});

describe("describeEdges", () => {
  it("opisuje wybór słowami", () => {
    expect(describeEdges([true, true, true, true])).toBe("dookoła");
    expect(describeEdges([false, false, false, false])).toBe("brak");
    expect(describeEdges([true, true, false, false])).toBe("2 dł.");
    expect(describeEdges([true, false, true, false])).toBe("1 dł. + 1 szer.");
    expect(describeEdges([false, false, true, true])).toBe("2 szer.");
  });
});
