import { describe, it, expect } from "vitest";
import { lacquerCode, lacquerColor, lacquerSuggestions, isNcsStandard, lacquerWarning } from "./lacquerColors.js";
import { RAL_CLASSIC } from "./data/ralClassic.js";
import { RAL_NAMES_PL } from "./data/ralNamesPl.js";
import { NCS_STANDARD } from "./data/ncsStandard.js";
import { decorColor, frontMaterialColor } from "./decorColors.js";
import { partMaterialLabel } from "./materialCatalog.js";

const hex = (c) => "#" + c.toString(16).padStart(6, "0");

describe("kolory lakieru RAL / NCS", () => {
  it("rozpoznaje kod w tekście", () => {
    expect(lacquerCode("Lakier RAL 9016 Traffic white")).toBe("RAL 9016");
    expect(lacquerCode("ral9010")).toBe("RAL 9010");
    expect(lacquerCode("ncs s0502-y")).toBe("NCS S 0502-Y");
    expect(lacquerCode("S 2005-Y20R")).toBe("NCS S 2005-Y20R");
    expect(lacquerCode("Egger W1000 ST9")).toBe("");
    expect(lacquerCode("W908 18mm 2800x2070 Dwustronna E1E05")).toBe("");
  });

  it("RAL z tabeli (pełna paleta Classic)", () => {
    expect(RAL_CLASSIC.length).toBe(216);
    expect(new Set(RAL_CLASSIC.map(([c]) => c)).size).toBe(216);
    expect(hex(lacquerColor("RAL 6039"))).toBe("#b3c43e");
    // każdy kolor RAL ma polską nazwę
    expect(RAL_CLASSIC.filter(([c]) => !RAL_NAMES_PL[c.slice(4)])).toEqual([]);
    expect(hex(lacquerColor("RAL 9016"))).toBe("#f7fbf5");
    expect(hex(lacquerColor("RAL 7016"))).toBe("#373f43");
    expect(lacquerColor("RAL 0000")).toBeNull();
  });

  it("NCS ze wzoru, zgodnie z pakietem ncs-color", () => {
    expect(hex(lacquerColor("NCS S 2080-G20Y"))).toBe("#65d636");
    expect(hex(lacquerColor("NCS S 2060-B"))).toBe("#399bd6");
    expect(hex(lacquerColor("NCS S 5000-N"))).toBe("#7f7f7f");
    expect(lacquerColor("S 6050-Y")).toBeNull(); // czerń + chromatyczność > 100
  });

  it("podpowiedzi zawierają RAL (po polsku i angielsku) i cały wzornik NCS", () => {
    const s = lacquerSuggestions();
    expect(s).toContain("RAL 9016 Biały drogowy / Traffic white");
    expect(s).toContain("NCS S 0502-Y");
    expect(s).toContain("NCS S 2060-R80B");
    expect(s.length).toBe(216 + NCS_STANDARD.length);
    expect(lacquerCode("RAL 9016 Biały drogowy / Traffic white")).toBe("RAL 9016");
  });

  it("wzornik NCS 1950: poprawne kody, bez duplikatów", () => {
    expect(NCS_STANDARD.length).toBeGreaterThanOrEqual(1950);
    expect(new Set(NCS_STANDARD).size).toBe(NCS_STANDARD.length);
    NCS_STANDARD.forEach((c) => {
      expect(c).toMatch(/^\d{4}-(N|[RGBY](\d{2}[RGBY])?)$/);
      expect(lacquerColor("S " + c)).not.toBeNull();
    });
  });

  it("kontrola kodu koloru", () => {
    expect(isNcsStandard("NCS S 0502-Y")).toBe(true);
    expect(isNcsStandard("S 0502-Y15R")).toBe(false);
    expect(isNcsStandard("RAL 9016")).toBeNull();
    expect(lacquerWarning("NCS S 0502-Y")).toBe("");
    expect(lacquerWarning("RAL 9016")).toBe("");
    expect(lacquerWarning("")).toBe("");
    expect(lacquerWarning("S 0502-Y15R")).toMatch(/poza wzornikiem/);
    expect(lacquerWarning("S 6050-Y")).toMatch(/nie istnieje/);
    expect(lacquerWarning("RAL 0000")).toMatch(/nie istnieje/);
  });

  it("materiał frontu z kolorem lakieru: odcień w 3D i opis formatki", () => {
    const project = { pricing: { frontMaterials: [{ id: "lak", name: "Lakier", color: "RAL 7016" }] } };
    expect(frontMaterialColor("lak", project)).toBe(lacquerColor("RAL 7016"));
    expect(decorColor("Lakier RAL 7016")).toBe(lacquerColor("RAL 7016"));
    expect(partMaterialLabel({ category: "Front", materialId: "lak" }, project)).toMatch(/^Front: Lakier RAL 7016 \(Egger W908/);
  });
});
