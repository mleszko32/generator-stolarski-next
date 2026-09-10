// src/utils/dom.js
// Wspólne, lekkie helpery DOM. Aplikacja renderuje duże fragmenty UI przez
// szablony string wstrzykiwane przez innerHTML (patrz src/ui/*, src/render/*),
// dlatego każda wartość pochodząca od użytkownika (nazwa modułu, nazwa
// projektu wczytana z Firestore itp.) MUSI przejść przez escapeHtml() przed
// wstrzyknięciem do HTML, żeby uniknąć ataków XSS (np. nazwa projektu
// "<img src=x onerror=alert(1)>" zapisana bezpośrednio w bazie).

/**
 * Zamienia znaki specjalne HTML na ich bezpieczne encje.
 * Używaj zawsze, gdy wartość pochodząca od użytkownika (nazwa modułu,
 * nazwa projektu, dowolny tekst z formularza) trafia do szablonu innerHTML.
 *
 * @param {*} value - Dowolna wartość (zostanie skonwertowana na string).
 * @returns {string} Bezpieczny do wstawienia w HTML tekst.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
