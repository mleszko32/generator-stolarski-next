import { describe, it, expect } from "vitest";
import { drawingScale } from "./drawerBoxDrawing2d.js";

// Minimalna skrzynka do doboru skali: boki L × H, dno L × W, tył/przód W × h.
const box = (L, H, W, h) => ({
  panels: [
    { kind: "bok", length: L, width: H },
    { kind: "dno", length: L, width: W },
    { kind: "plyta", length: W, width: h },
  ],
});

describe("rysunki skrzynek szuflad - jedna skala", () => {
  it("typowa szuflada mieści się na A4 w skali 1:4", () => {
    expect(drawingScale(box(490, 195, 522, 166))).toBe(4);
  });
  it("większa skrzynka przechodzi na 1:5 / 1:10, ale jedna skala dla wszystkich formatek", () => {
    expect(drawingScale(box(690, 350, 503, 321))).toBe(5);
    expect(drawingScale(box(690, 914, 922, 875))).toBe(10);
  });
});
