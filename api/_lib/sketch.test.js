import { describe, it, expect } from "vitest";
import { validateSketchRequest, extractModules, MAX_BASE64_LENGTH, MAX_MODULES } from "./sketch.js";

describe("validateSketchRequest", () => {
  it("przyjmuje obraz base64 w obsługiwanym formacie", () => {
    expect(validateSketchRequest({ base64Image: "aGVsbG8=", mimeType: "image/jpeg" })).toMatchObject({ ok: true });
  });

  it("odrzuca brak treści, zły format, za duży obraz i nie-base64", () => {
    expect(validateSketchRequest(undefined)).toMatchObject({ ok: false, status: 400 });
    expect(validateSketchRequest({ base64Image: "aGVsbG8=", mimeType: "text/html" })).toMatchObject({ ok: false, status: 415 });
    expect(validateSketchRequest({ base64Image: "a".repeat(MAX_BASE64_LENGTH + 1), mimeType: "image/png" })).toMatchObject({ ok: false, status: 413 });
    expect(validateSketchRequest({ base64Image: "<script>", mimeType: "image/png" })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("extractModules", () => {
  const reply = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });

  it("wyciąga tablicę z odpowiedzi (także w bloku ```json)", () => {
    expect(extractModules(reply('```json\n[{"type":"base_cabinet"}]\n```'))).toEqual([{ type: "base_cabinet" }]);
  });

  it("zablokowana odpowiedź / zły JSON / nie-tablica dają czytelny błąd", () => {
    expect(() => extractModules({ promptFeedback: { blockReason: "SAFETY" } })).toThrow("SAFETY");
    expect(() => extractModules(reply("nie wiem"))).toThrow("JSON");
    expect(() => extractModules(reply('{"a":1}'))).toThrow("listy");
  });

  it("ogranicza liczbę szafek", () => {
    const many = JSON.stringify(Array.from({ length: MAX_MODULES + 5 }, () => ({})));
    expect(extractModules(reply(many))).toHaveLength(MAX_MODULES);
  });
});
