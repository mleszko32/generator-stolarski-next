import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HELP_SECTIONS } from "./helpContent.js";
import { SECTIONS as PROP_SECTIONS } from "./propertiesShell.js";

// Instrukcja ma się zgadzać z ekranem: nazwy sekcji huba i prawego panelu czytamy z kodu
// i sprawdzamy, że rozdziały je wymieniają (zmiana nazwy w UI bez instrukcji = czerwony test).
const body = (id) => HELP_SECTIONS.find((s) => s.id === id).body;

describe("instrukcja obsługi", () => {
  it("rozdziały mają unikalne id, tytuł, ikonę i treść", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    HELP_SECTIONS.forEach((s) => {
      expect(s.title).toBeTruthy();
      expect(s.icon).toMatch(/^[a-z0-9-]+$/);
      expect(s.body.trim().length).toBeGreaterThan(50);
    });
  });

  it("rozdział Produkcja wymienia wszystkie sekcje huba (poza Kosztorysem - osobny rozdział)", () => {
    const src = readFileSync(new URL("./productionHub.js", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("const SECTIONS = ["), src.indexOf("];", src.indexOf("const SECTIONS = [")));
    const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]).filter((l) => l !== "Kosztorys");
    expect(labels.length).toBeGreaterThan(5);
    labels.forEach((l) => expect(body("produkcja")).toContain(`<b>${l}</b>`));
    expect(body("wycena")).toContain("<b>Kosztorys</b>");
  });

  it("rozdział Właściwości wymienia sekcje prawego panelu", () => {
    ["wymiary", "front", "szuflady", "konstrukcja", "nogi", "zawiasy", "naroznik"].forEach((k) =>
      expect(body("wlasciwosci")).toContain(`<b>${PROP_SECTIONS[k].label}</b>`));
  });
});
