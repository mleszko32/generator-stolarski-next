// src/ui/panelHover.js
//
// Panel boczny poszerza się po najechaniu myszą i wraca po zjechaniu. Poszerzony przykrywa
// widok 3D: ujemny margines od strony sceny trzyma jego miejsce w układzie, więc scena się nie
// przesuwa ani nie przelicza. Dopóki kursor jest w polu panelu (focus), panel zostaje szeroki.
//
// opts.side: 'left' | 'right' - z której strony okna stoi panel;
// opts.width: docelowa szerokość w px albo 'content' (najdłuższy wiersz treści);
// opts.max: górna granica w px (dodatkowo najwyżej 60% okna).

const DELAY = 200;
const panels = new WeakMap(); // element → { opts, timer, wide, hover }

function fit(el) {
  const st = panels.get(el);
  if (!st || !st.wide) return;
  const margin = st.opts.side === 'left' ? 'marginRight' : 'marginLeft';
  el.style.width = st.opts.width === 'content' ? 'max-content' : '';
  el.style[margin] = '';
  const base = parseFloat(getComputedStyle(el).minWidth) || el.offsetWidth;
  const want = st.opts.width === 'content' ? el.offsetWidth : st.opts.width;
  const w = Math.min(want, st.opts.max || want, Math.round(window.innerWidth * 0.6));
  el.style.width = '';
  if (w <= base + 1) { el.classList.remove('is-wide'); return; }
  el.classList.add('is-wide');
  el.style.width = w + 'px';
  el.style[margin] = (base - w) + 'px';
}

function narrow(el) {
  const st = panels.get(el);
  if (st.timer) clearTimeout(st.timer);
  st.timer = null;
  st.wide = false;
  el.classList.remove('is-wide');
  el.style.width = '';
  el.style.marginLeft = '';
  el.style.marginRight = '';
}

// Po zmianie treści panelu (np. przerysowana lista) dopasuj szerokość na nowo.
export function refitPanel(el) {
  if (el) fit(el);
}

export function bindHoverExpand(el, opts) {
  if (!el || panels.has(el)) return;
  const st = { opts, timer: null, wide: false, hover: false };
  panels.set(el, st);
  el.addEventListener('mouseenter', (e) => {
    st.hover = true;
    // nie w trakcie przeciągania (szafka, kamera) i nie w układzie jednokolumnowym (telefon)
    if (e.buttons !== 0 || st.wide || st.timer) return;
    if (getComputedStyle(el.parentElement).flexDirection === 'column') return;
    st.timer = setTimeout(() => { st.timer = null; st.wide = true; fit(el); }, DELAY);
  });
  el.addEventListener('mouseleave', () => {
    st.hover = false;
    if (!el.contains(document.activeElement)) narrow(el);
  });
  el.addEventListener('focusout', () => {
    // focus wyszedł z panelu (albo pole zniknęło przy przerysowaniu), a myszy już nad nim nie ma
    setTimeout(() => { if (!st.hover && !el.contains(document.activeElement)) narrow(el); }, 0);
  });
}
