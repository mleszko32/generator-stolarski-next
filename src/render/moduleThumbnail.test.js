import { describe, it, expect } from "vitest";
import { generateModuleThumbnailSVG } from "./moduleThumbnail.js";
import { baseModule, fullZoneFront } from "../test/fixtures.js";

describe("generateModuleThumbnailSVG", () => {
  it("zwraca pusty string bez modułu", () => {
    expect(generateModuleThumbnailSVG(null)).toBe("");
  });

  it("rysuje obrys korpusu i jeden prostokąt na front", () => {
    const mod = baseModule({ elements: [fullZoneFront({ x: 18, y: 18, w: 564, h: 684 })] });
    const svg = generateModuleThumbnailSVG(mod, 40);
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="40" height="40"');
    expect((svg.match(/<rect/g) || []).length).toBe(2); // obrys + 1 front
  });

  it("drzwi i szuflady dostają różne kolory", () => {
    const mod = baseModule({
      elements: [
        fullZoneFront({ id: "d", subtype: "drzwi", x: 18, y: 371, w: 564, h: 331 }),
        fullZoneFront({ id: "s", subtype: "szuflada", x: 18, y: 18, w: 564, h: 331 }),
      ],
    });
    const svg = generateModuleThumbnailSVG(mod);
    expect(svg).toContain("#f0fdf4"); // drzwi
    expect(svg).toContain("#eff6ff"); // szuflada
  });

  it("szafka narożna dostaje kształt L, bez rzucania błędu", () => {
    const mod = { type: "corner_cabinet", dimensions: { width: 860, legB: 860, height: 720 } };
    const svg = generateModuleThumbnailSVG(mod, 24);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });
});
