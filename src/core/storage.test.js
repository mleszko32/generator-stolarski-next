import { describe, it, expect, beforeEach, vi } from "vitest";

// Firestore w pamięci: ścieżka dokumentu -> dane. Wystarczy do sprawdzenia logiki
// historii wersji (archiwizacja, ograniczanie częstotliwości, przywracanie).
const h = vi.hoisted(() => {
  const store = new Map();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const auth = { currentUser: { email: "mleszko32@gmail.com" } };
  return { store, clone, auth };
});

vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
vi.mock("firebase/auth", () => ({
  getAuth: () => h.auth,
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock("firebase/firestore", () => {
  const { store, clone } = h;
  const ref = (_db, ...seg) => ({ path: seg.join("/"), id: seg[seg.length - 1] });
  const childrenOf = (colPath) =>
    [...store.keys()].filter((p) => p.startsWith(colPath + "/") && !p.slice(colPath.length + 1).includes("/"));
  return {
    getFirestore: () => ({}),
    doc: ref,
    collection: ref,
    setDoc: async (r, data) => { store.set(r.path, clone(data)); },
    getDoc: async (r) => ({ exists: () => store.has(r.path), data: () => clone(store.get(r.path)) }),
    getDocs: async (c) => {
      const docs = childrenOf(c.path).map((p) => ({ id: p.split("/").pop(), data: () => clone(store.get(p)) }));
      return { docs, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
    },
    deleteDoc: async (r) => { store.delete(r.path); },
    writeBatch: () => {
      const ops = [];
      return {
        set: (r, data) => ops.push(() => store.set(r.path, clone(data))),
        delete: (r) => ops.push(() => store.delete(r.path)),
        commit: async () => { ops.forEach((o) => o()); },
      };
    },
  };
});

const storage = await import("./storage.js");
const { state } = await import("./state.js");

const versionIds = (id) => [...h.store.keys()].filter((p) => p.startsWith(`projects/${id}/versions/`));
const versionMarkers = async (id) => {
  const list = await storage.listProjectVersions(id);
  return list.map((v) => JSON.parse(h.store.get(`projects/${id}/versionData/${v.id}`).json).marker);
};

beforeEach(() => {
  h.store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
  vi.stubGlobal("alert", vi.fn());
  vi.spyOn(console, "warn").mockImplementation(() => {});
  state.project.modules = [];
  state.project.marker = 0;
  state.loadedProjectId = null;
});

describe("historia wersji projektu", () => {
  it("zapis ręczny istniejącego projektu archiwizuje poprzednią treść i nowy stan", async () => {
    h.store.set("projects/P", { name: "P", modules: [], marker: 1 });
    state.loadedProjectId = "P";
    state.project.marker = 2;

    await storage.saveProjectToCloud("P");

    expect(h.store.get("projects/P").marker).toBe(2);
    const markers = await versionMarkers("P");
    expect(markers.sort()).toEqual([1, 2]);
  });

  it("nic nie archiwizuje drugi raz, gdy treść się nie zmieniła", async () => {
    state.loadedProjectId = "P";
    state.project.marker = 5;
    await storage.saveProjectToCloud("P");
    vi.advanceTimersByTime(1000);
    await storage.saveProjectToCloud("P");

    expect(versionIds("P")).toHaveLength(1);
  });

  it("autozapis archiwizuje nadpisywaną treść najwyżej raz na 10 minut", async () => {
    h.store.set("projects/P", { name: "P", modules: [], marker: 1 });
    state.loadedProjectId = "P";
    await storage.loadProjectFromCloud("P"); // ustawia migawkę i zeruje sesję wersji

    state.project.marker = 2;
    expect(await storage.saveProjectSilently()).toBe("saved");
    expect(await versionMarkers("P")).toEqual([1]);

    vi.advanceTimersByTime(3 * 60 * 1000);
    state.project.marker = 3;
    expect(await storage.saveProjectSilently()).toBe("saved");
    expect(versionIds("P")).toHaveLength(1); // za wcześnie na kolejną wersję

    vi.advanceTimersByTime(8 * 60 * 1000);
    state.project.marker = 4;
    await storage.saveProjectSilently();
    expect((await versionMarkers("P")).sort()).toEqual([1, 3]);
  });

  it("przywrócenie ustawia wybraną wersję i zachowuje bieżący stan w historii", async () => {
    h.store.set("projects/P", { name: "P", modules: [], marker: 1 });
    state.loadedProjectId = "P";
    state.project.marker = 2;
    await storage.saveProjectToCloud("P"); // wersje: 1 (przed) i 2 (po)
    state.project.marker = 9; // niezapisana zmiana

    const list = await storage.listProjectVersions("P");
    const v1 = list.find((v) => JSON.parse(h.store.get(`projects/P/versionData/${v.id}`).json).marker === 1);
    vi.advanceTimersByTime(1000);
    expect(await storage.restoreProjectVersion("P", v1.id)).toBe(true);

    expect(state.project.marker).toBe(1);
    expect(h.store.get("projects/P").marker).toBe(1);
    expect(await versionMarkers("P")).toContain(9); // stan sprzed przywrócenia
  });

  it("usunięcie projektu usuwa też jego historię", async () => {
    state.loadedProjectId = "P";
    await storage.saveProjectToCloud("P");
    expect(versionIds("P").length).toBeGreaterThan(0);

    await storage.deleteProjectFromCloud("P");

    expect([...h.store.keys()].filter((p) => p.startsWith("projects/P"))).toEqual([]);
  });

  it("trzyma tylko najnowsze wersje (limit 60)", async () => {
    state.loadedProjectId = "P";
    for (let i = 1; i <= 65; i++) {
      state.project.marker = i;
      vi.advanceTimersByTime(1000);
      await storage.saveProjectToCloud("P");
    }
    await vi.advanceTimersByTimeAsync(10);
    const markers = await versionMarkers("P");
    expect(markers.length).toBeLessThanOrEqual(61); // przycinanie działa w tle, po zapisie
    expect(markers).toContain(65);
    expect(markers).not.toContain(1);
  });
});
