import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import {
  wallToWorld, worldToWall, rowProfile, findBlocked, findFreeSegments, parseSplit,
  divideSegment, buildFillItems, findPlanConflicts, applyFillPlan, describeWidths,
} from "./wallFill.js";
import { computeWallLayouts } from "./walls.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

const room = { width: 4000, depth: 3000, height: 2600 };
const base = { type: "base_cabinet", height: 720, depth: 513, posY: 0, legsH: 100, y0: 0, y1: 820 };
const upper = { type: "upper_cabinet", height: 720, depth: 320, posY: 1450, legsH: 0, y0: 1450, y1: 2170 };

describe("współrzędne ściana <-> pokój", () => {
  it("wallToWorld i worldToWall są wzajemnie odwrotne na każdej ścianie", () => {
    ["tyl", "prawa", "przednia", "lewa"].forEach((w) => {
      const box = wallToWorld(w, room, 700, 600, 0, 513);
      const loc = worldToWall(w, room, box);
      expect([loc.u0, loc.u1, loc.d0, loc.d1]).toEqual([700, 1300, 0, 513]);
    });
  });

  it("szafka postawiona przez wallToWorld trafia na tę samą ścianę i u w rzutach", () => {
    setProject(freshProject({ room, modules: [] }));
    ["tyl", "prawa", "przednia", "lewa"].forEach((w) => {
      const box = wallToWorld(w, room, 700, 600, 0, 513);
      state.project.modules = [baseModule({ id: "m", rotation: box.rotation, position: { x: box.x0, y: 0, z: box.z0 } })];
      const it = computeWallLayouts().walls.find((x) => x.id === w).items[0];
      expect([it.u0, it.u1]).toEqual([700, 1300]);
    });
  });
});

describe("rowProfile", () => {
  it("domyślne wymiary rzędu z typu szafki", () => {
    setProject(freshProject({ room, modules: [] }));
    expect(rowProfile("base_cabinet")).toMatchObject({ height: 720, depth: 513, y0: 0, y1: 820 });
    expect(rowProfile("upper_cabinet")).toMatchObject({ depth: 320, y0: 1450, y1: 2170 });
  });

  it("wymiary ze wzoru, gdy jest podany", () => {
    const t = baseModule({ dimensions: { width: 400, height: 800, depth: 560 }, legs: { active: true, height: 150 } });
    expect(rowProfile("base_cabinet", t)).toMatchObject({ height: 800, depth: 560, y1: 950 });
  });
});

describe("wolne odcinki ściany", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], openings: [] })));

  it("pusta ściana to jeden odcinek na całą długość", () => {
    const r = findFreeSegments(state.project, "tyl", base);
    expect(r.segments).toEqual([{ u0: 0, u1: 4000 }]);
    expect(findFreeSegments(state.project, "lewa", base).segments).toEqual([{ u0: 0, u1: 3000 }]);
  });

  it("istniejąca szafka dzieli ścianę na dwa odcinki", () => {
    state.project.modules = [baseModule({ id: "a", name: "Zlew", position: { x: 1000, y: 0, z: 0 } })];
    const r = findFreeSegments(state.project, "tyl", base);
    expect(r.segments).toEqual([{ u0: 0, u1: 1000 }, { u0: 1600, u1: 4000 }]);
    expect(r.blocked[0]).toMatchObject({ label: "Zlew", kind: "module" });
  });

  it("szafka dolna nie blokuje rzędu wiszących i odwrotnie", () => {
    state.project.modules = [baseModule({ id: "a", position: { x: 1000, y: 0, z: 0 } })];
    expect(findFreeSegments(state.project, "tyl", upper).segments).toEqual([{ u0: 0, u1: 4000 }]);
  });

  it("szafka na sąsiedniej ścianie w narożniku odcina koniec ściany", () => {
    // Lewa ściana, obrót 270: odcisk x 0..513, z 0..600 - przy tylnym narożniku.
    state.project.modules = [baseModule({ id: "l", rotation: 270, position: { x: 0, y: 0, z: 0 } })];
    expect(findFreeSegments(state.project, "tyl", base).segments).toEqual([{ u0: 513, u1: 4000 }]);
  });

  it("szafka w głębi pokoju (wyspa) nie blokuje ściany", () => {
    state.project.modules = [baseModule({ id: "w", position: { x: 1000, y: 0, z: 1500 } })];
    expect(findFreeSegments(state.project, "tyl", base).segments).toEqual([{ u0: 0, u1: 4000 }]);
  });

  it("okno nad blatem nie blokuje dolnych, blokuje wiszące; odstęp od otworu poszerza blokadę", () => {
    state.project.openings = [{ id: "o", kind: "okno", wall: "tyl", u: 1500, width: 1000, height: 1200, sill: 900 }];
    expect(findFreeSegments(state.project, "tyl", base).segments).toEqual([{ u0: 0, u1: 4000 }]);
    expect(findFreeSegments(state.project, "tyl", upper, { openingMargin: 50 }).segments)
      .toEqual([{ u0: 0, u1: 1450 }, { u0: 2550, u1: 4000 }]);
  });

  it("drzwi na sąsiedniej ścianie przy narożniku blokują strefą przejścia", () => {
    // Drzwi na lewej ścianie, u = głębokość - z: u 2200..3000 -> z 0..800 (przy ścianie tylnej).
    state.project.openings = [{ id: "d", kind: "drzwi", wall: "lewa", u: 2200, width: 800, height: 2050, sill: 0 }];
    const r = findFreeSegments(state.project, "tyl", base, { doorPassage: 700 });
    expect(r.segments).toEqual([{ u0: 700, u1: 4000 }]);
    expect(r.blocked[0].kind).toBe("drzwi");
  });

  it("blenda (bok dokładany) też blokuje", () => {
    state.project.sidePanels = [{ id: "b", kind: "blenda", name: "Blenda 1", position: { x: 3950, y: 100, z: 453 }, rotation: 0, dimensions: { width: 50, height: 720, depth: 80 } }];
    expect(findBlocked(state.project, "tyl", base)).toHaveLength(1);
    expect(findFreeSegments(state.project, "tyl", base).segments).toEqual([{ u0: 0, u1: 3950 }]);
  });
});

describe("parseSplit", () => {
  it("milimetry, proporcje, gwiazdka i fr", () => {
    expect(parseSplit("600, 800, *, *")).toEqual([
      { type: "fixed", value: 600 }, { type: "fixed", value: 800 }, { type: "fr", value: 1 }, { type: "fr", value: 1 },
    ]);
    expect(parseSplit("1:2:1").map((p) => p.type)).toEqual(["fr", "fr", "fr"]);
    expect(parseSplit("3fr:100")).toEqual([{ type: "fr", value: 3 }, { type: "fixed", value: 100 }]);
    expect(parseSplit("abc")).toBeNull();
    expect(parseSplit("")).toBeNull();
  });
});

describe("divideSegment", () => {
  it("standard: dokładne wypełnienie z katalogu wygrywa", () => {
    const v = divideSegment(2400, { mode: "standard" });
    expect(v[0].rest).toBe(0);
    expect(v[0].widths.reduce((s, x) => s + x, 0)).toBe(2400);
    expect(v[0].fillers).toEqual([]);
  });

  it("standard: przy remisie wygrywają szerokości bliższe 600 mm", () => {
    expect(divideSegment(3400, { mode: "standard" })[0].label).toBe("5 × 600 + 400");
  });

  it("standard: reszta na blendę po wybranej stronie", () => {
    const v = divideSegment(2380, { mode: "standard", catalog: [600], fillerSide: "left" });
    expect(v[0].widths).toEqual([600, 600, 600]);
    expect(v[0].fillers).toEqual([{ side: "left", width: 580 }]);
    expect(v[0].warnings.join(" ")).toMatch(/Blenda szersza/);
  });

  it("standard: tryb rozciągania rozdziela resztę na szafki", () => {
    const v = divideSegment(2410, { mode: "standard", restMode: "stretch" });
    expect(v[0].widths.reduce((s, x) => s + x, 0)).toBe(2410);
    expect(v[0].fillers).toEqual([]);
  });

  it("równy podział: N szafek, reszta z zaokrąglenia na blendy po obu stronach", () => {
    const [v] = divideSegment(2390, { mode: "equal", count: 4, roundTo: 10, fillerSide: "both" });
    expect(v.widths).toEqual([590, 590, 590, 590]);
    expect(v.fillers).toEqual([{ side: "left", width: 15 }, { side: "right", width: 15 }]);
  });

  it("równy podział z rozciąganiem: suma dokładnie równa odcinkowi", () => {
    const [v] = divideSegment(2390, { mode: "equal", count: 4, restMode: "stretch" });
    expect(v.widths).toEqual([598, 598, 597, 597]);
  });

  it("równy podział bez liczby proponuje kilka N od najbliższego 600 mm", () => {
    const v = divideSegment(2400, { mode: "equal" });
    expect(v[0].widths).toEqual([600, 600, 600, 600]);
    expect(v.length).toBeGreaterThan(1);
  });

  it("stałe + reszta: gwiazdki dzielą to, co zostało", () => {
    const [v] = divideSegment(2600, { mode: "fixed", split: "600, 800, *, *" });
    expect(v.widths).toEqual([600, 800, 600, 600]);
    expect(v.rest).toBe(0);
  });

  it("stałe + reszta z rozciąganiem nie rusza stałych szerokości", () => {
    const [v] = divideSegment(2601, { mode: "fixed", split: "600, *, *", restMode: "stretch", roundTo: 10 });
    expect(v.widths[0]).toBe(600);
    expect(v.widths.reduce((s, x) => s + x, 0)).toBe(2601);
  });

  it("proporcje 1:2:1", () => {
    const [v] = divideSegment(2400, { mode: "ratio", split: "1:2:1" });
    expect(v.widths).toEqual([600, 1200, 600]);
  });

  it("błędy: za krótki odcinek, za duże stałe, zły napis", () => {
    expect(divideSegment(100, {})[0].error).toBeTruthy();
    expect(divideSegment(1000, { mode: "fixed", split: "600, 600" })[0].error).toMatch(/nie mieszczą/);
    expect(divideSegment(1000, { mode: "ratio", split: "x" })[0].error).toBeTruthy();
  });

  it("describeWidths grupuje powtórzenia", () => {
    expect(describeWidths([600, 600, 600, 500])).toBe("3 × 600 + 500");
  });
});

describe("plan i kolizje", () => {
  it("buildFillItems: blenda z lewej ma kołnierz od prawej (od szafki)", () => {
    const items = buildFillItems({ u0: 100, u1: 1400 }, { widths: [600, 600], fillers: [{ side: "left", width: 100 }] });
    expect(items).toEqual([
      { kind: "blenda", u0: 100, width: 100, flange: "prawa" },
      { kind: "cabinet", u0: 200, width: 600 },
      { kind: "cabinet", u0: 800, width: 600 },
    ]);
  });

  it("findPlanConflicts: nachodzenie na przeszkodę i wyjście poza ścianę", () => {
    const items = [{ kind: "cabinet", u0: 0, width: 600 }, { kind: "cabinet", u0: 600, width: 600 }];
    const out = findPlanConflicts(items, [{ u0: 1000, u1: 1600, label: "Zlew" }], 1100);
    expect(out.some((m) => /Szafka 2.*Zlew/.test(m))).toBe(true);
    expect(out.some((m) => /wystaje poza ścianę/.test(m))).toBe(true);
    expect(findPlanConflicts(items.slice(0, 1), [], 4000)).toEqual([]);
  });
});

describe("applyFillPlan", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], sidePanels: [] })));

  it("wstawia szafki obrócone do ściany i blendę z licem równo z frontami", () => {
    const items = buildFillItems({ u0: 0, u1: 1250 }, { widths: [600, 600], fillers: [{ side: "right", width: 50 }] });
    const { modules, panels } = applyFillPlan({ wallId: "prawa", items, type: "base_cabinet" });
    expect(modules).toHaveLength(2);
    expect(modules.map((m) => m.rotation)).toEqual([90, 90]);
    expect(modules.map((m) => m.position)).toEqual([{ x: 3487, y: 0, z: 0 }, { x: 3487, y: 0, z: 600 }]);
    expect(new Set(modules.map((m) => m.id)).size).toBe(2);
    expect(panels[0]).toMatchObject({ kind: "blenda", flange: "lewa", rotation: 90, dimensions: { width: 50, height: 720, depth: 80 } });
    // Lico blendy (d1) = głębokość korpusu + 2 mm szczeliny + 18 mm frontu.
    const lay = computeWallLayouts();
    expect(lay.walls.find((w) => w.id === "prawa").items.map((i) => [i.u0, i.u1])).toEqual([[0, 600], [600, 1200]]);
    expect(state.activeModuleId).toBe(modules[0].id);
  });

  it("kopiuje wzór (wnętrze) z nowymi id i zmienioną szerokością", () => {
    const t = baseModule({ id: "wzor", name: "Wzór", elements: [{ id: "front-1", typ: "front", subtype: "drzwi", baseZone: {} }] });
    state.project.modules = [t];
    const { modules } = applyFillPlan({ wallId: "tyl", items: [{ kind: "cabinet", u0: 1000, width: 450 }], type: "base_cabinet", template: t });
    expect(modules[0].id).not.toBe("wzor");
    expect(modules[0].dimensions.width).toBe(450);
    expect(modules[0].elements[0].id).not.toBe("front-1");
    expect(modules[0].position).toEqual({ x: 1000, y: 0, z: 0 });
    expect(modules[0].name).toBe("Szafka dolna 2");
  });
});
