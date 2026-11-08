import { describe, it, expect } from "vitest";
import { cornerHingeName, CORNER_WIDE_HINGE_NAME } from "./cornerHinge.js";

describe("zawias drzwi szafki narożnej", () => {
  const front = { cornerArm: "A" };
  it("oddzielne fronty z cornerWideHinge -> Blum 170°", () => {
    expect(cornerHingeName({ type: "corner_cabinet", cornerWideHinge: true }, front)).toBe(CORNER_WIDE_HINGE_NAME);
  });
  it("bez ustawienia, przy froncie łamanym albo w zwykłej szafce -> zwykły zawias", () => {
    expect(cornerHingeName({ type: "corner_cabinet" }, front)).toBe(null);
    expect(cornerHingeName({ type: "corner_cabinet", cornerWideHinge: true, cornerFrontMode: "bifold" }, front)).toBe(null);
    expect(cornerHingeName({ type: "upper_cabinet", cornerWideHinge: true }, { cornerArm: null })).toBe(null);
  });
});
