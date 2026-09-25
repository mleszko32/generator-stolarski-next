import { describe, it, expect } from "vitest";
import { plural, describeModuleContents, buildOfferHtml, getOfferSettings } from "./offer.js";
import { freshProject, baseModule } from "../test/fixtures.js";

const cost = {
  priceBeforeDiscount: 10000, discountPercent: 10, discountAmount: 1000,
  net: 9000, vatPercent: 23, vatAmount: 2070, gross: 11070,
};

describe("plural", () => {
  it("odmienia po polsku", () => {
    expect(plural(1, "szuflada", "szuflady", "szuflad")).toBe("szuflada");
    expect(plural(3, "szuflada", "szuflady", "szuflad")).toBe("szuflady");
    expect(plural(5, "szuflada", "szuflady", "szuflad")).toBe("szuflad");
    expect(plural(12, "szuflada", "szuflady", "szuflad")).toBe("szuflad");
    expect(plural(22, "szuflada", "szuflady", "szuflad")).toBe("szuflady");
  });
});

describe("describeModuleContents", () => {
  it("liczy szuflady, drzwi i półki ruchome", () => {
    const mod = baseModule({
      elements: [
        { id: "a", typ: "front", subtype: "szuflada" },
        { id: "b", typ: "front", subtype: "szuflada" },
        { id: "c", typ: "front", subtype: "drzwi" },
        { id: "d", typ: "poziom", isStructural: false },
        { id: "e", typ: "poziom", isStructural: true },
      ],
    });
    expect(describeModuleContents(mod)).toBe("2 szuflady, 1 skrzydło drzwi, 1 półka");
  });

  it("pusta szafka nie ma opisu", () => {
    expect(describeModuleContents(baseModule())).toBe("");
  });
});

describe("buildOfferHtml", () => {
  const project = freshProject({
    name: "Kuchnia <Kowalski>",
    modules: [baseModule({ name: "Dolna 1" })],
    offer: { company: "Stolarnia Test", clientName: "Jan Kowalski", number: "12/2026", validDays: 14, notes: "Termin: 4 tygodnie" },
  });

  it("zawiera dane oferty i cenę brutto, bez marży i kosztów", () => {
    const html = buildOfferHtml({ project, cost, snapshot: null, now: new Date("2026-01-10T10:00:00") });
    expect(html).toContain("Stolarnia Test");
    expect(html).toContain("12/2026");
    expect(html).toContain("Jan Kowalski");
    expect(html).toContain("Termin: 4 tygodnie");
    expect(html).toContain("Cena brutto");
    expect(html).toContain("Rabat (10%)");
    expect(html).toContain("Dolna 1");
    expect(html.toLowerCase()).not.toContain("marża");
  });

  it("escapuje nazwę projektu (XSS)", () => {
    const html = buildOfferHtml({ project, cost, snapshot: null });
    expect(html).not.toContain("<Kowalski>");
    expect(html).toContain("&lt;Kowalski&gt;");
  });

  it("wstawia zdjęcie tylko gdy jest, i pomija rabat gdy zerowy", () => {
    const withImg = buildOfferHtml({ project, cost: { ...cost, discountPercent: 0 }, snapshot: "data:image/jpeg;base64,AAAA" });
    expect(withImg).toContain("data:image/jpeg;base64,AAAA");
    expect(withImg).not.toContain("Rabat (");
    expect(buildOfferHtml({ project, cost, snapshot: null })).not.toContain("<img");
  });

  it("ustawienia mają wartości domyślne", () => {
    expect(getOfferSettings({}).validDays).toBe(14);
  });
});
