import { describe, it, expect } from "vitest";
import { decorTextureSpec, grainAxis, textureKey, normalizePhoto, photoTile, photoDocId } from "./decorTexture.js";

describe("decorTextureSpec", () => {
  it("kod Egger H daje drewno, F kamień", () => {
    expect(decorTextureSpec("H1180 ST37 18mm", 0xc8a27a).kind).toBe("wood");
    expect(decorTextureSpec("F186 ST9", 0x9c9a95).kind).toBe("stone");
  });
  it("biele, kolory jednolite i lakier zostają gładkie", () => {
    expect(decorTextureSpec("W1000 PM/ST9 19mm", 0xfaf9f6)).toBeNull();
    expect(decorTextureSpec("U702 ST9 18mm", 0x8fa6a0)).toBeNull();
    expect(decorTextureSpec("Lakier RAL 9016", 0xf1f0ea)).toBeNull();
  });
  it("rozpoznaje drewno i kamień po nazwie bez kodu", () => {
    expect(decorTextureSpec("Front lamelowy dąb", 0xc99a7f).kind).toBe("wood");
    expect(decorTextureSpec("Blat beton jasny", 0x9c9a95).kind).toBe("stone");
    expect(decorTextureSpec("Front lamelowy biały", 0xf6f5f2)).toBeNull();
  });
  it("pusta nazwa albo brak koloru - bez tekstury", () => {
    expect(decorTextureSpec("", 0xffffff)).toBeNull();
    expect(decorTextureSpec("H1180", null)).toBeNull();
  });
  it("ten sam dekor ma zawsze ten sam klucz i ziarno", () => {
    const a = decorTextureSpec("h1180 st37", 1), b = decorTextureSpec(" H1180 ST37 ", 1);
    expect(a.key).toBe(b.key);
    expect(a.seed).toBe(b.seed);
    expect(textureKey("S:dąb")).toBe("DĄB");
    expect(textureKey("Egger H1180 ST37 Dąb Halifax naturalny 19mm")).toBe("H1180");
    expect(textureKey("F128 PA / U999 ST9 19mm Granit")).toBe("F128");
  });
});

describe("zdjęcia dekorów", () => {
  const dataUrl = "data:image/jpeg;base64,AAAA";
  it("normalizePhoto przepuszcza obraz i porządkuje pola", () => {
    expect(normalizePhoto({ name: " h1180 st37 ", dataUrl, widthMm: "800", grain: "h" }))
      .toEqual({ key: "H1180", name: " h1180 st37 ", dataUrl, widthMm: 800, grain: "h" });
    expect(normalizePhoto({ key: "X", dataUrl, widthMm: 5 }).widthMm).toBe(50);
    expect(normalizePhoto({ key: "X", dataUrl }).grain).toBe("v");
  });
  it("normalizePhoto odrzuca to, co nie jest obrazem", () => {
    expect(normalizePhoto({ key: "X", dataUrl: "javascript:alert(1)" })).toBeNull();
    expect(normalizePhoto({ key: "X", dataUrl: "data:text/html;base64,AAAA" })).toBeNull();
    expect(normalizePhoto({ key: "", dataUrl })).toBeNull();
    expect(normalizePhoto(null)).toBeNull();
  });
  it("photoTile - słoje pionowo na zdjęciu zamieniają osie", () => {
    expect(photoTile(600, 1000, 500, "h")).toEqual({ tileU: 600, tileV: 300 });
    expect(photoTile(600, 1000, 500, "v")).toEqual({ tileU: 300, tileV: 600 });
  });
  it("photoDocId nie zawiera ukośnika ani kropki", () => {
    expect(photoDocId("Fornir dąb 0.8/A")).toBe("FORNIR%20D%C4%84B%200%2E8%2FA");
    expect(photoDocId("W1000 PM/ST9 0.8")).toBe("W1000");
  });
});

describe("grainAxis", () => {
  it("front i bok - pionowo", () => {
    expect(grainAxis("front", 600, 300, 18)).toBe("y");
    expect(grainAxis("corpus", 18, 360, 560)).toBe("y");
  });
  it("wieniec i półka - wzdłuż dłuższego wymiaru", () => {
    expect(grainAxis("corpus", 564, 18, 510)).toBe("x");
    expect(grainAxis("shelf", 300, 18, 500)).toBe("z");
  });
  it("cokół - wzdłuż długości", () => {
    expect(grainAxis("plinth", 1200, 100, 18)).toBe("x");
  });
});
