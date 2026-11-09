import { describe, it, expect } from "vitest";
import { computeAutoClearance, frontClearance, isAutoClearance, describeClearance } from "./autoClearance.js";

const mod = (id, over = {}) => ({
  id, type: "base_cabinet",
  dimensions: { width: 600, height: 720, depth: 513 },
  position: { x: 0, y: 0, z: 0 }, rotation: 0,
  legs: { active: true, height: 100, plinth: true, plinthOffset: 40 },
  front: { clearanceAuto: true }, elements: [],
  ...over,
});
const project = (modules, sidePanels = [], extra = {}) => ({
  front: { gap: 3, clearance: { sides: 1.5, top: 5, bottom: 0 } },
  room: { width: 4000, depth: 3000, height: 2600 },
  modules, sidePanels, ...extra,
});
const values = (c) => ({ left: c.left.value, right: c.right.value, top: c.top.value, bottom: c.bottom.value });

describe("computeAutoClearance", () => {
  it("samotna szafka dolna z cofniętym cokołem: boki 1,5, góra 5 (blat), dół 0", () => {
    const m = mod("a");
    expect(values(computeAutoClearance(m, project([m])))).toEqual({ left: 1.5, right: 1.5, top: 5, bottom: 0 });
  });

  it("szafka obok szafki: po połowie szczeliny", () => {
    const a = mod("a"), b = mod("b", { position: { x: 600, y: 0, z: 0 } });
    const c = computeAutoClearance(a, project([a, b]));
    expect(c.right).toEqual({ value: 1.5, reason: "szafka obok" });
    expect(c.left.reason).toBe("wolna krawędź");
  });

  it("blenda i bok dokładany dają całą szczelinę po stronie frontu", () => {
    const a = mod("a", { position: { x: 50, y: 0, z: 0 } });
    const blenda = { id: "bl", kind: "blenda", position: { x: 0, y: 100, z: 435 }, rotation: 0, dimensions: { width: 50, height: 720, depth: 98 } };
    const bok = { id: "bok", position: { x: 650, y: 0, z: 0 }, rotation: 0, dimensions: { width: 18, height: 820, depth: 560 } };
    const c = computeAutoClearance(a, project([a], [blenda, bok]));
    expect(c.left).toEqual({ value: 3, reason: "blenda obok" });
    expect(c.right).toEqual({ value: 3, reason: "bok dokładany obok" });
  });

  it("zmywarka obok: szczelina minus luz frontu zmywarki", () => {
    const a = mod("a");
    const zm = { id: "zm", kind: "zmywarka", position: { x: 600, y: 0, z: 0 }, rotation: 0, dimensions: { width: 600, height: 820, depth: 560 } };
    expect(computeAutoClearance(a, project([a], [zm])).right).toEqual({ value: 0.5, reason: "zmywarka obok" });
  });

  it("szafki postawione na sobie: dolna 3 u góry, górna 0 na dole", () => {
    const low = mod("low", { type: "tall_cabinet", dimensions: { width: 600, height: 1200, depth: 513 } });
    const high = mod("high", { type: "tall_cabinet", position: { x: 0, y: 1300, z: 0 }, legs: { active: false }, dimensions: { width: 600, height: 900, depth: 513 } });
    const p = project([low, high]);
    expect(computeAutoClearance(low, p).top).toEqual({ value: 3, reason: "szafka wyżej" });
    expect(computeAutoClearance(high, p).bottom).toEqual({ value: 0, reason: "szafka niżej" });
  });

  it("blat nad szafką dolną i szafka przy suficie: 5", () => {
    const a = mod("a");
    expect(computeAutoClearance(a, project([a])).top).toEqual({ value: 5, reason: "blat" });
    const bez = mod("b", { worktop: false });
    expect(computeAutoClearance(bez, project([bez])).top).toEqual({ value: 1.5, reason: "wolna krawędź" });
    const tall = mod("t", { type: "tall_cabinet", dimensions: { width: 600, height: 2460, depth: 513 } });
    expect(computeAutoClearance(tall, project([tall])).top).toEqual({ value: 5, reason: "sufit" });
  });

  it("blenda górna ma pierwszeństwo przed sufitem", () => {
    const tall = mod("t", { type: "tall_cabinet", dimensions: { width: 600, height: 2400, depth: 513 } });
    const bl = { id: "bl", kind: "blenda", position: { x: 0, y: 2500, z: 435 }, rotation: 0, dimensions: { width: 600, height: 100, depth: 98 } };
    expect(computeAutoClearance(tall, project([tall], [bl])).top).toEqual({ value: 3, reason: "blenda górna" });
  });

  it("cokół w licu frontów: 3 na dole", () => {
    const a = mod("a", { legs: { active: true, height: 100, plinth: true, plinthOffset: -20 } });
    expect(computeAutoClearance(a, project([a])).bottom).toEqual({ value: 3, reason: "cokół w licu frontów" });
  });

  it("panel pod szafką wiszącą: front schodzi o grubość panelu + 12", () => {
    const up = mod("u", { type: "upper_cabinet", position: { x: 0, y: 1450, z: 0 }, legs: { active: false }, dimensions: { width: 600, height: 720, depth: 320 } });
    const panel = { id: "p", kind: "poziomy", position: { x: 0, y: 1432, z: 0 }, rotation: 0, dimensions: { width: 1200, height: 18, depth: 320 } };
    expect(computeAutoClearance(up, project([up], [panel])).bottom).toEqual({ value: -30, reason: "panel pod szafką" });
    expect(computeAutoClearance(up, project([up])).bottom.value).toBe(0);
  });

  it("obrót 180°: lewy bok szafki to wyższy X w pokoju", () => {
    const a = mod("a", { rotation: 180, position: { x: 1000, y: 0, z: 2487 } });
    const bok = { id: "bok", position: { x: 1600, y: 0, z: 2440 }, rotation: 0, dimensions: { width: 18, height: 820, depth: 560 } };
    const c = computeAutoClearance(a, project([a], [bok]));
    expect(c.left.value).toBe(3);
    expect(c.right.value).toBe(1.5);
  });

  it("obrót 90°: lewy bok szafki to niższy Z w pokoju", () => {
    const a = mod("a", { rotation: 90, position: { x: 3487, y: 0, z: 500 } });
    const bok = { id: "bok", position: { x: 3440, y: 0, z: 482 }, rotation: 90, dimensions: { width: 18, height: 820, depth: 560 } };
    expect(computeAutoClearance(a, project([a], [bok])).left.value).toBe(3);
  });
});

describe("otwarta szafka w licu frontów", () => {
  // obrót 180° jak szafa S.6.3: przód to niższy Z, otwarta szafka głębsza o 20 mm
  const open = (id, over) => mod(id, { rotation: 180, legs: { active: false }, dimensions: { width: 550, height: 694, depth: 500 }, ...over });
  const closed = (id, over) => mod(id, { rotation: 180, legs: { active: false }, dimensions: { width: 550, height: 694, depth: 483 }, ...over });

  it("front nad i pod otwartą szafką: 3 mm po stronie frontu", () => {
    const low = closed("low", { position: { x: 0, y: 518, z: 3732 } });
    const mid = open("mid", { position: { x: 0, y: 1212, z: 3712 } });
    const high = closed("high", { position: { x: 0, y: 1906, z: 3732 } });
    const p = project([low, mid, high], [], { room: { width: 5586, depth: 4215, height: 4000 } });
    expect(computeAutoClearance(low, p).top).toEqual({ value: 3, reason: "szafka wyżej" });
    expect(computeAutoClearance(high, p).bottom).toEqual({ value: 3, reason: "otwarta szafka niżej" });
  });

  it("front obok otwartej szafki: 3 mm, obok zwykłej 1,5", () => {
    const a = closed("a", { position: { x: 550, y: 0, z: 3732 } });
    const o = open("o", { position: { x: 0, y: 0, z: 3712 } });
    const b = closed("b", { position: { x: 1100, y: 0, z: 3732 } });
    const c = computeAutoClearance(a, project([a, o, b]));
    expect(c.right).toEqual({ value: 3, reason: "otwarta szafka obok" });
    expect(c.left).toEqual({ value: 1.5, reason: "szafka obok" });
  });
});

describe("luz liczony dla wnęki frontu", () => {
  it("słupek obok kolumny z otwartą szafką: 3 mm na całej wysokości, kolumna 0", () => {
    const slupek = mod("s", { type: "tall_cabinet", rotation: 180, legs: { active: false }, position: { x: 550, y: 518, z: 3732 }, dimensions: { width: 550, height: 2087, depth: 483 } });
    const part = (id, y, depth) => mod(id, { rotation: 180, legs: { active: false }, position: { x: 0, y, z: 4215 - depth }, dimensions: { width: 550, height: 694, depth } });
    const p = project([slupek, part("d", 518, 483), part("o", 1212, 500), part("g", 1906, 483)], [], { room: { width: 5586, depth: 4215, height: 4000 } });
    // szafki z frontem nad i pod otwartą idą równo z jej krawędzią (0), więc słupek obok
    // bierze całe 3 mm na całej wysokości - linia szczeliny jest prosta
    const right = (minY, maxY) => frontClearance(slupek, p, { minX: 18, maxX: 532, minY, maxY }).right;
    expect(right(18, 685)).toBe(3);
    expect(right(703, 1379)).toBe(3);
    expect(right(1397, 2069)).toBe(3);
    const gorna = p.modules[3];
    expect(computeAutoClearance(gorna, p).left).toEqual({ value: 0, reason: "w linii z otwartą szafką" });
    expect(computeAutoClearance(gorna, p).right).toEqual({ value: 0, reason: "w linii z otwartą szafką" });
  });
});

describe("frontClearance", () => {
  it("tryb ręczny: ustawienia projektu nadpisane ustawieniami szafki", () => {
    const m = mod("a", { front: { clearance: { top: 2 } } });
    expect(isAutoClearance(m, project([m]))).toBe(false);
    expect(frontClearance(m, project([m]))).toEqual({ sides: 1.5, top: 2, bottom: 0 });
  });

  it("tryb Auto: luzy z sąsiadów, wpisany ręcznie ma pierwszeństwo, pusty nie", () => {
    const m = mod("a", { front: { clearanceAuto: true, clearance: { top: 4, left: null, right: "" } } });
    const p = project([m]);
    expect(frontClearance(m, p)).toEqual({ left: 1.5, right: 1.5, top: 4, bottom: 0 });
    expect(describeClearance(m, p).top).toEqual({ value: 4, auto: 5, reason: "blat", manual: true });
  });

  it("Auto nie działa dla frontów wpuszczanych, szafki narożnej i skosu", () => {
    const inset = mod("a", { front: { clearanceAuto: true, type: "wpuszczane" } });
    expect(isAutoClearance(inset, project([inset]))).toBe(false);
    expect(isAutoClearance(mod("c", { type: "corner_cabinet" }), project([]))).toBe(false);
    expect(isAutoClearance(mod("s", { type: "slope_cabinet" }), project([]))).toBe(false);
  });
});
