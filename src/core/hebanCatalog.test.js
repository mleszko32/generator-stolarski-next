import { describe, it, expect } from "vitest";
import { parseHebanCatalog, hebanLabel, hebanFromText, hebanByCode, hebanSheetSize, hebanPricePerM2, hebanSheetsToM2, hebanBlumCode,
  hebanSuggest, hebanLinkFromRows, hebanRowsFromLink, hebanLinkPrice, hebanLinkLabel, hebanIsBoard, hardwareHebanRows } from "./hebanCatalog.js";

const rows = [
  ["18.U8685/SM-2800X2070", "D.P.Biel Alpejska gr.18 mm U8685/SM. 2800x2070 (pal. 27 szt.) 5.796 m2", "m2", 28.98, "Płyty laminowane", "29999"],
  ["18.U8685/SM-2776X560", "Biel Alpejska gr.18 mm ( U8685/SM ) PAS Z PŁYTY wym.2776/x560// (szt.)", "szt.", 63, "Płyty laminowane", "30001"],
  ["470M5002S  Z LI   V20SW-M", "470M5002S Z LI V20SW-M (kod z Hebanu, blum merivobox)", "szt.", 36.13, "Blum merivobox", "34101"],
  ["450.5001B  K R+L   MP  ZN", "450.5001B K R+L MP ZN (kod z Hebanu, blum merivobox)", "szt.", 97.11, "Blum merivobox", "34102"],
  ["MDF.LX2.18.(280X207)U190/PE", "Z.Płyta MDF lam.dwustr.x2 gr.18(2800x2070) U190/PE", "m2", 50.6, "Płmdf", "40001"],
];

describe("katalog Heban", () => {
  it("napis podpowiedzi i odczyt wybranej pozycji (kody ze spacjami)", () => {
    expect(hebanLabel(rows[0])).toBe("18.U8685/SM-2800X2070 · D.P.Biel Alpejska gr.18 mm U8685/SM. 2800x2070 (pal. 27 szt.) 5.796 m2 · 28,98 zł/m2");
    expect(hebanFromText(rows, hebanLabel(rows[2]))).toBe(rows[2]);
    expect(hebanFromText(rows, "470m5002s z li v20sw-m")).toBe(rows[2]);
    expect(hebanFromText(rows, "biel")).toBeNull();
    expect(hebanByCode(rows, "450.5001B  K R+L   MP  ZN")).toBe(rows[3]);
    expect(hebanByCode(rows, "")).toBeNull();
  });

  it("wymiar arkusza, cena za m² i ilość do zamówienia w m²", () => {
    expect(hebanSheetSize(rows[0])).toEqual([2800, 2070]);
    expect(hebanSheetSize(rows[4])).toEqual([2800, 2070]);
    expect(hebanSheetSize(rows[2])).toBeNull();
    expect(hebanPricePerM2(rows[0])).toBe(28.98);
    expect(hebanPricePerM2(rows[1])).toBeCloseTo(40.53, 2);
    expect(hebanPricePerM2(rows[2])).toBeNull();
    expect(hebanSheetsToM2(rows[0], 2)).toBe(11.592);
    expect(hebanSheetsToM2(rows[0], 0.5)).toBe(2.898);
    expect(hebanSheetsToM2(rows[2], 1)).toBeNull();
  });

  it("kod Blum, kolor i strona z kodu Hebanu", () => {
    expect(hebanBlumCode(rows[2])).toEqual({ code: "470M5002S", color: "B", side: "L" });
    expect(hebanBlumCode(rows[3])).toEqual({ code: "450.5001B", color: "", side: "LP" });
    expect(hebanBlumCode(["ZA4.5400.BTABD  V1000OG-M", "", "szt.", 0.54, "", ""])).toEqual({ code: "ZA4.5400", color: "A", side: "" });
    expect(hebanBlumCode(["ZL4.500S.E BXCA MP 10IG-M", "", "szt.", 64.56, "", ""])).toEqual({ code: "ZL4.500S.E", color: "S", side: "" });
    expect(hebanBlumCode(rows[0])).toBeNull();
  });

  it("plik katalogu ze skryptu", () => {
    const file = { format: "gsn-heban-catalog", date: "2026-11-13", rows: [...rows, ["X", "zła cena", "szt.", "1,5", "x", ""], ["", "bez kodu", "szt.", 1, "x", ""]] };
    expect(parseHebanCatalog(JSON.stringify(file))).toEqual({ date: "2026-11-13", rows });
    expect(parseHebanCatalog(JSON.stringify({ ...file, format: "gsn-sas-catalog" }))).toBeNull();
    expect(parseHebanCatalog(JSON.stringify({ ...file, date: "13.11.2026" }))).toBeNull();
    expect(parseHebanCatalog("nie json")).toBeNull();
  });
});

// Części Merivobox w układzie Hebanu (kody ze spacjami, kolor w końcówce kodu), ceny przykładowe.
const H = (code, price, unit = "szt.") => [code, `${code} (kod z Hebanu, blum merivobox)`, unit, price, "Blum merivobox", code];
const parts = [
  H("470M5002S  Z LI   V20SW-M", 36), H("470M5002S  Z RE   V20SW-M", 36), H("470M5002S  Z LI   V20OG-M", 35), H("470M5002S  Z RE   V20OG-M", 35),
  H("470K5002S  Z R+L  V1 SW-M", 114, "kpl."),
  H("450.5001B  K R+L   MP  ZN", 97), H("453.5001B  K R+L   MP  ZN", 122),
  H("ZF4.1002   FROB  V500  ZN", 1.35), H("ZF4.10I2   FROB  V500  ZN", 2.14), H("ZF4.5002   FROB O 500  ZN", 1.56),
  H("ZA4.5400.BTABD  V1000SW-M", 0.54), H("ZA4.5400.BTABD  V1000OG-M", 0.54),
  H("ABD.1000.BTABD  V1000SW-M", 0.48), H("ABD.1000.BTABD  V1000OG-M", 0.48),
  H("ZB4M000S   HO-RW  MP SW-M", 4.92), H("ZB4K000S   HO-RW  MP SW-M", 5.78), H("ZB4E000S   HO-RW  MP SW-M", 9.68), H("ZB4E000S   HO-RW  MP OG-M", 10),
  H("ZL4.500S.E BXCA MP 10SW-M", 64.56),
  H("ZR4.500RS.ERE R+L MP SW-M", 25), H("ZB4E00AK   ABD  V100 SW-M", 5.82),
  ["71B3550 MB V250 NI+WIERTERKA+BITY", "ZESTAW-250 szt. 71B3550 + wiertarka", "szt.", 12.18, "Blum zawiasy", "1"],
  ["71B3550   MB     V250  NI", "BLUM 71B3550 CLIP TOP BLUMOTION zawias 110°", "szt.", 13.59, "Blum zawiasy", "2"],
  ["173L6100 MPL V500 NI", "BLUM 173L6100 CLIP Prowadnik 0 mm", "szt.", 0.89, "Blum zawiasy", "3"],
  ["70T3550.TLMB V50 NI", "BLUM 70T3550 zawias TIP-ON", "szt.", 6.97, "Blum zawiasy", "4"],
  ["766H5000B  MOVENTO MP  ZN", "MOVENTO 60 kg NL 500 BLUMOTION", "kpl.", 152, "Blum movento", "5"],
  ["T51.7601 KUPP L 100 OR", "T51.7601 MOVENTO LEWE Sprzęgło", "szt.", 6.89, "Blum movento", "6"],
  ["T51.7601 KUPP R 100 OR", "T51.7601 MOVENTO PRAWE Sprzęgło", "szt.", 6.89, "Blum movento", "7"],
];
const codes = (list) => list.map((r, i) => `${r[0].split(/\s+/)[0]}${list.per[i] > 1 ? "×" + list.per[i] : ""}`);

describe("dobór okuć z katalogu Heban", () => {
  it("MERIVOBOX E z relingiem (domyślnie): boki lewy + prawy, prowadnica, mocowania, zaślepki, uchwyt, reling", () => {
    const s = hebanSuggest(parts, "Komplet szuflady (MERIVOBOX - H:E L-500)");
    expect(codes(s)).toEqual(["470M5002S", "470M5002S", "450.5001B", "ZF4.1002×2", "ZF4.5002×2", "ZA4.5400.BTABD×2", "ABD.1000.BTABD×2", "ZB4E000S", "ZR4.500RS.ERE", "ZB4E00AK×2"]);
    expect(hebanLinkPrice(s)).toBe(Math.round((36 * 2 + 97 + 1.35 * 2 + 1.56 * 2 + 0.54 * 2 + 0.48 * 2 + 9.68 + 25 + 5.82 * 2) * 100) / 100);
    expect(hebanLinkLabel(s)).toMatch(/^470M5002S Z LI V20SW-M \+ 470M5002S Z RE V20SW-M \+ .*ZF4\.1002 FROB V500 ZN ×2.* · \d+,\d\d zł$/);
  });

  it("opcje: Boxcap, 70 kg, Inserta, kolor; para R+L jedną pozycją; brak części = null", () => {
    const box = hebanSuggest(parts, "Komplet szuflady (MERIVOBOX - H:E L-500)", { color: "B", kg: 70, eVariant: "boxcap", fix: "W" });
    expect(codes(box)).toContain("ZL4.500S.E");
    expect(codes(box)).toContain("453.5001B");
    expect(codes(box)).not.toContain("ZR4.500RS.ERE");
    const k = hebanSuggest(parts, "Komplet szuflady (MERIVOBOX - H:K L-500)", { color: "B", kg: 40, eVariant: "reling", fix: "I" });
    expect(codes(k)).toEqual(["470K5002S", "450.5001B", "ZF4.10I2×2", "ZA4.5400.BTABD×2", "ABD.1000.BTABD×2", "ZB4K000S"]);
    // antracyt: brak uchwytu ZB4M000S w kolorze OG -> nie da się skompletować
    expect(hebanSuggest(parts, "Komplet szuflady (MERIVOBOX - H:M L-500)", { color: "A", kg: 40, eVariant: "reling", fix: "W" })).toBeNull();
    expect(hebanSuggest(parts, "Komplet szuflady (ANTARO - H:M L-500)")).toBeNull();
  });

  it("zawias bez zestawów promocyjnych, kod z przyrostkiem, MOVENTO ze sprzęgłami", () => {
    expect(codes(hebanSuggest(parts, "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)"))).toEqual(["71B3550", "173L6100"]);
    expect(codes(hebanSuggest(parts, "Zawias 70T3550 + prowadnik 173L6100"))).toEqual(["70T3550.TLMB", "173L6100"]);
    const mv = hebanSuggest(parts, "Prowadnice Blum MOVENTO 766H (60 kg) NL-500 + sprzęgła T51.7601");
    expect(mv.map((r) => r[5])).toEqual(["5", "6", "7"]);
    const legs = [
      ["637.76.353", "Stopka regulacji cokołu AXILO 100", "szt.", 2.82, "HAF", "21"],
      ["637.76.333", "GŁÓWKA STOPKI AXILO", "szt.", 1.97, "HAF", "22"],
    ];
    expect(hebanSuggest(legs, "Nóżka regulowana H-100").map((r) => r[5])).toEqual(["21", "22"]);
    expect(hebanSuggest(legs, "Nóżka regulowana H-120")).toBeNull();
  });

  it("powiązanie z Kosztorysu: zapis z ilościami i odczyt, pierwszeństwo przed doborem", () => {
    const s = hebanSuggest(parts, "Komplet szuflady (MERIVOBOX - H:E L-500)");
    const link = hebanLinkFromRows(s);
    expect(link.split("|")[3]).toBe("ZF4.1002   FROB  V500  ZN×2");
    const back = hebanRowsFromLink(parts, link);
    expect(hebanLinkPrice(back)).toBe(hebanLinkPrice(s));
    expect(hebanRowsFromLink(parts, "NIEMA×1")).toBeNull();
    const links = { "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)": "71B3550 MB V250 NI+WIERTERKA+BITY×1" };
    expect(hardwareHebanRows(parts, links, "Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)")[0][3]).toBe(12.18);
    expect(hebanIsBoard(rows[0])).toBe(true);
    expect(hebanIsBoard(rows[2])).toBe(false);
  });
});
