// Formatki i wiercenia korpusu prostokątnej szafki (engine/carcaseParts.js). Wartości
// oczekiwane policzone ręcznie dla szafki 600×720×513, płyta 18, plecy 3.
import { describe, it, expect } from "vitest";
import { getCorpusParts, getBackPanelParts, getCorpusHoles, getPionMountHoles } from "./carcaseParts.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const config = (construction = {}) => {
  const p = freshProject();
  p.construction = { ...p.construction, ...construction };
  return p;
};
const byName = (parts, name) => parts.filter((p) => p.name === name);

describe("getCorpusParts", () => {
  it("boki przelotowe, pełny wieniec: boki na całą wysokość, wieńce między bokami", () => {
    const parts = getCorpusParts(baseModule(), config());
    expect(byName(parts, "Bok (L/P)")).toEqual([{ name: "Bok (L/P)", length: 720, width: 510, qty: 2, category: "Korpus" }]);
    // wieniec dolny + górny: 600 - 2×18 = 564, głębokość 513 - 3 (plecy nakładane)
    expect(byName(parts, "W600")).toEqual([
      { name: "W600", length: 564, width: 510, qty: 1, category: "Korpus" },
      { name: "W600", length: 564, width: 510, qty: 1, category: "Korpus" },
    ]);
  });

  it("wieńce przelotowe: wieńce na całą szerokość, boki krótsze o dwie płyty", () => {
    const parts = getCorpusParts(baseModule(), config({ joinType: "wience_przelotowe" }));
    expect(byName(parts, "Bok (L/P)")[0].length).toBe(684);
    expect(byName(parts, "W600").map((p) => p.length)).toEqual([600, 600]);
  });

  it("plecy we wpust: bok na pełną głębokość, wieniec krótszy o odsunięcie wpustu i plecy", () => {
    const mod = baseModule({ backPanel: { type: "nut", offset: 20, grooveDepth: 7, nutBuild: "all", clearance: 2 } });
    const parts = getCorpusParts(mod, config());
    expect(byName(parts, "Bok (L/P)")[0].width).toBe(513);
    expect(byName(parts, "W600")[0].width).toBe(490); // 513 - 20 - 3
  });

  it("trawersy poziome: jeden wieniec dolny + dwa trawersy szerokości traverseWidth", () => {
    const parts = getCorpusParts(baseModule(), config({ topType: "trawersy_poziom", traverseWidth: 100 }));
    expect(byName(parts, "W600")).toHaveLength(1);
    expect(byName(parts, "Trawers górny (poziomy)")).toEqual([
      { name: "Trawers górny (poziomy)", length: 564, width: 100, qty: 1, category: "Korpus" },
      { name: "Trawers górny (poziomy)", length: 564, width: 100, qty: 1, category: "Korpus" },
    ]);
  });

  it("trawersy pionowe z wyłączonym tylnym i własną szerokością przedniego", () => {
    const cons = { topType: "trawersy_pion", traverseWidth: 100, traverses: { front: { width: 80 }, rear: { active: false } } };
    const parts = getCorpusParts(baseModule(), config(cons));
    expect(byName(parts, "Trawers górny (pionowy)")).toEqual([
      { name: "Trawers górny (pionowy)", length: 564, width: 80, qty: 1, category: "Korpus" },
    ]);
  });

  it("półki konstrukcyjne dochodzą jako wieńce W600 (ruchome nie)", () => {
    const mod = baseModule({ elements: [
      { id: "a", typ: "poziom", isStructural: true },
      { id: "b", typ: "poziom", isStructural: true },
      { id: "c", typ: "poziom", isStructural: false },
    ] });
    const shelves = byName(getCorpusParts(mod, config()), "W600").filter((p) => p.qty === 2);
    expect(shelves).toEqual([{ name: "W600", length: 564, width: 510, qty: 2, category: "Korpus" }]);
  });
});

describe("getBackPanelParts", () => {
  it("plecy nakładane: wymiar korpusu minus 4 mm", () => {
    expect(getBackPanelParts(baseModule({ backPanel: { type: "nakladane" } }), config())).toEqual([
      { name: "Plecy 720x600", length: 716, width: 596, qty: 1, category: "Plecy" },
    ]);
  });

  it("plecy we wpust ze wszystkich stron: światło + 2× głębokość wpustu - luz", () => {
    const mod = baseModule({ backPanel: { type: "nut", grooveDepth: 7, clearance: 2, nutBuild: "all" } });
    const [nut] = getBackPanelParts(mod, config());
    expect(nut.width).toBe(574); // 600 - 36 + 14 - 4
    expect(nut.length).toBe(694); // 720 - 36 + 14 - 4
  });

  it("wpust tylko w bokach: wysokość jak plecy nakładane", () => {
    const mod = baseModule({ backPanel: { type: "nut", grooveDepth: 7, clearance: 2, nutBuild: "sides" } });
    const [p] = getBackPanelParts(mod, config());
    expect(p.width).toBe(574);
    expect(p.length).toBe(716);
  });
});

describe("getCorpusHoles", () => {
  const holesOf = (mod, cfg) => getCorpusHoles(mod, cfg)[0].holes;

  it("boki przelotowe, pełny wieniec: wkręt + kołek 32 mm dalej, z przodu i z tyłu, dół i góra", () => {
    const holes = holesOf(baseModule(), config());
    expect(holes).toHaveLength(8);
    // dół: w osi płyty (18/2)
    expect(holes.filter((h) => h.y === 9)).toEqual([
      { y: 9, xFromFront: 37, holeType: "screw" },
      { y: 9, xFromFront: 69, holeType: "dowel" },
      { y: 9, xFromFront: 476, holeType: "screw" },
      { y: 9, xFromFront: 444, holeType: "dowel" },
    ]);
    expect(holes.filter((h) => h.y === 711)).toHaveLength(4);
  });

  it("trawersy pionowe: otwory na górze boku w osi trawersu, pionowo", () => {
    const holes = holesOf(baseModule(), config({ topType: "trawersy_pion" }));
    const top = holes.filter((h) => h.y > 600);
    expect(top).toEqual([
      { y: 683, xFromFront: 9, holeType: "screw" },
      { y: 651, xFromFront: 9, holeType: "dowel" },
      { y: 683, xFromFront: 504, holeType: "screw" },
      { y: 651, xFromFront: 504, holeType: "dowel" },
    ]);
  });

  it("wieńce przelotowe: łączenia na krawędziach boku (y = 0 i y = wysokość)", () => {
    const ys = [...new Set(holesOf(baseModule(), config({ joinType: "wience_przelotowe" })).map((h) => h.y))];
    expect(ys).toEqual([0, 720]);
  });
});

describe("getPionMountHoles", () => {
  const pion = (over = {}) => ({ id: "p", typ: "pion", isStructural: true, x: 291, w: 18, y: 18, h: 684, ...over });

  it("bez przegród konstrukcyjnych - brak nawiertów", () => {
    const mod = baseModule({ elements: [pion({ isStructural: false })] });
    expect(getPionMountHoles(mod, config())).toEqual([]);
  });

  it("przegroda na całą wysokość: nawierty w wieńcu dolnym i górnym, X względem krawędzi wieńca", () => {
    const panels = getPionMountHoles(baseModule({ elements: [pion()] }), config());
    expect(panels.map((p) => p.panelKey)).toEqual(["wieniec-dolny", "wieniec-gorny"]);
    const [bottom] = panels;
    expect(bottom.panelWidth).toBe(564);
    expect(bottom.panelDepth).toBe(510);
    // środek przegrody 300 od lewego boku, wieniec zaczyna się za bokiem (18) -> 282
    expect(bottom.holes).toEqual([
      { x: 282, zFromFront: 473, holeType: "screw" },
      { x: 282, zFromFront: 441, holeType: "dowel" },
      { x: 282, zFromFront: 37, holeType: "screw" },
      { x: 282, zFromFront: 69, holeType: "dowel" },
    ]);
  });

  it("przegroda stojąca na półce: nawierty w tej półce, X względem krawędzi półki", () => {
    const shelf = { id: "s1", typ: "poziom", x: 18, w: 564, y: 300, h: 18 };
    const mod = baseModule({ elements: [shelf, pion({ y: 318, h: 384 })] });
    const panels = getPionMountHoles(mod, config());
    expect(panels.map((p) => p.panelKey)).toEqual(["polka-s1-gora", "wieniec-gorny"]);
    expect(panels[0].holes[0].x).toBe(282);
  });
});
