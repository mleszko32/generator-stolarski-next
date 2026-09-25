// src/ui/edgeBandingUi.js
// Mała ikona formatki z krawędziami do okleiny: w liście formatek klikalna
// (klik w krawędź przełącza ją, klik w środek - dookoła / brak), na etykietach
// tylko do odczytu. Krawędzie wg engine/edgeBanding.js: góra/dół = dłuższe,
// lewa/prawa = krótsze.
const ON = "#0f766e";
const OFF = "#cbd5e1";

// edges: [dł.1, dł.2, szer.1, szer.2]. opts: { width, height (px/mm), interactive, key }
export function edgeIconSvg(edges, { width = 52, height = 32, interactive = false, key = "" } = {}) {
  const x0 = 9, x1 = 43, y0 = 7, y1 = 25;
  const line = (i, ax, ay, bx, by) => {
    const on = edges[i];
    const visible = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${on ? ON : OFF}" stroke-width="${on ? 3.2 : 1.2}" ${on ? "" : 'stroke-dasharray="2,2"'} stroke-linecap="round" />`;
    if (!interactive) return visible;
    const hit = `<line class="eb-edge" data-i="${i}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="9" style="cursor:pointer" />`;
    return visible + hit;
  };
  const center = interactive
    ? `<rect class="eb-all" x="${x0 + 4}" y="${y0 + 4}" width="${x1 - x0 - 8}" height="${y1 - y0 - 8}" fill="#f1f5f9" rx="2" style="cursor:pointer"><title>Kliknij: dookoła / brak</title></rect>`
    : `<rect x="${x0 + 3}" y="${y0 + 3}" width="${x1 - x0 - 6}" height="${y1 - y0 - 6}" fill="#f1f5f9" rx="2" />`;
  return `<svg class="eb-icon" data-key="${key}" viewBox="0 0 52 32" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle">
    ${center}
    ${line(0, x0, y0, x1, y0)}${line(1, x0, y1, x1, y1)}${line(2, x0, y0, x0, y1)}${line(3, x1, y0, x1, y1)}
  </svg>`;
}
