import { describe, it, expect } from "vitest";
import { collectDrawerBoxes, buildDrawerBox, jointCount, jointPositions, getDrawerBoxSettings, holeSpecs, LAMELLO, lamelloGrooveLength, lamelloPositions, lamelloGrooveLen, cabinetFrontView } from "./drawerBoxBuild.js";
import { getDrawerComponents } from "./drawerMath.js";
import { drawerSystems } from "./drawerSystems.js";
import { buildSlopeElements } from "./slopeCabinet.js";
import { recalculateLayout } from "./layout.js";
import { freshProject, baseModule, fullZoneFront, setProject } from "../test/fixtures.js";

const movento = drawerSystems.movento_katalog;
const comps = (sideHeight = 150, nlDepth = 500) => getDrawerComponents("movento_katalog", 564, nlDepth, 400, "auto", sideHeight);

describe("skrzynki szuflad MOVENTO - łączniki", () => {
  it("liczba łączników rośnie z wysokością", () => {
    expect([60, 80, 120, 200, 300, 400].map(jointCount)).toEqual([1, 1, 2, 3, 4, 5]);
  });

  it("pozycje: jeden na środku, kilka równo od krawędzi", () => {
    expect(jointPositions(70, 25, 1)).toEqual([35]);
    expect(jointPositions(150, 25, 3)).toEqual([25, 75, 125]);
    // niska formatka: odstęp od krawędzi zmniejszony, żeby łączniki się zmieściły
    expect(jointPositions(60, 25, 2)).toEqual([15, 45]);
  });

  it("domyślnie kołek + wkręt, na przemian, co najmniej po jednym", () => {
    const s = getDrawerBoxSettings({});
    expect(s.join).toBe("kolek_wkret");
    const box = buildDrawerBox({ comps: comps(90), system: movento, isB: false }, s);
    const tyl = box.panels.find((p) => p.id === "tyl-przod");
    const left = tyl.holes.filter((h) => h.edge === "lewe").map((h) => h.kind);
    expect(left).toEqual(["wkret", "kolek"]);
  });

  it("kołek nie przewierca boku, wkręt i kołek mają głębokości w czole", () => {
    const sp = holeSpecs(getDrawerBoxSettings({}), 16);
    expect(sp.kolek.side).toMatchObject({ d: 8, depth: 11 });
    expect(sp.kolek.edge).toMatchObject({ d: 8, depth: 20 });
    expect(sp.wkret.edge).toMatchObject({ d: 3, depth: 36 });
    expect(sp.wkret.side.depth).toBeNull();
  });
});

describe("skrzynki szuflad MOVENTO - formatki i otwory", () => {
  const s = getDrawerBoxSettings({});
  const box = buildDrawerBox({ comps: comps(150), system: movento, isB: false }, s);
  const panel = (id) => box.panels.find((p) => p.id === id);

  it("wymiary jak lista formatek: SKW = LW - 42, SKL = NL - 10", () => {
    expect(box.lw - box.skw).toBe(42);
    expect(box.skl).toBe(box.nl - 10);
    expect(panel("bok")).toMatchObject({ qty: 2, length: box.skl, width: 150 });
    expect(panel("tyl-przod")).toMatchObject({ length: box.skw, width: 150 - 13 - 16, qty: 2 });
  });

  it("bok: łączniki tyłu i czoła w osi ich grubości, łączniki dna w osi dna", () => {
    const h = panel("bok").holes;
    expect(new Set(h.filter((x) => x.to === "czoło wewn.").map((x) => x.x))).toEqual(new Set([8]));
    expect(new Set(h.filter((x) => x.to === "tył").map((x) => x.x))).toEqual(new Set([box.skl - 8]));
    expect(new Set(h.filter((x) => x.to === "dno").map((x) => x.y))).toEqual(new Set([13 + 8]));
    // łączniki tyłu powyżej dna
    h.filter((x) => x.to === "tył").forEach((x) => expect(x.y).toBeGreaterThan(13 + 16));
  });

  it("dno: zaczep tylny Blum Ø6 × 10, 7 mm od boków, 11 mm nad spodem", () => {
    const z = panel("dno").holes.filter((x) => x.kind === "zaczep");
    expect(z).toHaveLength(2);
    expect(z.map((x) => x.x)).toEqual([7, box.skw - 7]);
    z.forEach((x) => expect(x).toMatchObject({ d: 6, depth: 10, y: 11, edge: "tylne", z: box.skl }));
  });

  it("dno: łączniki co najwyżej co 150 mm, min. 80 mm od końców (strefa sprzęgieł i zaczepów)", () => {
    const zs = panel("dno").holes.filter((x) => x.edge === "lewe").map((x) => x.z);
    expect(zs[0]).toBe(80);
    expect(zs[zs.length - 1]).toBe(box.skl - 80);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeLessThanOrEqual(150);
  });
});

describe("skrzynki szuflad MOVENTO - zbieranie z projektu", () => {
  const drawerFront = (id, minY, maxY) => fullZoneFront({ id, subtype: "szuflada", baseZone: { minX: 18, maxX: 582, minY, maxY, offsetBottom: 0, offsetTop: 0 } });

  it("identyczne skrzynki z dwóch szafek scalone, metalowe pominięte", () => {
    const m1 = baseModule({ id: "a", name: "Dolna A", elements: [drawerFront("f1", 18, 360), drawerFront("f2", 360, 702)] });
    const m2 = baseModule({ id: "b", name: "Dolna B", position: { x: 600, y: 0, z: 0 }, elements: [drawerFront("f3", 18, 360), drawerFront("f4", 360, 702)] });
    const project = freshProject({ modules: [m1, m2] });
    project.front.drawerSystem = "movento_katalog";
    setProject(project);
    const boxes = collectDrawerBoxes(project);
    expect(boxes.reduce((n, b) => n + b.qty, 0)).toBe(4);
    expect(boxes.length).toBeLessThan(4);
    boxes.forEach((b) => expect(b.modules).toEqual(["Dolna A", "Dolna B"]));

    project.front.drawerSystem = "merivobox";
    expect(collectDrawerBoxes(project)).toEqual([]);
  });

  it("szafka pod skos: skrzynka B ma dwa różne boki i skośny tył", () => {
    const mod = {
      id: "skos", name: "Skos", type: "slope_cabinet",
      dimensions: { width: 1000, height: 1000, depth: 600 }, position: { x: 0, y: 0, z: 0 },
      legs: { active: false }, front: {}, slope: { lowSide: "left", lowHeight: 400, drawerBox: "B" }, elements: [],
    };
    const project = freshProject({ modules: [mod] });
    project.front.drawerSystem = "movento_katalog";
    setProject(project);
    mod.elements = buildSlopeElements(mod, 18, [], [], 3);
    recalculateLayout(mod);
    const [box] = collectDrawerBoxes(project);
    expect(box.isB).toBe(true);
    const ids = box.panels.map((p) => p.id);
    expect(ids).toEqual(["bok-niski", "bok-wysoki", "dno", "tyl-przod"]);
    const low = box.panels[0], high = box.panels[1];
    expect(high.width).toBeGreaterThan(low.width);
    // wysoki bok ma więcej łączników tyłu niż niski
    const backJoints = (p) => p.holes.filter((h) => h.to === "tył").length;
    expect(backJoints(high)).toBeGreaterThan(backJoints(low));
    expect(box.panels.find((p) => p.id === "tyl-przod").points.length).toBeGreaterThanOrEqual(4);
  });
});

describe("skrzynki szuflad - Lamello P (Zeta P2)", () => {
  const lamBox = (join, sideHeight = 150) => buildDrawerBox({ comps: comps(sideHeight), system: movento, isB: false }, getDrawerBoxSettings({ drawerBox: { join } }));

  it("długość rowka na powierzchni z koła freza Ø100,4", () => {
    expect(lamelloGrooveLength(10)).toBeCloseTo(60.1, 1);
    expect(lamelloGrooveLength(14)).toBeCloseTo(69.6, 1);
  });

  it("rozmieszczenie: oś 60 mm od końca (domyślnie), rozstaw maks. 300 mm, za mało miejsca - jeden na środku", () => {
    expect(lamelloPositions(80, LAMELLO.tenso_p10)).toEqual([40]);
    expect(lamelloPositions(210, LAMELLO.tenso_p14)).toEqual([60, 150]);
    const long = lamelloPositions(490, LAMELLO.clamex_p14);
    expect(long[0]).toBe(60);
    expect(long[long.length - 1]).toBe(430);
    for (let i = 1; i < long.length; i++) expect(long[i] - long[i - 1]).toBeLessThanOrEqual(300);
  });

  it("Tenso: rowki w boku (pionowo przy tyle, poziomo przy dnie) i w czołach, bez otworów na klucz", () => {
    const box = lamBox("tenso_p14");
    const side = box.panels.find((p) => p.id === "bok");
    const tyl = side.holes.filter((h) => h.to === "tył");
    tyl.forEach((h) => expect(h).toMatchObject({ kind: "lamello", d: 7, depth: 14, orient: "v", groove: 75 }));
    side.holes.filter((h) => h.to === "dno").forEach((h) => expect(h.orient).toBe("h"));
    expect(box.panels.flatMap((p) => p.holes).some((h) => h.kind === "klucz")).toBe(false);
    expect(box.warnings).toEqual([]);
  });

  it("Clamex: otwór Ø6 na klucz od lica tyłu, 7,5 mm od krawędzi (P-14), 5,5 mm (P-10)", () => {
    const k14 = lamBox("clamex_p14").panels.find((p) => p.id === "tyl-przod").holes.filter((h) => h.kind === "klucz" && !h.to);
    expect(k14.length).toBeGreaterThan(0);
    expect(new Set(k14.map((h) => h.x))).toEqual(new Set([7.5, lamBox("clamex_p14").skw - 7.5]));
    k14.forEach((h) => expect(h).toMatchObject({ d: 6, edge: "lico" }));
    const k10 = lamBox("clamex_p10").panels.find((p) => p.id === "dno").holes.filter((h) => h.kind === "klucz");
    expect(new Set(k10.map((h) => h.x))).toEqual(new Set([5.5, lamBox("clamex_p10").skw - 5.5]));
  });

  it("ostrzeżenie, gdy tył za niski na rowek", () => {
    const box = lamBox("clamex_p14", 90);   // tył 90 - 13 - 16 = 61 mm < 2 × 37
    expect(box.warnings.some((w) => w.includes("za mało na rowek"))).toBe(true);
  });
});

describe("skrzynki szuflad - Lamello: odsunięcie od końca formatki", () => {
  it("ustawienie lamelloEdge zmienia odsunięcie, ale nie schodzi poniżej minimum producenta", () => {
    expect(lamelloPositions(300, LAMELLO.tenso_p14, 80)).toEqual([80, 220]);
    expect(lamelloPositions(300, LAMELLO.tenso_p14, 10)).toEqual([37, 263]);
  });

  it("w skrzynce: tył/przód 60 mm od końców, dno z bokami poza strefą sprzęgieł (75 + pół rowka)", () => {
    const box = buildDrawerBox({ comps: getDrawerComponents("movento_katalog", 564, 500, 400, "auto", 250), system: movento, isB: false }, getDrawerBoxSettings({ drawerBox: { join: "tenso_p14" } }));
    const dno = box.panels.find((p) => p.id === "dno").holes.filter((h) => h.edge === "lewe").map((h) => h.z);
    expect(dno[0]).toBe(112.5);
    expect(dno[dno.length - 1]).toBe(box.skl - 112.5);
    const tp = box.panels.find((p) => p.id === "tyl-przod").holes.filter((h) => h.edge === "lewe").map((h) => h.y);
    expect(tp[0]).toBe(60);
  });
});

describe("skrzynki szuflad - Lamello: długość rowka", () => {
  it("domyślnie P-14 75 mm, P-10 60 mm (pomiary z Zeta P2); ustawienie nadpisuje", () => {
    expect(lamelloGrooveLen(LAMELLO.clamex_p14, {})).toBe(75);
    expect(lamelloGrooveLen(LAMELLO.tenso_p10, { lamelloGroove: 0 })).toBe(60);
    expect(lamelloGrooveLen(LAMELLO.tenso_p14, { lamelloGroove: 78 })).toBe(78);
  });
  it("dwa rowki po 60 mm od końców mieszczą się dopiero, gdy nie zachodzą na siebie", () => {
    // 60 + 37,5 = 97,5 z każdej strony + 10 mm odstępu -> od 205 mm dwa rowki
    expect(lamelloPositions(200, LAMELLO.tenso_p14, 60, 75)).toEqual([100]);
    expect(lamelloPositions(210, LAMELLO.tenso_p14, 60, 75)).toEqual([60, 150]);
  });
});

describe("skrzynki szuflad - dno połączone z tyłem i przodem", () => {
  const boxWith = (join) => buildDrawerBox({ comps: comps(150), system: movento, isB: false }, getDrawerBoxSettings({ drawerBox: { join } }));

  it("kołek + wkręt: wkręty od spodu dna, kołki od góry, min. 80 mm od boków (sprzęgła / zaczepy MOVENTO)", () => {
    const box = boxWith("kolek_wkret");
    const dno = box.panels.find((p) => p.id === "dno").holes.filter((h) => h.to === "tył" || h.to === "przód");
    expect(dno.filter((h) => h.to === "tył")).toHaveLength(dno.length / 2);
    dno.forEach((h) => {
      expect(h.x).toBeGreaterThanOrEqual(80);
      expect(h.x).toBeLessThanOrEqual(box.skw - 80);
      expect(h.face).toBe(h.kind === "wkret" ? "spod" : "gora");
    });
    // oś tyłu / przodu w połowie ich grubości
    expect(new Set(dno.map((h) => h.z))).toEqual(new Set([8, box.skl - 8]));
    // te same pozycje w dolnej krawędzi tył/przód
    const tp = box.panels.find((p) => p.id === "tyl-przod").holes.filter((h) => h.edge === "dolne").map((h) => h.x);
    expect(tp).toEqual(dno.filter((h) => h.to === "tył").map((h) => h.x));
  });

  it("Lamello: rowki w licu dna i w dolnej krawędzi tył/przód, cały rowek poza strefą sprzęgieł (75 mm); Clamex z kluczem nad dnem", () => {
    const box = boxWith("clamex_p14");
    const tp = box.panels.find((p) => p.id === "tyl-przod").holes;
    const bottomEdge = tp.filter((h) => h.edge === "dolne");
    expect(bottomEdge[0]).toMatchObject({ kind: "lamello", x: 112.5, groove: 75 });
    // rowek (oś ± 37,5) zaczyna się dopiero za strefą 75 mm od boku, po obu stronach
    bottomEdge.forEach((h) => { expect(h.x - h.groove / 2).toBeGreaterThanOrEqual(75); expect(h.x + h.groove / 2).toBeLessThanOrEqual(box.skw - 75); });
    expect(tp.filter((h) => h.kind === "klucz" && h.to === "dno").map((h) => h.y)).toContain(7.5);
    // P-10: rowek 60 mm -> oś 105 mm od boku
    const p10 = boxWith("tenso_p10").panels.find((p) => p.id === "tyl-przod").holes.filter((h) => h.edge === "dolne");
    expect(p10[0].x).toBe(105);
    const dno = box.panels.find((p) => p.id === "dno").holes.filter((h) => h.to === "tył");
    dno.forEach((h) => expect(h).toMatchObject({ kind: "lamello", face: "gora" }));
  });
});

describe("skrzynki szuflad - gdzie w szafce", () => {
  it("skrzynka pamięta szafki i szuflady, z których pochodzi; widok szafki ma te fronty", () => {
    const drawerFront = (id, minY, maxY) => fullZoneFront({ id, subtype: "szuflada", baseZone: { minX: 18, maxX: 582, minY, maxY, offsetBottom: 0, offsetTop: 0 } });
    const m1 = baseModule({ id: "a", name: "Dolna A", elements: [drawerFront("f1", 18, 360), drawerFront("f2", 360, 702)] });
    const m2 = baseModule({ id: "b", name: "Dolna B", position: { x: 600, y: 0, z: 0 }, elements: [drawerFront("f3", 18, 360), drawerFront("f4", 360, 702)] });
    const project = freshProject({ modules: [m1, m2] });
    project.front.drawerSystem = "movento_katalog";
    setProject(project);
    const boxes = collectDrawerBoxes(project);
    const all = boxes.flatMap((b) => b.locations.flatMap((l) => l.frontIds.map((id) => `${l.modId}:${id}`)));
    expect(all.sort()).toEqual(["a:f1", "a:f2", "b:f3", "b:f4"]);
    boxes.forEach((b) => expect(b.locations.reduce((n, l) => n + l.frontIds.length, 0)).toBe(b.qty));

    const view = cabinetFrontView(m1, project);
    expect(view).toMatchObject({ W: 600, H: 720 });
    expect(view.fronts.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
    view.fronts.forEach((f) => expect(f.points).toHaveLength(4));
  });

  it("szafka pod skos: obrys trapezu, przy niskiej stronie po prawej odbity", () => {
    const mod = {
      id: "skos", name: "Skos", type: "slope_cabinet",
      dimensions: { width: 1000, height: 1000, depth: 600 }, position: { x: 0, y: 0, z: 0 },
      legs: { active: false }, front: {}, slope: { lowSide: "right", lowHeight: 400 }, elements: [],
    };
    const project = freshProject({ modules: [mod] });
    project.front.drawerSystem = "movento_katalog";
    setProject(project);
    mod.elements = buildSlopeElements(mod, 18, [], [], 3);
    const view = cabinetFrontView(mod, project);
    // niska strona (400) po prawej: wierzchołek (1000, 400), wysoka (0, 1000)
    expect(view.outline).toEqual(expect.arrayContaining([[1000, 400], [0, 1000]]));
    expect(view.fronts.length).toBeGreaterThan(0);
  });
});
