import { describe, it, expect } from "vitest";
import { lacquerCode, lacquerColor, lacquerSuggestions } from "./lacquerColors.js";
import { RAL_CLASSIC } from "./data/ralClassic.js";
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
    expect(RAL_CLASSIC.length).toBeGreaterThan(200);
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

  it("podpowiedzi zawierają RAL i NCS", () => {
    const s = lacquerSuggestions();
    expect(s).toContain("RAL 9016 Traffic white");
    expect(s).toContain("NCS S 0502-Y");
  });

  it("materiał frontu z kolorem lakieru: odcień w 3D i opis formatki", () => {
    const project = { pricing: { frontMaterials: [{ id: "lak", name: "Lakier", color: "RAL 7016" }] } };
    expect(frontMaterialColor("lak", project)).toBe(lacquerColor("RAL 7016"));
    expect(decorColor("Lakier RAL 7016")).toBe(lacquerColor("RAL 7016"));
    expect(partMaterialLabel({ category: "Front", materialId: "lak" }, project)).toMatch(/^Front: Lakier RAL 7016 \(Egger W908/);
  });
});
