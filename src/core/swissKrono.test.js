import { describe, it, expect } from "vitest";
import { swissKronoDecor } from "./swissKrono.js";
import { decorColor } from "./decorColors.js";
import { textureKey, decorTextureSpec } from "./decorTexture.js";
import { SWISS_KRONO_DECORS } from "./data/swissKronoDecors.js";

describe("dekory Swiss Krono", () => {
  it("każdy dekor z listy ma kolor próbki", () => {
    expect(SWISS_KRONO_DECORS.every((d) => /^#[0-9a-f]{6}$/.test(d.color))).toBe(true);
  });

  it("rozpoznaje dekor po kodzie tylko z nazwą producenta", () => {
    expect(swissKronoDecor("Swiss Krono D3025 OW Dąb Sonoma")).toMatchObject({ code: "D3025", type: "D", color: 0xc0a78e });
    expect(swissKronoDecor("Korpus: Swiss Krono U164 VL Antracyt").code).toBe("U164");
    expect(swissKronoDecor("Egger U164 ST9")).toBeNull(); // kody U pokrywają się z Egger
    expect(swissKronoDecor("Swiss Krono D99999 Nieznany")).toBeNull();
  });

  it("kolor w 3D to kolor próbki, też dla nazw bez słowa o drewnie", () => {
    expect(decorColor("Swiss Krono D20240 CX Oasis")).toBe(0xb4956c);
    expect(decorColor("Swiss Krono K101 PE Biały")).toBe(0xfcfaf8);
  });

  it("jedno zdjęcie na wszystkie struktury dekoru, drewno ma słoje, unikolor gładki", () => {
    expect(textureKey("Swiss Krono U190 VL Czarny")).toBe("SK-U190");
    expect(textureKey("Swiss Krono U190 PE Czarny")).toBe("SK-U190");
    expect(textureKey("SK-U190")).toBe("SK-U190");
    expect(decorTextureSpec("Swiss Krono D20240 CX Oasis", 0xb4956c)).toMatchObject({ kind: "wood", key: "SK-D20240" });
    expect(decorTextureSpec("Swiss Krono D1038 BS Beton Millenium", 0x989598).kind).toBe("stone");
    expect(decorTextureSpec("Swiss Krono U164 VL Antracyt", 0x474544)).toBeNull();
  });
});
