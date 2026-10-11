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

// Otwiera stronę HTML (wydruk, rysunek, raport) w nowej karcie z adresu blob. Adres jest
// zwalniany po minucie - karta ma już wtedy wczytany dokument, a blob nie wisi w pamięci
// do zamknięcia aplikacji (wcześniej każdy wydruk zostawiał swoją kopię).
export function openHtmlWindow(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const win = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return win;
}

// Pobranie pliku wygenerowanego w przeglądarce (CSV, DXF, JSON).
export function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
