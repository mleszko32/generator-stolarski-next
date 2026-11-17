// Zawieszki szafek wiszących Camar 818 (regulowane, za plecami korpusu) - czyste dane i obliczenia.
// Wymiary z karty producenta (rysunek montażowy, mm):
//  - 3 kołki Ø10 × 12,5 w licu wewnętrznym boku, co 32 mm; oś pierwszego min. 65 mm od góry korpusu;
//    oś kołków 5 mm od tyłu pleców w stronę tyłu korpusu, więc plecy muszą być cofnięte min. 15 mm;
//  - 2 otwory Ø10 (rysunek: Ø12, min. Ø10) w plecach na śruby regulacji: oś 18 mm od lica wewnętrznego boku,
//    pierwszy 4 mm niżej niż pierwszy kołek, drugi 50 mm niżej;
//  - 1 wkręt Ø3,5 pod kątem 45° na zawieszkę; zaślepki 2 szt. na zawieszkę (nie w komplecie);
//  - zawieszka: grubość 15, szerokość 31,5, wysokość 146; regulacja 18 mm pion / 25 mm w głąb.
import { resolveBackPanel } from "./backPanel.js";
import { num } from "../utils/math.js";

export const HANGER_818 = {
  id: "camar818",
  name: "Zawieszka Camar 818",
  pinDiameter: 10,
  pinDepth: 12.5,
  pinPitch: 32,
  pinCount: 3,
  minTopOffset: 65,        // oś górnego kołka od góry korpusu (minimum)
  pinFromBack: 5,          // oś kołków od lica pleców (od strony tyłu korpusu)
  minBackInset: 15,        // minimalne cofnięcie pleców od tyłu boków
  backHoleDiameter: 10,    // wg rysunku Ø12 (min. Ø10) - wiercimy Ø10 (decyzja warsztatu)
  backHoleMinDiameter: 10,
  backHoleFromSide: 18,    // oś otworu w plecach od lica wewnętrznego boku
  backHoleDrop: 4,         // pierwszy otwór w plecach niżej niż górny kołek
  backHolePitch: 50,
  bodyWidth: 31.5,
  bodyHeight: 146,
  bodyThickness: 15,
  bodyAboveTopPin: 55,     // wysokość korpusu zawieszki nad osią górnego kołka (146 - 64 - 27)
  loadKg: 70,              // nośność na sztukę wg sklepu - niezweryfikowana na karcie producenta
  screwDiameter: 3.5,
  capsPerHanger: 2,
};

// Ustawienia zawieszek szafki ({ active, model, topOffset }) albo null, gdy wyłączone.
export function hangerOf(mod) {
  const h = mod && mod.hanger;
  if (!h || !h.active) return null;
  return { model: h.model || HANGER_818.id, topOffset: Math.max(HANGER_818.minTopOffset, num(h.topOffset, HANGER_818.minTopOffset)) };
}

// Zawieszki mają sens tylko w szafce zwykłej (nie narożnej / pod skos) z plecami wpuszczanymi.
const supportedType = (mod) => mod && mod.type !== "corner_cabinet" && mod.type !== "slope_cabinet";

// Problemy z zamontowaniem: lista komunikatów (pusta = można montować).
export function hangerProblems(mod, project) {
  if (!hangerOf(mod)) return [];
  if (!supportedType(mod)) return ["zawieszki 818 są przewidziane tylko dla zwykłych szafek"];
  const bp = resolveBackPanel(mod, project);
  if (bp.type !== "wpuszczane") return ["zawieszka 818 wymaga pleców wpuszczanych, cofniętych od tyłu boków"];
  if (bp.insetOffset < HANGER_818.minBackInset) return [`plecy cofnięte o ${bp.insetOffset} mm - zawieszka 818 wymaga min. ${HANGER_818.minBackInset} mm`];
  const h = num(mod.dimensions && mod.dimensions.height, 0);
  const lowest = hangerOf(mod).topOffset + (HANGER_818.pinCount - 1) * HANGER_818.pinPitch;
  if (lowest + 27 > h) return ["szafka za niska na zawieszkę 818"];
  return [];
}

// Czy zawieszki da się faktycznie zamontować (włączone i bez problemów).
export const hangerEnabled = (mod, project) => !!hangerOf(mod) && hangerProblems(mod, project).length === 0;

// Geometria w mm. Pion od góry korpusu (do dołu), głębokość od tyłu boków (do przodu), strona boku
// od lica wewnętrznego (do środka). Zawieszki są dwie: lewa i prawa (lustrzane).
export function hangerGeometry(mod, project) {
  if (!hangerEnabled(mod, project)) return null;
  const H = HANGER_818;
  const bp = resolveBackPanel(mod, project);
  const top = hangerOf(mod).topOffset;
  const pinsFromTop = Array.from({ length: H.pinCount }, (_, i) => top + i * H.pinPitch);
  const backHolesFromTop = [0, 1].map((i) => top + H.backHoleDrop + i * H.backHolePitch);
  return {
    pinsFromTop,
    pinFromRear: bp.insetOffset - H.pinFromBack,     // oś kołków od tyłu boków
    backHolesFromTop,
    backHoleFromSide: H.backHoleFromSide,
    bodyTopFromTop: top - H.bodyAboveTopPin,
    bodyBottomFromTop: top - H.bodyAboveTopPin + H.bodyHeight,
    insetOffset: bp.insetOffset,
  };
}

// Pozycje wierceń dla getCabinetPanels - współrzędne jak w otworach boku: x od przodu boku, y od dołu
// płyty; dla pleców: x od lewej krawędzi płyty, y od dołu płyty (widok od wnętrza).
export function hangerHoles(mod, project, { depth, panelHeight, topY, backWidth, backTopY }) {
  const g = hangerGeometry(mod, project);
  if (!g) return null;
  const H = HANGER_818;
  const side = g.pinsFromTop.map((d) => ({ x: Math.round((depth - g.pinFromRear) * 10) / 10, y: Math.round((topY - d) * 10) / 10,
    kind: "zawieszka", d: H.pinDiameter, depth: H.pinDepth, to: "kołek zawieszki Camar 818" }));
  const back = [];
  g.backHolesFromTop.forEach((d) => {
    [H.backHoleFromSide, backWidth - H.backHoleFromSide].forEach((x, i) => back.push({ x, y: Math.round((backTopY - d) * 10) / 10, kind: "zawieszka",
      d: H.backHoleDiameter, depth: null, to: `śruba regulacji zawieszki ${i ? "prawej" : "lewej"}` }));
  });
  return { side, back, panelHeight };
}

// Okucia na szafkę (lista zakupów): 2 zawieszki (L + R), 2 × 2 zaślepki, 2 wkręty Ø3,5.
export function hangerHardware(mod, project) {
  if (!hangerEnabled(mod, project)) return [];
  return [
    { name: "Zawieszka Camar 818 (komplet L + R)", qty: 1, unit: "kpl." },
    { name: "Zaślepka zawieszki Camar 818", qty: 2 * HANGER_818.capsPerHanger, unit: "szt." },
    { name: "Wkręt Ø3,5 do zawieszki 818", qty: 2, unit: "szt." },
  ];
}
