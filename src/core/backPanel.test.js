import { describe, it, expect } from "vitest";
import { resolveBackPanel, corpusInnerDepth, sideDepthOf, BACK_PANEL_DEFAULTS } from "./backPanel.js";
import { getCorpusParts } from "../engine/carcaseParts.js";
import { getBackPanelParts } from "../engine/carcaseParts.js";
import { freshProject, baseModule } from "../test/fixtures.js";

describe("resolveBackPanel", () => {
  it("bez ustawień w szafce daje wartości domyślne z formularza", () => {
    expect(resolveBackPanel({}, freshProject())).toEqual({ ...BACK_PANEL_DEFAULTS });
  });

  it("uzupełnia brakujące pola i zamienia napisy na liczby", () => {
    const bp = resolveBackPanel({ backPanel: { type: "nut", offset: "20" } }, freshProject());
    expect(bp).toEqual({ type: "nut", offset: 20, grooveDepth: 6, clearance: 2, nutBuild: "all", thickness: 18, insetOffset: 0 });
  });

  it("szafka nadpisuje ustawienia projektu", () => {
    const project = freshProject({ backPanel: { grooveDepth: 8 } });
    expect(resolveBackPanel({ backPanel: { grooveDepth: 10 } }, project).grooveDepth).toBe(10);
    expect(resolveBackPanel({}, project).grooveDepth).toBe(8);
  });
});

describe("corpusInnerDepth", () => {
  it("plecy nakładane: głębokość minus HDF, w nucie jeszcze minus cofnięcie", () => {
    const project = freshProject();
    expect(corpusInnerDepth(baseModule({ backPanel: { type: "nakladane" } }), project)).toBe(510);
    expect(corpusInnerDepth(baseModule({ backPanel: { type: "nut", offset: 20 } }), project)).toBe(490);
  });
});

describe("plecy w nucie bez głębokości nutu (np. szafka z importu szkicu AI)", () => {
  it("formatka ma liczby zamiast NaN - domyślny nut 6 mm i luz 2 mm", () => {
    const mod = baseModule({ backPanel: { type: "nut", offset: 16 } });
    const [plecy] = getBackPanelParts(mod, freshProject());
    // 600 - 2*18 + 2*6 - 2*2 = 572; 720 - 2*18 + 2*6 - 2*2 = 692
    expect(plecy).toMatchObject({ length: 692, width: 572 });
  });
});

describe("plecy wpuszczane", () => {
  const mod = () => baseModule({ dimensions: { width: 550, height: 694, depth: 500 }, backPanel: { type: "wpuszczane", thickness: 18 } });

  it("bok na całą głębokość, wieńce krótsze o plecy", () => {
    const project = freshProject();
    expect(sideDepthOf(mod(), project)).toBe(500);
    expect(corpusInnerDepth(mod(), project)).toBe(482);
    const parts = getCorpusParts(mod(), project);
    expect(parts.find((p) => p.name === "Bok (L/P)").width).toBe(500);
    expect(parts.find((p) => p.name === "W550").width).toBe(482);
  });

  it("plecy to formatka korpusu między bokami i wieńcami", () => {
    expect(getBackPanelParts(mod(), freshProject())).toEqual([
      { name: "Plecy wpuszczane 694x550", length: 658, width: 514, qty: 1, category: "Korpus" },
    ]);
  });

  it("cofnięte od tyłu boków (szczelina do ściany): wieńce krótsze o cofnięcie i plecy, bok bez zmian", () => {
    const m = baseModule({ dimensions: { width: 420, height: 2050, depth: 403 }, backPanel: { type: "wpuszczane", thickness: 18, insetOffset: 20 } });
    const project = freshProject();
    expect(sideDepthOf(m, project)).toBe(403);
    expect(corpusInnerDepth(m, project)).toBe(365);
    expect(getCorpusParts(m, project).find((p) => p.name === "W420").width).toBe(365);
    expect(getBackPanelParts(m, project)[0]).toMatchObject({ length: 2014, width: 384 });
  });

  it("nakładane bez zmian: bok krótszy o HDF", () => {
    expect(sideDepthOf(baseModule({ dimensions: { width: 600, height: 720, depth: 513 } }), freshProject())).toBe(510);
  });
});
