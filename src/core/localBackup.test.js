import { describe, it, expect, beforeEach, vi } from "vitest";

// storage.js ciągnie Firebase - do testu kopii lokalnej wystarczy stub z jedną
// funkcją (czy są niezapisane zmiany), którą sterujemy z testu.
const h = vi.hoisted(() => ({ unsaved: true }));
vi.mock("./storage.js", () => ({ hasUnsavedChanges: () => h.unsaved }));

const { runLocalBackupTick, readLocalBackup, clearLocalBackup } = await import("./localBackup.js");
const { state } = await import("./state.js");

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeLocalStorage());
  clearLocalBackup();
  h.unsaved = true;
  state.project.modules = [{ id: "m1", name: "A", dimensions: { width: 600, height: 720, depth: 513 }, elements: [] }];
  state.loadedProjectId = "Projekt X";
});

describe("kopia lokalna projektu", () => {
  it("zapisuje kopię przy niezapisanych zmianach i pozwala ją odczytać", () => {
    expect(runLocalBackupTick()).toBe("written");
    const b = readLocalBackup();
    expect(b.loadedProjectId).toBe("Projekt X");
    expect(b.project.modules[0].id).toBe("m1");
    expect(typeof b.savedAt).toBe("number");
  });

  it("nie zapisuje drugi raz tej samej treści", () => {
    runLocalBackupTick();
    expect(runLocalBackupTick()).toBe("skipped");
  });

  it("kasuje kopię, gdy wszystko jest już zapisane w chmurze", () => {
    runLocalBackupTick();
    h.unsaved = false;
    expect(runLocalBackupTick()).toBe("cleared");
    expect(readLocalBackup()).toBeNull();
  });

  it("pusty projekt nie kasuje istniejącej kopii (czeka na decyzję użytkownika)", () => {
    runLocalBackupTick();
    state.project.modules = [];
    expect(runLocalBackupTick()).toBe("skipped");
    expect(readLocalBackup()).not.toBeNull();
  });

  it("uszkodzona kopia jest ignorowana", () => {
    localStorage.setItem("gsn-local-backup-v1", "{nie json");
    expect(readLocalBackup()).toBeNull();
  });

  it("brak localStorage nie wywala funkcji", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(runLocalBackupTick()).toBe("skipped");
    expect(readLocalBackup()).toBeNull();
  });
});
