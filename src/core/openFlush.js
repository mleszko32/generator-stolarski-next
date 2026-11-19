// Półki i przegrody w części korpusu bez frontów (otwarty regał) przy froncie wpuszczanym.
// Front wpuszczany wchodzi w głąb korpusu o grubość płyty, więc półka/przegroda przy froncie
// jest o tyle krótsza. W otwartej części nie ma czemu ustępować — sięgają do lica korpusu.

const SIDE_TOL = 30; // mm: front stojący przy przegrodzie (szczelina + luz) nadal ją „dotyka”

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1;

/** Czy element wnętrza (poziom / pion) nie ma w swojej strefie żadnego frontu → lico równo z korpusem. */
export function isOpenFlush(mod, el) {
  if (!el || (el.typ !== 'poziom' && el.typ !== 'pion')) return false;
  const fronts = (mod.elements || []).filter((e) => e.typ === 'front' && e.w >= 1);
  const x0 = Number(el.x) || 0;
  const x1 = x0 + (Number(el.w) || 0);
  if (el.typ === 'poziom') {
    // Front nad / pod półką w tej samej kolumnie (nakładanie w poziomie).
    return !fronts.some((f) => overlap(x0, x1, f.x, f.x + f.w));
  }
  const y0 = Number(el.y) || 0;
  const y1 = y0 + (Number(el.h) || 0);
  // Front wpuszczany leży OBOK przegrody, nie przed nią — więc przegroda sięga do lica, gdy choć
  // z jednej strony (przy otwartym regale) nie ma frontu na wspólnej wysokości.
  const frontBeside = (from, to) => fronts.some((f) => overlap(y0, y1, f.y, f.y + f.h) && overlap(from, to, f.x, f.x + f.w));
  return !frontBeside(x0 - SIDE_TOL, x0) || !frontBeside(x1, x1 + SIDE_TOL);
}
