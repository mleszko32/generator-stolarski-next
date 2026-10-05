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

  it("respektuje własną serię NL systemu zamiast domyślnej (Blum) listy", () => {
    // GTV Axis Pro: 250-600, bez 650 mimo bardzo głębokiej szafki
    expect(calculateNominalLength(1000, "gtv_axis_16")).toBe(600);
    // i z dolnym progiem 250, nie 270 jak w domyślnej (Blumowej) serii
    expect(calculateNominalLength(100, "gtv_axis_16")).toBe(250);
    // Merivobox: kończy na 600, nie ma wariantu 650
    expect(calculateNominalLength(1000, "merivobox")).toBe(600);
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

describe("MOVENTO - skrzynka drewniana", () => {
  // Wnęka 564 mm szerokości (LW), 505 mm głębokości, 200 mm wysokości.
  it("katalog: 5 formatek, dno między bokami, tył i czoło na dnie", () => {
    const c = getDrawerComponents("movento_katalog", 564, 505, 200, "auto", 150);
    expect(c.woodenBox).toBe(true);
    expect(c.nominalLength).toBe(500);
    expect(c.sides).toEqual({ length: 490, height: 150, qty: 2 });          // SKL = NL - 10
    expect(c.bottom).toEqual({ width: 522, length: 490 });                    // SKW = LW - 42
    expect(c.back).toMatchObject({ width: 522, height: 150 - 13 - 16 });      // bok - wcięcie - dno
    expect(c.innerFront).toEqual({ width: 522, height: 121 });
  });

  it("forum: bok 18 mm, LW - 46, wcięcie 12 mm", () => {
    const c = getDrawerComponents("movento_forum", 564, 505, 200, "auto", 150);
    expect(c.sideThickness).toBe(18);
    expect(c.bottom.width).toBe(518);
    expect(c.back.height).toBe(150 - 12 - 18);
  });

  it("bez wpisanej wysokości bierze największą mieszczącą się (miejsce - 16 - 7)", () => {
    const c = getDrawerComponents("movento_katalog", 564, 505, 200);
    expect(c.sideHeight).toBe(177);
    expect(c.clamped).toBe(false);
  });

  it("za wysoki bok jest przycinany do miejsca we wnęce", () => {
    const c = getDrawerComponents("movento_katalog", 564, 505, 200, "auto", 300);
    expect(c.sideHeight).toBe(177);
    expect(c.clamped).toBe(true);
  });

  it("getDrawerVariant zwraca wysokość zajętą we wnęce (luz pod + bok)", () => {
    expect(getDrawerVariant(200, "movento_katalog", "auto", 150)).toEqual({ type: "H150", backHeight: 121, boxHeight: 166 });
  });

  it("brak katalogowych otworów frontu (front przykręcany przez czoło wewn.)", () => {
    setProject(freshProject());
    expect(calculateDrawerHoles("movento_katalog", 0, 250, 18, 0, false).frontHoles).toHaveLength(0);
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

describe("calculateDrawerHoles - MOVENTO", () => {
  beforeEach(() => setProject(freshProject()));
  it("dolna szuflada: wkręty 38 mm nad wieńcem, rozstaw wg NL", () => {
    const h = calculateDrawerHoles("movento_katalog", 0, 300, 18, 0, true, 500);
    expect(h.slideSideHoles.map((x) => x.x)).toEqual([37, 69, 261, 293]);
    expect(h.slideSideHoles[0].y).toBe(18 + 38);
  });
  it("systemy metalowe bez zmian: 37 / 69 / 261", () => {
    expect(calculateDrawerHoles("merivobox", 0, 300, 18, 0, true, 500).slideSideHoles.map((x) => x.x)).toEqual([37, 69, 261]);
  });
});

describe("calculateDrawerHoles - MOVENTO na półce", () => {
  beforeEach(() => setProject(freshProject()));
  it("wkręty 38 mm nad wierzchem półki, nie nad dolną krawędzią frontu", () => {
    // front zaczyna się 7,5 mm niżej niż wierzch półki (zachodzi na pół półki)
    const h = calculateDrawerHoles("movento_katalog", 510.5, 300, 18, 0, false, 500, 518);
    expect(h.slideSideHoles[0].y).toBe(556);
  });
});
