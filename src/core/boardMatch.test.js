import { describe, it, expect } from "vitest";
import { parseBoardDecor, rowThickness, pickBoard, categoryDecor, boardOffers } from "./boardMatch.js";

// SAS: [indeks, nazwa, jedn., cena arkusza, grupa]; Heban: [kod, nazwa, jedn., cena za m², grupa, id]
const sas = [
  ["143327-500", "Płyta meblowa EGGER U702 ST9 18mm Kaszmir V24", "szt", 289.8, "Płyty"],
  ["168479-100", "Płyta meblowa EGGER U702 PM/ST9 19mm Kaszmir PerfectSense Mat V12", "szt", 900, "Płyty"],
  ["171138-200", "Blat EGGER U702 Kaszmir ST78 4100x600x38mm", "szt", 382.16, "Blaty robocze i panele wnękowe"],
  ["348634-360", "Płyta HDF WOODECO HD3037 Dąb olejowany II 2850x2070 3mm V160", "szt", 59, "Płyty"],
  ["961193-003", "Obrzeże meblowe REHAU 23x0.8mm 79098 /U702 ST9", "m", 1.28, "Obrzeża"],
];
const heb = [
  ["18.U702 ST9 2800X2070 KASZMIR", "Z. EG.PŁYTA WIÓROWA LAMINOWANA gr.18 U702 ST9. 2800X2070", "m2", 47.08, "EGGER PŁYTA", "1"],
  ["18.D3025/OW-2800X2070 P.R.!!!", "D.P. Dąb Sonoma gr.18 mm 3025/OW. 2800x2070", "m2", 28.98, "PŁYTY LAMINOWANE", "2"],
  ["16.D3025/OW-2800X2070 P.R.!!!", "D.P. Dąb Sonoma gr.16 mm 3025/OW. 2800x2070", "m2", 30.39, "PŁYTY LAMINOWANE", "3"],
  ["18.U8685/SM-2800X2070 II GATUNEK", "II. D.P.Biel Alpejska gr.18 mm U8685/SM", "m2", 20, "PŁYTY LAMINOWANE", "4"],
  ["18.U8685/SM-2800X2070", "D.P.Biel Alpejska gr.18 mm U8685/SM. 2800x2070", "m2", 28.98, "PŁYTY LAMINOWANE", "5"],
  ["LAM.D3025/OW 4100X1320X0.6", "Laminat HPL D3025/OW 4100x1320x0.6", "m2", 59.96, "LAMINATY", "6"],
];

describe("dobór płyty z hurtowni", () => {
  it("dekor: kod, struktura, grubość, rodzaj, producent", () => {
    expect(parseBoardDecor("Egger U702 ST9 18mm")).toMatchObject({ code: "U702", structure: "ST9", thickness: 18, kind: "board", producer: "egger" });
    expect(parseBoardDecor("HDF 110 D-PE Biały korpusowy 3mm")).toMatchObject({ code: "110", structure: "D-PE", thickness: 3, kind: "hdf" });
    expect(parseBoardDecor("Swiss Krono D3025 OW Dąb Sonoma")).toMatchObject({ code: "D3025", structure: "OW", thickness: null, producer: "swisskrono" });
    expect(parseBoardDecor("HDF biały 3 mm")).toBeNull();
    expect(rowThickness(heb[0])).toBe(18);
    expect(rowThickness(sas[3])).toBe(3);
  });

  it("Egger / Woodeco z SAS (cena arkusza / m²), Swiss Krono z Hebanu; bez blatów, obrzeży, PerfectSense, II gatunku", () => {
    const u702 = pickBoard(sas, heb, "Egger U702 ST9 18mm");
    expect(u702.src).toBe("sas");
    expect(u702.row[0]).toBe("143327-500");
    expect(u702.pricePerM2).toBe(50);
    expect(pickBoard(sas, heb, "HDF Woodeco HD3037 Dąb olejowany II 3mm").row[0]).toBe("348634-360");
    const sonoma = pickBoard(sas, heb, "Swiss Krono D3025 OW Dąb Sonoma");
    expect([sonoma.src, sonoma.row[5], sonoma.pricePerM2]).toEqual(["heban", "2", 28.98]);
    expect(pickBoard(sas, heb, "Swiss Krono D3025 OW Dąb Sonoma 16mm").row[5]).toBe("3");
    expect(pickBoard(sas, heb, "Swiss Krono U8685 SM Biel alpejska").row[5]).toBe("5");
    expect(pickBoard(sas, heb, "Egger U702 PM/ST9 19mm Kaszmir PerfectSense").row[0]).toBe("168479-100");
  });

  it("producent nieznany - tańsza; brak w obu hurtowniach - null; Egger bez SAS - Heban", () => {
    expect(pickBoard(sas, heb, "U702 ST9 18mm").src).toBe("heban");
    expect(pickBoard(sas, heb, "Egger H1180 ST37 18mm")).toBeNull();
    expect(pickBoard([], heb, "Egger U702 ST9 18mm").src).toBe("heban");
  });

  it("oferty obu hurtowni do porównania", () => {
    const o = boardOffers(sas, heb, "Egger U702 ST9 18mm");
    expect([o.sas.row[0], o.sas.pricePerM2, o.heban.row[5], o.heban.pricePerM2]).toEqual(["143327-500", 50, "1", 47.08]);
    expect(boardOffers(sas, heb, "HDF biały 3 mm")).toEqual({ sas: null, heban: null });
  });

  it("dekor wiersza kosztorysu", () => {
    const project = { materials: { decors: { Korpus: "Egger W1000 ST9 18mm", Szuflada: "" } } };
    expect(categoryDecor("Korpus: Egger U702 ST9 18mm", project)).toBe("Egger U702 ST9 18mm");
    expect(categoryDecor("Plecy: HDF Woodeco HD3037 Dąb olejowany II 3mm", project)).toBe("HDF Woodeco HD3037 Dąb olejowany II 3mm");
    expect(categoryDecor("Korpus", project)).toBe("Egger W1000 ST9 18mm");
    expect(categoryDecor("Szuflada", project)).toBe("");
  });
});
