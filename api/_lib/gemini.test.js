import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("./firebaseToken.js", () => ({ verifyFirebaseIdToken: h.verify }));
const { default: handler } = await import("../gemini.js");

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const req = (over = {}) => ({
  method: "POST",
  headers: { authorization: "Bearer tok" },
  body: { base64Image: "aGVsbG8=", mimeType: "image/jpeg" },
  ...over,
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  h.verify.mockReset().mockResolvedValue({ email: "mleszko32@gmail.com" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("api/gemini", () => {
  it("405 dla metody innej niż POST", async () => {
    const res = mockRes();
    await handler(req({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("401 bez poprawnego tokenu - nic nie idzie do Gemini", async () => {
    h.verify.mockRejectedValue(new Error("Brak tokenu."));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(req({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 dla konta spoza listy", async () => {
    h.verify.mockResolvedValue({ email: "obcy@example.com" });
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(403);
  });

  it("400 dla złego zapytania", async () => {
    const res = mockRes();
    await handler(req({ body: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it("klucz w nagłówku (nie w adresie), zwraca sparsowane moduły", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '[{"type":"base_cabinet"}]' }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ modules: [{ type: "base_cabinet" }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("key=");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
  });

  it("błąd Gemini -> 502 bez surowej odpowiedzi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) }));
    const res = mockRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(502);
  });
});
