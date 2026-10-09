import { describe, it, expect } from "vitest";
import { splitPlinthRun, maxPlinthLength } from "./plinthSplit.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

describe("maxPlinthLength", () => {
  it("domyślny arkusz 2800×2070 z obrzeżem 10 mm daje 2780", () => {
    expect(maxPlinthLength(undefined)).toBe(2780);
    expect(maxPlinthLength({})).toBe(2780);
  });

  it("bierze dłuższy bok arkusza (też obróconego) i obrzeże z ustawień", () => {
    expect(maxPlinthLength({ sheetW: 2070, sheetH: 2800, trim: 0 })).toBe(2800);
    expect(maxPlinthLength({ sheetW: 4100, sheetH: 2050, trim: 15 })).toBe(4070);
  });
});

describe("splitPlinthRun", () => {
  it("krótki bieg zostaje w jednym kawałku", () => {
    expect(splitPlinthRun(1200, [600], 2780)).toEqual([1200]);
    expect(splitPlinthRun(2780, [600, 1200], 2780)).toEqual([2780]);
  });

  it("pusty / zerowy bieg nie daje części", () => {
    expect(splitPlinthRun(0, [], 2780)).toEqual([]);
  });

  it("dzieli na stykach szafek, na równe części (6 × 600 = 3600 → 1800 + 1800)", () => {
    expect(splitPlinthRun(3600, [600, 1200, 1800, 2400, 3000], 2780)).toEqual([1800, 1800]);
  });

  it("najmniej części, potem najkrótsza najdłuższa część (4000 z szafek 400/600/800)", () => {
    const joints = [400, 1000, 1800, 2400, 3200]; // szafki 400, 600, 800, 600, 800, 800
    const pieces = splitPlinthRun(4000, joints, 2780);
    expect(pieces).toEqual([1800, 2200]);
    expect(sum(pieces)).toBe(4000);
  });

  it("każdy styk części wypada na styku szafek", () => {
    const joints = [450, 1050, 1650, 2250, 2850, 3450, 3900]; // ściana 4500
    const pieces = splitPlinthRun(4500, joints, 2780);
    let pos = 0;
    pieces.slice(0, -1).forEach((len) => { pos += len; expect(joints).toContain(pos); });
    pieces.forEach((len) => expect(len).toBeLessThanOrEqual(2780));
    expect(sum(pieces)).toBe(4500);
  });

  it("szafka dłuższa niż arkusz jest dzielona w środku (inaczej się nie da)", () => {
    // jedna szafka 3000 + jedna 600
    const pieces = splitPlinthRun(3600, [3000], 2780);
    pieces.forEach((len) => expect(len).toBeLessThanOrEqual(2780));
    expect(sum(pieces)).toBeCloseTo(3600, 6);
    expect(pieces).toHaveLength(2);
    expect(pieces).toEqual([1500, 2100]);
  });

  it("bez styków dzieli bieg na równe części", () => {
    expect(splitPlinthRun(6000, [], 2780)).toEqual([2000, 2000, 2000]);
  });
});
