// src/core/moduleLibrary.js
//
// Biblioteka własnych szafek: zapis skonfigurowanej szafki jako szablon i
// wstawianie jej do dowolnego projektu. Szablony leżą w localStorage przeglądarki
// (nie w chmurze), a do przeniesienia na inny komputer służy eksport/import pliku
// JSON. Wstawianie (nowe id elementów, przepisane powiązania frontów) robi
// addModuleFromTemplate w core/state.js.
const KEY = "gsn-module-library-v1";

function storageOrNull() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (e) {
    return null;
  }
}

// Szablon musi wyglądać jak moduł: wymiary i lista elementów.
function isValidModule(m) {
  return !!m && typeof m === "object" && !!m.dimensions && Array.isArray(m.elements || []);
}

export function listTemplates() {
  const ls = storageOrNull();
  if (!ls) return [];
  try {
    const list = JSON.parse(ls.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((t) => t && isValidModule(t.module)) : [];
  } catch (e) {
    return [];
  }
}

function writeTemplates(list) {
  const ls = storageOrNull();
  if (!ls) return false;
  try {
    ls.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn("Nie udało się zapisać biblioteki szafek:", e);
    return false;
  }
}

const newId = () => "tpl-" + Date.now() + Math.random().toString(36).slice(2, 6);

// Zapisuje kopię modułu pod podaną nazwą. Pozycja x i grupa dotyczą konkretnego
// projektu, więc nie wchodzą do szablonu. Zwraca zapisany wpis albo null.
export function saveTemplate(mod, name) {
  if (!isValidModule(mod)) return null;
  const copy = JSON.parse(JSON.stringify(mod));
  delete copy.groupId;
  const entry = {
    id: newId(),
    name: (name || copy.name || "Szafka").trim(),
    savedAt: Date.now(),
    type: copy.type,
    module: copy,
  };
  const list = listTemplates();
  list.push(entry);
  return writeTemplates(list) ? entry : null;
}

export function deleteTemplate(id) {
  return writeTemplates(listTemplates().filter((t) => t.id !== id));
}

export function exportLibraryJson() {
  return JSON.stringify({ format: "gsn-module-library", version: 1, templates: listTemplates() }, null, 2);
}

// Dopisuje szablony z pliku JSON do biblioteki. Zwraca liczbę dodanych albo -1
// przy niepoprawnym pliku.
export function importLibraryJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return -1; }
  const incoming = Array.isArray(data) ? data : data && Array.isArray(data.templates) ? data.templates : null;
  if (!incoming) return -1;
  const valid = incoming
    .filter((t) => t && isValidModule(t.module))
    .map((t) => ({ id: newId(), name: String(t.name || t.module.name || "Szafka"), savedAt: Date.now(), type: t.module.type, module: t.module }));
  if (valid.length === 0) return 0;
  const list = listTemplates().concat(valid);
  return writeTemplates(list) ? valid.length : -1;
}
