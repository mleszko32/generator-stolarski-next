// src/core/blumDrawer.js
//
// Szuflady Blum w wycenie: opcje zakupu kompletu (kolor, udźwig, wysokość E z relingiem / Boxcap, mocowanie frontu)
// i rozpiska kompletu MERIVOBOX na części, które sprzedaje hurtownia (Heban nie ma gotowych zestawów z ceną - liczy się
// z części; SAS ma zestawy „Szuflada Blum MERIVOBOX …”). Opcje są wspólne dla całego projektu:
// project.pricing.blumDrawer = { color, kg, eVariant, fix } (Kosztorys, wiersz „Szuflady Blum”).
// Rozpiska sprawdzona na koszyku SAS: zestaw T00000-999 (500 E Boxcap) = te same części, suma cen się zgadza.
// Czyste funkcje.

// Kolory Blum: B = jedwabiście biały, S = szary indium, A = szary orion / antracyt.
export const BLUM_COLORS = { B: "jedwabiście biały", S: "szary indium", A: "antracyt" };

export const BLUM_DRAWER_DEFAULTS = Object.freeze({ color: "B", kg: 40, eVariant: "reling", fix: "W" });

// Opcje z cennika projektu, uzupełnione domyślnymi i poprawione (nieznana wartość = domyślna).
export function drawerOptions(pricing) {
  const o = (pricing && pricing.blumDrawer) || {};
  const d = BLUM_DRAWER_DEFAULTS;
  return {
    color: BLUM_COLORS[o.color] ? o.color : d.color,
    kg: Number(o.kg) === 70 ? 70 : 40,
    eVariant: o.eVariant === "boxcap" ? "boxcap" : d.eVariant,
    fix: o.fix === "I" ? "I" : "W",
  };
}

// Opis opcji do podpowiedzi: „jedwabiście biały, 40 kg, E z relingiem, wkręty”.
export function drawerOptionsLabel(opts) {
  return `${BLUM_COLORS[opts.color]}, ${opts.kg} kg, E ${opts.eVariant === "boxcap" ? "z Boxcap" : "z relingiem"}, ${opts.fix === "I" ? "Inserta" : "wkręty"}`;
}

// Nazwa kompletu z listy okuć (core/drawerMath.js: drawerHardwareKey) -> { system, height, nl } albo null.
export function parseDrawerKit(name) {
  const m = String(name).match(/^Komplet szuflady \(([A-Z_0-9]+) - H:([A-Z]) L-(\d+)\)/);
  return m ? { system: m[1], height: m[2], nl: Number(m[3]) } : null;
}

// Części jednej szuflady MERIVOBOX: [{ code, qty, pair, colored, label }]. pair = para lewy + prawy (hurtownia sprzedaje
// parę albo osobno lewy i prawy), colored = pozycja w kolorze szuflady. Wysokość E stoi na bokach M.
export function merivoboxRecipe(height, nl, opts = BLUM_DRAWER_DEFAULTS) {
  const H = String(height).toUpperCase(), L = String(nl); // kody Blum z NL wprost: 470M5002S, 450.5001B
  const bh = H === "E" ? "M" : H;
  const ins = opts.fix === "I";
  const sideH = { N: 68, M: 91, K: 129 }[bh];
  const items = [
    { code: `470${bh}${L}2S`, qty: 1, pair: true, colored: true, label: `Boki ${bh}${sideH ? ` (${sideH} mm)` : ""}, NL ${L}` },
    { code: `${opts.kg === 70 ? "453" : "450"}.${L}1B`, qty: 1, pair: true, colored: false, label: `Prowadnica ${opts.kg} kg, NL ${L}` },
    { code: ins ? "ZF4.10I2" : "ZF4.1002", qty: 2, colored: false, label: `Mocowanie frontu dolne (${ins ? "Inserta" : "wkręty"})` },
  ];
  if (H === "E") items.push({ code: ins ? "ZF4.50I2" : "ZF4.5002", qty: 2, colored: false, label: `Mocowanie frontu górne (${ins ? "Inserta" : "wkręty"})` });
  items.push({ code: "ZA4.5400", qty: 2, colored: true, label: "Zaślepka boku ZA4.540" });
  items.push({ code: "ABD.1000", qty: 2, colored: true, label: "Zaślepka ABD" });
  items.push({ code: `ZB4${H}000S`, qty: 1, colored: true, label: `Uchwyt drewnianej ścianki tylnej, wys. ${H}` });
  if (H === "E" && opts.eVariant === "boxcap") items.push({ code: `ZL4.${L}S.E`, qty: 1, colored: true, label: `BOXCAP wys. E, NL ${L}` });
  if (H === "E" && opts.eVariant === "reling") {
    items.push({ code: `ZR4.${L}RS.ERE`, qty: 1, pair: true, colored: true, label: `Reling podłużny, NL ${L}` });
    items.push({ code: "ZB4E00AK", qty: 2, colored: true, label: "Zaślepka wys. E (do relingu)" });
  }
  return items;
}
