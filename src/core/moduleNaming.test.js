import { describe, it, expect, beforeEach } from "vitest";
import { addModule, addCornerModule, state } from "./state.js";
import { freshProject, setProject } from "../test/fixtures.js";

describe("domyślna nazwa nowej szafki numeruje się tylko wśród szafek TEGO SAMEGO typu", () => {
  beforeEach(() => setProject(freshProject({ modules: [] })));

  it("dodanie innego typu między dwoma słupkami nie psuje numeracji słupków", () => {
    const s1 = addModule("tall_cabinet");
    const d1 = addModule("base_cabinet");
    const s2 = addModule("tall_cabinet");

    expect(s1.name).toBe("Słupek 1");
    expect(d1.name).toBe("Szafka dolna 1");
    expect(s2.name).toBe("Słupek 2"); // nie "Słupek 3" mimo że to trzecia szafka w projekcie
  });

  it("to samo dla szafek narożnych, niezależnie od innych typów w projekcie", () => {
    addModule("base_cabinet");
    const c1 = addCornerModule();
    addModule("upper_cabinet");
    const c2 = addCornerModule();

    expect(c1.name).toBe("Szafka narożna 1");
    expect(c2.name).toBe("Szafka narożna 2");
  });
});
