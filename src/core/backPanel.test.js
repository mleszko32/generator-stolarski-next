import { describe, it, expect } from "vitest";
import { resolveBackPanel, corpusInnerDepth, BACK_PANEL_DEFAULTS } from "./backPanel.js";
import { getBackPanelParts } from "../engine/carcaseParts.js";
import { freshProject, baseModule } from "../test/fixtures.js";

describe("resolveBackPanel", () => {
  it("bez ustawień w szafce daje wartości domyślne z formularza", () => {
    expect(resolveBackPanel({}, freshProject())).toEqual({ ...BACK_PANEL_DEFAULTS });
  });

  it("uzupełnia brakujące pola i zamienia napisy na liczby", () => {
    const bp = resolveBackPanel({ backPanel: { type: "nut", offset: "20" } }, freshProject());
    expect(bp).toEqual({ type: "nut", offset: 20, grooveDepth: 6, clearance: 2, nutBuild: "all" });
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
