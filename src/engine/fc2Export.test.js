import { describe, it, expect } from "vitest";
import { buildFc2Csv, fc2Text, fc2SymbolKey, fc2SymbolSlots, getFc2Settings, autoSymbol } from "./fc2Export.js";

const project = (fc2Export) => ({
  pricing: { frontMaterials: [{ id: "default", name: "Standard" }, { id: "lakier", name: "Lakier" }] },
  ...(fc2Export ? { fc2Export } : {}),
});
const all = [true, true, true, true];

describe("fc2Text", () => {
  it("usuwa polskie litery, separatory i przycina do 50 znaków", () => {
    expect(fc2Text("Półka; żółta\tłódź")).toBe("Polka zolta lodz");
    expect(fc2Text("x".repeat(60))).toHaveLength(50);
  });
});

describe("symbole materiałów", () => {
  it("fronty po materiale z cennika, brak materiału = pierwszy z cennika", () => {
    expect(fc2SymbolKey({ category: "Front", materialId: "lakier" }, project())).toBe("Front:lakier");
    expect(fc2SymbolKey({ category: "Front" }, project())).toBe("Front:default");
    expect(fc2SymbolKey({ category: "Korpus" }, project())).toBe("Korpus");
  });
  it("pozycje do wpisania w kolejności kategorii", () => {
    const slots = fc2SymbolSlots([{ category: "Plecy" }, { category: "Front", materialId: "lakier" }, { category: "Korpus" }], project());
    expect(slots.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "Korpus", label: "Korpus" },
      { key: "Front:lakier", label: "Front - Lakier" },
      { key: "Plecy", label: "Plecy" },
    ]);
  });
});

describe("buildFc2Csv", () => {
  it("wiersz w formacie FC2: dłuższe krawędzie = góra/dół, krótsze = lewa/prawa", () => {
    const csv = buildFc2Csv([
      { category: "Front", materialId: "lakier", name: "Drzwi", length: 696, width: 546, qty: 3, edges: all },
      { category: "Korpus", name: "Bok (L/P)", length: 2082, width: 480, qty: 4, edges: [true, false, false, false] },
      { category: "Plecy", name: "Plecy 2082x550", length: 2078, width: 546, qty: 2, edges: [false, false, false, false] },
    ], project({ symbols: { Korpus: "U702", "Front:lakier": "MDF18" }, edgeSymbol: "PCV_2" }));
    expect(csv.split("\r\n")).toEqual([
      "MDF18;696;546;3;Drzwi;PCV_2;PCV_2;PCV_2;PCV_2;;;0",
      "U702;2082;480;4;Bok (L/P);;;PCV_2;;;;0",
      "Plecy;2078;546;2;Plecy 2082x550;;;;;;;0",
      "",
    ]);
  });
  it("pomija puste i zerowe wiersze, pogrubienie z ustawień", () => {
    const csv = buildFc2Csv([{ category: "Korpus", name: "x", length: 0, width: 10, qty: 1, edges: all },
      { category: "Korpus", name: "W550", length: 514, width: 480, qty: 12, edges: all }], project({ bolding: true }));
    expect(csv).toBe("Korpus;514;480;12;W550;PCV_2;PCV_2;PCV_2;PCV_2;;;1\r\n");
  });
  it("format SAS: 13 kolumn - struktura (10) i pogrubianie (13)", () => {
    const p = project({ symbols: { Korpus: "U702 ST9 18" }, grain: true, bolding: true });
    const csv = buildFc2Csv([{ category: "Korpus", name: "Bok", length: 720, width: 560, qty: 2, edges: [true, false, false, false] }],
      p, getFc2Settings(p), "sas");
    expect(csv).toBe("U702 ST9 18;720;560;2;Bok;;;;;1;;;1\r\n");  // SAS bez oklejania
    const p2 = project({ symbols: { Korpus: "U702" }, edges: { Korpus: "76873_23/2_GL_BIALE/963017-009" } });
    expect(buildFc2Csv([{ category: "Korpus", name: "Bok", length: 720, width: 560, qty: 1, edges: [true, false, false, false] }], p2, getFc2Settings(p2)))
      .toBe("U702;720;560;1;Bok;;;76873_23/2_GL_BIALE/963017-009;;;;0\r\n");
  });
  it("bez wpisu symbol = symbol eSAS płyty z projektu (dekor korpusu, lakier -> MDF, HDF), inaczej nazwa płyty", () => {
    const p = { pricing: { frontMaterials: [{ id: "l", name: "Lakier" }] }, materials: { decors: { Plecy: "HDF biały 3 mm", Szuflada: "Coś spoza bazy" } } };
    expect(autoSymbol({ category: "Korpus: Egger W908/W908 SM/SM-MB Biały bazowy 19mm 2800x2070 Dwustronna E1E05 TSCA" }, p)).toBe("MDF_W908_SM/W908_SM-MB_DO_GL._FREZGR/145909-300");
    expect(autoSymbol({ category: "Front", materialId: "l" }, p)).toBe("MDF_W908_SM/W908_SM-MB_DO_GL._FREZ._G/145909-200");
    expect(autoSymbol({ category: "Plecy" }, p)).toBe("HDF110PE-BIALA_JEDNOSTRONN_GR_3/HDF000-001");
    expect(autoSymbol({ category: "Szuflada" }, p)).toBe("Coś spoza bazy");
    expect(autoSymbol({ category: "Inne" }, p)).toBe("");
    expect(autoSymbol({ category: "Korpus: Lakier NCS S 2005-Y40R" }, p)).toBe("MDF_W908_SM/W908_SM-MB_DO_GL._FREZ._G/145909-200");
    const csv = buildFc2Csv([{ category: "Front", materialId: "l", name: "Drzwi", length: 700, width: 500, qty: 1, edges: all }], p, getFc2Settings(p), "sas");
    expect(csv.startsWith("MDF_W908_SM/W908_SM-MB_DO_GL._FREZ._G/145909-200;700;500;1;Drzwi;")).toBe(true);
  });
  it("domyślne ustawienia", () => {
    expect(getFc2Settings({})).toEqual({ symbols: {}, edgeSymbol: "PCV_2", bolding: false, grain: false, edges: {} });
  });
});
