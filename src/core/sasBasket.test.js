import { describe, it, expect } from "vitest";
import { sasSuggest, linkFromRows, rowsFromLink, linkPrice, linkLabel, stockLabel } from "./sasCatalog.js";
import { basketItems, basketText, parseBasketText, BASKET_BOOKMARKLET, BASKET_PREFIX } from "./sasBasket.js";

// Wiersze w układzie katalogu: [indeks, nazwa, jedn., cena, grupa, nr w sklepie, stan Waw, stan Stę]
const R = (idx, name, price, pid = "1", unit = "szt") => [idx, name, unit, price, "Akcesoria meblowe", pid, 5, 10];
const rows = [
  R("Z1", "CLIP top BLUMOTION zawias standard. 110°, Drzwi nakładane, niklowany, BLUM 71B3550 V250", 10, "101"),
  R("Z2", "CLIP top BLUMOTION zawias standard. 110°, Drzwi nakładane, czarny onyx, BLUM 71B3550 V250", 11, "102"),
  R("P1", "CLIP prowadnik, krzyżakowy, H0 mm, niklowany, BLUM 173L6100 V500", 1, "103"),
  R("T1", "Szuflada Blum MERIVOBOX Jedwabiście biały mat 500 M 40kg Wkręt", 146, "104", "kpl"),
  R("T2", "Szuflada Blum MERIVOBOX Jedwabiście biały mat 500 M 40kg Inserta", 147, "105", "kpl"),
  R("T3", "Szuflada Blum MERIVOBOX Antracyt mat 500 M 40kg Wkręt", 146, "106", "kpl"),
  R("T4", "Szuflada Blum MERIVOBOX Jedwabiście biały mat 450 M 40kg Wkręt", 140, "107", "kpl"),
  R("T5", "Szuflada Blum TANDEMBOX ANTARO Biały 500 M 30kg Wkręt", 120, "108", "kpl"),
  R("M1", "Prowadnica MOVENTO z BLUMOTION S, 70 kg, dł.=600 mm, BLUM 766H6000S", 138, "109", "kpl"),
  R("S1", "Sprzęgło, z regulacją boczną, lewe do prowadnicy MOVENTO, BLUM T51.7601 V100", 5, "110"),
  R("S2", "Sprzęgło, z regulacją boczną, prawe do prowadnicy MOVENTO, BLUM T51.7601 V100", 5, "111"),
  R("N1", "Nóżka do mebli Czarna H-100 mm Plastik, PREMIUM, 2 elementowa", 0.84, "112", "kpl"),
  R("F1", "Zawias uzupełniający 60°, BLUM 79T8500 V100", 20, "113"),
];

describe("dobór okuć z katalogu SAS", () => {
  it("zawias standardowy = zawias + prowadnik, niklowane", () => {
    const s = sasSuggest(rows, "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)");
    expect(s.map((r) => r[0])).toEqual(["Z1", "P1"]);
    expect(linkPrice(s)).toBe(11);
    expect(linkLabel(s)).toMatch(/^Z1 \+ P1 · .* · 11,00 zł$/);
  });

  it("komplet szuflady -> zestaw SAS o tym NL i wysokości, biały, na wkręty", () => {
    expect(sasSuggest(rows, "Komplet szuflady (MERIVOBOX - H:M L-500)").map((r) => r[0])).toEqual(["T1"]);
    expect(sasSuggest(rows, "Komplet szuflady (MERIVOBOX - H:M L-450)")[0][0]).toBe("T4");
    expect(sasSuggest(rows, "Komplet szuflady (ANTARO - H:M L-500)")[0][0]).toBe("T5");
    expect(sasSuggest(rows, "Komplet szuflady (MERIVOBOX - H:K L-500)")).toBeNull();
    expect(sasSuggest(rows, "Komplet szuflady (GTV_AXIS_16 - H:A L-500)")).toBeNull();
  });

  it("MOVENTO = prowadnice + sprzęgło lewe i prawe; nóżki; kod Blum w nazwie", () => {
    expect(sasSuggest(rows, "Prowadnice Blum MOVENTO 766H (60 kg) NL-600 + sprzęgła T51.7601").map((r) => r[0])).toEqual(["M1", "S1", "S2"]);
    expect(sasSuggest(rows, "Nóżka regulowana H-100")[0][0]).toBe("N1");
    expect(sasSuggest(rows, "Zawias uzupełniający 60° do drzwi składanych (Blum 79T8500)")[0][0]).toBe("F1");
    expect(sasSuggest(rows, "Okleina krawędziowa (mb)")).toBeNull();
  });

  it("powiązanie z Kosztorysu i stan magazynu", () => {
    const link = linkFromRows([rows[1], rows[2]]);
    expect(link).toBe("Z2+P1");
    expect(rowsFromLink(rows, link)).toEqual([rows[1], rows[2]]);
    expect(rowsFromLink(rows, "Z2+NIE")).toBeNull();
    expect(stockLabel(rows[0])).toBe("stan: Warszawa 5, Stęszew 10");
    expect(stockLabel(["a", "b", "szt", 1, "g"])).toBe("");
  });
});

describe("koszyk SAS", () => {
  const hw = [
    { name: "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)", qty: 4 },
    { name: "Zawias uzupełniający 60° do drzwi składanych (Blum 79T8500)", qty: 2 },
    { name: "Nóżka regulowana H-100", qty: 4.5 },
    { name: "Okleina krawędziowa (mb)", qty: 14.6 },
  ];

  it("pozycje do koszyka z ilościami; powiązanie z Kosztorysu wygrywa z doborem", () => {
    const { items, missing } = basketItems(hw, rows, { "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)": "Z2+P1" });
    expect(items.map((i) => [i.pid, i.qty])).toEqual([["102", 4], ["103", 4], ["113", 2], ["112", 5]]);
    expect(missing).toEqual(["Okleina krawędziowa (mb)"]);
  });

  it("tekst do schowka i jego odczyt", () => {
    const { items } = basketItems(hw.slice(0, 1), rows, {});
    const t = basketText(items);
    expect(t).toBe(BASKET_PREFIX + '[["101",4],["103",4]]');
    expect(parseBasketText(t)).toEqual([["101", 4], ["103", 4]]);
    expect(parseBasketText("cokolwiek")).toBeNull();
    expect(parseBasketText(BASKET_PREFIX + '[["x",1]]')).toBeNull();
  });

  it("zakładka jest poprawnym kodem i działa tylko na stronie SAS", () => {
    expect(BASKET_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    expect(() => new Function(BASKET_BOOKMARKLET.slice("javascript:".length))).not.toThrow();
    expect(BASKET_BOOKMARKLET).toContain("/pl/web/basket/add");
    expect(BASKET_BOOKMARKLET).toContain(BASKET_PREFIX);
  });
});
