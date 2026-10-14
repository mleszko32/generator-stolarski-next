import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import { freshProject } from "../test/fixtures.js";
import {
  DEFAULT_SLOPE_NICHE, ceilingAt, nicheModuleSlots, nicheWidthDiff, sectionHeights,
  buildSlopeNicheModules, applySlopeNiche, getSlopeNicheSettings,
} from "./slopeNiche.js";
import { recalculateLayout } from "./layout.js";
import { buildZoneTree } from "./zoneTree.js";
import { calculateModuleParts } from "../engine/cabinet.js";

const niche = () => getSlopeNicheSettings({});

describe("slopeNiche", () => {
  beforeEach(() => { state.project = freshProject({ sidePanels: [] }); });

  it("sufit: liniowo do końca skosu, dalej płasko", () => {
    const n = niche();
    expect(ceilingAt(n, 0)).toBe(1100);
    expect(ceilingAt(n, 1250)).toBe(1780);
    expect(ceilingAt(n, 2500)).toBe(2460);
    expect(ceilingAt(n, 3300)).toBe(2460);
  });

  it("wysokości szafek A-E = sufit nad lewą krawędzią minus 50", () => {
    const slots = nicheModuleSlots(niche());
    expect(slots.map((s) => s.x)).toEqual([0, 600, 1200, 1800, 2500]);
    expect(slots.map((s) => s.height)).toEqual([1050, 1376, 1702, 2029, 2410]);
    expect(nicheWidthDiff(niche())).toBe(0);
  });

  it("zaokrąglenie w dół i zmiana pomiaru", () => {
    const n = { ...niche(), roundTo: 10, leftHeight: 1120 };
    expect(nicheModuleSlots(n)[0].height).toBe(1070);
    expect(nicheModuleSlots(n)[1].height % 10).toBe(0);
  });

  it("sekcje: stałe h, upTo od podłogi, reszta dla ostatniej; skalowanie gdy się nie mieści", () => {
    const h = sectionHeights([{ h: 680 }, { upTo: 2000 }, {}], 2192, 18, 100);
    expect(h[0]).toBe(680);
    expect(100 + 18 + h[0] + 18 + h[1] + 18).toBe(2000);
    expect(h.reduce((a, b) => a + b, 0) + 36).toBe(2192);
    const tight = sectionHeights([{ h: 1020 }, {}], 900, 18, 100);
    expect(tight[1]).toBeGreaterThanOrEqual(80);
    expect(tight[0] + tight[1] + 18).toBeCloseTo(900);
  });

  it("buduje szafki z wnętrzem odtwarzalnym przez drzewo wnęk", () => {
    const mods = buildSlopeNicheModules(niche(), state.project);
    expect(mods.map((m) => m.type)).toEqual(["base_cabinet", "tall_cabinet", "tall_cabinet", "tall_cabinet", "tall_cabinet"]);
    // Wysokość całkowita: nóżki + korpus (+ blat siedziska w A).
    const legs = mods[1].legs.height;
    expect(legs + mods[1].dimensions.height).toBe(1376);
    expect(legs + mods[0].dimensions.height + 38).toBe(1050);
    const drawers = (m) => m.elements.filter((e) => e.subtype === "szuflada").length;
    expect(mods.map(drawers)).toEqual([3, 3, 2, 2, 2]);
    expect(mods[3].elements.filter((e) => e.subtype === "drzwi-lp").length).toBe(2);
    expect(mods[3].elements.filter((e) => e.typ === "poziom" && !e.isStructural).length).toBe(4);
    expect(mods[4].elements.filter((e) => e.subtype === "drzwi-lp").length).toBe(4);
    expect(mods[4].wardrobeRod.y + legs).toBe(1900);
    // Półka nad szafą na 2000 od podłogi.
    const shelves = mods[4].elements.filter((e) => e.typ === "poziom").map((e) => e.y + 18 + legs);
    expect(shelves).toContain(2000);
    mods.forEach((m) => {
      expect(() => buildZoneTree(m)).not.toThrow();
      recalculateLayout(m);
      m.elements.filter((e) => e.typ === "front").forEach((f) => expect(f.h).toBeGreaterThan(50));
      expect(calculateModuleParts(m).parts.length).toBeGreaterThan(3);
    });
  });

  it("przeliczenie zastępuje poprzednią zabudowę, zostawia inne szafki", () => {
    state.project.modules.push({ id: "inna", type: "base_cabinet", dimensions: { width: 600, height: 720, depth: 500 }, position: { x: 0, y: 0, z: 2000 }, elements: [] });
    const n = niche();
    applySlopeNiche(state.project, n, buildSlopeNicheModules(n, state.project));
    expect(state.project.modules.length).toBe(6);
    expect(state.project.room.width).toBe(3500);
    expect(state.project.worktop.enabled).toBe(true);
    const removed = applySlopeNiche(state.project, n, buildSlopeNicheModules({ ...n, modules: n.modules.slice(0, 2) }, state.project));
    expect(removed).toBe(5);
    expect(state.project.modules.length).toBe(3);
    expect(DEFAULT_SLOPE_NICHE.modules.length).toBe(5);
  });
});
