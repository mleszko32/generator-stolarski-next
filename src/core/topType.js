// src/core/topType.js
//
// Zamknięcie góry korpusu (construction.topType): 'pelny' wieniec, 'trawersy_poziom', 'trawersy_pion'
// albo 'brak' - bez wieńca górnego (szafka pod blatem, np. szufladki biurka przykręcone do blatu):
// wnętrze sięga do górnej krawędzi boków, nie ma formatki ani wierceń wieńca górnego.

export const TOP_TYPES = [
  ["pelny", "Pełny wieniec"],
  ["trawersy_poziom", "Trawersy poziome"],
  ["trawersy_pion", "Trawersy pionowe"],
  ["brak", "Bez wieńca górnego (pod blatem)"],
];

// Górna granica wnętrza korpusu (mm od dołu szafki).
export function topInnerY(cons, height, th) {
  if (cons.topType === "brak") return height;
  if (cons.topType === "trawersy_pion") return height - (parseFloat(cons.traverseWidth) || 100);
  return height - th;
}
