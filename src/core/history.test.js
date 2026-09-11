import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resetHistory,
  scheduleCheckpoint,
  undo,
  redo,
  canUndo,
  canRedo,
} from "./history.js";
import { state } from "./state.js";
import { freshProject, baseModule, setProject } from "../test/fixtures.js";

// scheduleCheckpoint() jest debounce'owane (DEBOUNCE_MS w history.js) — testy
// operują na fałszywych timerach i sami przesuwają zegar zamiast czekać.
const DEBOUNCE_MS = 600;

const setName = (name) =>
  setProject({ ...freshProject(), modules: [baseModule({ id: "m1", name })] });

const currentName = () => state.project.modules[0].name;

describe("history (cofnij/wprzód)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setName("Szafka A");
    resetHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("świeży start: nic do cofnięcia ani ponowienia", () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it("scheduleCheckpoint zatwierdza zmianę dopiero po ucichnięciu debounce'u", () => {
    setName("Szafka ZMIENIONA");
    scheduleCheckpoint();

    expect(canUndo()).toBe(false); // jeszcze nie zdebounce'owane
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(canUndo()).toBe(true);
  });

  it("wiele wywołań scheduleCheckpoint w oknie debounce'u = jeden krok historii", () => {
    for (let i = 0; i < 5; i++) {
      setName(`Krok ${i}`);
      scheduleCheckpoint();
      vi.advanceTimersByTime(100); // krócej niż DEBOUNCE_MS — kolejne wywołania resetują timer
    }
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(canUndo()).toBe(true);

    // jeden undo cofa od razu do stanu SPRZED całej serii zmian
    undo();
    expect(currentName()).toBe("Szafka A");
    expect(canUndo()).toBe(false);
  });

  it("undo przywraca poprzedni stan i pozwala na redo", () => {
    setName("Po zmianie");
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(currentName()).toBe("Po zmianie");

    const undone = undo();
    expect(undone).toBe(true);
    expect(currentName()).toBe("Szafka A");
    expect(canRedo()).toBe(true);

    const redone = redo();
    expect(redone).toBe(true);
    expect(currentName()).toBe("Po zmianie");
    expect(canRedo()).toBe(false);
  });

  it("undo() bez wcześniejszego zdebounce'owania i tak zatwierdza pending zmianę przed cofnięciem", () => {
    setName("Świeża, niezdebouncowana zmiana");
    scheduleCheckpoint(); // timer NIE odpalony

    const undone = undo();
    expect(undone).toBe(true);
    expect(currentName()).toBe("Szafka A");
  });

  it("nowa zmiana po undo() czyści stos redo", () => {
    setName("A");
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    undo();
    expect(canRedo()).toBe(true);

    setName("B (nowa gałąź)");
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(canRedo()).toBe(false);
  });

  it("undo/redo bez żadnej historii nic nie robi", () => {
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
  });

  it("resetHistory czyści oba stosy i ustawia nowy punkt zerowy", () => {
    setName("Coś");
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(canUndo()).toBe(true);

    resetHistory();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it("po cofnięciu usunięcia aktywnego modułu przywraca activeModuleId", () => {
    setProject({
      ...freshProject(),
      modules: [baseModule({ id: "m1", name: "M1" }), baseModule({ id: "m2", name: "M2" })],
    });
    state.activeModuleId = "m2";
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    // "usuwamy" aktywny moduł m2 i przełączamy zaznaczenie na m1
    state.project.modules = state.project.modules.filter((m) => m.id !== "m2");
    state.activeModuleId = "m1";
    scheduleCheckpoint();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(undo()).toBe(true);
    expect(state.project.modules.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(state.activeModuleId).toBe("m2");
  });
});
