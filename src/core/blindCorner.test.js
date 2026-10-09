import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import { recalculateLayout } from "./layout.js";
import { blindGeometry, getBlindPanel, checkBlindCorner, getBlindCorner, getBlindStile, blindHingeSide } from "./blindCorner.js";
import { getCabinetPanels } from "../engine/cabinetDrillings.js";
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

describe("szafka ślepa - mocowanie drzwi i zawiasy", () => {
  beforeEach(() => setProject(freshProject({ room: { width: 4000, depth: 3000, height: 2600 }, modules: [] })));
  const setup = (blind) => {
    const mod = blindModule(blind);
    state.project.modules = [mod];
    recalculateLayout(mod);
    return mod;
  };
  const hwNamed = (re) => calculateProjectHardware().find((h) => re.test(h.name));

  it("domyślnie listwa 100 mm między wieńcami, drzwi nakładają się na nią jak na bok", () => {
    const mod = setup({ side: "left" });
    const g = blindGeometry(mod, state.project);
    expect(g.mount).toBe("listwa");
    // drzwi od 548,5; nakładanie 18 - 1,5 = 16,5 -> krawędź listwy przy otworze 565
    expect([g.stileX0, g.stileX1]).toEqual([465, 565]);
    expect(g.clearOpening).toBe(1000 - 18 - 565);
    expect(getBlindStile(mod, state.project)).toEqual({ x: 465, w: 100, y: 18, h: 684, thickness: 18 });
    // zaślepka nakłada się na listwę (kończy się przed krawędzią listwy przy otworze)
    expect(g.panelX1).toBeGreaterThan(g.stileX0);
    expect(g.panelX1).toBeLessThan(g.stileX1);
    const { parts } = calculateModuleParts(mod);
    expect(parts.find((p) => p.name === "Listwa szafki ślepej")).toMatchObject({ length: 684, width: 100, category: "Korpus" });
  });

  it("listwa: zawiasy od strony narożnika (layout to wymusza), zawias równoległy nakładany Blum", () => {
    const mod = setup({ side: "left" });
    expect(blindHingeSide(mod)).toBe("left");
    expect(mod.elements[0].openingSide).toBe("left"); // w fixture było "right"
    expect(hwNamed(/79B9950/)).toMatchObject({ qty: 2 });
    expect(hwNamed(/Zawias meblowy/)).toBeUndefined();
  });

  it("listwa: prowadniki na listwie (21,5 mm od krawędzi przy drzwiach), nie na boku; łączniki listwy w wieńcach", () => {
    const mod = setup({ side: "left" });
    const panels = getCabinetPanels(mod, state.project);
    const stile = panels.find((p) => p.id === "listwa-slepa");
    const hinge = stile.holes.filter((h) => h.kind === "zawias");
    expect(hinge).toHaveLength(4);
    expect(new Set(hinge.map((h) => h.x))).toEqual(new Set([100 - 21.5]));
    expect(stile.holes.filter((h) => h.edge === "dolne")).toHaveLength(3);
    ["bok-lewy", "bok-prawy"].forEach((id) => expect(panels.find((p) => p.id === id).holes.some((h) => h.kind === "zawias")).toBe(false));
    expect(panels.find((p) => p.id === "wieniec-dolny").holes.filter((h) => h.to === "listwa szafki ślepej")).toHaveLength(3);
    expect(panels.find((p) => p.id === "wieniec-gorny").holes.filter((h) => h.to === "listwa szafki ślepej")).toHaveLength(3);
  });

  it("mocowanie na boku: zawiasy z dala od narożnika, zwykły zawias, prowadniki na boku, bez listwy", () => {
    const mod = setup({ side: "left", mount: "bok" });
    expect(mod.elements[0].openingSide).toBe("right");
    expect(getBlindStile(mod, state.project)).toBeNull();
    expect(hwNamed(/Zawias meblowy/)).toMatchObject({ qty: 2 });
    const panels = getCabinetPanels(mod, state.project);
    expect(panels.find((p) => p.id === "bok-prawy").holes.filter((h) => h.kind === "zawias")).toHaveLength(4);
    expect(panels.some((p) => p.id === "listwa-slepa")).toBe(false);
  });

  it("mocowanie na zaślepce: zawias równoległy wpuszczany, bez listwy i bez otworów na bokach", () => {
    const mod = setup({ side: "right", mount: "zaslepka" });
    expect(mod.elements[0].openingSide).toBe("right");
    expect(hwNamed(/79B9550/)).toMatchObject({ qty: 2 });
    const panels = getCabinetPanels(mod, state.project);
    expect(panels.some((p) => p.holes.some((h) => h.kind === "zawias"))).toBe(false);
  });

  it("okucie wymaga mocowania: Magic Corner - na boku, LeMans - od strony narożnika", () => {
    const magic = setup({ fitting: "magicCorner", frontWidth: 450 });
    expect(checkBlindCorner(magic, state.project).join(" ")).toMatch(/na boku korpusu z dala od narożnika/);
    const magicOk = setup({ fitting: "magicCorner", frontWidth: 450, mount: "bok" });
    expect(checkBlindCorner(magicOk, state.project).join(" ")).not.toMatch(/mocowanie/);
    const lemans = setup({ fitting: "lemans", mount: "bok" });
    expect(checkBlindCorner(lemans, state.project).join(" ")).toMatch(/od strony ślepej/);
  });

  it("otwór w świetle za mały dla okucia - ostrzeżenie", () => {
    const mod = setup({ fitting: "lemans", frontWidth: 450, stileWidth: 100 });
    expect(checkBlindCorner(mod, state.project)).toEqual([]);
    expect(checkCornerFitting("lemans", { width: 1000, frontWidth: 450, clearOpening: 400 }).join(" ")).toMatch(/otwór drzwi w świetle 400 mm - okucie wymaga co najmniej 411/);
  });

  it("drzwi dwuskrzydłowe: ostrzeżenie; skrzydło przycięte do zera bez formatki i bez zawiasów", () => {
    const mod = blindModule({ side: "left", frontWidth: 300 }, {
      elements: [
        { id: "f-L-1", typ: "front", subtype: "drzwi-lp", frontIndex: 0, baseZone: { boundLeft: "cab-left", boundBottom: "cab-bottom", boundTop: "cab-top", maxX: 500, offsetBottom: 0, offsetTop: 0 } },
        { id: "f-P-1", typ: "front", subtype: "drzwi-lp", frontIndex: 0, baseZone: { minX: 500, boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top", offsetBottom: 0, offsetTop: 0 } },
      ],
    });
    state.project.modules = [mod];
    recalculateLayout(mod);
    expect(mod.elements.find((e) => e.id === "f-L-1").w).toBe(0);
    expect(checkBlindCorner(mod, state.project).join(" ")).toMatch(/dwuskrzydłowe/);
    const { parts } = calculateModuleParts(mod);
    expect(parts.filter((p) => p.name.startsWith("Drzwi"))).toHaveLength(1);
    const hinges = calculateProjectHardware().filter((h) => /Zawias/.test(h.name)).reduce((n, h) => n + h.qty, 0);
    expect(hinges).toBe(2);
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
