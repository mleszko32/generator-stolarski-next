import { describe, it, expect } from "vitest";
import { lamelloDiscSetting } from "./lamello.js";

describe("tarcza kątów Lamello (lamelloDiscSetting)", () => {
  it("płyta 18 mm: P-10 do 35°, P-14 z podkładką 4 mm 40-80°, bez podkładki 85-90°", () => {
    expect(lamelloDiscSetting(22.5, 18)).toMatchObject({ connector: "P-10", spacer: 2 });
    expect(lamelloDiscSetting(35, 18)).toMatchObject({ connector: "P-10", spacer: 2 });
    expect(lamelloDiscSetting(53.1, 18)).toMatchObject({ angle: 55, connector: "P-14", spacer: 4 });
    expect(lamelloDiscSetting(80, 18)).toMatchObject({ connector: "P-14", spacer: 4 });
    expect(lamelloDiscSetting(85, 18)).toMatchObject({ connector: "P-14", spacer: 0 });
    expect(lamelloDiscSetting(100, 18)).toMatchObject({ connector: "P-14", spacer: 2 });
  });

  it("inne grubości, brak łącznika i poza tarczą", () => {
    expect(lamelloDiscSetting(45, 16)).toMatchObject({ connector: "P-10", spacer: 4 });
    expect(lamelloDiscSetting(22.5, 22)).toMatchObject({ connector: "P-14", spacer: 0 });
    expect(lamelloDiscSetting(35, 16)).toMatchObject({ connector: null });
    expect(lamelloDiscSetting(15, 18)).toBeNull();
    expect(lamelloDiscSetting(45, 25)).toBeNull();
  });
});
