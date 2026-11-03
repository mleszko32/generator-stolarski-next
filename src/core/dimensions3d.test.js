import { describe, it, expect } from "vitest";
import { computeDimensions } from "./dimensions3d.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const mod = (id, x, extra = {}) => baseModule({ id, position: { x, y: 0, z: 0 }, ...extra });
const labels = (segs, kind, row) => segs.filter((s) => s.kind === kind && (!row || s.row === row)).map((s) => s.label);

describe("wymiary w 3D", () => {
  it("łańcuch szafek stojących przy ścianie tylnej + wymiar całkowity, przed licem frontów", () => {
    const p = freshProject({ modules: [mod("a", 0), mod("b", 600), mod("c", 1500)] });
    const segs = computeDimensions(p);
    expect(labels(segs, "chain", "dolne")).toEqual(["600", "600", "300", "600"]);
    expect(labels(segs, "total", "dolne")).toEqual(["2100"]);
    const s = segs.find((x) => x.kind === "chain");
    expect(s.a.z).toBeGreaterThan(513 + 20);   // przed frontami
    expect(s.a.y).toBe(0);
  });

  it("wysokości: podłoga, nóżki, korpus i sufit", () => {
    const p = freshProject({ modules: [mod("a", 0)] });
    const segs = computeDimensions(p);
    const H = p.room.height;
    expect(labels(segs, "height")).toEqual(["100", "720", String(H - 820)]);
  });

  it("szafka wisząca ma osobny łańcuch", () => {
    const up = mod("u", 0, { type: "upper_cabinet", position: { x: 0, y: 1400, z: 0 }, legs: { active: false, height: 100 } });
    const segs = computeDimensions(freshProject({ modules: [mod("a", 0), up] }));
    expect(labels(segs, "chain", "gorne")).toEqual(["600"]);
  });

  it("zaznaczona szafka: szerokość, wysokość, głębokość i odstępy do sąsiada i ściany", () => {
    const p = freshProject({ modules: [mod("a", 0), mod("b", 900)] });
    const segs = computeDimensions(p, "b");
    expect(labels(segs, "active")).toEqual(["600", "720", "513"]);
    expect(labels(segs, "gap")).toEqual(["300", String(p.room.width - 1500)]);
  });
});
