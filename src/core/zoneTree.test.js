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
  addEvenShelves,
  rescaleSubtree,
  axisAncestorChain,
  resizeAlongAxis,
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

  it("dzielenie obsadzonej frontem wnęki NIE usuwa frontu - obejmuje teraz cały węzeł 'split'", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi");
    root = buildZoneTree(mod);
    expect(root.fronts).toHaveLength(1);

    splitZoneHorizontal(mod, root);
    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    // front przetrwał i "przeniósł się" na węzeł 'split' obejmujący całość -
    // baseZone się nie zmienił, nadal pasuje do tego samego rect.
    expect(tree.fronts).toHaveLength(1);
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

  it("można obsadzić frontem węzeł 'split' (front obejmuje całe poddrzewo z półkami w środku)", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root); // jedna półka - wnęka to teraz węzeł 'split'

    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    assignFront(mod, tree, "drzwi");

    const after = buildZoneTree(mod);
    expect(after.type).toBe("split"); // półka nadal tam jest
    expect(after.fronts).toHaveLength(1);
    expect(after.fronts[0].baseZone).toMatchObject(INNER); // front na CAŁĄ wnękę, nie tylko połowę
  });

  it("obsadzenie ANCESTORA frontem usuwa fronty wcześniej przypisane głębiej w jego poddrzewie (bez duplikatów)", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 3); // trzy półki - kilka zagnieżdżonych węzłów 'split'

    let tree = buildZoneTree(mod);
    // obsadź jedną z węższych, zagnieżdżonych wnęk frontem
    assignFront(mod, tree.b.a, "szuflada", { distribution: "1" });
    tree = buildZoneTree(mod);
    expect(tree.b.a.fronts).toHaveLength(1);

    // teraz obsadź frontem CAŁY korpus (najwyższy węzeł) - poprzedni,
    // zagnieżdżony front nie powinien przetrwać jako "duch" pod spodem
    assignFront(mod, tree, "drzwi");

    const after = buildZoneTree(mod);
    expect(after.fronts).toHaveLength(1);
    expect(after.fronts[0].subtype).toBe("drzwi");
    expect(mod.elements.filter((el) => el.typ === "front")).toHaveLength(1);
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
  it("usuwa dzielnik i fronty BEZPOŚREDNIO na jego dwóch stronach, scalając je z powrotem w jedną wnękę", () => {
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

  it("usuwa TYLKO ten jeden podział - głębiej zagnieżdżony podział (i jego fronty) po drugiej stronie przetrwa scalenie", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root); // dół (a) / góra (b)
    root = buildZoneTree(mod);
    assignFront(mod, root.a, "drzwi"); // front bezpośrednio na dolnej wnęce - ma zniknąć

    splitZoneVertical(mod, root.b); // góra podzielona dalej na dwie kolumny
    root = buildZoneTree(mod);
    assignFront(mod, root.b.a, "szuflada", { distribution: "1" });
    assignFront(mod, root.b.b, "drzwi", { openingSide: "right" });
    root = buildZoneTree(mod);
    const nestedDividerId = root.b.divider.id;

    removeSplit(mod, root); // usuń TYLKO dolny/górny podział (root), nie ten w środku

    // W prawdziwym flow (ui/interiorEditor.js: refreshAfterEdit) update3D()
    // wywołuje recalculateLayout() dla każdego modułu PRZED przebudową drzewa
    // - to ono odświeża literalne baseZone.min/max frontów na podstawie
    // bound-referencji (core/layout.js), które removeSplit właśnie przepięło.
    recalculateLayout(mod);

    const tree = buildZoneTree(mod);
    // scaliło się w JEDNĄ wnękę na starym miejscu root.a (front tam usunięty)...
    expect(tree.type).toBe("split"); // ...ale zagnieżdżony podział (dawne root.b) przetrwał
    expect(tree.axis).toBe("v");
    expect(tree.divider.id).toBe(nestedDividerId);
    expect(tree.rect).toEqual(INNER); // scalona wnęka rozpina się na CAŁY korpus
    expect(tree.a.fronts).toHaveLength(1);
    expect(tree.a.fronts[0].subtype).toBe("szuflada");
    expect(tree.b.fronts).toHaveLength(1);
    expect(tree.b.fronts[0].subtype).toBe("drzwi");
  });

  it("zachowuje front przypisany do SAMEGO usuwanego węzła 'split' (front na całość, bez półki w środku)", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi"); // front na całą (jeszcze niepodzieloną) wnękę
    root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root); // dodaj półkę - front "przenosi się" na węzeł split
    root = buildZoneTree(mod);
    expect(root.type).toBe("split");
    expect(root.fronts).toHaveLength(1);

    removeSplit(mod, root); // usuń tylko półkę, front ma zostać

    const tree = buildZoneTree(mod);
    expect(tree).toMatchObject({ type: "leaf", rect: INNER });
    expect(tree.fronts).toHaveLength(1);
  });
});

describe("addEvenShelves", () => {
  it("dzieli wnękę na N+1 niezależnych wnęk (prawdziwe zagnieżdżone podziały)", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 2);

    const tree = buildZoneTree(mod);
    expect(tree.type).toBe("split");
    expect(tree.axis).toBe("h");
    expect(tree.b.type).toBe("split"); // druga półka zagnieżdżona w górnej części
    expect(tree.b.axis).toBe("h");
    expect(tree.b.b.type).toBe("leaf"); // trzy wnęki finalnie: a, b.a, b.b
  });

  it("front przypisany PRZED dodaniem półek przetrwa - obejmuje całe poddrzewo", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    assignFront(mod, root, "drzwi");
    root = buildZoneTree(mod);

    addEvenShelves(mod, root, 3);

    const tree = buildZoneTree(mod);
    expect(tree.fronts).toHaveLength(1); // front przetrwał na węźle obejmującym całość
    expect(tree.fronts[0].baseZone).toMatchObject(INNER);
  });

  it("po dodaniu półek każda z powstałych wnęk jest osobno obsadzalna frontem", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 1); // jedna półka -> dwie niezależne wnęki (a, b)

    let tree = buildZoneTree(mod);
    assignFront(mod, tree.a, "szuflada", { distribution: "1" });
    tree = buildZoneTree(mod);
    assignFront(mod, tree.b, "drzwi");

    const after = buildZoneTree(mod);
    expect(after.a.fronts).toHaveLength(1);
    expect(after.a.fronts[0].subtype).toBe("szuflada");
    expect(after.b.fronts).toHaveLength(1);
    expect(after.b.fronts[0].subtype).toBe("drzwi");
  });
});

describe("przegroda pionowa MIĘDZY dwiema półkami", () => {
  it("kliknięcie w konkretną (środkową) wnękę powstałą z dwóch półek naturalnie ogranicza przegrodę do niej", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 2); // dwie półki -> trzy wnęki: dół, środek, góra

    let tree = buildZoneTree(mod);
    const middleLeaf = tree.b.a; // środkowa wnęka (patrz addEvenShelves test wyżej: b.a, b.b)
    expect(middleLeaf.type).toBe("leaf");
    splitZoneVertical(mod, middleLeaf);

    tree = buildZoneTree(mod);
    // przegroda podzieliła TYLKO środkową wnękę - dolna i górna zostały nietknięte (dalej 'leaf')
    expect(tree.a.type).toBe("leaf");
    expect(tree.b.a.type).toBe("split");
    expect(tree.b.a.axis).toBe("v");
    expect(tree.b.a.rect).toEqual(middleLeaf.rect); // przegroda nie wyszła poza granice tej wnęki
    expect(tree.b.b.type).toBe("leaf");
  });
});

describe("toggleStructural", () => {
  it("przełącza isStructural na dzielniku poziomym (półce)", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneHorizontal(mod, root);
    const tree = buildZoneTree(mod);

    expect(tree.divider.isStructural).toBe(false);
    toggleStructural(tree);
    expect(tree.divider.isStructural).toBe(true);
  });

  it("przegroda pionowa ma domyślnie mocowanie na kołek+wkręt, toggleStructural je zdejmuje", () => {
    const mod = setup();
    const root = buildZoneTree(mod);
    splitZoneVertical(mod, root);
    const tree = buildZoneTree(mod);

    expect(tree.divider.isStructural).toBe(true);
    toggleStructural(tree);
    expect(tree.divider.isStructural).toBe(false);
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

  it("przesunięcie przegrody pionowej PRZESKALOWUJE zagnieżdżone półki po obu stronach (nie gubi ich)", () => {
    const mod = setup();
    let root = buildZoneTree(mod);
    addEvenShelves(mod, root, 2); // dwie półki, wnęka staje się węzłem 'split' (axis h)
    root = buildZoneTree(mod);

    // dodaj przegrodę pionową w środkowej wnęce (między półkami)
    const middleLeaf = root.b.a;
    splitZoneVertical(mod, middleLeaf);

    root = buildZoneTree(mod);
    const vSplit = root.b.a; // węzeł 'split' (axis v) w środkowej wnęce
    expect(vSplit.type).toBe("split");
    expect(vSplit.axis).toBe("v");

    moveSplit(mod, vSplit, vSplit.rect.minX + 100); // przesuń przegrodę w prawo

    const tree = buildZoneTree(mod);
    const movedV = tree.b.a;
    expect(movedV.type).toBe("split");
    expect(movedV.divider.x).toBeCloseTo(vSplit.rect.minX + 100);
    // obie kolumny nadal istnieją i razem wypełniają dokładnie starą szerokość wnęki
    expect(movedV.a.rect.minX).toBeCloseTo(vSplit.rect.minX);
    expect(movedV.b.rect.maxX).toBeCloseTo(vSplit.rect.maxX);
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

  describe("zablokowany wymiar (divider.lockA / lockB)", () => {
    it("przesunięcie dzielnika WYŻEJ w drzewie respektuje lockA nested dzielnika po drodze - cała zmiana idzie na drugą stronę", () => {
      const mod = setup();
      let root = buildZoneTree(mod);
      addEvenShelves(mod, root, 2); // trzy wnęki: dół (a), środek (b.a), góra (b.b)
      root = buildZoneTree(mod);

      const middleHeight = root.b.a.rect.maxY - root.b.a.rect.minY;
      root.b.divider.lockA = true; // zablokuj wysokość ŚRODKOWEJ wnęki (strona 'a' węzła root.b)

      // przesuń NAJNIŻSZY dzielnik (root) - to przeskalowuje CAŁY węzeł root.b
      // (a więc i zagnieżdżony root.b.divider) przez rescaleSubtree
      moveSplit(mod, root, root.divider.y - 80);

      const tree = buildZoneTree(mod);
      const newMiddleHeight = tree.b.a.rect.maxY - tree.b.a.rect.minY;
      expect(newMiddleHeight).toBeCloseTo(middleHeight);
    });

    it("przesunięcie dzielnika WYŻEJ w drzewie też respektuje lockB nested dzielnika po drodze", () => {
      const mod = setup();
      let root = buildZoneTree(mod);
      addEvenShelves(mod, root, 2); // dół (a), środek (b.a), góra (b.b)
      root = buildZoneTree(mod);

      const topHeight = root.b.b.rect.maxY - root.b.b.rect.minY;
      root.b.divider.lockB = true; // zablokuj wysokość GÓRNEJ wnęki (strona 'b' węzła root.b)

      // przesuń NAJNIŻSZY dzielnik (root) - to przeskalowuje CAŁY węzeł root.b
      // (a więc i zagnieżdżony root.b.divider) przez rescaleSubtree
      moveSplit(mod, root, root.divider.y + 100);

      const tree = buildZoneTree(mod);
      const newTopHeight = tree.b.b.rect.maxY - tree.b.b.rect.minY;
      expect(newTopHeight).toBeCloseTo(topHeight);
    });

    it("bez blokady zachowanie jest jak dawniej - proporcjonalne", () => {
      const mod = setup();
      let root = buildZoneTree(mod);
      addEvenShelves(mod, root, 2);
      root = buildZoneTree(mod);

      const middleHeight = root.b.a.rect.maxY - root.b.a.rect.minY;
      moveSplit(mod, root.b, root.b.divider.y + 80);

      const tree = buildZoneTree(mod);
      const newMiddleHeight = tree.b.a.rect.maxY - tree.b.a.rect.minY;
      expect(newMiddleHeight).not.toBeCloseTo(middleHeight, 0);
    });

    // Zgłoszony błąd: zablokowana przestrzeń między półkami wracała do starego
    // (proporcjonalnego) rozmiaru przy zmianie SZEROKOŚCI/WYSOKOŚCI całej szafki z
    // panelu właściwości - ten kod wcześniej przeliczał piony/poziomy wprost po
    // współrzędnych, z pominięciem zoneTree.js i jego blokad. ui/properties.js
    // (input width/height) woła teraz dokładnie to, co te dwa testy odtwarzają.
    it("zmiana wysokości szafki z panelu właściwości respektuje zablokowaną przestrzeń", () => {
      const mod = setup();
      let root = buildZoneTree(mod);
      addEvenShelves(mod, root, 2); // dół (a), środek (b.a), góra (b.b)
      root = buildZoneTree(mod);
      const middleHeight = root.b.a.rect.maxY - root.b.a.rect.minY;
      root.b.divider.lockA = true; // zablokuj środkową przestrzeń

      const th = 18;
      mod.dimensions.height = 900; // 720 -> 900, jak wpisanie w polu "Wysokość korpusu"
      const newInner = 900 - th - th;
      rescaleSubtree(root, "y", INNER.minY, INNER.maxY, th, th + newInner);

      const tree = buildZoneTree(mod);
      const newMiddleHeight = tree.b.a.rect.maxY - tree.b.a.rect.minY;
      expect(newMiddleHeight).toBeCloseTo(middleHeight);
    });

    it("zmiana szerokości szafki z panelu właściwości respektuje zablokowaną przestrzeń", () => {
      const mod = setup();
      let root = buildZoneTree(mod);
      splitZoneVertical(mod, root); // lewa (a), prawa (b)
      root = buildZoneTree(mod);
      const leftWidth = root.a.rect.maxX - root.a.rect.minX;
      root.divider.lockA = true; // zablokuj lewą kolumnę

      const th = 18;
      mod.dimensions.width = 900; // 600 -> 900, jak wpisanie w polu "Szerokość"
      const newInner = 900 - th - th;
      rescaleSubtree(root, "x", INNER.minX, INNER.maxX, th, th + newInner);

      const tree = buildZoneTree(mod);
      const newLeftWidth = tree.a.rect.maxX - tree.a.rect.minX;
      expect(newLeftWidth).toBeCloseTo(leftWidth);
    });
  });
});

// Zgłoszony błąd (drugi etap): mając np. 4 wnęki, z których dwie ŚRODKOWE są
// zablokowane, a skrajne (góra/dół) nie - wpisanie nowego wymiaru w JEDNEJ
// skrajnej wnęce zmieniało NAJBLIŻSZĄ (zablokowaną!) sąsiadkę zamiast dotrzeć
// do drugiej, odblokowanej wnęki po przeciwnej stronie. moveSplit() zawsze
// resize'ował tylko bezpośredniego sąsiada danego dzielnika, z pominięciem
// tego, czy jest zablokowany - lock chronił tylko przed kaskadą zmiany "z
// góry" (zmiana wymiaru całej szafki, patrz opis wyżej), nie przed edycją
// sąsiedniej wnęki. resizeAlongAxis (użyte teraz w ui/interiorEditor.js do
// wpisywania dokładnego wymiaru wnęki) ma "przejść przez" zablokowane wnęki.
describe("resizeAlongAxis - edycja wymiaru przechodzi przez zablokowane sąsiednie wnęki", () => {
  function setup4() {
    const mod = baseModule({ elements: [] });
    setProject(freshProject({ modules: [mod] }));
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 3); // 4 równe wnęki: dół -> góra
    return mod;
  }
  // Drzewo po addEvenShelves(mod, root, 3): root.a = dół (z1), root.b.a = z2,
  // root.b.b.a = z3, root.b.b.b = góra (z4) - patrz rescaleSubtree/moveSplit
  // wyżej dla tego samego kształtu drzewa.
  function zones(tree) {
    return [tree.a, tree.b.a, tree.b.b.a, tree.b.b.b]; // [z1..z4], dół -> góra
  }
  function heights(zs) {
    return zs.map((n) => n.rect.maxY - n.rect.minY);
  }

  it("axisAncestorChain: łańcuch dzielników osi 'h' od korzenia do wnęki, ze stroną po drodze", () => {
    const mod = setup4();
    const tree = buildZoneTree(mod);
    const [, , , z4] = zones(tree);
    const chain = axisAncestorChain(tree, z4, true);
    expect(chain.map((c) => c.side)).toEqual(["b", "b", "b"]); // z4 jest zawsze stroną 'b' (góra) na każdym poziomie
    expect(chain[chain.length - 1].node).toBe(tree.b.b); // najbliższy rodzic ostatni
  });

  it("edycja GÓRNEJ odblokowanej wnęki: dwie zablokowane środkowe bez zmian, dolna odblokowana wchłania różnicę", () => {
    const mod = setup4();
    const tree = buildZoneTree(mod);
    const [z1, z2, z3, z4] = zones(tree);
    tree.b.divider.lockA = true; // zablokuj z2
    tree.b.b.divider.lockA = true; // zablokuj z3
    const [h1, h2, h3, h4] = heights([z1, z2, z3, z4]);

    resizeAlongAxis(mod, tree, z4, true, h4 + 50, h4);

    const [nz1, nz2, nz3, nz4] = zones(buildZoneTree(mod));
    expect(nz4.rect.maxY - nz4.rect.minY).toBeCloseTo(h4 + 50);
    expect(nz3.rect.maxY - nz3.rect.minY).toBeCloseTo(h3);
    expect(nz2.rect.maxY - nz2.rect.minY).toBeCloseTo(h2);
    expect(nz1.rect.maxY - nz1.rect.minY).toBeCloseTo(h1 - 50);
  });

  it("edycja DOLNEJ odblokowanej wnęki: te same dwie zablokowane środkowe bez zmian, górna wchłania różnicę", () => {
    const mod = setup4();
    const tree = buildZoneTree(mod);
    const [z1, z2, z3, z4] = zones(tree);
    tree.b.divider.lockA = true;
    tree.b.b.divider.lockA = true;
    const [h1, h2, h3, h4] = heights([z1, z2, z3, z4]);

    resizeAlongAxis(mod, tree, z1, true, h1 + 42.5, h1);

    const [nz1, nz2, nz3, nz4] = zones(buildZoneTree(mod));
    expect(nz1.rect.maxY - nz1.rect.minY).toBeCloseTo(h1 + 42.5);
    expect(nz2.rect.maxY - nz2.rect.minY).toBeCloseTo(h2);
    expect(nz3.rect.maxY - nz3.rect.minY).toBeCloseTo(h3);
    expect(nz4.rect.maxY - nz4.rect.minY).toBeCloseTo(h4 - 42.5);
  });

  it("bez żadnej blokady zachowuje się jak dawniej - zmienia bezpośredniego sąsiada", () => {
    const mod = setup4();
    const tree = buildZoneTree(mod);
    const [, , z3, z4] = zones(tree);
    const [h3, h4] = heights([z3, z4]);

    resizeAlongAxis(mod, tree, z4, true, h4 + 30, h4);

    const [, , nz3, nz4] = zones(buildZoneTree(mod));
    expect(nz4.rect.maxY - nz4.rect.minY).toBeCloseTo(h4 + 30);
    expect(nz3.rect.maxY - nz3.rect.minY).toBeCloseTo(h3 - 30);
  });

  it("gdy wszystko po drodze jest zablokowane, spada do starego zachowania (najbliższy dzielnik)", () => {
    const mod = setup4();
    const tree = buildZoneTree(mod);
    tree.divider.lockA = true; // zablokuj z1 (dół)
    tree.b.divider.lockA = true; // zablokuj z2
    tree.b.b.divider.lockA = true; // zablokuj z3
    const [, , z3, z4] = zones(tree);
    const [h3, h4] = heights([z3, z4]);

    resizeAlongAxis(mod, tree, z4, true, h4 + 20, h4);

    const [, , nz3, nz4] = zones(buildZoneTree(mod));
    expect(nz4.rect.maxY - nz4.rect.minY).toBeCloseTo(h4 + 20);
    expect(nz3.rect.maxY - nz3.rect.minY).toBeCloseTo(h3 - 20); // nie ma dokąd oddać zmiany
  });
});

// Zgłoszony błąd (trzeci etap, na prawdziwym projekcie): 6 wnęk, zablokowane
// wszystkie oprócz dwóch DOLNYCH (bezpośrednio sąsiadujących ze sobą). Pierwsza
// (poprawiona) wersja resizeAlongAxis szukała "pierwszego niezablokowanego
// PRZODKA" po CAŁYCH gałęziach drzewa, więc mimo że sąsiadka (druga wnęka)
// była naprawdę odblokowana, różnica i tak trafiała częściowo do niej
// proporcjonalnie, a resztę wypychała aż do zupełnie innej, odległej wnęki
// (u góry) - łamiąc po drodze blokady kilku wnęk, które miały zostać bez
// zmian. Odtwarza dokładnie warstwę zamków z realnego projektu (dwa ostatnie
// poziomy zablokowane PO OBU stronach tego samego dzielnika na raz).
describe("resizeAlongAxis - realny przypadek: 6 wnęk, zablokowane wszystkie oprócz dwóch dolnych", () => {
  function setup6() {
    // Wysoki słupek (jak w zgłoszeniu) - przy domyślnej wysokości 720 mm 6
    // wnęk wychodzi po ~99 mm, za mało, żeby zmieścić realistyczną (40-50 mm)
    // zmianę bez przekroczenia sąsiedniej wnęki.
    const mod = baseModule({ elements: [], dimensions: { width: 550, height: 2082, depth: 473 } });
    setProject(freshProject({ modules: [mod] }));
    const root = buildZoneTree(mod);
    addEvenShelves(mod, root, 5); // 6 wnęk: dół -> góra
    return mod;
  }
  // root.a=z1(dół) .. root.b.b.b.b.b=z6(góra), jak w setup4, ale o dwa poziomy głębiej
  function zones6(tree) {
    return [tree.a, tree.b.a, tree.b.b.a, tree.b.b.b.a, tree.b.b.b.b.a, tree.b.b.b.b.b];
  }
  function heights(zs) { return zs.map((n) => n.rect.maxY - n.rect.minY); }

  it("zmiana dolnej wnęki na konkretny wymiar zmienia TYLKO sąsiadkę - reszta (w tym podwójnie zablokowana góra) zostaje bez zmian", () => {
    const mod = setup6();
    const tree = buildZoneTree(mod);
    const [z1, z2, z3, z4, z5, z6] = zones6(tree);
    tree.b.b.divider.lockA = true; // zablokuj z3
    tree.b.b.b.divider.lockA = true; // zablokuj z4
    tree.b.b.b.b.divider.lockA = true; // zablokuj z5
    tree.b.b.b.b.divider.lockB = true; // I zablokuj z6 - ten sam dzielnik, obie strony na raz (jak w realnym projekcie)
    const [h1, h2, h3, h4, h5, h6] = heights([z1, z2, z3, z4, z5, z6]);
    const newH1 = h1 + 40; // odpowiednik "zmień pierwszą wnękę na 360mm" ze zgłoszenia (326 -> 366)

    resizeAlongAxis(mod, tree, z1, true, newH1, h1);

    const [n1, n2, n3, n4, n5, n6] = zones6(buildZoneTree(mod));
    expect(n1.rect.maxY - n1.rect.minY).toBeCloseTo(newH1);
    expect(n2.rect.maxY - n2.rect.minY).toBeCloseTo(h2 - 40); // jedyna, która ma się zmienić
    expect(n3.rect.maxY - n3.rect.minY).toBeCloseTo(h3);
    expect(n4.rect.maxY - n4.rect.minY).toBeCloseTo(h4);
    expect(n5.rect.maxY - n5.rect.minY).toBeCloseTo(h5);
    expect(n6.rect.maxY - n6.rect.minY).toBeCloseTo(h6);
  });

  it("zmiana większa niż mieści sąsiadka zostaje docięta do MIN_GAP zamiast przeskoczyć na kolejną półkę", () => {
    const mod = setup6();
    const tree = buildZoneTree(mod);
    const [z1, z2, z3] = zones6(tree);
    const [h1, h2, h3] = heights([z1, z2, z3]);

    resizeAlongAxis(mod, tree, z1, true, h1 + h2, h1); // żąda całej wysokości sąsiadki na raz - za dużo

    const [n1, n2, n3] = zones6(buildZoneTree(mod));
    expect(n2.rect.maxY - n2.rect.minY).toBeGreaterThanOrEqual(30 - 0.01); // MIN_GAP, nie ujemna/zerowa
    expect(n1.rect.maxY - n1.rect.minY).toBeCloseTo(h1 + h2 - 30);
    expect(n3.rect.maxY - n3.rect.minY).toBeCloseTo(h3); // dalsze wnęki nietknięte, kolejność się nie posypała
  });
});
