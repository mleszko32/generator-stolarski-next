import { describe, it, expect } from "vitest";
import { normalizeStatus, projectListEntry, filterProjects, countByStatus, formatSavedAt, statusLabel } from "./projectStatus.js";

describe("projectStatus", () => {
  it("brak albo nieznany status = robocze", () => {
    expect(normalizeStatus(undefined)).toBe("roboczy");
    expect(normalizeStatus("xyz")).toBe("roboczy");
    expect(normalizeStatus("wycena")).toBe("wycena");
    expect(statusLabel("zakonczony")).toBe("Zakończone");
  });

  it("skrót projektu do listy", () => {
    expect(projectListEntry("A", { status: "wycena", savedAt: 5, modules: [{}, {}] }))
      .toEqual({ id: "A", status: "wycena", savedAt: 5, modules: 2 });
    expect(projectListEntry("B", {})).toEqual({ id: "B", status: "roboczy", savedAt: null, modules: 0 });
  });

  const list = [
    { id: "Żupnicza 17A – kuchnia", status: "roboczy", savedAt: 100 },
    { id: "BEMOWO KUCHNIA", status: "wycena", savedAt: null },
    { id: "Białołęka szafa", status: "roboczy", savedAt: 300 },
    { id: "Alfa", status: "roboczy", savedAt: null },
  ];

  it("filtruje po zakładce i sortuje od najnowszych, bez daty alfabetycznie na końcu", () => {
    expect(filterProjects(list, { status: "roboczy" }).map((p) => p.id))
      .toEqual(["Białołęka szafa", "Żupnicza 17A – kuchnia", "Alfa"]);
  });

  it("szuka bez polskich znaków i wielkości liter", () => {
    expect(filterProjects(list, { query: "zupnicza" }).map((p) => p.id)).toEqual(["Żupnicza 17A – kuchnia"]);
    expect(filterProjects(list, { query: "BIALOLEKA" }).map((p) => p.id)).toEqual(["Białołęka szafa"]);
  });

  it("liczy projekty w zakładkach", () => {
    expect(countByStatus(list)).toEqual({ roboczy: 3, wycena: 1, zakonczony: 0 });
  });

  it("formatuje datę zapisu", () => {
    const now = new Date(2026, 10, 8, 18, 0).getTime();
    expect(formatSavedAt(new Date(2026, 10, 8, 9, 5).getTime(), now)).toBe("dziś 9:05");
    expect(formatSavedAt(new Date(2026, 10, 7, 23, 0).getTime(), now)).toBe("wczoraj 23:00");
    expect(formatSavedAt(new Date(2026, 10, 3, 12, 0).getTime(), now)).toBe("3.11.2026");
    expect(formatSavedAt(null, now)).toBe("");
  });
});
