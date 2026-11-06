import { describe, it, expect } from "vitest";
import { isFlap, flapPowerFactor, flapHinges, flapHardware } from "./liftFlap.js";

const flap = (w, h) => ({ typ: "front", subtype: "drzwi", openingSide: "top", w, h });

describe("klapa AVENTOS HK-XS", () => {
  it("klapa = drzwi z zawiasami u góry", () => {
    expect(isFlap(flap(600, 300))).toBe(true);
    expect(isFlap({ ...flap(600, 300), openingSide: "left" })).toBe(false);
  });

  it("LF = wysokość × masa frontu", () => {
    // 0,6 × 0,3 × 0,018 m³ × 660 kg/m³ = 2,14 kg; × 300 mm = 642
    expect(flapPowerFactor(flap(600, 300), 18)).toBe(642);
  });

  it("2 zawiasy, przy szerokości ponad 900 mm trzy", () => {
    expect(flapHinges(flap(823, 395)).map((h) => h.x)).toEqual([100, 723]);
    expect(flapHinges(flap(1000, 395))).toHaveLength(3);
  });

  it("okucia: siłownik w zakresie LF albo do doboru, zawiasy bez sprężyny", () => {
    const ok = flapHardware(flap(700, 400), 18);
    expect(ok[0].name).toContain("20K1501T");
    expect(ok.find((x) => x.name.includes("70T3550")).qty).toBe(2);
    expect(flapHardware(flap(500, 250), 18)[0].name).toContain("do doboru");
  });
});
