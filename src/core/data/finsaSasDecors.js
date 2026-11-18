// src/core/data/finsaSasDecors.js
//
// Płyty Finsa (fornirowane, laminowana, MDF malowane / barwione w masie) z cennika SAS - nazwy płyt i indeksy SAS,
// bez cen (ceny po rabacie są poufne, siedzą w katalogu SAS w Firestore). Pominięte płyty surowe trudnopalne /
// wilgocioodporne - to materiały konstrukcyjne, nie dekory. Przy nowym cenniku sprawdź indeksy.
// Heban nie ma płyt fornirowanych ani Finsy (sprawdzono 11.2026: tylko dekor Swiss Krono D60654 „Dąb fornir” - jest
// już w swissKronoDecors.js).
export const FINSA_SAS_DECORS = Object.freeze([
  { group: "laminowane", name: "White SR209 ST Brilho 18mm SUPERPAN DECOR", sas: "402733-940" },
  { group: "fornirowane", name: "Fornirowana Dąb Biały Europejski Pasiak ROB EUR 19mm A/B+ SUPERPAN NATUR", sas: "406947-450" },
  { group: "fornirowane", name: "Fornirowana Dąb Biały Europejski Pasiak ROB EUR 19mm AB/B FIMANATUR", sas: "406170-610" },
  { group: "fornirowane", name: "Fornirowana Dąb Biały Europejski ROB EUR 19mm AB/B FIMANATUR FLADER", sas: "411532-900" },
  { group: "fornirowane", name: "Fornirowana Dąb Biały Europejski Pasiak ROB EUR 20mm A+/B MDF FIBRACOLOUR NEGRO EZ NATUR czarna barwiona w masie", sas: "410386-490" },
  { group: "fornirowane", name: "Fornirowana Orzech amerykański NOGAL 19mm A/B SUPERPAN NATUR", sas: "405377-410" },
  { group: "fornirowane", name: "Fornirowana Jesion FRESNO 19mm A/B SUPERPAN NATUR", sas: "405377-400" },
  { group: "fornirowane", name: "Fornirowana Buk parzony HAYA 19mm A/B SUPERPAN NATUR", sas: "405377-390" },
  { group: "MDF", name: "MDF Blanco biała 18mm 3660x2100 FIBRAPLAST dwustronna", sas: "410461-930" },
  { group: "MDF", name: "MDF surowy 18mm 3660x2100 FIBRAPAN", sas: "400219-880" },
  { group: "MDF", name: "MDF FIBRACOLOUR NEGRO czarna barwiona w masie 18mm", sas: "408277-500" },
  { group: "MDF", name: "MDF FIBRACOLOUR NEGRO czarna barwiona w masie 6mm", sas: "407928-350" },
  { group: "MDF", name: "MDF FIBRACOLOUR NEGRO czarna barwiona w masie 19mm", sas: "401741-710" },
  { group: "MDF", name: "MDF FIBRACOLOUR NEGRO czarna barwiona w masie 16mm", sas: "402475-480" },
]);
