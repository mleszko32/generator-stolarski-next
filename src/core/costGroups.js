// src/core/costGroups.js
//
// Grupy okuć w Kosztorysie (ui/kosztorysModal.js) - żeby długa lista okuć dała się czytać: szuflady, zawiasy i
// podnośniki, nóżki / złącza / drążki, okleina, reszta. Kolejność grup = kolejność w tabeli. Czyste funkcje.

export const HARDWARE_GROUPS = [
  { id: "szuflady", label: "Szuflady", test: /szuflad|MOVENTO|TANDEM|MERIVOBOX|LEGRABOX|ANTARO/i },
  { id: "zawiasy", label: "Zawiasy i podnośniki", test: /zawias|prowadnik krzyżak|AVENTOS|siłownik|podnośnik|klap/i },
  { id: "nozki", label: "Nóżki, złącza, drążki", test: /nóżk|cokoł|złącz|konfirmat|kołek|drążek|wspornik/i },
  { id: "okleina", label: "Okleina", test: /okleina|obrzeże/i },
  { id: "inne", label: "Inne (kosze, okucia narożne…)", test: () => true },
];

export function hardwareGroup(name) {
  const n = String(name || "");
  return HARDWARE_GROUPS.find((g) => (typeof g.test === "function" ? g.test(n) : g.test.test(n))).id;
}

// Pozycje kosztorysu [{ name, … }] pogrupowane w kolejności HARDWARE_GROUPS: [{ id, label, items }], bez pustych grup.
export function groupHardware(items) {
  return HARDWARE_GROUPS.map((g) => ({ id: g.id, label: g.label, items: (items || []).filter((it) => hardwareGroup(it.name) === g.id) }))
    .filter((g) => g.items.length);
}
