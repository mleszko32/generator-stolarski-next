// src/core/priceLibrary.js
//
// Baza domyślnych cen (materiały płytowe, katalog materiałów frontów, okucia,
// cena cięcia formatki):
// jeden zapisany "zrzut" cennika w localStorage przeglądarki, który można
// nałożyć na dowolny projekt zamiast wpisywać wszystkie ceny od zera za
// każdym razem (zgłoszona potrzeba). Jeden slot, nie lista jak biblioteka
// szafek (core/moduleLibrary.js) - w przeciwieństwie do szafek nie ma
// naturalnego przypadku trzymania wielu różnych cenników naraz. Eksport/
// import JSON do przenoszenia bazy między komputerami, ten sam wzorzec co
// biblioteka szafek.
const KEY = "gsn-price-defaults-v1";

function storageOrNull() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (e) {
    return null;
  }
}

function isValidSnapshot(s) {
  return !!s && typeof s === "object"
    && !!s.materials && typeof s.materials === "object"
    && !!s.hardware && typeof s.hardware === "object"
    && Array.isArray(s.frontMaterials);
}

export function loadPriceDefaults() {
  const ls = storageOrNull();
  if (!ls) return null;
  try {
    const s = JSON.parse(ls.getItem(KEY));
    return isValidSnapshot(s) ? s : null;
  } catch (e) {
    return null;
  }
}

// Zapisuje bieżący cennik projektu (pricing = state.project.pricing) jako nową bazę domyślnych cen.
export function savePriceDefaults(pricing) {
  const ls = storageOrNull();
  if (!ls) return null;
  const snapshot = {
    savedAt: Date.now(),
    materials: { ...(pricing.materials || {}) },
    frontMaterials: JSON.parse(JSON.stringify(pricing.frontMaterials || [])),
    hardware: { ...(pricing.hardware || {}) },
    cuttingPerPart: parseFloat(pricing.cuttingPerPart) || 0,
  };
  try {
    ls.setItem(KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch (e) {
    console.warn("Nie udało się zapisać bazy cen:", e);
    return null;
  }
}

export function exportPriceDefaultsJson() {
  const snapshot = loadPriceDefaults();
  return JSON.stringify({ format: "gsn-price-defaults", version: 1, ...snapshot }, null, 2);
}

// Nadpisuje bazę danymi z pliku JSON (eksportu z innego komputera). Zwraca
// false przy niepoprawnym pliku, inaczej true.
export function importPriceDefaultsJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return false; }
  const snapshot = {
    savedAt: Date.now(),
    materials: data && data.materials,
    frontMaterials: data && data.frontMaterials,
    hardware: data && data.hardware,
    ...(data && data.cuttingPerPart != null ? { cuttingPerPart: data.cuttingPerPart } : {}),
  };
  if (!isValidSnapshot(snapshot)) return false;
  const ls = storageOrNull();
  if (!ls) return false;
  try {
    ls.setItem(KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    return false;
  }
}

// Nakłada zapisaną bazę na cennik AKTYWNEGO projektu (pricing =
// state.project.pricing). Nigdy nie usuwa pozycji, których baza nie zna -
// tylko nadpisuje wartości dla tego, co baza ma, i dopisuje nowe materiały
// frontów. Materiały frontów dopasowywane PO NAZWIE (nie po id - id z bazy i
// z projektu to niezależne, wygenerowane osobno ciągi): ten sam materiał
// nazwany tak samo w obu miejscach dostaje nową cenę zamiast duplikować się
// jako druga pozycja o tej samej nazwie.
export function applyPriceDefaults(pricing, snapshot) {
  if (!pricing || !snapshot) return;
  Object.keys(snapshot.materials || {}).forEach(cat => {
    if (cat in (pricing.materials || {})) pricing.materials[cat] = parseFloat(snapshot.materials[cat]) || 0;
  });
  if (!Array.isArray(pricing.frontMaterials)) pricing.frontMaterials = [];
  (snapshot.frontMaterials || []).forEach(src => {
    const existing = pricing.frontMaterials.find(m => m.name === src.name);
    if (existing) existing.pricePerM2 = parseFloat(src.pricePerM2) || 0;
    else pricing.frontMaterials.push({
      id: 'mat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: src.name,
      pricePerM2: parseFloat(src.pricePerM2) || 0,
    });
  });
  pricing.hardware = { ...(pricing.hardware || {}), ...(snapshot.hardware || {}) };
  // Starsze bazy (sprzed ceny cięcia) nie mają tego pola - wtedy cena w projekcie zostaje.
  if (snapshot.cuttingPerPart != null) pricing.cuttingPerPart = parseFloat(snapshot.cuttingPerPart) || 0;
}
