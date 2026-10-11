import { describe, it, expect, beforeEach } from "vitest";
import { state } from "./state.js";
import { planKitchenRun, applyKitchenRun, runPresets, findKitchenRunAround, customFromRun, replaceKitchenRun } from "./kitchenRun.js";
import { computeWallLayouts } from "./walls.js";
import { validateProject } from "./validate.js";
import { freshProject, setProject } from "../test/fixtures.js";

const room = { width: 4000, depth: 3000, height: 2600 };
const fill = { mode: "standard", restMode: "blenda", maxFiller: 150 };

describe("układy L/U", () => {
  it("4 układy L i 4 układy U z sąsiednich ścian (zgodnie z zegarem)", () => {
    const p = runPresets();
    expect(p.filter((x) => x.shape === "L")).toHaveLength(4);
    expect(p.find((x) => x.id === "lewa+tyl").label).toBe("L: lewa + tylna");
    expect(p.find((x) => x.id === "lewa+tyl+prawa").shape).toBe("U");
  });
});

describe("planKitchenRun", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], sidePanels: [], openings: [] })));

  it("nie zmienia projektu przy liczeniu planu", () => {
    planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill });
    expect(state.project.modules).toHaveLength(0);
    expect(state.project.sidePanels).toHaveLength(0);
  });

  it("L z szafką narożną: narożnik w rogu, ściany wypełnione od narożnika", () => {
    const plan = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L", size: 900 }], fill });
    const corner = plan.modules.find((m) => m.type === "corner_cabinet");
    expect(corner).toMatchObject({ rotation: 0, position: { x: 0, y: 0, z: 0 }, dimensions: { width: 900, legB: 900 } });
    const tyl = plan.walls.find((w) => w.wallId === "tyl");
    const lewa = plan.walls.find((w) => w.wallId === "lewa");
    expect(tyl.segments[0].u0).toBe(900);
    expect(lewa.segments[lewa.segments.length - 1].u1).toBe(2100);

    applyKitchenRun(plan);
    expect(state.project.modules.length).toBe(plan.modules.length);
    const { issues } = validateProject();
    expect(issues.filter((i) => /Nachodzi/.test(i.message))).toEqual([]);
    // Szafki stoją przy właściwych ścianach, bez nakładania w rzucie.
    const lay = computeWallLayouts();
    const items = lay.walls.find((w) => w.id === "tyl").items.filter((i) => i.kind === "cabinet").sort((a, b) => a.u0 - b.u0);
    for (let i = 1; i < items.length; i++) expect(items[i].u0).toBeGreaterThanOrEqual(items[i - 1].u1 - 0.5);
  });

  it("szafka ślepa: odsunięta tak, żeby drzwi minęły fronty sąsiedniej ściany + blendę", () => {
    const plan = planKitchenRun(state.project, {
      walls: ["lewa", "tyl"],
      corners: [{ kind: "blind", blindOn: "next", width: 1000, frontWidth: 500, filler: 50, fitting: "lemans" }],
      fill,
    });
    const blind = plan.modules.find((m) => m.blindCorner);
    // Od boku do drzwi 498,5 mm; potrzeba 513 + 20 + 50 = 583 -> odsunięcie 85 mm.
    expect(blind.blindCorner.side).toBe("left");
    expect(blind.position).toMatchObject({ x: 85, z: 0 });
    expect(blind.rotation).toBe(0);
    expect(plan.warnings.some((w) => /odsunięta od ściany o 85 mm/.test(w))).toBe(true);
    // Blenda narożna na lewej ścianie tuż za licem frontów ściany tylnej.
    const blenda = plan.panels.find((p) => p.kind === "blenda");
    expect(blenda).toMatchObject({ rotation: 270, dimensions: { width: 50 }, flange: "lewa" });
    const lewa = plan.walls.find((w) => w.wallId === "lewa");
    expect(Math.max(...lewa.segments.map((s) => s.u1))).toBeLessThanOrEqual(3000 - 533 - 50);
    // Na ścianie tylnej nic nie wchodzi w odsunięcie przy ścianie.
    const tyl = plan.walls.find((w) => w.wallId === "tyl");
    expect(tyl.segments[0].u0).toBeGreaterThanOrEqual(1085);

    // Po wstawieniu kontrola projektu nie ma uwag do frontów w narożniku ani kolizji.
    applyKitchenRun(plan);
    const { issues } = validateProject();
    expect(issues.filter((i) => /narożnik|Nachodzi/i.test(i.message) && i.level !== "info")).toEqual([]);
  });

  it("szafka ślepa: domyślnie listwa i zawias od narożnika; z Magic Corner zawias na boku z dala", () => {
    const plan = (fitting) => planKitchenRun(state.project, {
      walls: ["lewa", "tyl"], corners: [{ kind: "blind", blindOn: "next", width: 1000, frontWidth: 500, filler: 50, fitting }], fill,
    }).modules.find((m) => m.blindCorner);
    const a = plan("");
    expect(a.blindCorner.mount).toBe("listwa");
    expect(a.elements.find((e) => e.subtype === "drzwi").openingSide).toBe("left"); // strona ślepa
    const b = plan("magicCorner");
    expect(b.blindCorner.mount).toBe("bok");
    expect(b.elements.find((e) => e.subtype === "drzwi").openingSide).toBe("right");
  });

  it("U z szafkami L: bez uwag do narożników po wstawieniu", () => {
    applyKitchenRun(planKitchenRun(state.project, { walls: ["lewa", "tyl", "prawa"], corners: [{ kind: "L" }, { kind: "L" }], fill }));
    const { issues } = validateProject();
    expect(issues.filter((i) => /narożnik|Nachodzi/i.test(i.message))).toEqual([]);
  });

  it("narożnik martwy: zaślepka na jednej ścianie, blenda na drugiej", () => {
    const plan = planKitchenRun(state.project, { walls: ["tyl", "prawa"], corners: [{ kind: "dead", blindOn: "prev", filler: 50 }], fill });
    const cover = plan.panels.find((p) => /Zaślepka narożnika/.test(p.name));
    expect(cover.dimensions.width).toBe(513 + 20 + 50);
    expect(cover.rotation).toBe(0);
    const prawa = plan.walls.find((w) => w.wallId === "prawa");
    expect(prawa.segments[0].u0).toBeGreaterThanOrEqual(583);
    expect(plan.modules.every((m) => m.type === "base_cabinet")).toBe(true);
  });

  it("długość ramienia ogranicza skrajną ścianę od narożnika", () => {
    const plan = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], armLength: { lewa: 1500, tyl: 2000 }, fill });
    const lewa = plan.walls.find((w) => w.wallId === "lewa");
    const tyl = plan.walls.find((w) => w.wallId === "tyl");
    expect(Math.min(...lewa.segments.map((s) => s.u0))).toBe(1500);
    expect(Math.max(...tyl.segments.map((s) => s.u1))).toBe(2000);
  });

  it("U: dwa narożniki i ostrzeżenie o ciasnym przejściu", () => {
    setProject(freshProject({ room: { width: 2200, depth: 3000, height: 2600 }, modules: [], sidePanels: [] }));
    const plan = planKitchenRun(state.project, { walls: ["lewa", "tyl", "prawa"], corners: [{ kind: "L" }, { kind: "L" }], fill });
    expect(plan.modules.filter((m) => m.type === "corner_cabinet").map((m) => m.rotation)).toEqual([0, 90]);
    expect(plan.warnings.some((w) => /Przejście między ramionami U/.test(w))).toBe(true);
  });

  it("własne szerokości dla odcinka mają pierwszeństwo przed podziałem ogólnym", () => {
    const a = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill });
    const key = a.walls[1].segments[0].key; // tylna 900-4000 (3100 mm)
    const b = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill, custom: { [key]: "600, 800, *, *" } });
    const seg = b.walls[1].segments[0];
    expect(seg.custom).toBe("600, 800, *, *");
    expect(seg.items.filter((i) => i.kind === "cabinet").map((i) => i.width)).toEqual([600, 800, 850, 850]);
    const bad = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill, custom: { [key]: "2000, 2000" } });
    expect(bad.walls[1].segments[0].variants[0].error).toMatch(/nie mieszczą/);
    expect(bad.walls[1].segments[0].items).toEqual([]);
  });

  it("odsunięcie 50: szafka L odsunięta od obu ścian, ciągi zaczynają się za nią", () => {
    const plan = planKitchenRun(state.project, { walls: ["tyl", "prawa"], corners: [{ kind: "L", size: 900 }], fill, wallGap: 50 });
    const corner = plan.modules.find((m) => m.type === "corner_cabinet");
    expect(corner.position).toMatchObject({ x: 4000 - 50 - 900, z: 50 });
    const tyl = plan.walls.find((w) => w.wallId === "tyl");
    const prawa = plan.walls.find((w) => w.wallId === "prawa");
    expect(Math.max(...tyl.segments.map((s) => s.u1))).toBe(3050);
    expect(prawa.segments[0].u0).toBe(950);
    // Wszystkie zwykłe szafki 50 mm od swojej ściany.
    plan.modules.filter((m) => m.type === "base_cabinet").forEach((m) => {
      if (m.rotation === 0) expect(m.position.z).toBe(50);
      if (m.rotation === 90) expect(m.position.x).toBe(4000 - 50 - 513);
    });
    applyKitchenRun(plan);
    const { issues } = validateProject();
    expect(issues.filter((i) => /narożnik|Nachodzi/i.test(i.message))).toEqual([]);
  });

  it("odsunięcie 50: szafka ślepa odsuwa się dalej (135 zamiast 85), blenda za licem 583", () => {
    const plan = planKitchenRun(state.project, {
      walls: ["lewa", "tyl"],
      corners: [{ kind: "blind", blindOn: "next", width: 1000, frontWidth: 500, filler: 50 }],
      fill, wallGap: 50,
    });
    const blind = plan.modules.find((m) => m.blindCorner);
    // Od boku do drzwi 498,5; potrzeba 50 + 513 + 20 + 50 = 633 -> 135 mm.
    expect(blind.position).toMatchObject({ x: 135, z: 50 });
    expect(plan.warnings.some((w) => /odsunięta od ściany o 135 mm/.test(w))).toBe(true);
    const lewa = plan.walls.find((w) => w.wallId === "lewa");
    expect(Math.max(...lewa.segments.map((s) => s.u1))).toBeLessThanOrEqual(3000 - 583 - 50);
    const blenda = plan.panels.find((p) => p.kind === "blenda" && p.rotation === 270);
    expect(blenda.position.x).toBe(50 + 513 + 2 - 62);
    applyKitchenRun(plan);
    const { issues } = validateProject();
    expect(issues.filter((i) => /narożnik|Nachodzi/i.test(i.message) && i.level !== "info")).toEqual([]);
  });

  it("odsunięcie 50: zaślepka martwego narożnika szersza o odsunięcie", () => {
    const plan = planKitchenRun(state.project, { walls: ["tyl", "prawa"], corners: [{ kind: "dead", blindOn: "prev", filler: 50 }], fill, wallGap: 50 });
    const cover = plan.panels.find((p) => /Zaślepka narożnika/.test(p.name));
    expect(cover.dimensions.width).toBe(50 + 513 + 20 + 50);
    const prawa = plan.walls.find((w) => w.wallId === "prawa");
    expect(prawa.segments[0].u0).toBeGreaterThanOrEqual(633);
  });

  it("odsunięcie 50: przejście U liczone od lic frontów odsuniętych szafek", () => {
    setProject(freshProject({ room: { width: 2350, depth: 3000, height: 2600 }, modules: [], sidePanels: [] }));
    const opts = { walls: ["lewa", "tyl", "prawa"], corners: [{ kind: "L" }, { kind: "L" }], fill };
    expect(planKitchenRun(state.project, opts).warnings.some((w) => /Przejście/.test(w))).toBe(false); // 1284
    const plan = planKitchenRun(state.project, { ...opts, wallGap: 50 });
    expect(plan.warnings.some((w) => /Przejście między ramionami U ma 1184 mm/.test(w))).toBe(true);
  });

  it("wybór wariantu podziału dla odcinka", () => {
    const a = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill });
    const key = a.walls[1].segments[0].key;
    const b = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill, choice: { [key]: 1 } });
    expect(b.walls[1].segments[0].chosen).toBe(1);
    expect(b.walls[1].segments[0].items).not.toEqual(a.walls[1].segments[0].items);
  });
});

describe("zmiana podziału istniejącej kuchni L/U", () => {
  beforeEach(() => setProject(freshProject({ room, modules: [], sidePanels: [], openings: [] })));

  const build = (opts) => {
    const plan = planKitchenRun(state.project, { fill, ...opts });
    applyKitchenRun(plan);
    return plan;
  };
  const replan = (info, extra = {}) => {
    const base = {
      walls: info.walls, type: info.type, corners: info.corners, armLength: info.armLength, fill,
      wallGap: info.gap, ignoreIds: [...info.moduleIds, ...info.panelIds],
      template: state.project.modules.find((m) => m.id === info.templateId) || null,
    };
    const first = planKitchenRun(state.project, base);
    return planKitchenRun(state.project, { ...base, custom: customFromRun(info, first), ...extra });
  };

  it("rozpoznaje L z szafką narożną - od zwykłej szafki i od szafki L", () => {
    build({ walls: ["lewa", "tyl"], corners: [{ kind: "L", size: 900 }], wallGap: 50 });
    const cab = state.project.modules.find((m) => m.type === "base_cabinet" && m.rotation === 0);
    const info = findKitchenRunAround(state.project, cab.id);
    expect(info).toMatchObject({ walls: ["lewa", "tyl"], presetId: "lewa+tyl", type: "base_cabinet", gap: 50 });
    expect(info.corners[0]).toMatchObject({ kind: "L", size: 900 });
    expect(info.moduleIds.sort()).toEqual(state.project.modules.map((m) => m.id).sort());
    expect(info.panelIds.sort()).toEqual(state.project.sidePanels.map((p) => p.id).sort());
    const corner = state.project.modules.find((m) => m.type === "corner_cabinet");
    expect(findKitchenRunAround(state.project, corner.id).walls).toEqual(["lewa", "tyl"]);
  });

  it("rozpoznaje U, szafkę ślepą i narożnik martwy z ich ustawieniami", () => {
    build({
      walls: ["lewa", "tyl", "prawa"],
      corners: [{ kind: "blind", blindOn: "next", width: 1000, frontWidth: 500, filler: 50 }, { kind: "dead", blindOn: "prev", filler: 40 }],
    });
    const cab = state.project.modules.find((m) => m.rotation === 90);
    const info = findKitchenRunAround(state.project, cab.id);
    expect(info.walls).toEqual(["lewa", "tyl", "prawa"]);
    expect(info.corners[0]).toMatchObject({ kind: "blind", blindOn: "next", width: 1000, frontWidth: 500, filler: 50 });
    expect(info.corners[1]).toMatchObject({ kind: "dead", blindOn: "prev", filler: 40 });
  });

  it("pojedynczy rząd przy ścianie to nie kuchnia L/U", () => {
    const plan = planKitchenRun(state.project, { walls: ["tyl"], fill });
    applyKitchenRun(plan);
    expect(findKitchenRunAround(state.project, state.project.modules[0].id)).toBeNull();
  });

  it("ten sam podział: szafki zostają na miejscu, z tymi samymi id", () => {
    build({ walls: ["lewa", "tyl"], corners: [{ kind: "L", size: 900 }] });
    const before = JSON.parse(JSON.stringify(state.project.modules));
    const info = findKitchenRunAround(state.project, before.find((m) => m.rotation === 0 && m.type === "base_cabinet").id);
    const r = replaceKitchenRun(info, replan(info));
    expect(r.removed).toEqual([]);
    const after = Object.fromEntries(state.project.modules.map((m) => [m.id, m]));
    expect(Object.keys(after).sort()).toEqual(before.map((m) => m.id).sort());
    before.forEach((m) => {
      expect(after[m.id].position).toEqual(m.position);
      expect(after[m.id].dimensions.width).toBe(m.dimensions.width);
    });
  });

  it("nowy podział: wnętrza zostają, nadmiarowe szafki znikają, narożnik zmienia rozmiar", () => {
    build({ walls: ["lewa", "tyl"], corners: [{ kind: "L", size: 900 }] });
    const tyl = state.project.modules.filter((m) => m.rotation === 0 && m.type === "base_cabinet").sort((a, b) => a.position.x - b.position.x);
    tyl[0].name = "Zlewowa";
    const corner = state.project.modules.find((m) => m.type === "corner_cabinet");
    const info = findKitchenRunAround(state.project, tyl[0].id);
    const first = planKitchenRun(state.project, {
      walls: info.walls, corners: [{ ...info.corners[0], size: 1000 }], fill, wallGap: info.gap,
      ignoreIds: [...info.moduleIds, ...info.panelIds],
    });
    const key = first.walls[1].segments[0].key;
    const plan = planKitchenRun(state.project, {
      walls: info.walls, corners: [{ ...info.corners[0], size: 1000 }], fill, wallGap: info.gap,
      ignoreIds: [...info.moduleIds, ...info.panelIds], custom: { [key]: "1000, *" },
    });
    const r = replaceKitchenRun(info, plan);
    expect(r.removed.length).toBe(tyl.length - 2);
    const z = state.project.modules.find((m) => m.id === tyl[0].id);
    expect(z).toMatchObject({ name: "Zlewowa", dimensions: { width: 1000 }, position: { x: 1000 } });
    expect(state.project.modules.find((m) => m.id === corner.id).dimensions).toMatchObject({ width: 1000, legB: 1000 });
    const { issues } = validateProject();
    expect(issues.filter((i) => /narożnik|Nachodzi/i.test(i.message))).toEqual([]);
  });

  it("ignoreIds: plan liczony tak, jakby kuchni nie było", () => {
    const empty = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill });
    build({ walls: ["lewa", "tyl"], corners: [{ kind: "L" }] });
    const info = findKitchenRunAround(state.project, state.project.modules[0].id);
    const again = planKitchenRun(state.project, { walls: ["lewa", "tyl"], corners: [{ kind: "L" }], fill, ignoreIds: [...info.moduleIds, ...info.panelIds] });
    expect(again.walls.map((w) => w.segments.map((s) => [s.u0, s.u1]))).toEqual(empty.walls.map((w) => w.segments.map((s) => [s.u0, s.u1])));
  });
});
