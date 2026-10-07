// src/render/workshopDrawing.js
//
// Wspólne klocki rysunków warsztatowych (osobne okno, druk): instrukcje skrzynek szuflad
// (render/drawerBoxDrawing2d.js) i szafek (render/cabinetDrawing2d.js) - teksty, wymiary,
// otwory w płaszczyźnie i w czołach (też rowek Lamello P), aksonometria izometryczna z
// rysowaniem brył metodą malarza i widok szafki od frontu z zaznaczonymi frontami.
// Skala 1 jednostka = 1 mm. Kolory i font z drawingPalette.js.
import { C, FONT } from "./drawingPalette.js";
import { escapeHtml } from "../utils/dom.js";

export const r1 = (v) => Math.round(v * 10) / 10;
export const fmt = (v) => String(r1(v)).replace(".", ",");

export const KIND = {
  wkret: { color: C.purple600, label: "wkręt" },
  konfirmat: { color: C.violet600, label: "konfirmat" },
  kolek: { color: C.green600, label: "kołek" },
  zaczep: { color: C.sky600, label: "zaczep prowadnicy" },
  lamello: { color: C.orange600, label: "rowek Lamello P" },
  klucz: { color: C.red600, label: "otwór na klucz Clamex" },
  podporka: { color: C.amber600, label: "podpórka półki" },
  prowadnica: { color: C.sky600, label: "prowadnica szuflady" },
  zawias: { color: C.teal700, label: "prowadnik zawiasu" },
};

// Jednostka opisu (U): przy dużych formatkach (słupek) czcionki, odstępy opisów i znaczniki
// rosną razem z formatką, inaczej na rysunku powiększonym do ekranu byłyby nieczytelne.
// Rysunek ustawia ją na czas budowania (setUnit) i przywraca 1; małe formatki - zawsze 1.
let U = 1;
export const unit = () => U;
export function setUnit(u) { U = u > 1 ? u : 1; }
export const unitFor = (maxDim) => Math.max(1, maxDim / 800);

export const text = (x, y, t, { size = 11, color = C.slate700, anchor = "middle", weight = "normal", rotate = 0 } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT}" font-size="${r1(size * U)}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}"${rotate ? ` transform="rotate(${rotate} ${r1(x)} ${r1(y)})"` : ""}>${escapeHtml(t)}</text>`;
export const line = (x1, y1, x2, y2, color = C.slate500, extra = "") =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${color}" stroke-width="${r1(0.8 * U)}" ${extra}/>`;
export const dash = 'stroke-dasharray="3,2"';

export function dimH(x1, x2, y, label, color = C.slate600) {
  const t = 4 * U;
  return line(x1, y, x2, y, color) + line(x1, y - t, x1, y + t, color) + line(x2, y - t, x2, y + t, color)
    + text((x1 + x2) / 2, y - t, label, { size: 11, color });
}
export function dimV(x, y1, y2, label, color = C.slate600) {
  const t = 4 * U;
  return line(x, y1, x, y2, color) + line(x - t, y1, x + t, y1, color) + line(x - t, y2, x + t, y2, color)
    + text(x - 6 * U, (y1 + y2) / 2, label, { size: 11, color, rotate: -90 });
}
// scale = N dla skali 1:N - rysunek dostaje wymiary w mm (prawdziwa skala na wydruku 100%),
// zamiast rozciągania na szerokość karty.
// Na ekranie (styl WORKSHOP_CSS) rysunek ze skalą jest powiększany do szerokości okna, na wydruku
// dostaje prawdziwe wymiary z --w / --h (skala 1:scale).
export const wrap = (minX, minY, w, h, body, scale) =>
  `<svg viewBox="${r1(minX)} ${r1(minY)} ${r1(w)} ${r1(h)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}"${scale ? ` class="to-scale" style="--w:${r1(w / scale)}mm;--h:${r1(h / scale)}mm"` : ""}>`
  + `<rect x="${r1(minX)}" y="${r1(minY)}" width="${r1(w)}" height="${r1(h)}" fill="${C.white}"/>${body}</svg>`;
export const title = (x, y, t, sub) => text(x, y, t.toUpperCase(), { size: 14, color: C.blue900, weight: "bold" })
  + (sub ? text(x, y + 15 * U, sub, { size: 11, color: C.slate500 }) : "");
export const uniq = (arr) => [...new Set(arr.map(r1))].sort((a, b) => a - b);

// Otwór w płaszczyźnie: kółko w prawdziwej średnicy + numer obok.
export function faceHole(cx, cy, h, n) {
  const k = KIND[h.kind];
  if (h.groove) {
    const [w, l] = h.orient === "h" ? [h.groove, h.d] : [h.d, h.groove];
    return `<rect x="${r1(cx - w / 2)}" y="${r1(cy - l / 2)}" width="${r1(w)}" height="${r1(l)}" rx="1" fill="${k.color}" fill-opacity="0.3" stroke="${k.color}" stroke-width="1"/>`
      + line(cx, cy - 2, cx, cy + 2, k.color) + line(cx - 2, cy, cx + 2, cy, k.color)
      + text(cx + w / 2 + 2 * U, cy - l / 2 + 8 * U, String(n), { size: 9, color: k.color, anchor: "start", weight: "bold" });
  }
  const r = Math.max(h.d / 2, 1.6 * U);
  return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${h.depth == null ? C.white : k.color}" stroke="${k.color}" stroke-width="${r1(1.2 * U)}"/>`
    + text(cx + r + 2 * U, cy - r - U, String(n), { size: 9, color: k.color, anchor: "start", weight: "bold" });
}
// Otwór w czole: zarys kanału od krawędzi w głąb płyty (dx, dy - kierunek w głąb).
export function edgeHole(x, y, dx, dy, h, n) {
  const k = KIND[h.kind], half = Math.max(h.d / 2, 1.2 * U), L = h.depth;
  if (h.groove) {
    // Promień łuku z cięciwy (długość rowka) i strzałki (głębokość): R = (c² + g²) / 2g.
    const c = h.groove / 2, R = r1((c * c + L * L) / (2 * L));
    // Końce cięciwy wzdłuż krawędzi, łuk o promieniu freza sięgający głębokości L.
    const [a, b] = dx ? [[x, y - c], [x, y + c]] : [[x - c, y], [x + c, y]];
    const sweep = (dx > 0 || dy < 0) ? 1 : 0;
    return `<path d="M ${r1(a[0])} ${r1(a[1])} A ${R} ${R} 0 0 ${sweep} ${r1(b[0])} ${r1(b[1])} Z" fill="${k.color}" fill-opacity="0.3" stroke="${k.color}" stroke-width="1"/>`
      + text(x + dx * (L + 3 * U) + (dy ? c + 2 * U : 0), y + dy * (L + 3 * U) + (dx ? -c + 8 * U : 9 * U), String(n), { size: 9, color: k.color, anchor: dx < 0 ? "end" : "start", weight: "bold" });
  }
  const pts = dx
    ? [[x, y - half], [x + dx * L, y - half], [x + dx * L, y + half], [x, y + half]]
    : [[x - half, y], [x - half, y + dy * L], [x + half, y + dy * L], [x + half, y]];
  return `<polygon points="${pts.map((p) => p.map(r1).join(",")).join(" ")}" fill="${k.color}" fill-opacity="0.25" stroke="${k.color}" stroke-width="1"/>`
    + text(x + dx * (L + 3 * U) + (dy ? half + 2 * U : 0), y + dy * (L + 3 * U) + (dx ? -half - U : 9 * U), String(n), { size: 9, color: k.color, anchor: dx < 0 ? "end" : "start", weight: "bold" });
}

// ---------------------------------------------------------------------------
// Aksonometria izometryczna. Układ: x w poprzek (w prawo), y w górę, z w głąb (0 = przód).
// Patrzymy z prawej, z góry, od przodu.
// ---------------------------------------------------------------------------

export const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6);
export const CAM = [1, 1, -1];                                   // kierunek do obserwatora
export const proj = ([x, y, z]) => [(x + z) * ISO_C, (x - z) * ISO_S - y];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const move = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

// Graniastosłup: wielokąt (wypukły) w płaszczyźnie osi u, v wyciągnięty o `depth`
// wzdłuż osi w. axis: 'z' (płyta czołowa: u=x, v=y, w=z), 'x' (bok: u=z, v=y, w=x),
// 'y' (dno: u=x, v=z, w=y).
export function prism(poly, axis, w0, depth) {
  const to3 = (u, v, w) => (axis === "z" ? [u, v, w] : axis === "x" ? [w, v, u] : [u, w, v]);
  const a = poly.map(([u, v]) => to3(u, v, w0)), b = poly.map(([u, v]) => to3(u, v, w0 + depth));
  const cross = (p, q, r) => {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  };
  const all = [...a, ...b];
  const center = [0, 1, 2].map((i) => all.reduce((s, p) => s + p[i], 0) / all.length);
  const faces = [a, b.slice().reverse(), ...a.map((p, i) => [p, a[(i + 1) % a.length], b[(i + 1) % a.length], b[i]])];
  // Normalna skierowana na zewnątrz (od środka bryły) - do wyboru ścian widocznych.
  return {
    center,
    faces: faces.map((f) => {
      let nn = cross(f[0], f[1], f[2]);
      const fc = [0, 1, 2].map((i) => f.reduce((s, p) => s + p[i], 0) / f.length);
      if (dot(nn, [fc[0] - center[0], fc[1] - center[1], fc[2] - center[2]]) < 0) nn = nn.map((v) => -v);
      return { pts: f, normal: nn };
    }),
  };
}

export function solidsSvg(solids, scale, ox, oy) {
  const P = (p, sh) => { const [x, y] = proj(move(p, sh)); return [ox + x * scale, oy + y * scale]; };
  // Malarz: najpierw bryły dalej od obserwatora.
  const order = solids.slice().sort((a, b) => dot(move(a.solid.center, a.shift), CAM) - dot(move(b.solid.center, b.shift), CAM));
  let out = "";
  order.forEach((s) => {
    s.solid.faces.filter((f) => dot(f.normal, CAM) > 1e-6).forEach((f) => {
      // Ściany od góry jaśniejsze, boczne ciemniejsze - czytelniejsza bryła.
      const shade = f.normal[1] > 1e-6 ? 1 : (Math.abs(f.normal[0]) > Math.abs(f.normal[2]) ? 0.8 : 0.92);
      out += `<polygon points="${f.pts.map((p) => P(p, s.shift).map(r1).join(",")).join(" ")}" fill="${s.tone}" fill-opacity="${shade}" stroke="${C.slate700}" stroke-width="0.9" stroke-linejoin="round"/>`;
    });
  });
  return { svg: out, P };
}

// Szafka od frontu z zaznaczonymi szufladami, których dotyczy instrukcja skrzynki.
// view - core/drawerBoxBuild.js: cabinetFrontView; highlightIds - fronty z tą skrzynką
// (numerowane po kolei, od dołu). Szuflady wewnętrzne przerywaną linią (są za frontem).
export function cabinetLocatorSVG(view, highlightIds, name) {
  const pad = 30, top = 46;
  const s = Math.min(260 / view.W, 300 / view.H);       // ok. 260 px szerokości, nie wyżej niż 300
  const W = view.W * s, H = view.H * s;
  const P = ([x, y]) => [r1(pad + x * s), r1(top + H - y * s)];
  const pts = (arr) => arr.map((p) => P(p).join(",")).join(" ");
  const minY = (f) => Math.min(...f.points.map((p) => p[1]));
  const hl = view.fronts.filter((f) => highlightIds.includes(f.id)).sort((a, b) => minY(a) - minY(b));
  let b = text(pad, 16, name, { size: 13, color: C.blue900, weight: "bold", anchor: "start" });
  b += text(pad, 32, `${fmt(view.W)} × ${fmt(view.H)} mm · widok od frontu`, { size: 10, color: C.slate500, anchor: "start" });
  b += `<polygon points="${pts(view.outline)}" fill="${C.slate50}" stroke="${C.slate700}" stroke-width="1.5"/>`;
  view.fronts.forEach((f) => {
    const on = highlightIds.includes(f.id);
    const drawer = (f.subtype || "").includes("szuflada");
    const stroke = on ? C.orange700 : drawer ? C.blue500 : C.green500;
    const fill = on ? C.orange600 : drawer ? C.blue50 : C.green50;
    b += `<polygon points="${pts(f.points)}" fill="${fill}" fill-opacity="${on ? 0.35 : 1}" stroke="${stroke}" stroke-width="${on ? 2 : 1}"${f.inner ? ' stroke-dasharray="4,3"' : ""}/>`;
  });
  hl.forEach((f, i) => {
    const cx = f.points.reduce((a, p) => a + p[0], 0) / f.points.length;
    const cy = f.points.reduce((a, p) => a + p[1], 0) / f.points.length;
    const [x, y] = P([cx, cy]);
    b += `<circle cx="${x}" cy="${y}" r="10" fill="${C.white}" stroke="${C.orange700}" stroke-width="1.5"/>`;
    b += text(x, y + 4, String(i + 1), { size: 11, color: C.orange700, weight: "bold" });
    if (f.inner) b += text(x, y + 22, "wewn.", { size: 9, color: C.orange700 });
  });
  const totalW = W + 2 * pad, totalH = H + top + 24;
  b += text(pad, totalH - 6, `${hl.length} ${hl.length === 1 ? "szuflada" : hl.length < 5 ? "szuflady" : "szuflad"} z tą skrzynką`, { size: 10, color: C.orange700, anchor: "start" });
  return `<svg viewBox="0 0 ${r1(totalW)} ${r1(totalH)}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}" class="locator" style="width:${r1(totalW)}px;height:${r1(totalH)}px"><rect width="${r1(totalW)}" height="${r1(totalH)}" fill="${C.white}"/>${b}</svg>`;
}
