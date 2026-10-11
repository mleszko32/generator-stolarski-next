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

  it("pin bez kalibracji: położenie robocze 37 od tyłu + zakres najbliższego pinu 29…45", () => {
    expect(rcRearScrew(510, { rearMode: "pin" })).toEqual({ x: 473, exact: false, range: [29, 45] });
  });

  it("pin z kalibracją z warsztatu (521 -> 34 od tyłu): najbliższy otwór szyny co 16 mm", () => {
    const s = { rearMode: "pin", calibDepth: 521, calibRear: 34 };
    expect(rcRearScrew(521, s).x).toBe(487);                    // 34 od tyłu - pomiar
    expect(510 - rcRearScrew(510, s).x).toBe(39);
    expect(560 - rcRearScrew(560, s).x).toBe(41);
    expect(320 - rcRearScrew(320, s).x).toBe(41);
    expect(537 - rcRearScrew(537, s).x).toBe(34);               // +16 mm głębokości -> ta sama odległość od tyłu
    for (let D = 300; D <= 650; D++) {
      const r = D - rcRearScrew(D, s).x;
      expect(r).toBeGreaterThanOrEqual(29);
      expect(r).toBeLessThanOrEqual(45);
      expect(Math.abs((rcRearScrew(D, s).x - 487) % 16)).toBe(0); // zawsze na siatce szyny
    }
  });

  it("domyślna kalibracja = pomiar z warsztatu; puste pola jej nie kasują; nadpisanie tylko gdy stół włączony", () => {
    expect(getRcSettings({})).toMatchObject({ enabled: false, rearMode: "pin", calibDepth: 521, calibRear: 34 });
    expect(getRcSettings({ rcSystem: { calibDepth: null, calibRear: "" } })).toMatchObject({ calibDepth: 521, calibRear: 34 });
    expect(rcRearOverride(510, { rcSystem: { enabled: false } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true } })).toBe(471);
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "stop" } })).toBe(473);
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
