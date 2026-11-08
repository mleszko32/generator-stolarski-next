// scripts/sas/rabaty.js
//
// Przypisanie grupy rabatowej SAS nowym pozycjom cennika (pozycje z poprzedniego cennika zachowują dawną grupę).
// Same procenty rabatów NIE są w repozytorium (jest publiczne) - buduj.js czyta je z zakładki „Rabaty”
// poprzedniego cennika; nazwy grup poniżej muszą się zgadzać z tą zakładką.

const P = "przypisane wg nazwy grupy", S = "do sprawdzenia";
// Grupa rabatowa nowej pozycji: [grupa, pewność]. Pozycje z poprzedniego cennika zachowują dawne przypisanie.
export function assign(grp, sub, prod, name) {
  const n = name.toUpperCase();
  if (prod === "BLUM") return ["BLUM", "potwierdzone"];
  if (prod === "HAFELE") return ["HAFELE", P];
  if (prod === "PEKA") return ["PEKA", P];
  if (prod === "NOMET") return /uchwyt/i.test(sub) ? ["NOMET - KOSZE, WYPOSAŻENIE WNĘTRZ", S] : ["NOMET - KOSZE, WYPOSAŻENIE WNĘTRZ", P];
  if (prod === "ZOBAL") return ["ZOBAL - STANDARD MAG.", S];
  if (prod === "ITALIANA FERRAMENTA") return ["ITALIANA", P];
  if (prod === "SEVROLL") return ["SEVROL-SYS.DRZWI PRZESUWANYCH", P];
  if (prod === "FRANKE") return ["FRANKE (Katalog kuchenny)", S];
  if (prod === "HENKEL") return ["HENKEL", P];
  if (prod === "DU PONT™") return [/GLACIER WHITE/.test(n) ? "CORIAN - GLACIER WHITE STANDARD MAG." : "CORIAN", P];
  if (prod === "GARNICA") return ["SKLEJKA GARNICA", P];
  if (prod === "KAIDI" || /Stelaże elektryczne/.test(sub)) return ["STELAŻE ELEKTRYCZNE", P];
  if (prod === "DIMAR" || prod === "FESTOOL" || prod === "PRO-FIT") return ["NARZĘDZIA STOLARSKIE/FESTOOL/DIMAR", P];
  if (/Wkręty/.test(sub)) return ["WKRĘTY, KONFIRMATY", P];
  if (/Uchwyty/.test(sub)) return ["UCHWYTY STANDARD MAG.", S];
  if (/Oświetlenie|Mediaporty/.test(sub)) return ["OŚWIETLENIE MEBLOWE", /Oświetlenie/.test(sub) ? P : S];
  if (/Żaluzje/.test(sub) && prod === "REHAU") return ["REHAU ŻALUZJE KOMPONENTY", P];
  if (/Cokoły/.test(sub) && prod === "REHAU") return ["REHAU LP, COKOŁY", S];
  if (grp === "Chemia meblowa") return ["KLEJE I CHEMIA - POZOSTAŁE", P];
  if (grp === "Sklejki") return [/elastyczn/i.test(sub) ? "SKLEJKA ELASTYCZNA" : "SKLEJKI/PŁ.STOLARSKA", P];
  if (grp === "Laminaty") {
    if (prod === "EGGER") return ["EGGER - LAMINATY STANDARD MAG.", S];
    if (prod === "FORMICA") return ["FORMICA - STANDARD MAG.", S];
    if (prod === "HOMAPAL") return ["FORMICA - HOMAPAL", P];
    if (prod === "KRONOSPAN") return ["KRONO HPL", P];
  }
  if (grp === "Blaty robocze i panele wnękowe") {
    if (/Panele wnękowe/.test(sub)) return prod === "EGGER" ? ["EGGER - PANELE WNĘKOWE", P] : ["KRONOSPAN - BLATY", S];
    if (/Blaty drewniane/.test(sub)) return ["BLATY DREWNIANE", P];
    if (/kompaktowego/.test(sub) && prod === "FORMICA") return ["FORMICA - BLATY KOMPAKTOWE", P];
    if (prod === "EGGER") return ["EGGER - BLATY", P];
    if (prod === "KRONOSPAN") return ["KRONOSPAN - BLATY", P];
    if (prod === "WOODECO") return ["WOODECO - BLATY, PANELE ŚCIENNE", P];
  }
  if (grp === "Obrzeża meblowe" && prod === "REHAU") return [/LASER/.test(n) ? "REHAU OBRZEŻA LASEROWE" : "REHAU OBRZEŻA ABS", P];
  if (/ZAŚLEPK/.test(n) && /SAMOPRZYLEP/.test(n)) return ["ZAŚLEPKI SAMOPRZYLEPNE", P];
  if (grp === "Wzorniki i materiały marketingowe") return ["", "bez rabatu"];
  return ["AKCESORIA", S];
}
