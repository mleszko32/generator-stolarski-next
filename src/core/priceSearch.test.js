import { describe, it, expect } from "vitest";
import { normText, buildItems, searchItems, parseQuickDrawer, drawerQuote, csvSas, csvHeban, sheetsList, DRAWER_DEFAULTS } from "./priceSearch.js";

// Zmyślone ceny - tylko do sprawdzenia logiki.
const SAS = [
  ["B1-U702", "Płyta wiórowa U702 ST9 18mm 2800x2070 Egger", "szt", 100, "Płyty", 11, 5, 0],
  ["B2-OBR", "Obrzeże ABS U702 23x2", "mb", 2, "Obrzeża", 12, "", ""],
  ["B3-ZAW", "Zawias Blum 71B3550", "szt", 10, "Okucia", 13, "", ""],
  ["T1-KIT", "Szuflada Blum MERIVOBOX 500 E 40kg jedwabiście biały Boxcap wkręty", "szt", 400, "Szuflady", 14, "", ""],
];
const HEB = [
  ["18.U702/SM-2800X2070", "Płyta wiórowa U702 Swiss Krono", "m2", 20, "PŁYTY", 21],
  ["LEWA", "Dąb ŁÓŻKO", "szt.", 7, "ZAWIASY", 22],
];

describe("normText", () => {
  it("usuwa polskie znaki i wielkość liter", () => {
    expect(normText("Łóżko ŻÓŁĆ")).toBe("lozko zolc");
  });
});

describe("searchItems", () => {
  const items = buildItems(SAS, HEB);
  it("klasyfikuje typy i liczy cenę za m² i arkusz", () => {
    const p = items.find((i) => i.code === "B1-U702");
    expect(p.type).toBe("P");
    expect(p.perM2).toBeCloseTo(100 / (2.8 * 2.07), 1);
    expect(p.perSheet).toBe(100);
    expect(p.stock).toEqual({ waw: 5, ste: 0 });
    expect(items.find((i) => i.code === "B2-OBR").type).toBe("O");
    const h = items.find((i) => i.src === "HEBAN" && i.type === "P");
    expect(h.perM2).toBe(20);
    expect(h.perSheet).toBeCloseTo(20 * 2.8 * 2.07, 1);
  });
  it("szuka wielu słów w dowolnej kolejności, bez polskich znaków", () => {
    expect(searchItems(items, { q: "u702 plyta" }).length).toBe(2);
    expect(searchItems(items, { q: "dab lozko" }).map((i) => i.code)).toEqual(["LEWA"]);
    expect(searchItems(items, { q: "nic takiego" })).toEqual([]);
  });
  it("filtruje po hurtowni i typie, sortuje po cenie", () => {
    expect(searchItems(items, { src: "HEBAN" }).every((i) => i.src === "HEBAN")).toBe(true);
    expect(searchItems(items, { typ: "O" }).length).toBe(1);
    const asc = searchItems(items, { typ: "P", sort: "asc" });
    expect(asc[0].perM2).toBeLessThanOrEqual(asc[1].perM2);
  });
});

describe("parseQuickDrawer", () => {
  it("czyta szybki wpis", () => {
    const c = parseQuickDrawer("merivobox 450 M antracyt 70kg inserta x6");
    expect(c).toMatchObject({ nl: 450, H: "M", color: "A", kg: 70, fix: "I", n: 6 });
  });
  it("pola bez wskazania zostają z bazy, liczba szuflad = 1", () => {
    expect(parseQuickDrawer("500", { ...DRAWER_DEFAULTS, H: "K", n: 9 })).toMatchObject({ nl: 500, H: "K", n: 1 });
  });
});

describe("drawerQuote i CSV", () => {
  it("SAS: gotowy zestaw, ilość razy liczba szuflad", () => {
    const q = drawerQuote(SAS, HEB, { H: "E", nl: 500, color: "B", kg: 40, eVariant: "boxcap", fix: "W", n: 3 });
    expect(q.sas.kit).toBe(true);
    expect(q.sas.total).toBe(1200);
    expect(q.sas.perDrawer).toBe(400);
    expect(csvSas(q.sas)).toBe("T1-KIT;3\r\n");
  });
  it("brak części w katalogu = null", () => {
    expect(drawerQuote([], [], {}).sas).toBeNull();
    expect(drawerQuote([], [], {}).heban).toBeNull();
  });
  it("CSV Hebanu ma nagłówek i kody bez zmian", () => {
    const quote = { lines: [{ code: "470M5002S  Z LI   V20SW-M", qty: 1.2, unit: "szt." }] };
    expect(csvHeban(quote)).toBe("Code;Quantity;Unit\r\n470M5002S  Z LI   V20SW-M;2;szt.\r\n");
  });
});

describe("sheetsList", () => {
  it("przelicza arkusze na m² dla płyty na m²", () => {
    const h = buildItems([], HEB).find((i) => i.type === "P");
    const l = sheetsList(h, [1, 2]);
    expect(l[1].m2).toBeCloseTo(11.592, 3);
    expect(sheetsList(buildItems(SAS, [])[0])).toEqual([]);
  });
});
