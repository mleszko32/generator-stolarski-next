// Nóżka regulowana szafek = Häfele Axilo: słupek ze stopą (kod zależy od wysokości) + podstawa nogi 637.76.333.
// Cena nóżki to suma obu pozycji. Wysokości bez słupka w Axilo (np. 120) nie mają dopasowania.
const STALK = { 60: "637.76.351", 80: "637.76.352", 85: "637.76.352", 100: "637.76.353", 125: "637.76.354", 150: "637.76.355" };
export const AXILO_BASE = "637.76.333";

// { stalk, base } (kody Häfele) dla wysokości nóżki w mm albo null.
export function axiloCodes(height) {
  const stalk = STALK[Math.round(Number(height))];
  return stalk ? { stalk, base: AXILO_BASE } : null;
}
