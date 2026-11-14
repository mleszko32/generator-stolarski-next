import { describe, it, expect } from "vitest";
import { drawerOptions, drawerOptionsLabel, parseDrawerKit, merivoboxRecipe, BLUM_DRAWER_DEFAULTS } from "./blumDrawer.js";

describe("szuflady Blum - opcje i części MERIVOBOX", () => {
  it("opcje: domyślnie biały, 40 kg, E z relingiem, wkręty; złe wartości -> domyślne", () => {
    expect(drawerOptions({})).toEqual(BLUM_DRAWER_DEFAULTS);
    expect(drawerOptions(undefined)).toEqual(BLUM_DRAWER_DEFAULTS);
    expect(drawerOptions({ blumDrawer: { color: "A", kg: "70", eVariant: "boxcap", fix: "I" } })).toEqual({ color: "A", kg: 70, eVariant: "boxcap", fix: "I" });
    expect(drawerOptions({ blumDrawer: { color: "X", kg: 55, eVariant: "?", fix: "?" } })).toEqual(BLUM_DRAWER_DEFAULTS);
    expect(drawerOptionsLabel(BLUM_DRAWER_DEFAULTS)).toBe("jedwabiście biały, 40 kg, E z relingiem, wkręty");
  });

  it("nazwa kompletu z listy okuć", () => {
    expect(parseDrawerKit("Komplet szuflady (MERIVOBOX - H:E L-500)")).toEqual({ system: "MERIVOBOX", height: "E", nl: 500 });
    expect(parseDrawerKit("Zawias")).toBeNull();
  });

  it("części: E stoi na bokach M, ma mocowania górne; reling + zaślepki E albo Boxcap", () => {
    const e = merivoboxRecipe("E", 500);
    expect(e.map((i) => `${i.code}×${i.qty}`)).toEqual(["470M5002S×1", "450.5001B×1", "ZF4.1002×2", "ZF4.5002×2", "ZA4.5400×2", "ABD.1000×2", "ZB4E000S×1", "ZR4.500RS.ERE×1", "ZB4E00AK×2"]);
    const box = merivoboxRecipe("E", 450, { color: "S", kg: 70, eVariant: "boxcap", fix: "I" });
    expect(box.map((i) => i.code)).toEqual(["470M4502S", "453.4501B", "ZF4.10I2", "ZF4.50I2", "ZA4.5400", "ABD.1000", "ZB4E000S", "ZL4.450S.E"]);
    const m = merivoboxRecipe("M", 300);
    expect(m.map((i) => i.code)).toEqual(["470M3002S", "450.3001B", "ZF4.1002", "ZA4.5400", "ABD.1000", "ZB4M000S"]);
    expect(m.filter((i) => i.pair).map((i) => i.code)).toEqual(["470M3002S", "450.3001B"]);
  });
});
