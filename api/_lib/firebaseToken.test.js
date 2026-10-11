import { describe, it, expect, beforeAll } from "vitest";
import { verifyFirebaseIdToken } from "./firebaseToken.js";

// Własna para kluczy RSA zamiast kluczy Google - sprawdzamy podpis i pola tokenu.
const PROJECT = "generator-stolarski-next";
const NOW = 1_800_000_000;
let privateKey, jwk;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]);
  privateKey = pair.privateKey;
  jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
async function makeToken(payloadOver = {}, headerOver = {}) {
  const header = { alg: "RS256", kid: "k1", typ: "JWT", ...headerOver };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "uid-1",
    iat: NOW - 10, exp: NOW + 3600, email: "mleszko32@gmail.com", email_verified: true, ...payloadOver,
  };
  const input = `${b64(header)}.${b64(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(sig).toString("base64url")}`;
}
const opts = { projectId: PROJECT, getKeys: async () => [jwk], nowSec: NOW };

describe("verifyFirebaseIdToken", () => {
  it("przyjmuje poprawny token i zwraca e-mail", async () => {
    const payload = await verifyFirebaseIdToken(await makeToken(), opts);
    expect(payload.email).toBe("mleszko32@gmail.com");
  });

  it("odrzuca zmieniony podpis (podmieniony e-mail)", async () => {
    const [h, , s] = (await makeToken()).split(".");
    const forged = `${h}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "x", iat: NOW, exp: NOW + 10, email: "obcy@example.com", email_verified: true })}.${s}`;
    await expect(verifyFirebaseIdToken(forged, opts)).rejects.toThrow("podpis");
  });

  it("odrzuca token wygasły, dla innego projektu i bez potwierdzonego e-maila", async () => {
    await expect(verifyFirebaseIdToken(await makeToken({ exp: NOW - 3600 }), opts)).rejects.toThrow("wygasł");
    await expect(verifyFirebaseIdToken(await makeToken({ aud: "inny" }), opts)).rejects.toThrow("innego projektu");
    await expect(verifyFirebaseIdToken(await makeToken({ email_verified: false }), opts)).rejects.toThrow("e-maila");
  });

  it("odrzuca brak tokenu, nieznany klucz i inny algorytm", async () => {
    await expect(verifyFirebaseIdToken("", opts)).rejects.toThrow();
    await expect(verifyFirebaseIdToken(await makeToken({}, { kid: "k2" }), opts)).rejects.toThrow("klucz");
    await expect(verifyFirebaseIdToken(await makeToken({}, { alg: "HS256" }), opts)).rejects.toThrow("podpis");
  });
});
