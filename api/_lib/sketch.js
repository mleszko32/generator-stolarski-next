// api/_lib/sketch.js
//
// Czyste pomocnicze funkcje endpointu importu szkicu (api/gemini.js): walidacja zapytania
// i wyciągnięcie tablicy modułów z odpowiedzi Gemini.
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// Vercel przyjmuje do 4,5 MB treści zapytania; klient zmniejsza zdjęcie do ~1600 px.
export const MAX_BASE64_LENGTH = 4_000_000;
export const MAX_MODULES = 30;

export function validateSketchRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, status: 400, error: "Brak danych zapytania (JSON)." };
  const { base64Image, mimeType } = body;
  if (typeof base64Image !== "string" || !base64Image) return { ok: false, status: 400, error: "Brak obrazu." };
  if (base64Image.length > MAX_BASE64_LENGTH) return { ok: false, status: 413, error: "Zdjęcie jest za duże." };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Image)) return { ok: false, status: 400, error: "Obraz nie jest w formacie base64." };
  if (!ALLOWED_MIME.includes(mimeType)) return { ok: false, status: 415, error: "Nieobsługiwany format zdjęcia (JPG, PNG, WEBP, HEIC)." };
  return { ok: true, base64Image, mimeType };
}

// Odpowiedź generateContent -> tablica modułów (surowa; klient i tak ją sprawdza).
export function extractModules(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => p?.text || "").join("") : "";
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Model nie zwrócił wyniku (${reason}).` : "Model nie zwrócił wyniku.");
  }
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(clean); } catch (e) { throw new Error("Model zwrócił niepoprawny JSON.", { cause: e }); }
  if (!Array.isArray(parsed)) throw new Error("Model nie zwrócił listy szafek.");
  return parsed.slice(0, MAX_MODULES);
}
