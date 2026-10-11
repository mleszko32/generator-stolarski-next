import { describe, it, expect } from "vitest";
import { baseAndPin, rcRearScrew, rcRearOverride, rcPanelSetups, getRcSettings, rcPinsFor, rcMidGrid, rcMidPinForX } from "./rcSystem.js";
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

  it("pin z kalibracją z warsztatu (510, pin 7 -> 470 od przodu = 40 od tyłu): najbliższy otwór szyny", () => {
    const s = { rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 };
    expect(rcRearScrew(510, s)).toEqual({ x: 470, exact: true, pin: 7, frontPin: 3 }); // pomiar
    expect(rcRearScrew(521, s)).toMatchObject({ x: 486, pin: 6 });          // 35 od tyłu, pin 6 jak w warsztacie
    expect(rcRearScrew(320, s)).toMatchObject({ x: 278, pin: 19 });
    expect(rcRearScrew(560, s)).toMatchObject({ x: 518, pin: 4 });
    for (let D = 300; D <= 650; D++) {
      const r = rcRearScrew(D, s);
      expect(D - r.x).toBeGreaterThanOrEqual(29);
      expect(D - r.x).toBeLessThanOrEqual(45);
      expect(Math.abs((r.x - 470) % 16)).toBe(0);                          // zawsze na siatce szyny
      if (r.pin !== null) expect(r.x).toBe(470 + ((7 - r.pin) - (3 - r.frontPin)) * 16);
    }
  });

  it("bez numeru pinu w kalibracji - samo położenie; pin spoza szyny -> null", () => {
    expect(rcRearScrew(510, { rearMode: "pin", calibDepth: 510, calibRear: 40 }).pin).toBeNull();
    expect(rcRearScrew(1200, { rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3 }).pin).toBeNull();
  });

  it("domyślna kalibracja = pomiar z warsztatu; puste pola jej nie kasują; nadpisanie tylko gdy stół włączony", () => {
    expect(getRcSettings({})).toMatchObject({ enabled: false, rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 });
    expect(getRcSettings({ rcSystem: { calibDepth: null, calibRear: "" } })).toMatchObject({ calibDepth: 510, calibRear: 40 });
    expect(rcRearOverride(510, { rcSystem: { enabled: false } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true } })).toBe(470);
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "stop" } })).toBe(473);
  });

  it("pin przedniej wiertarki nie zmienia położenia otworów; tylny przesuwa się razem z nim (warsztat: 3/7, 2/6)", () => {
    const base = { rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3 };
    [2, 3, 5].forEach((fp) => {
      const r = rcRearScrew(510, { ...base, frontPin: fp });
      expect(r.x).toBe(470);
      expect(r.pin - r.frontPin).toBe(4);
      expect(r.frontPin).toBe(fp);
    });
  });

  it("gdy tylny pin nie mieści się na szynie, dobiera najbliższy pin przedni; za głęboka formatka - bez pinów", () => {
    const s = { rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 };
    expect(rcRearScrew(250, s)).toMatchObject({ frontPin: 1, pin: 21 });
    expect(rcRearScrew(650, s)).toMatchObject({ frontPin: 6, pin: 1 });
    expect(rcRearScrew(200, s)).toMatchObject({ pin: null, frontPin: null });
    expect(rcPinsFor(0, { calibPin: 7 })).toEqual({ pin: null, frontPin: null }); // bez pinu przedniego w kalibracji
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

describe("stół RC System - środkowe zestawy łączników", () => {
  // Warsztat: środkowe łączniki wierci tylna wiertarka przesunięta do przodu, przednią stroną do
  // pinu; od pinu do wiertła zawsze 37 mm -> siatka środka przesunięta o 37 + 32 + 37 = 106 mm.
  const grid = { origin: 576, step: 16 };
  const settings = getRcSettings({ rcSystem: { enabled: true } });

  it("siatka tylko przy włączonym i skalibrowanym stole", () => {
    expect(rcMidGrid({ rcSystem: { enabled: false } })).toBeNull();
    expect(rcMidGrid({ rcSystem: { enabled: true } })).toEqual(grid);
  });

  it("bok 510: środkowy zestaw 240/272 (pin 470 + 37 = 507, środek = pin + 37 / + 69), pin 16 od przodu", () => {
    const sets = jointSetPositions(510, 250, 470, grid);
    expect(sets).toEqual([{ screw: 37, dowel: 69 }, { screw: 272, dowel: 240 }, { screw: 470, dowel: 438 }]);
    expect(rcMidPinForX(272, settings)).toEqual({ pin: 16, from: "przód" });
    expect(rcMidPinForX(262, settings)).toBeNull();
  });

  it("tylny wkręt na pinie może wypaść bliżej tyłu niż 37 mm (521 -> 486, 35 od tyłu)", () => {
    expect(jointSetPositions(521, 250, 486, grid).at(-1)).toEqual({ screw: 486, dowel: 454 });
  });

  it("zestawy na siatce nie nachodzą na przedni ani tylny zestaw", () => {
    for (let D = 300; D <= 900; D += 7) {
      const sets = jointSetPositions(D, 250, null, grid);
      for (let i = 1; i < sets.length; i++) {
        const lo = Math.min(sets[i].screw, sets[i].dowel), hiPrev = Math.max(sets[i - 1].screw, sets[i - 1].dowel);
        expect(lo).toBeGreaterThan(hiPrev);
      }
    }
  });
});
