import { describe, it, expect } from "vitest";
import { baseAndPin, rcRearScrew, rcRearOverride, rcPanelSetups, getRcSettings } from "./rcSystem.js";
import { jointSetPositions } from "../engine/carcaseParts.js";
import { getCabinetPanels } from "../engine/cabinetDrillings.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

describe("stół RC System - otwór bazowy + pin", () => {
  it("odległość od krawędzi z otworu bazowego i pinu (najpierw pin neutralny)", () => {
    expect(baseAndPin(9)).toMatchObject({ base: 9, pin: 0 });
    expect(baseAndPin(37)).toMatchObject({ base: 37, pin: 0 });
    expect(baseAndPin(38.5)).toMatchObject({ base: 37, pin: 1.5 });
    expect(baseAndPin(10)).toMatchObject({ base: 9.5, pin: 0.5 });
    expect(baseAndPin(69)).toBeNull();
  });
});

describe("stół RC System - tylny otwór łączników", () => {
  // Obie wiertarki mają własny zderzak (pomiar w warsztacie): otwór zawsze 37 mm od krawędzi
  // opartej o zderzak, niezależnie od pinu w szynie i głębokości formatki.
  it("tylna wiertarka zderzakiem: zawsze 37 mm od tyłu, dla każdej głębokości", () => {
    [320, 400, 510, 513, 600].forEach((D) => expect(rcRearScrew(D)).toEqual({ x: D - 37, exact: true }));
  });

  it("nadpisanie tylko gdy stół włączony; stare ustawienia pin/kalibracja są ignorowane", () => {
    expect(rcRearOverride(510, { rcSystem: { enabled: false } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true } })).toBe(473);
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "pin", calibDepth: 510, calibRear: 45 } })).toBe(473);
    expect(getRcSettings({})).toEqual({ enabled: false });
  });

  it("zestawy łączników z tylnym otworem ze stołu; środkowe dalej w rastrze 32 od przodu", () => {
    const sets = jointSetPositions(510, 250, 465);
    expect(sets[0]).toEqual({ screw: 37, dowel: 69 });
    expect(sets[sets.length - 1]).toEqual({ screw: 465, dowel: 433 });
    sets.slice(1, -1).forEach((s) => expect((s.screw - 37) % 32).toBe(0));
  });
});

describe("stół RC System - karta wiercenia boku", () => {
  it("łączniki wieńca: dół do pinów, otwór 9, pary co 32 mm jednym wierceniem", () => {
    const mod = baseModule({ elements: [{ id: "p1", typ: "poziom", x: 18, w: 564, y: 300, h: 18, isStructural: false }] });
    const project = freshProject({ modules: [mod] });
    setProject(project);
    const side = getCabinetPanels(mod, project).find((p) => p.id === "bok-lewy");
    const setups = rcPanelSetups(side);
    const bottom = setups.find((s) => s.ref === "dol");
    expect(bottom).toMatchObject({ dist: 9, base: { base: 9, pin: 0 }, alongFrom: "przód" });
    expect(bottom.shots).toEqual([[37, 69], [261, 293], [441, 473]]);
    // podpórki półki ruchomej: przód do pinów, otwór 37, pozycje od dołu
    const front = setups.find((s) => s.ref === "przod" && s.kinds.includes("podporka"));
    expect(front).toMatchObject({ dist: 37, base: { base: 37, pin: 0 }, alongFrom: "dół" });
  });
});
