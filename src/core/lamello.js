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
