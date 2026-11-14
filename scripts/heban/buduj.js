// scripts/heban/buduj.js
//
// Z <katalog>/produkty.json (wynik pobierz.js) buduje:
//   - <katalog>/hebanCatalog.json - katalog dla aplikacji (kod, nazwa, jednostka, cena brutto, grupa, id artykułu);
//     wgrywa się go w Kosztorysie przyciskiem „Wgraj katalog Heban” (trafia do Firestore, nie do repozytorium);
//   - <katalog>/Cennik Heban <data>.xlsx - cała lista z filtrem (gdy jest zainstalowany exceljs z devDependencies).
// Ceny w panelu Hebanu to już ceny kontrahenta (bez osobnej tabeli rabatów jak w SAS). Pozycje bez ceny w panelu
// (ok. 1200, m.in. zestawy szuflad Merivobox z ceną 0) są pomijane. Wyniki są poufne - trzymaj je poza repozytorium.
// Użycie: node scripts/heban/buduj.js <katalog> <data RRRR-MM-DD>
import fs from "node:fs";
import path from "node:path";

const [dir, date] = process.argv.slice(2);
if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  console.error("Użycie: node scripts/heban/buduj.js <katalog> <RRRR-MM-DD>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(path.join(dir, "produkty.json"), "utf8"));
const clean = (s) => String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const groupName = (g) => clean(g).replace(/^\d{3}[ .]*/, "");

// Panel Hebanu ma u części pozycji (głównie Blum Merivobox) wpisaną cudzą nazwę - ta sama nazwa z innym kodem Blum
// przy wielu różnych towarach, np. „378M4502SA TANDEMBOX INTIVO Bok…” przy bokach, prowadnicach i zaślepkach
// Merivobox. Taką nazwę (i pustą) zastępujemy kodem + grupą. Warianty kolorów z tą samą nazwą (uchwyty, nóżki,
// woski) zostają - różnią się tylko kodem.
const BLUM_IN_NAME = /\b(\d{3}[A-Z]\d{4}[A-Z0-9]*)\b/;
const codeOf = (r) => String(r.k || "").replace(/\u00a0/g, " ").trim();
const byName = new Map();
for (const r of data.rows) {
  const n = clean(r.n);
  if (!byName.has(n)) byName.set(n, new Set());
  byName.get(n).add(codeOf(r));
}
const wrongName = (r) => {
  const n = clean(r.n);
  if (!n) return true;
  const m = n.toUpperCase().match(BLUM_IN_NAME);
  const first = codeOf(r).split(/\s+/)[0].toUpperCase();
  return Boolean(m) && byName.get(n).size >= 5 && first !== m[1] && !codeOf(r).toUpperCase().includes(m[1]);
};

const seen = new Set(), rows = [];
let fixed = 0, noPrice = 0;
for (const r of data.rows) {
  if (seen.has(r.id)) continue;
  seen.add(r.id);
  const bru = Number(r.bru);
  if (!Number.isFinite(bru) || bru <= 0) { noPrice++; continue; }
  let name;
  if (wrongName(r)) { name = `${clean(r.k)} (kod z Hebanu, ${groupName(r.g).toLowerCase()})`; fixed++; }
  else name = clean(r.n).replace(/^\.[0-9A-Za-z]+\.\s*/, "").replace(/\*{2,}|#{2,}|!{2,}/g, "").replace(/^[\s.*#!]+|[\s.*#!]+$/g, "");
  rows.push([codeOf(r), name, clean(r.j || "szt."), Math.round(bru * 100) / 100, groupName(r.g), String(r.id)]);
}

fs.writeFileSync(path.join(dir, "hebanCatalog.json"), JSON.stringify({ format: "gsn-heban-catalog", date, rows }));
console.log(`Zapisano hebanCatalog.json: ${rows.length} pozycji (pominięte bez ceny: ${noPrice}, poprawione nazwy: ${fixed}).`);

// Arkusz do przeglądania - tylko gdy exceljs jest zainstalowany (npm install w repozytorium).
try {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Wszystko", { views: [{ state: "frozen", ySplit: 3 }] });
  const dateLabel = date.split("-").reverse().join(".");
  ws.getCell("A1").value = `Heban – ceny kontrahenta brutto, ${dateLabel} (${rows.length} pozycji). Płyty na m²: w zamówieniu wpisz arkusze × powierzchnia (2 × 5,796 = 11,592 m²).`;
  ws.getCell("A1").font = { bold: true };
  ws.getRow(3).values = ["Grupa", "Kod", "Nazwa", "Jedn.", "Cena brutto", "Id artykułu"];
  ws.getRow(3).font = { bold: true };
  [28, 34, 80, 7, 12, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 4);
    row.values = [r[4], r[0], r[1], r[2], r[3], r[5]];
    row.getCell(5).numFmt = '#,##0.00" zł"';
  });
  ws.autoFilter = { from: "A3", to: { row: 3, column: 6 } };
  const xlsx = path.join(dir, `Cennik Heban ${date}.xlsx`);
  await wb.xlsx.writeFile(xlsx);
  console.log("Zapisano", xlsx);
} catch (e) {
  console.log("Pominięto arkusz .xlsx (brak exceljs - uruchom `npm install`).");
}
