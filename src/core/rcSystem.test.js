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
  it("zderzak do tylnej krawędzi: 37 mm od tyłu", () => {
    expect(rcRearScrew(510, { rearMode: "stop" })).toEqual({ x: 473, exact: true });
  });

  it("pin bez kalibracji: położenie robocze 37 od tyłu + zakres 37…52", () => {
    expect(rcRearScrew(510, { rearMode: "pin" })).toEqual({ x: 473, exact: false, range: [37, 52] });
  });

  it("pin z kalibracją (bok 510 -> 45 od tyłu): siatka co 16 mm, zawsze co najmniej 37 od tyłu", () => {
    const s = { rearMode: "pin", calibDepth: 510, calibRear: 45 };
    expect(rcRearScrew(510, s).x).toBe(465);                    // 45 od tyłu
    expect(526 - rcRearScrew(526, s).x).toBe(45);               // +16 mm głębokości -> ta sama odległość od tyłu
    const r560 = 560 - rcRearScrew(560, s).x;
    expect(r560).toBeGreaterThanOrEqual(37);
    expect(r560).toBeLessThan(53);
    [320, 400, 513, 600].forEach((D) => {
      const r = D - rcRearScrew(D, s).x;
      expect(r).toBeGreaterThanOrEqual(37);
      expect(r).toBeLessThan(53);
    });
  });

  it("nadpisanie tylko gdy stół włączony i wynik pewny", () => {
    expect(rcRearOverride(510, { rcSystem: { enabled: false, rearMode: "stop" } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "pin" } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "pin", calibDepth: 510, calibRear: 45 } })).toBe(465);
    expect(getRcSettings({}).rearMode).toBe("pin");
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
