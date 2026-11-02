import { describe, it, expect } from "vitest";
import { parseFurnitureJson, insertFurniture } from "./furnitureImport.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const furniture = () => ({
  format: "gsn-furniture",
  name: "Szafa",
  modules: [
    baseModule({ id: "m1", position: { x: 35, y: 0, z: 0 }, dimensions: { width: 600, height: 500, depth: 500 } }),
    baseModule({ id: "m2", position: { x: 35, y: 500, z: 0 }, dimensions: { width: 600, height: 700, depth: 500 } }),
  ],
  sidePanels: [{ id: "b1", kind: "blenda", name: "Blenda", position: { x: 0, y: 0, z: 0 }, rotation: 0, dimensions: { width: 35, height: 1200, depth: 80 } }],
});

describe("parseFurnitureJson", () => {
  it("odrzuca niepoprawny plik", () => {
    expect(parseFurnitureJson("nie json")).toBeNull();
    expect(parseFurnitureJson('{"modules":[]}')).toBeNull();
  });
  it("czyta moduły i blendy", () => {
    const f = parseFurnitureJson(JSON.stringify(furniture()));
    expect(f.name).toBe("Szafa");
    expect(f.modules).toHaveLength(2);
    expect(f.sidePanels).toHaveLength(1);
  });
});

describe("insertFurniture", () => {
  it("stawia mebel na prawo od istniejących, zachowuje układ i grupuje szafki", () => {
    const project = freshProject({ modules: [baseModule({ id: "x", position: { x: 0, y: 0, z: 0 } })] });
    const added = insertFurniture(project, parseFurnitureJson(JSON.stringify(furniture())));
    expect(project.modules).toHaveLength(3);
    expect(added[0].position.x).toBe(635); // 600 + 35 (blenda przed szafką)
    expect(added[1].position).toEqual({ x: 635, y: 500, z: 0 });
    expect(added[0].groupId).toBeTruthy();
    expect(added[0].groupId).toBe(added[1].groupId);
    expect(added[0].id).not.toBe("m1");
    const blenda = project.sidePanels.find((p) => p.kind === "blenda");
    expect(blenda.position.x).toBe(600);
    expect(blenda.id).not.toBe("b1");
  });
});
