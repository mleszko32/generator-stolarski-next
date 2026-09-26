import { describe, it, expect, beforeEach } from "vitest";
import { moduleInfoHtml } from "./moduleInfoPanel.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { state } from "../core/state.js";

const drawer = (i, y, h) => ({
  id: "front-d" + i, typ: "front", subtype: "szuflada", frontIndex: i, frontCount: 2, gap: 3,
  x: 16.5, y, w: 567, h,
  baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702, offsetBottom: 0, offsetTop: 0 },
});

describe("moduleInfoHtml", () => {
  beforeEach(() => setProject(freshProject({ modules: [baseModule()] })));

  it("szuflady: osobna linia na każdą, system/typ/długość i wymiar korpusu, bez frontu i skrzynki", () => {
    state.project.modules[0].elements = [drawer(0, 16.5, 330), drawer(1, 350, 330)];
    const html = moduleInfoHtml(state.project.modules[0]);
    expect(html).toContain("Szuflada 1");
    expect(html).toContain("Szuflada 2");
    expect(html.match(/Blum MERIVOBOX typ [A-Z], dł\. 500 · korpus 564 × [0-9.]+/g)).toHaveLength(2);
    expect(html).not.toContain("skrzynka");
    expect(html).not.toContain("front 5");
  });
});
