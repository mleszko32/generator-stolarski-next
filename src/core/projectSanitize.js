// src/core/projectSanitize.js
//
// Sito dla danych projektu z zewnątrz (chmura, historia wersji, kopia lokalna, szablon z
// biblioteki szafek / pliku JSON). UI składa HTML z szablonów tekstowych, a pola techniczne
// (id, powiązania baseZone, wymiary, ustawienia frontów) trafiają w wielu miejscach do
// atrybutów bez escapeHtml - podrzucony plik z `"><img onerror=...>` w id albo w wymiarze
// wykonałby kod w aplikacji. Tutaj:
// - wymiary i pozycja stają się liczbami,
// - z napisów technicznych znikają znaki, które mogą wyjść z atrybutu HTML / napisu JS
//   (te same znaki zamieniane wszędzie tak samo, więc powiązania między id się nie rozjeżdżają),
// - pola tekstowe użytkownika (nazwy, notatki, oferta) zostają bez zmian - są escapowane
//   przy wyświetlaniu.
// Mutuje i zwraca przekazany obiekt.

// Klucze z tekstem wpisanym przez użytkownika (wyświetlane zawsze przez escapeHtml).
const FREE_TEXT_KEYS = new Set([
  "name", "decor", "label", "notes", "contact", "company", "clientName", "number",
  "title", "description", "author", "materialName",
]);
// Poddrzewa, w których klucze obiektu są danymi (np. nazwa okucia -> cena) - ich wartości
// to liczby / tablice wartości logicznych, kluczy nie ruszamy.
const DANGEROUS = /[<>"'`&\\]/g;

const NUMERIC_DEFAULTS = {
  dimensions: { width: 600, height: 720, depth: 513 },
  position: { x: 0, y: 0, z: 0 },
};

export const safeToken = (v) => String(v).replace(DANGEROUS, "_");

function toNumber(v, fallback) {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function coerceNumbers(obj, defaults) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach((k) => {
    if (typeof obj[k] === "string" || (typeof obj[k] === "number" && !Number.isFinite(obj[k]))) {
      obj[k] = toNumber(obj[k], k in defaults ? defaults[k] : 0);
    }
  });
}

function walk(node, key) {
  if (typeof node === "string") return FREE_TEXT_KEYS.has(key) ? node : safeToken(node);
  if (Array.isArray(node)) return node.map((v) => walk(v, key));
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if ((k === "dimensions" || k === "position") && node[k] && typeof node[k] === "object" && !Array.isArray(node[k])) {
        coerceNumbers(node[k], NUMERIC_DEFAULTS[k]);
      }
      node[k] = walk(node[k], k);
    }
    if ("rotation" in node && typeof node.rotation !== "number") node.rotation = toNumber(node.rotation, 0);
  }
  return node;
}

// Cały projekt (state.project) albo pojedynczy moduł / szablon.
export function sanitizeProjectData(data) {
  return walk(data, "");
}
