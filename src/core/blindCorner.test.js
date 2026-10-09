import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import { recalculateLayout } from "./layout.js";
import { blindGeometry, getBlindPanel, checkBlindCorner, getBlindCorner } from "./blindCorner.js";
import { checkCornerFitting, fittingsOfKind, CORNER_FITTINGS } from "./cornerFittings.js";
import { calculateModuleParts } from "../engine/cabinet.js";
import { calculateProjectHardware } from "../engine/hardware.js";
import { validateProject } from "./validate.js";
import { computeWallLayouts } from "./walls.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

function blindModule(blind, overrides = {}) {
  return baseModule({
    id: "blind",
    name: "Ślepa",
    dimensions: { width: 1000, height: 720, depth: 560 },
    blindCorner: { active: true, side: "left", frontWidth: 450, fitting: "", ...blind },
    elements: [{
      id: "front-1", typ: "front", subtype: "drzwi", frontIndex: 0, openingSide: "right",
      baseZone: { boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top", offsetBottom: 0, offsetTop: 0 },
    }],
    ...overrides,
  });
}

describe("szafka ślepa - geometria", () => {
  beforeEach(() => setProject(freshProject({ room: { width: 4000, depth: 3000, height: 2600 }, modules: [] })));

  it("nieaktywna albo szafka narożna/skos to nie szafka ślepa", () => {
    expect(getBlindCorner(baseModule())).toBeNull();
    expect(getBlindCorner(baseModule({ blindCorner: { active: false } }))).toBeNull();
    expect(getBlindCorner(baseModule({ type: "corner_cabinet", blindCorner: { active: true } }))).toBeNull();
  });

  it("ślepa z lewej: drzwi przy prawej krawędzi, zaślepka od lewej do drzwi minus szczelina", () => {
    const mod = blindModule({ side: "left" });
    const g = blindGeometry(mod, state.project);
    // Nakładany: zewnętrzna krawędź frontu = 1000 - 1,5.
    expect(g.doorX1).toBe(998.5);
    expect(g.doorX0).toBe(548.5);
    expect(g.panelX0).toBe(1.5);
    expect(g.panelX1).toBe(545.5);
    expect(g.blindReach).toBe(548.5);
  });

  it("layout przycina drzwi do szerokości frontu", () => {
    const mod = blindModule({ side: "right" });
    state.project.modules = [mod];
    recalculateLayout(mod);
    const door = mod.elements[0];
    expect(door.x).toBe(1.5);
    expect(door.w).toBe(450);
    const panel = getBlindPanel(mod, state.project);
    expect(panel.x).toBe(454.5);
    expect(panel.w).toBe(544);
    expect(panel.y).toBe(door.y);
    expect(panel.h).toBe(door.h);
  });

  it("zaślepka jest formatką frontową, a w rzucie ściany frontem 'zaslepka'", () => {
    const mod = blindModule({ side: "left" });
    state.project.modules = [mod];
    recalculateLayout(mod);
    const { parts } = calculateModuleParts(mod);
    const z = parts.find((p) => p.name === "Zaślepka szafki ślepej");
    expect(z).toMatchObject({ category: "Front", width: 544 });
    const drzwi = parts.find((p) => p.name.startsWith("Drzwi"));
    expect(drzwi.width).toBe(450);
    const item = computeWallLayouts().walls.find((w) => w.id === "tyl").items[0];
    expect(item.fronts.some((f) => f.subtype === "zaslepka")).toBe(true);
  });

  it("okucie trafia na listę okuć w wersji strony ślepej", () => {
    state.project.modules = [blindModule({ side: "right", fitting: "lemans" })];
    const hw = calculateProjectHardware();
    expect(hw.find((h) => h.name.startsWith("Okucie narożne Kesseböhmer LeMans II"))).toMatchObject({ qty: 1 });
    expect(hw.some((h) => h.name.endsWith("strona ślepa prawa"))).toBe(true);
  });

  it("kontrola: pasujące okucie bez uwag, za wąski front i szuflady z ostrzeżeniem", () => {
    const ok = blindModule({ fitting: "lemans" });
    recalculateLayout(ok);
    expect(checkBlindCorner(ok, state.project)).toEqual([]);
    const narrow = blindModule({ fitting: "magicCorner", frontWidth: 350 });
    recalculateLayout(narrow);
    expect(checkBlindCorner(narrow, state.project).join(" ")).toMatch(/co najmniej 450/);
    state.project.modules = [blindModule({ fitting: "lemans", frontWidth: 300 })];
    const { issues } = validateProject();
    expect(issues.some((i) => i.level === "warn" && /LeMans II: front 300/.test(i.message))).toBe(true);
  });
});

describe("katalog okuć narożnych", () => {
  it("każde okucie ma rodzaj, szerokości i nazwę na liście okuć", () => {
    Object.values(CORNER_FITTINGS).forEach((f) => {
      expect(["blind", "corner"]).toContain(f.kind);
      expect(f.widths.length).toBeGreaterThan(0);
      expect(f.hwName).toBeTruthy();
    });
    expect(fittingsOfKind("corner").map((f) => f.id)).toContain("karuzela34");
  });

  it("checkCornerFitting: szerokość korpusu, głębokość i wysokość wnętrza", () => {
    expect(checkCornerFitting("magicCorner", { width: 1000, frontWidth: 450, innerDepth: 540, innerHeight: 684 })).toEqual([]);
    const msgs = checkCornerFitting("magicCorner", { width: 1200, frontWidth: 450, innerDepth: 480, innerHeight: 500 });
    expect(msgs).toHaveLength(3);
    expect(checkCornerFitting("karuzela34", { width: [900, 1100], innerHeight: 684 })).toHaveLength(1);
    expect(checkCornerFitting("nieznane", { width: 1 })).toEqual([]);
  });
});
