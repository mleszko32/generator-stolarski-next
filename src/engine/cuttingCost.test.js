import { describe, it, expect } from "vitest";
import { cutGroups, cuttingQuote, cuttingCostFor, isPremiumBoard, CUT_RATES } from "./cuttingCost.js";

const part = (category, length, width, qty = 1) => ({ category, name: "X", length, width, qty });

describe("koszt cięcia w hurtowni", () => {
  it("PREMIUM rozpoznane po PerfectSense / PM/ w nazwie dekoru", () => {
    expect(isPremiumBoard("Korpus: F128 PerfectSense")).toBe(true);
    expect(isPremiumBoard("Korpus: W1000 PM/ST9 19mm")).toBe(true);
    expect(isPremiumBoard("Korpus: U702 ST9 18mm")).toBe(false);
    expect(isPremiumBoard("Korpus")).toBe(false);
  });

  it("grupy: osobno po kategorii, bez blatu, mb = suma półobwodów na arkuszach", () => {
    const g = cutGroups([part("Korpus", 1000, 500, 2), part("Blat", 2000, 600), part("Plecy", 800, 400)]);
    expect(g.map((x) => x.category)).toEqual(["Korpus", "Plecy"]);
    expect(g[0].pieces).toBe(2);
    expect(g[0].sheets).toBe(1);
    expect(g[0].cutMb).toBeCloseTo(2 * (1000 + 500) / 1000, 5);
    expect(g[0].edgeM).toBeCloseTo(2 * 2 * (1000 + 500) / 1000, 5); // 4 krawędzie dookoła × 2 szt.
    expect(g[1].edgeM).toBe(0); // plecy bez okleiny
  });

  it("fronty z różnych materiałów to osobne grupy (osobne arkusze)", () => {
    const f = (materialId) => ({ category: "Front", name: "F", length: 700, width: 500, qty: 1, materialId });
    const g = cutGroups([f("a"), f("b"), f("a")]);
    expect(g.map((x) => [x.category, x.pieces, x.sheets])).toEqual([["Front", 2, 1], ["Front", 1, 1]]);
  });

  it("SAS: mb × 1,5 × stawka (kalibracja z zamówienia SAS), express ×1,5; Heban: za formatkę", () => {
    const groups = cutGroups([part("Korpus", 1000, 500, 2)]);
    const q = cuttingQuote(groups);
    expect(q.sas.cut).toBeCloseTo(3 * 1.5 * CUT_RATES.sas.perMbStandard, 1);
    expect(q.heban.total).toBeCloseTo(2 * 4.92, 5);
    const e = cuttingQuote(groups, { express: true });
    expect(e.sas.cut).toBeCloseTo(q.sas.cut * 1.5, 1);
    expect(e.heban.total).toBeCloseTo(2 * 7.38, 5);
  });

  it("PREMIUM: wyższa stawka i okleinowanie; paleta opcjonalnie", () => {
    const groups = cutGroups([part("Korpus: F128 PerfectSense", 1000, 500, 1)]);
    const q = cuttingQuote(groups, { pallet: true });
    expect(q.sas.cut).toBeCloseTo(1.5 * 1.5 * 5.42, 1);
    expect(q.sas.edging).toBeCloseTo(3 * 8.34, 1);
    expect(q.sas.pallet).toBe(64.58);
    expect(q.sas.total).toBeCloseTo(q.sas.cut + q.sas.edging + 64.58, 1);
  });

  it("cuttingCostFor wybiera hurtownię; pusty projekt = 0", () => {
    const parts = [part("Korpus", 1000, 500, 2)];
    expect(cuttingCostFor("heban", parts, {}, null, null)).toBeCloseTo(9.84, 2);
    expect(cuttingCostFor("sas", parts, {}, null, null)).toBeGreaterThan(0);
    expect(cuttingCostFor("sas", [], {}, null, null)).toBe(0);
  });
});
