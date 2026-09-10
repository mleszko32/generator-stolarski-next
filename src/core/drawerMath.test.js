import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateNominalLength,
  getDrawerVariant,
  getDrawerComponents,
  calculateDrawerHoles,
} from "./drawerMath.js";
import { drawerSystems } from "./drawerSystems.js";
import { freshProject, setProject } from "../test/fixtures.js";

describe("calculateNominalLength", () => {
  it("wybiera największą znormalizowaną długość mieszczącą się w głębokości minus 5 mm luzu", () => {
    expect(calculateNominalLength(555)).toBe(550);
    expect(calculateNominalLength(505)).toBe(500);
    expect(calculateNominalLength(504)).toBe(450);
  });

  it("spada do 270 gdy jest za płytko", () => {
    expect(calculateNominalLength(100)).toBe(270);
    expect(calculateNominalLength(274)).toBe(270);
  });
});

describe("getDrawerVariant", () => {
  it("w trybie auto bierze najwyższy wariant, który się mieści", () => {
    // MERIVOBOX: wysoka E minSpace 209
    expect(getDrawerVariant(250, "merivobox")).toEqual({ type: "E", backHeight: 184 });
    // 100 mm -> tylko bardzoniska N (minSpace 85.5)
    expect(getDrawerVariant(100, "merivobox")).toEqual({ type: "N", backHeight: 60.5 });
  });

  it("gdy nic się nie mieści, zwraca najniższy dostępny wariant", () => {
    expect(getDrawerVariant(10, "merivobox")).toEqual({ type: "N", backHeight: 60.5 });
  });

  it("honoruje wymuszony wariant tylko jeśli jest na niego miejsce", () => {
    expect(getDrawerVariant(200, "merivobox", "srednia")).toEqual({ type: "K", backHeight: 121 });
    // 100 < minSpace 146 dla 'srednia' -> powrót do auto
    expect(getDrawerVariant(100, "merivobox", "srednia")).toEqual({ type: "N", backHeight: 60.5 });
  });

  it("nieznany system traktuje jak merivobox", () => {
    expect(getDrawerVariant(250, "nie-ma-takiego")).toEqual({ type: "E", backHeight: 184 });
  });
});

describe("getDrawerComponents", () => {
  it("zwraca null dla nieznanego systemu", () => {
    expect(getDrawerComponents("nie-ma-takiego", 564, 500, 250)).toBeNull();
  });

  it("stosuje odjęcia wymiarowe z katalogu", () => {
    const sys = drawerSystems.merivobox;
    const comps = getDrawerComponents("merivobox", 564, 505, 250);

    expect(comps.nominalLength).toBe(500);
    expect(comps.bottom.width).toBe(564 - sys.bottomWidthDeduct);
    expect(comps.bottom.length).toBe(500 - sys.bottomLengthDeduct);
    expect(comps.back.width).toBe(564 - sys.backWidthDeduct);
    expect(comps.back).toMatchObject({ height: 184, variantType: "E" });
  });
});

describe("calculateDrawerHoles", () => {
  beforeEach(() => setProject(freshProject()));

  it("dolna szuflada: prowadnica uwzględnia currentY + grubość płyty + railOffset", () => {
    const { railOffset } = drawerSystems.merivobox.mounting;
    const holes = calculateDrawerHoles("merivobox", 0, 150, 18, 0, true);

    expect(holes.slideSideHoles.map((h) => h.y)).toEqual([
      18 + railOffset,
      18 + railOffset,
      18 + railOffset,
    ]);
    expect(holes.slideSideHoles.map((h) => h.x)).toEqual([37, 69, 261]);
  });

  it("nie-dolna szuflada: prowadnica na currentY + railOffset (bez grubości płyty)", () => {
    const { railOffset } = drawerSystems.merivobox.mounting;
    const holes = calculateDrawerHoles("merivobox", 300, 150, 18, 1, false);
    expect(holes.slideSideHoles[0].y).toBe(300 + railOffset);
  });

  it("dodaje trzeci otwór we froncie dopiero od 200 mm wysokości", () => {
    expect(calculateDrawerHoles("merivobox", 0, 150, 18, 0, false).frontHoles).toHaveLength(2);
    expect(calculateDrawerHoles("merivobox", 0, 200, 18, 0, false).frontHoles).toHaveLength(3);
  });
});
