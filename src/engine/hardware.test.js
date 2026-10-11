import { describe, it, expect } from "vitest";
import { calculateParts } from "./cabinet.js";
import { calculateProjectHardware } from "./hardware.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

// Lista okuć musi dobierać te same prowadnice (NL i wariant H) co formatki skrzynki -
// wcześniej hardware.js liczył szuflady po swojemu (patrz core/drawerSpec.js).
const zone = { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 };
const drawer = (extra = {}) => ({
  id: "f0", typ: "front", subtype: "szuflada", frontIndex: 0, gap: 3, distribution: "1", baseZone: { ...zone }, ...extra,
});

const drawerKits = () => calculateProjectHardware().filter((h) => h.name.startsWith("Komplet szuflady"));
const dnoNL = (parts) => Number(/NL(\d+)/.exec(parts.find((p) => p.name.startsWith("Dno szuflady")).name)[1]);

describe("calculateProjectHardware — komplety szuflad zgodne z formatkami", () => {
  it("szuflada wewnętrzna: prowadnica L-450 jak dno (wcześniej L-500)", () => {
    setProject(freshProject({ modules: [baseModule({ elements: [drawer({ subtype: "szuflada-wewnetrzna" })] })] }));
    const { parts } = calculateParts();
    expect(dnoNL(parts)).toBe(450);
    expect(drawerKits()).toEqual([expect.objectContaining({ name: expect.stringContaining("L-450"), qty: 1 })]);
  });

  it("front wpuszczany: ta sama długość prowadnicy co dno szuflady", () => {
    setProject(freshProject({ modules: [baseModule({ front: { type: "wpuszczane" }, elements: [drawer()] })] }));
    const { parts } = calculateParts();
    expect(drawerKits()[0].name).toContain(`L-${dnoNL(parts)}`);
  });

  it("ręczne NL: komplet z wpisaną długością", () => {
    setProject(freshProject({ modules: [baseModule({ elements: [drawer({ forceNL: 350 })] })] }));
    expect(drawerKits()[0].name).toContain("L-350");
  });

  it("wariant wysokości (H) taki sam jak w formatce tyłu szuflady", () => {
    setProject(freshProject({ modules: [baseModule({ elements: [drawer()] })] }));
    const { parts } = calculateParts();
    const variant = /\((\w+)\)/.exec(parts.find((p) => p.name.startsWith("Tył szuflady")).name)[1];
    expect(drawerKits()[0].name).toContain(`H:${variant} `);
  });
});
