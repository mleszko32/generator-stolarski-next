import { describe, it, expect } from "vitest";
import { sasLabel, sasSuggest, sasFromText, sasByIndex, sheetAreaM2, sasPricePerM2, parseSasCatalog } from "./sasCatalog.js";

const rows = [
  ["B09048-274", "86° Ogranicznik kąta otwarcia do zawiasu 110°, czarny, BLUM 70T3553 V250", "szt", 1.5, "Akcesoria meblowe"],
  ["145909-200", "Płyta MDF EGGER W908/W908 SM/SM-MB Biały bazowy 18mm 2800x2070 Dwustronna", "szt", 579.6, "Płyty"],
  ["X1-1", "Blat kompaktowy", "m2", 410, "Blaty robocze i panele wnękowe"],
];

describe("katalog SAS", () => {
  it("napis podpowiedzi i odczyt wybranej pozycji", () => {
    expect(sasLabel(rows[0])).toBe("B09048-274 · 86° Ogranicznik kąta otwarcia do zawiasu 110°, czarny, BLUM 70T3553 V250 · 1,50 zł/szt");
    expect(sasFromText(rows, sasLabel(rows[1]))).toBe(rows[1]);
    expect(sasFromText(rows, "b09048-274")).toBe(rows[0]);
    expect(sasFromText(rows, "zawias")).toBeNull();
    expect(sasByIndex(rows, "X1-1")).toBe(rows[2]);
    expect(sasByIndex(rows, "")).toBeNull();
  });

  it("cena za m² płyty z ceny arkusza", () => {
    expect(sheetAreaM2("Płyta 18mm 2800x2070")).toBeCloseTo(5.796);
    expect(sheetAreaM2("Zawias 110x45")).toBeNull();
    expect(sasPricePerM2(rows[1])).toBe(100);
    expect(sasPricePerM2(rows[2])).toBe(410);
    expect(sasPricePerM2(rows[0])).toBeNull();
    expect(sasPricePerM2(["P", "Płyta meblowa 18mm", "szt", 289.8, "Płyty"], 2.898)).toBe(100);
  });

  it("plik katalogu ze skryptu", () => {
    const file = { format: "gsn-sas-catalog", date: "2026-11-08", rows: [...rows, ["Z", "zła cena", "szt", "1,5", "x"]] };
    expect(parseSasCatalog(JSON.stringify(file))).toEqual({ date: "2026-11-08", rows });
    expect(parseSasCatalog("{")).toBeNull();
    expect(parseSasCatalog(JSON.stringify({ ...file, format: "gsn-furniture" }))).toBeNull();
    expect(parseSasCatalog(JSON.stringify({ ...file, rows: [] }))).toBeNull();
  });
});

describe("sasSuggest - komplet MERIVOBOX z części, gdy SAS nie ma zestawu", () => {
  it("składa komplet z pozycji po kodach Blum", () => {
    const mk = (i, n, p) => [String(i), n, "szt", p];
    const rows = [
      mk(1, "Boki szuflady Blum 470M5002S jedwabiście biały", 100), mk(2, "Prowadnica 450.5001B", 50),
      mk(3, "Mocowanie frontu ZF4.1002", 10), mk(4, "Zaślepka ZA4.5400 biała", 5), mk(5, "Zaślepka ABD.1000 biała", 5),
      mk(6, "Uchwyt ścianki ZB4M000S biały", 20),
    ];
    const r = sasSuggest(rows, "Komplet szuflady (MERIVOBOX - H:M L-500)");
    expect(r.map((x) => x[0])).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(r.per).toEqual([1, 1, 2, 2, 2, 1]);
  });
});
