import { describe, it, expect } from "vitest";
import { hardwareGroup, groupHardware } from "./costGroups.js";

describe("grupy okuć w kosztorysie", () => {
  it("rozpoznaje grupę po nazwie pozycji", () => {
    expect(hardwareGroup("Komplet szuflady (MERIVOBOX - H:E L-500)")).toBe("szuflady");
    expect(hardwareGroup("Prowadnice Blum MOVENTO 766H (60 kg) NL-500 + sprzęgła T51.7601")).toBe("szuflady");
    expect(hardwareGroup("Czoło szuflady wewn. MERIVOBOX ZV4.1042M (profil 1042 mm do docięcia)")).toBe("szuflady");
    expect(hardwareGroup("Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)")).toBe("zawiasy");
    expect(hardwareGroup("AVENTOS HK-XS - siłownik, LF ok. 500")).toBe("zawiasy");
    expect(hardwareGroup("Nóżka regulowana H-100")).toBe("nozki");
    expect(hardwareGroup("Złącze korpusowe (Kołek 8x30 + Konfirmat)")).toBe("nozki");
    expect(hardwareGroup("Okleina krawędziowa (mb, formatki dookoła + 10% zapasu)")).toBe("okleina");
    expect(hardwareGroup("Okucie narożne Magic Corner (kpl. koszy) - strona ślepa lewa")).toBe("inne");
  });

  it("grupuje w stałej kolejności i pomija puste grupy", () => {
    const g = groupHardware([{ name: "Nóżka regulowana H-100" }, { name: "Komplet szuflady (MERIVOBOX - H:M L-450)" }, { name: "Kosz cargo" }]);
    expect(g.map((x) => [x.id, x.items.length])).toEqual([["szuflady", 1], ["nozki", 1], ["inne", 1]]);
  });
});
