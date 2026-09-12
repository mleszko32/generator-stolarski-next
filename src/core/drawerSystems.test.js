import { describe, it, expect } from "vitest";
import { drawerSystems } from "./drawerSystems.js";

// Katalog systemów szuflad to jedyne źródło tych danych. Ten test pilnuje
// kompletności wpisów — regresja "brakującego tandemboxa" (system był do
// wyboru w UI, ale nie istniał tutaj, więc formatki dna/tyłu po cichu się nie
// generowały) nie może się powtórzyć.
const REQUIRED_SYSTEMS = [
  "antaro",
  "tandembox",
  "merivobox",
  "legrabox",
  "gtv_axis_16",
  "gtv_axis_18",
];

describe("drawerSystems catalog", () => {
  it("zawiera wszystkie systemy oferowane w UI", () => {
    for (const id of REQUIRED_SYSTEMS) {
      expect(drawerSystems, `brak systemu: ${id}`).toHaveProperty(id);
    }
  });

  for (const [id, sys] of Object.entries(drawerSystems)) {
    describe(id, () => {
      it("ma komplet odjęć wymiarowych (liczby)", () => {
        for (const key of ["bottomWidthDeduct", "bottomLengthDeduct", "backWidthDeduct"]) {
          expect(typeof sys[key], `${id}.${key}`).toBe("number");
          expect(sys[key]).toBeGreaterThan(0);
        }
      });

      it("ma offsety montażowe", () => {
        expect(sys.mounting).toBeDefined();
        for (const key of ["railOffset", "frontHolesBase", "frontHolesXBase"]) {
          expect(typeof sys.mounting[key], `${id}.mounting.${key}`).toBe("number");
        }
      });

      it("ma co najmniej jeden wariant wysokości z type/height/minSpace", () => {
        const variants = Object.values(sys.variants || {});
        expect(variants.length).toBeGreaterThan(0);
        for (const v of variants) {
          expect(typeof v.type).toBe("string");
          expect(v.height).toBeGreaterThan(0);
          expect(v.minSpace).toBeGreaterThan(0);
        }
      });

      it("warianty są posortowane rosnąco po minSpace i height", () => {
        const variants = Object.values(sys.variants);
        for (let i = 1; i < variants.length; i++) {
          expect(variants[i].minSpace).toBeGreaterThan(variants[i - 1].minSpace);
          expect(variants[i].height).toBeGreaterThan(variants[i - 1].height);
        }
      });
    });
  }

  // Regresja: height = wysokość DREWNIANEJ ŚCIANKI TYLNEJ (formatka "tył"), nie
  // wysokość boku szuflady (profil metalowy) - to dwie różne liczby w katalogu
  // Blum dla tego samego oznaczenia N/M/K/E (np. N: bok 68.5mm, ale tył tylko
  // 60.5mm - zweryfikowane zrzutem ekranu z katalogu "Szuflada standardowa - N",
  // pole "Drewniana ścianka tylna"). Formatki tnie się na wysokość tyłu.
  it("Merivobox: wysokości tyłu (nie boku!) zgodne z katalogiem Blum", () => {
    const v = drawerSystems.merivobox.variants;
    expect(v.bardzoniska.height).toBe(60.5);
    expect(v.niska.height).toBe(83);
    expect(v.srednia.height).toBe(121);
    expect(v.wysoka.height).toBe(184);
  });

  // Regresja: brakował najwyższy wariant Legrabox (F) - zweryfikowany z
  // oficjalnymi instrukcjami Blum (d2.blum.com "Drawer Component Preparation",
  // dakotahardwoods.com "F Height Drawer"). 212mm to wysokość CIĘCIA tyłu, nie
  // mylić z "wysokością profilu szuflady" 241mm, którą część źródeł też
  // nazywa "F height" - to inny, niewykorzystywany tu wymiar.
  it("Legrabox: ma najwyższy wariant F (212mm, min. miejsce 257mm)", () => {
    const v = drawerSystems.legrabox.variants;
    expect(v.bardzowysoka).toMatchObject({ type: "F", height: 212, minSpace: 257 });
  });
});
