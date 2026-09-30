// src/render/moduleThumbnail.js
//
// Mała ikonka SVG (rzut czołowy) szafki - do list, gdzie trzeba szybko
// rozpoznać, która formatka do której szafki należy (ui/productionHub.js:
// "Formatki" grupowane wg szafki). Czysta funkcja z danych modułu - czyta
// TYLKO już wyliczone el.x/y/w/h frontów (core/layout.js: recalculateLayout),
// więc wołający musi to przeliczyć najpierw (w praktyce zawsze prawda, bo
// lista formatek i tak przechodzi przez calculateAllProjectParts() ->
// recalculateAllLayouts() zanim tu trafimy).
function num(v, d = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

// Szafka narożna ma inny kształt bryły (L) niż zwykła prostokątna - bez
// szczegółów frontów (osobny, bardziej złożony układ współrzędnych na
// ramię), tylko sam obrys, żeby dało się ją odróżnić na pierwszy rzut oka.
function cornerThumbnailSVG(mod, size) {
  const legA = num(mod.dimensions?.width, 860);
  const legB = num(mod.dimensions?.legB, 860);
  const th = Math.max(legA, legB) * 0.18; // wizualna grubość ramienia, nie prawdziwa grubość płyty
  const k = size / Math.max(legA, legB);
  const w = legA * k, h = legB * k, t = th * k;
  return `<svg class="module-thumb" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <path d="M0.75 0.75 H${(w - 0.75).toFixed(1)} V${t.toFixed(1)} H${t.toFixed(1)} V${(h - 0.75).toFixed(1)} H0.75 Z" fill="#f8fafc" stroke="#334155" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

// Rzut czołowy zwykłej (prostokątnej) szafki: obrys korpusu + każdy front
// (drzwi/szuflada) jako osobny, kolorowany prostokąt na swojej realnej
// pozycji - ta sama konwencja kolorów co render/wallElevations.js (drzwi
// zielone, szuflady niebieskie), żeby wyglądało spójnie z resztą aplikacji.
function rectThumbnailSVG(mod, size) {
  const W = num(mod.dimensions?.width, 600);
  const H = num(mod.dimensions?.height, 720);
  const k = size / Math.max(W, H, 1);
  const w = W * k, h = H * k;

  const fronts = (mod.elements || []).filter((e) => e.typ === 'front');
  const inner = fronts.map((f) => {
    const fx = num(f.x) * k;
    const fw = num(f.w) * k;
    const fy = num(f.y) * k;
    const fh = num(f.h) * k;
    const isDrawer = (f.subtype || '').includes('szuflada');
    const y = h - fy - fh; // el.y rośnie w górę od dołu szafki, SVG y rośnie w dół
    return `<rect x="${fx.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, fw).toFixed(1)}" height="${Math.max(0, fh).toFixed(1)}" fill="${isDrawer ? '#eff6ff' : '#f0fdf4'}" stroke="${isDrawer ? '#93c5fd' : '#86efac'}" stroke-width="0.75" />`;
  }).join('');

  return `<svg class="module-thumb" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.75" y="0.75" width="${Math.max(0, w - 1.5).toFixed(1)}" height="${Math.max(0, h - 1.5).toFixed(1)}" fill="#ffffff" stroke="#334155" stroke-width="1.5"/>
    ${inner}
  </svg>`;
}

// size = docelowa szerokość/wysokość ikonki w px (dopasowanie proporcji do
// dłuższego boku szafki, druga oś się skaluje razem z nią).
export function generateModuleThumbnailSVG(mod, size = 32) {
  if (!mod || !mod.dimensions) return '';
  return mod.type === 'corner_cabinet' ? cornerThumbnailSVG(mod, size) : rectThumbnailSVG(mod, size);
}
