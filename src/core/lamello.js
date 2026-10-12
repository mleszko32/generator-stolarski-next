// src/core/lamello.js
//
// Łączniki Lamello P-System (frezarka Zeta P2) - wspólne dla skrzynek szuflad
// (core/drawerBoxBuild.js) i korpusu szafki pod skos (core/slopeCabinet.js). Źródła i pomiary
// z warsztatu opisane w nagłówku core/drawerBoxBuild.js. Czysta logika.
import { num, round1 } from "../utils/math.js";

// Oś skrajnego łącznika od końca formatki - warsztatowo 60 mm (ustawienie project.drawerBox.lamelloEdge).
export const LAMELLO_EDGE = 60;

// Łączniki Lamello P (źródła: nagłówek core/drawerBoxBuild.js). minFace / minEdge - min. grubość płyty z rowkiem
// w płaszczyźnie / w krawędzi.
export const LAMELLO = {
  tenso_p10: { name: "Tenso P-10", depth: 10, groove: 60, endMin: 32, minFace: 9, minEdge: 12, clamex: false },
  tenso_p14: { name: "Tenso P-14", depth: 14, groove: 75, endMin: 37, minFace: 11, minEdge: 12, clamex: false },
  clamex_p10: { name: "Clamex P-10", depth: 10, groove: 60, endMin: 32, minFace: 11, minEdge: 12, clamex: true, keyFromEdge: 5.5 },
  clamex_p14: { name: "Clamex P-14", depth: 14, groove: 75, endMin: 37, minFace: 15, minEdge: 12, clamex: true, keyFromEdge: 7.5 },
};
const LAMELLO_CUTTER_R = 50.2;      // promień freza Zeta P2 (Ø100,4)
const LAMELLO_MAX_SPACING = 300;
// Długość rowka P na powierzchni płyty. Teoretycznie to cięciwa koła freza na głębokości g
// (lamelloGrooveLength: ≈70 dla 14, ≈60 dla 10), ale rowek z Zeta P2 zmierzony w warsztacie
// ma ≈75 mm przy P-14 i ≈60 mm przy P-10. Dlatego LAMELLO[].groove: P-14 75, P-10 60
// (pomiary z warsztatu). Ustawienie
// lamelloGroove > 0 nadpisuje obie.
export const lamelloGrooveLen = (lam, settings) => (num(settings && settings.lamelloGroove, 0) > 0 ? num(settings.lamelloGroove) : lam.groove);
export const lamelloGrooveLength = (g) => round1(2 * Math.sqrt(LAMELLO_CUTTER_R ** 2 - (LAMELLO_CUTTER_R - g) ** 2));

// Pozycje łączników Lamello na odcinku 0..h: oś `edge` mm od końców formatki (warsztatowo
// 60 mm - ustawienie lamelloEdge; nigdy mniej niż minimum producenta endMin), rozstaw maks.
// 300; gdy dwa rowki by się nie zmieściły - jeden na środku.
export function lamelloPositions(h, lam, edge = LAMELLO_EDGE, len = lam.groove) {
  const e = Math.max(lam.endMin, num(edge, LAMELLO_EDGE));
  if (h - 2 * e < len + 10) return [round1(h / 2)];
  const n = Math.ceil((h - 2 * e) / LAMELLO_MAX_SPACING) + 1;
  return Array.from({ length: n }, (_, i) => round1(e + (h - 2 * e) * i / (n - 1)));
}

// Tarcza kątów Lamello (Art. 369143), awers, odczyt ze zdjęć z warsztatu: dla kąta między płytami
// i grubości płyty - łącznik (10 = P-10, 14 = P-14, null = brak) i podkładka pod maszynę [mm].
// Wiersz: [kąt, 16 mm, 18 mm, 19 mm, 22 mm], każda komórka [łącznik, podkładka].
const DISC_TH = [16, 18, 19, 22];
const DISC = [
  [22.5, [10, 2], [10, 2], [14, 2], [14, 0]],
  [30, [10, 2], [10, 2], [14, 2], [14, 2]],
  [35, [null, 0], [10, 2], [10, 2], [14, 2]],
  ...[40, 45, 50, 55, 60].map((a) => [a, [10, 4], [14, 4], [14, 4], [14, 4]]),
  ...[65, 70, 75, 80].map((a) => [a, [14, 4], [14, 4], [14, 4], [14, 4]]),
  ...[85, 90].map((a) => [a, [14, 2], [14, 0], [14, 0], [14, 0]]),
  ...[95, 100].map((a) => [a, [10, 2], [14, 2], [14, 2], [14, 0]]),
];

// Ustawienie z tarczy dla kąta (najbliższa kreska tarczy) i grubości płyty (najbliższa z 16/18/19/22,
// najwyżej 1 mm różnicy). null - poza tarczą (kąt < 22,5° albo > 100°, inna grubość).
// Wynik: { angle (kreska tarczy), thickness, connector: 'P-10' | 'P-14' | null, depth, spacer }.
export function lamelloDiscSetting(angle, th) {
  if (!(angle >= 22.5 - 1e-9 && angle <= 100 + 2.5)) return null;
  const ti = DISC_TH.reduce((b, t, i) => (Math.abs(t - th) < Math.abs(DISC_TH[b] - th) ? i : b), 0);
  if (Math.abs(DISC_TH[ti] - th) > 1) return null;
  const row = DISC.reduce((b, r) => (Math.abs(r[0] - angle) < Math.abs(b[0] - angle) ? r : b), DISC[0]);
  const [depth, spacer] = row[ti + 1];
  return { angle: row[0], thickness: DISC_TH[ti], connector: depth ? `P-${depth}` : null, depth, spacer };
}
