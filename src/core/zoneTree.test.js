import { describe, it, expect, beforeEach } from "vitest";
import {
  getCabinetInnerRect,
  buildZoneTree,
  splitZoneHorizontal,
  splitZoneVertical,
  removeSplit,
  toggleStructural,
  assignFront,
  moveSplit,
} from "./zoneTree.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";
import { recalculateLayout } from "./layout.js";

// Korpus 600x720, płyta 18 -> wnętrze 18..582 / 18..702 (patrz layout.test.js).
const INNER = { minX: 18, maxX: 582, minY: 18, maxY: 702 };

function setup(elements = []) {
  const mod = baseModule({ elements });
  setProject(freshProject({ modules: [mod] }));
  return mod;
}

describe("getCabinetInnerRect", () => {
  it("liczy światło korpusu z grubości płyty i typu zamknięcia góry", () => {
    const mod = setup();
    expect(getCabinetInnerRect(mod)).toEqual(INNER);
  });
});

describe("buildZoneTree", () => {
  it("pusty moduł to jedna wnęka na cały korpus", () => {
    const mod = setup();
    const tree = buildZoneTree(mod);
    expect(tree).toMatchObject({ type: "leaf", rect: INNER, fronts: [] });
    expect(tree.boundLeftId).toBe("cab-left");
    expect(tree.boundRightId).toBe("cab-right");
    expect(tree.boundBottomId).toBe("cab-bottom");
    expect(tree.boundTopId).toBe("cab-top");
  });
});

describe("splitZoneHorizontal / splitZoneVertical", () => {
  it("dzieli wnękę półką na środku wysokości", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);

    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    expect(tree.axis).toBe("h");
    expect(tree.divider.y).toBeCloseTo(351); // (18+702)/2 - 18/2
    expect(tree.divider.h).toBe(18);
    expect(tree.a.rect).toEqual({ minX: 18, maxX: 582, minY: 18, maxY: 351 });
    expect(tree.b.rect).toEqual({ minX: 18, maxX: 582, minY: 369, maxY: 702 });
  });

  it("dzieli wnękę przegrodą na środku szerokości", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneVertical(mod, root);

    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    expect(tree.axis).toBe("v");
    expect(tree.divider.x).toBeCloseTo(291); // (18+582)/2 - 18/2
    expect(tree.a.rect.maxX).toBeCloseTo(291);
    expect(tree.b.rect.minX).toBeCloseTo(309);
  });

  it("dzielenie obsadzonej frontem wnęki usuwa front", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi");
    root = buildZoneTree(mod);
    expect(root.fronts).toHaveLength(1);

    splitZoneHorizontal(mod, root);
    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    expect(tree.a.fronts).toHaveLength(0);
    expect(tree.b.fronts).toHaveLength(0);
  });
});

describe("assignFront", () => {
  it("drzwi pojedyncze: jeden front, baseZone spięty z krawędziami korpusu", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi", { openingSide: "right" });

    const tree = buildZoneTree(mod);
    expect(tree.fronts).toHaveLength(1);
    const f = tree.fronts[0];
    expect(f.subtype).toBe("drzwi");
    expect(f.openingSide).toBe("right");
    expect(f.baseZone).toMatchObject({ ...INNER, boundLeft: "cab-left", boundRight: "cab-right", boundBottom: "cab-bottom", boundTop: "cab-top" });
  });

  it("drzwi podwójne (L/P): dwa fronty z tym samym baseZone", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi-lp");

    const tree = buildZoneTree(mod);
    expect(tree.fronts).toHaveLength(2);
    expect(tree.fronts.map((f) => f.frontIndex).sort()).toEqual([0, 1]);
  });

  it("szuflady z dystrybucją '3' tworzą trzy fronty tej samej wnęki", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    assignFront(mod, root, "szuflada", { distribution: "3" });

    const tree = buildZoneTree(mod);
    expect(tree.fronts).toHaveLength(3);
    expect(tree.fronts.every((f) => f.subtype === "szuflada")).toBe(true);
  });

  it("obsadzenie frontem zastępuje poprzedni front tej wnęki", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi");
    root = buildZoneTree(mod);
    assignFront(mod, root, "szuflada", { distribution: "2" });

    const tree = buildZoneTree(mod);
    expect(tree.fronts).toHaveLength(2);
    expect(tree.fronts.every((f) => f.subtype === "szuflada")).toBe(true);
  });
});

describe("integracja z recalculateLayout (core/layout.js)", () => {
  it("front w zagnieżdżonej wnęce jest spięty (boundLeft/boundBottom) z rzeczywistymi sąsiadującymi dzielnikami", () => {
    const mod = setup();
    // korpus -> podziel poziomo (półka) -> w górnej wnęce podziel pionowo (przegroda)
    // -> w prawej kolumnie górnej wnęki wstaw drzwi. Front jest więc związany
    // z dwoma RÓŻNYMI sąsiadującymi elementami, nie z cab-*.
    let root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);
    root = buildZoneTree(mod);
    splitZoneVertical(mod, root.b);
    root = buildZoneTree(mod);
    const targetLeaf = root.b.b; // górna wnęka, prawa kolumna
    assignFront(mod, targetLeaf, "drzwi", { openingSide: "left" });

    const front = mod.elements.find((el) => el.typ === "front");
    expect(front.baseZone.boundLeft).toBe(root.b.divider.id); // przegroda pionowa
    expect(front.baseZone.boundBottom).toBe(root.divider.id); // półka pod spodem
    expect(front.baseZone.boundRight).toBe("cab-right");
    expect(front.baseZone.boundTop).toBe("cab-top");

    // Silnik formatek NIE korzysta z zoneTree — czyta wyłącznie el.x/y/w/h
    // wyliczone przez recalculateLayout() (który dolicza nakładkę frontu na
    // sąsiednie płyty, dlatego nie porównujemy tu z gołym node.rect).
    recalculateLayout(mod);
    expect(Number.isFinite(front.x)).toBe(true);
    expect(front.w).toBeGreaterThan(0);
    expect(front.h).toBeGreaterThan(0);
  });

  it("po przesunięciu dzielnika (moveSplit) front związany z nim przesuwa się o dokładnie tę samą deltę", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root); // półka na y=351
    root = buildZoneTree(mod);
    assignFront(mod, root.b, "drzwi"); // drzwi w GÓRNEJ wnęce, boundBottom = ta półka

    recalculateLayout(mod);
    const front = mod.elements.find((el) => el.typ === "front");
    const yBefore = front.y;
    const hBefore = front.h;

    root = buildZoneTree(mod);
    const th = 18;
    const oldDividerTop = root.divider.y + root.divider.h;
    moveSplit(mod, root, 500); // podnieś półkę z 351 na 500 -> górna wnęka się kurczy
    const delta = root.divider.y + th - oldDividerTop; // nowa góra półki - stara góra półki

    recalculateLayout(mod);
    expect(front.y).toBeCloseTo(yBefore + delta);
    expect(front.h).toBeCloseTo(hBefore - delta);
  });
});

describe("removeSplit", () => {
  it("usuwa dzielnik i całą zagnieżdżoną zawartość, scalając z powrotem w jedną wnękę", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);
    root = buildZoneTree(mod);
    assignFront(mod, root.a, "drzwi");
    assignFront(mod, root.b, "szuflada", { distribution: "2" });
    root = buildZoneTree(mod);
    expect(mod.elements.length).toBeGreaterThan(0);

    removeSplit(mod, root);

    const tree = buildZoneTree(mod);
    expect(tree).toMatchObject({ type: "leaf", rect: INNER, fronts: [] });
    expect(mod.elements).toHaveLength(0);
  });
});

describe("toggleStructural", () => {
  it("przełącza isStructural tylko na dzielniku poziomym (półce)", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);
    const tree = buildZoneTree(mod);

    expect(tree.divider.isStructural).toBe(false);
    toggleStructural(tree);
    expect(tree.divider.isStructural).toBe(true);
  });
});

describe("moveSplit", () => {
  it("przesuwa półkę i proporcjonalnie przeskalowuje zagnieżdżoną przegrodę pod nią", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root); // dzielnik poziomy na y=351

    root = buildZoneTree(mod);
    splitZoneVertical(mod, root.a); // przegroda w dolnej wnęce (18..351), x=291, y=18, h=333

    root = buildZoneTree(mod);
    moveSplit(mod, root, 400); // przesuń GŁÓWNĄ półkę z 351 na 400

    const tree = buildZoneTree(mod);
    expect(tree.divider.y).toBeCloseTo(400);

    // dolna wnęka teraz 18..400 (wysokość 382) - zagnieżdżona przegroda musi
    // rozpinać się DOKŁADNIE na nowej wysokości, nie zostać przy starej.
    expect(tree.a.type).toBe("split");
    expect(tree.a.axis).toBe("v");
    expect(tree.a.divider.y).toBeCloseTo(18);
    expect(tree.a.divider.h).toBeCloseTo(382);
    expect(tree.a.divider.x).toBeCloseTo(291); // x nietknięty (przesuwaliśmy tylko oś Y)
    expect(tree.a.rect).toEqual({ minX: 18, maxX: 582, minY: 18, maxY: 400 });

    // górna wnęka skurczyła się zgodnie z przesunięciem
    expect(tree.b.rect).toEqual({ minX: 18, maxX: 582, minY: 418, maxY: 702 });
  });

  it("nie pozwala docisnąć dzielnika bliżej niż MIN_GAP do krawędzi wnęki", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);
    const tree = buildZoneTree(mod);

    moveSplit(mod, tree, 5); // dużo poniżej dolnej krawędzi (18) + MIN_GAP
    const after = buildZoneTree(mod);
    expect(after.divider.y).toBeCloseTo(48); // rect.minY(18) + MIN_GAP(30)
  });
});
