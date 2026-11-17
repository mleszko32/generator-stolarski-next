import { describe, it, expect, beforeEach } from "vitest";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { hangerOf, hangerProblems, hangerGeometry, hangerHoles, hangerHardware, HANGER_818 } from "./hanger.js";

const upper = (over = {}) => baseModule({
  type: "upper_cabinet",
  dimensions: { width: 600, height: 720, depth: 320 },
  legs: { active: false },
  backPanel: { type: "wpuszczane", thickness: 18, insetOffset: 18 },
  hanger: { active: true },
  ...over,
});

describe("zawieszki Camar 818", () => {
  let project;
  beforeEach(() => { project = freshProject(); });

  it("bez włączenia nic nie liczy", () => {
    const mod = upper({ hanger: undefined });
    setProject({ ...project, modules: [mod] });
    expect(hangerOf(mod)).toBeNull();
    expect(hangerGeometry(mod, project)).toBeNull();
    expect(hangerHardware(mod, project)).toEqual([]);
  });

  it("kołki w boku: 65 / 97 / 129 od góry, oś 13 mm od tyłu przy cofnięciu 18", () => {
    const mod = upper();
    const g = hangerGeometry(mod, project);
    expect(g.pinsFromTop).toEqual([65, 97, 129]);
    expect(g.pinFromRear).toBe(13);
  });

  it("otwory w plecach: 69 i 119 od góry, 18 mm od boków", () => {
    const mod = upper();
    const g = hangerGeometry(mod, project);
    expect(g.backHolesFromTop).toEqual([69, 119]);
    const h = hangerHoles(mod, project, { depth: 320, panelHeight: 720, topY: 720, backWidth: 564, backTopY: 720 });
    expect(h.side.map((x) => x.y)).toEqual([655, 623, 591]);
    expect(h.side[0].x).toBe(307);
    expect(h.back).toHaveLength(4);
    expect(h.back.map((x) => x.x).sort((a, b) => a - b)).toEqual([18, 18, 546, 546]);
  });

  it("minimalne cofnięcie pleców 15 mm", () => {
    expect(hangerProblems(upper({ backPanel: { type: "wpuszczane", insetOffset: 14 } }), project)).toHaveLength(1);
    expect(hangerProblems(upper({ backPanel: { type: "wpuszczane", insetOffset: 15 } }), project)).toEqual([]);
  });

  it("plecy nakładane lub nut - problem", () => {
    expect(hangerProblems(upper({ backPanel: { type: "nakladane" } }), project)).toHaveLength(1);
  });

  it("górny otwór nie wyżej niż 65 mm od góry", () => {
    const mod = upper({ hanger: { active: true, topOffset: 40 } });
    expect(hangerGeometry(mod, project).pinsFromTop[0]).toBe(HANGER_818.minTopOffset);
  });

  it("okucia: komplet, 4 zaślepki, 2 wkręty", () => {
    const hw = hangerHardware(upper(), project);
    expect(hw.map((x) => x.qty)).toEqual([1, 4, 2]);
  });
});
