// src/utils/math.js
// Bezpieczny parser prostych wyrażeń arytmetycznych dla pól wymiarów (np.
// wpisanie "400+18*2" zamiast ręcznego liczenia na kalkulatorze obok). Celowo
// NIE używa eval()/Function() - własny mini-parser rekurencyjny, żeby pole
// tekstowe nie mogło nigdy wykonać niczego poza +,-,*,/ i nawiasami.

/**
 * Liczy wartość wyrażenia arytmetycznego (+ - * / oraz nawiasy) albo zwraca
 * zwykłą liczbę bez zmian. Przecinek jest traktowany jak kropka dziesiętna.
 *
 * @param {string|number} input - Tekst z pola (np. "4+5", "1200/2-18") lub liczba.
 * @returns {number|null} Wynik, null dla pustego pola, NaN dla niepoprawnego wyrażenia.
 */
export function evalDimensionExpr(input) {
  if (input === null || input === undefined) return null;
  const str = String(input).trim().replace(/,/g, '.');
  if (str === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
  if (!/^[0-9+\-*/().\s]+$/.test(str)) return NaN;

  let pos = 0;
  const peek = () => str[pos];
  const skipSpace = () => { while (str[pos] === ' ') pos++; };

  const parseFactor = () => {
    skipSpace();
    const c = peek();
    if (c === '+') { pos++; return parseFactor(); }
    if (c === '-') { pos++; return -parseFactor(); }
    if (c === '(') {
      pos++;
      const value = parseExpr();
      skipSpace();
      if (peek() !== ')') throw new Error('parse');
      pos++;
      return value;
    }
    const start = pos;
    while (pos < str.length && /[0-9.]/.test(str[pos])) pos++;
    if (pos === start) throw new Error('parse');
    return Number(str.slice(start, pos));
  };
  const parseTerm = () => {
    let value = parseFactor();
    for (;;) {
      skipSpace();
      const c = peek();
      if (c === '*' || c === '/') {
        pos++;
        const rhs = parseFactor();
        value = c === '*' ? value * rhs : value / rhs;
      } else break;
    }
    return value;
  };
  const parseExpr = () => {
    let value = parseTerm();
    for (;;) {
      skipSpace();
      const c = peek();
      if (c === '+' || c === '-') {
        pos++;
        const rhs = parseTerm();
        value = c === '+' ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  };

  try {
    const result = parseExpr();
    skipSpace();
    if (pos !== str.length) return NaN;
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}
