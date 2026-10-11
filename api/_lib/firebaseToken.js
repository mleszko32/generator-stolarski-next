// api/_lib/firebaseToken.js
//
// Weryfikacja tokenu ID Firebase (JWT RS256) po stronie funkcji Vercela, bez firebase-admin:
// podpis sprawdzany WebCrypto kluczami publicznymi Google (JWK, cache wg Cache-Control),
// do tego wystawca, odbiorca, ważność i potwierdzony e-mail. Katalog `_lib` - Vercel nie
// robi z niego osobnego endpointu.
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_S = 300;

let jwksCache = { keys: null, expires: 0 };

export async function fetchGoogleJwks() {
  const now = Date.now();
  if (jwksCache.keys && now < jwksCache.expires) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Nie udało się pobrać kluczy Google (${res.status}).`);
  const body = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1]) || 3600;
  jwksCache = { keys: body.keys || [], expires: now + maxAge * 1000 };
  return jwksCache.keys;
}

const b64urlToBytes = (s) => Uint8Array.from(Buffer.from(s, "base64url"));
const decodePart = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// Zwraca payload tokenu albo rzuca błąd z czytelnym opisem.
// opts: { projectId, getKeys = fetchGoogleJwks, nowSec = teraz }
export async function verifyFirebaseIdToken(token, { projectId, getKeys = fetchGoogleJwks, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== "string" || token.split(".").length !== 3) throw new Error("Brak lub zły format tokenu.");
  const [h, p, sig] = token.split(".");
  let header, payload;
  try { header = decodePart(h); payload = decodePart(p); } catch (e) { throw new Error("Nieczytelny token.", { cause: e }); }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Nieobsługiwany podpis tokenu.");

  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Nieznany klucz podpisu tokenu.");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("Zły podpis tokenu.");

  if (payload.aud !== projectId) throw new Error("Token dla innego projektu.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Zły wystawca tokenu.");
  if (!payload.sub) throw new Error("Token bez użytkownika.");
  if (!(payload.exp > nowSec - CLOCK_SKEW_S)) throw new Error("Token wygasł.");
  if (!(payload.iat <= nowSec + CLOCK_SKEW_S)) throw new Error("Token z przyszłości.");
  if (!payload.email || payload.email_verified !== true) throw new Error("Konto bez potwierdzonego e-maila.");
  return payload;
}
