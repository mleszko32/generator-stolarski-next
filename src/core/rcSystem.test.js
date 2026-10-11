import { describe, it, expect } from "vitest";
import { baseAndPin, rcRearScrew, rcRearOverride, rcPanelSetups, getRcSettings, rcMidGrid, rcMidPinForX, rcPinSideText, rcRailLength, rcFrontPinFor } from "./rcSystem.js";
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

  // Model listwy (warsztat): pin n opiera wiertarkę 16·n mm od zera, pin Ø5, od pinu do wiertła 37.
  // Pomiary: przednia pin 3, formatka 510, tylna pin 7 (od tyłu) -> 470; środek pin 16 od przodu -> 245/277.
  const s = { rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 };

  it("odległość między zerami listew z pomiaru: 667 mm (środkowa dziura w połowie)", () => {
    expect(rcRailLength(s)).toBe(667);
  });

  it("tył: pomiar 510 -> pin 7 po stronie tylnej, 470 od przodu; inne głębokości na siatce co 16", () => {
    expect(rcRearScrew(510, s)).toEqual({ x: 470, exact: true, pin: 7, from: "tył", frontPin: 3 });
    expect(rcRearScrew(521, s)).toMatchObject({ x: 486, pin: 6, from: "tył" });
    expect(rcRearScrew(560, s)).toMatchObject({ x: 518, pin: 4, from: "tył" });
    expect(rcRearScrew(320, s)).toMatchObject({ x: 278, pin: 19, from: "tył" });
    for (let D = 300; D <= 650; D++) {
      const r = rcRearScrew(D, s);
      expect(D - r.x).toBeGreaterThanOrEqual(29);
      expect(D - r.x).toBeLessThanOrEqual(45);
    }
  });

  it("przednia na innym pinie: formatka przesuwa się z nią, tylny pin w drugą stronę (2 -> 8)", () => {
    const r = rcRearScrew(510, { ...s, frontPin: 2 });
    expect(r).toMatchObject({ x: 470, pin: 8, frontPin: 2 });
  });

  it("głęboka formatka: niższy pin przedni, do zera bez pinu; > 650 mm - za głęboka", () => {
    expect(rcRearScrew(620, s)).toMatchObject({ frontPin: 2, pin: 1 });
    expect(rcRearScrew(650, s)).toMatchObject({ frontPin: 1, pin: 0, from: "tył", x: 614 });
    expect(rcRearScrew(660, s)).toMatchObject({ frontPin: null, tooDeep: true, x: 623 });
  });

  it("płytka formatka: tylny pin po stronie przedniej wiertarki", () => {
    expect(rcRearScrew(250, s)).toMatchObject({ x: 214, pin: 19, from: "przód" });
  });

  it("bez pełnej kalibracji - położenie robocze; nadpisanie tylko gdy stół włączony", () => {
    expect(rcRearScrew(510, { rearMode: "pin", calibDepth: 510, calibRear: 40 })).toMatchObject({ exact: false });
    expect(getRcSettings({})).toMatchObject({ enabled: false, rearMode: "pin", calibDepth: 510, calibRear: 40, calibPin: 7, calibFrontPin: 3, frontPin: 3 });
    expect(getRcSettings({ rcSystem: { calibDepth: null, calibRear: "" } })).toMatchObject({ calibDepth: 510, calibRear: 40 });
    expect(rcRearOverride(510, { rcSystem: { enabled: false } })).toBeNull();
    expect(rcRearOverride(510, { rcSystem: { enabled: true } })).toBe(470);
    expect(rcRearOverride(510, { rcSystem: { enabled: true, rearMode: "stop" } })).toBe(473);
    expect(rcFrontPinFor(510, s)).toBe(3);
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
  // Środkowe łączniki wierci tylna wiertarka przesunięta do przodu, przednią stroną do pinu.
  // Pomiar: formatka 510, przednia pin 3, środek pin 16 (od przodu) -> 245/277 - model daje to samo.
  const grid = { origin: 21, step: 16 };
  const settings = getRcSettings({ rcSystem: { enabled: true } });

  it("siatka tylko przy włączonym i skalibrowanym stole; zależy od pinu przedniego", () => {
    expect(rcMidGrid({ rcSystem: { enabled: false } }, 510)).toBeNull();
    expect(rcMidGrid({ rcSystem: { enabled: true } }, 510)).toEqual(grid);
    expect(rcMidGrid({ rcSystem: { enabled: true } }, 640)).toEqual({ origin: 53, step: 16 }); // przednia na pinie 1
  });

  it("bok 510: środkowy zestaw 245/277 na pinie 16 od przodu - jak pomiar", () => {
    const sets = jointSetPositions(510, 250, 470, grid);
    expect(sets).toEqual([{ screw: 37, dowel: 69 }, { screw: 277, dowel: 245 }, { screw: 470, dowel: 438 }]);
    expect(rcMidPinForX(277, settings, 510)).toEqual({ pin: 16, from: "przód" });
    expect(rcMidPinForX(293, settings, 510)).toEqual({ pin: 17, from: "przód" });
    expect(rcMidPinForX(272, settings, 510)).toBeNull();
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

describe("stół RC System - strona szyny przy numerze pinu", () => {
  it("piny przedniej wiertarki i środka po jej stronie, tylne po przeciwnej (domyślnie przednia po lewej)", () => {
    const s = getRcSettings({});
    expect(s.frontSide).toBe("lewa");
    expect(rcPinSideText(16, "przód", s)).toBe("pin 16 po lewej (strona przedniej wiertarki)");
    expect(rcPinSideText(7, "tył", s)).toBe("pin 7 po prawej (strona tylnej wiertarki)");
    expect(rcPinSideText(7, "tył", { frontSide: "prawa" })).toBe("pin 7 po lewej (strona tylnej wiertarki)");
    expect(rcPinSideText(0, "tył", s)).toBe("od zera prawej listwy, bez pinu (strona tylnej wiertarki)");
  });
});
