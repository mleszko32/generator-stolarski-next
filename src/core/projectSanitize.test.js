import { describe, it, expect } from "vitest";
import { sanitizeProjectData } from "./projectSanitize.js";
import { freshProject, baseModule, fullZoneFront } from "../test/fixtures.js";
import { cloneModuleWithNewIds } from "./state.js";

const evil = '"><img src=x onerror=alert(1)>';

describe("sanitizeProjectData", () => {
  it("usuwa znaki HTML/JS z id i powiązań - tak samo, więc powiązanie zostaje", () => {
    const mod = baseModule({ id: "m" + evil, elements: [
      fullZoneFront({ id: "front" + evil }),
      fullZoneFront({ id: "front-2", baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, boundBottom: "front" + evil } }),
    ] });
    const p = sanitizeProjectData(freshProject({ modules: [mod] }));
    const [a, b] = p.modules[0].elements;
    expect(p.modules[0].id).not.toMatch(/[<>"']/);
    expect(a.id).not.toMatch(/[<>"']/);
    expect(b.baseZone.boundBottom).toBe(a.id);
  });

  it("wymiary i pozycja jako liczby; śmieci -> wartości domyślne", () => {
    const mod = baseModule({ dimensions: { width: "800", height: evil, depth: 560 }, position: { x: "100", y: 0, z: "abc" }, rotation: "90" });
    const [m] = sanitizeProjectData(freshProject({ modules: [mod] })).modules;
    expect(m.dimensions).toEqual({ width: 800, height: 720, depth: 560 });
    expect(m.position).toEqual({ x: 100, y: 0, z: 0 });
    expect(m.rotation).toBe(90);
  });

  it("nie rusza tekstu użytkownika (nazwy, oferta) ani poprawnych id", () => {
    const p = sanitizeProjectData(freshProject({
      name: 'Kuchnia "Kowalski"', offer: { notes: "Termin <2 tyg.>" },
      modules: [baseModule({ id: "mod-17000.5ab", name: 'Szafka "A"', elements: [fullZoneFront({ id: "front-L-1700.12" })] })],
    }));
    expect(p.name).toBe('Kuchnia "Kowalski"');
    expect(p.offer.notes).toBe("Termin <2 tyg.>");
    expect(p.modules[0].name).toBe('Szafka "A"');
    expect(p.modules[0].id).toBe("mod-17000.5ab");
    expect(p.modules[0].elements[0].id).toBe("front-L-1700.12");
  });

  it("szablon z biblioteki przechodzi przez to samo sito", () => {
    const copy = cloneModuleWithNewIds(baseModule({ dimensions: { width: evil, height: 720, depth: 513 }, elements: [fullZoneFront({ forceNL: evil })] }));
    expect(copy.dimensions.width).toBe(600);
    expect(copy.elements[0].forceNL).not.toMatch(/[<>"]/);
  });
});
