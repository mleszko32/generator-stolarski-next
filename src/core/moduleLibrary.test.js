import { describe, it, expect, beforeEach, vi } from "vitest";
import { listTemplates, saveTemplate, deleteTemplate, exportLibraryJson, importLibraryJson } from "./moduleLibrary.js";
import { cloneModuleWithNewIds, addModuleFromTemplate, duplicateModule, state } from "./state.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const withElements = () => baseModule({
  groupId: "g1",
  elements: [
    { id: "poziom-1-a", typ: "poziom", x: 18, y: 300, w: 564, h: 18, isStructural: false },
    {
      id: "front-1-a", typ: "front", subtype: "drzwi", frontIndex: 0, gap: 3,
      baseZone: { minX: 18, maxX: 582, minY: 318, maxY: 702, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "poziom-1-a", boundTop: "cab-top" },
    },
    { id: "front-L-2-a", typ: "front", subtype: "drzwi-lp", frontIndex: 0, gap: 3, baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 300 } },
  ],
});

describe("cloneModuleWithNewIds", () => {
  it("nadaje nowe id i przepisuje powiązania frontu z półką", () => {
    const src = withElements();
    const copy = cloneModuleWithNewIds(src);

    expect(copy.id).not.toBe(src.id);
    const shelf = copy.elements.find((e) => e.typ === "poziom");
    const front = copy.elements.find((e) => e.id.startsWith("front-1"));
    expect(shelf.id).not.toBe("poziom-1-a");
    expect(front.baseZone.boundBottom).toBe(shelf.id); // wskazuje na nową półkę
    expect(front.baseZone.boundLeft).toBe("cab-left"); // krawędzie korpusu bez zmian
    expect(src.elements[1].baseZone.boundBottom).toBe("poziom-1-a"); // oryginał nietknięty
  });

  it("zachowuje prefiks 'front' i znacznik -L- w id frontów", () => {
    const copy = cloneModuleWithNewIds(withElements());
    copy.elements.filter((e) => e.typ === "front").forEach((f) => expect(f.id.startsWith("front")).toBe(true));
    expect(copy.elements.find((e) => e.subtype === "drzwi-lp").id).toContain("-L-");
  });

  it("kolejna kopia kopii nie wydłuża id w nieskończoność", () => {
    const c1 = cloneModuleWithNewIds(withElements());
    const c2 = cloneModuleWithNewIds(c1);
    expect(c2.elements[0].id.length).toBe(c1.elements[0].id.length);
  });
});

describe("duplicateModule / addModuleFromTemplate", () => {
  beforeEach(() => setProject(freshProject({ modules: [withElements()] })));

  it("duplikat zachowuje powiązania frontu z półką", () => {
    const dup = duplicateModule("mod-test");
    const shelf = dup.elements.find((e) => e.typ === "poziom");
    const front = dup.elements.find((e) => e.id.startsWith("front-1"));
    expect(front.baseZone.boundBottom).toBe(shelf.id);
    expect(dup.name).toBe("Szafka (Kopia)");
  });

  it("szablon wstawia się na końcu rzędu i bez grupy", () => {
    const tpl = state.project.modules[0];
    const mod = addModuleFromTemplate(tpl);
    expect(mod.position.x).toBe(600);
    expect(mod.groupId).toBeUndefined();
    expect(state.activeModuleId).toBe(mod.id);
    expect(state.project.modules).toHaveLength(2);
  });
});

describe("biblioteka szablonów", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });

  it("zapisuje, listuje i usuwa szablony", () => {
    const entry = saveTemplate(withElements(), "Słupek na piekarnik");
    expect(entry.name).toBe("Słupek na piekarnik");
    expect(entry.module.groupId).toBeUndefined();
    expect(listTemplates()).toHaveLength(1);
    deleteTemplate(entry.id);
    expect(listTemplates()).toHaveLength(0);
  });

  it("eksport i import przenoszą szablony", () => {
    saveTemplate(withElements(), "A");
    saveTemplate(baseModule({ name: "B" }), "B");
    const json = exportLibraryJson();

    vi.stubGlobal("localStorage", fakeLocalStorage()); // "inny komputer"
    expect(importLibraryJson(json)).toBe(2);
    expect(listTemplates().map((t) => t.name)).toEqual(["A", "B"]);
  });

  it("odrzuca niepoprawny plik", () => {
    expect(importLibraryJson("nie json")).toBe(-1);
    expect(importLibraryJson('{"x":1}')).toBe(-1);
    expect(importLibraryJson('{"templates":[{"foo":1}]}')).toBe(0);
  });
});
