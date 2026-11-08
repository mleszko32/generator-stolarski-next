// scripts/sas/buduj.js
//
// Z <katalog>/produkty.json (wynik pobierz.js) buduje:
//   - <katalog>/Cennik SAS z rabatami <data>.xlsx - zakładki Info, Wszystko, po jednej na grupę towarów i Rabaty
//     (rabat formułą z zakładki Rabaty, „Twoja cena” = katalogowa × (1 − rabat), brutto × 1,23);
//   - <katalog>/sasCatalog.json - katalog dla aplikacji (indeks, nazwa, jednostka, cena po rabacie brutto, grupa);
//     wgrywa się go w Kosztorysie przyciskiem „Wgraj katalog SAS” (trafia do Firestore, nie do repozytorium).
// Poprzedni cennik (.xlsx; arkusz Google pobierz jako .xlsx) daje procenty rabatów (zakładka „Rabaty”) i grupy
// rabatowe pozycji, które już w nim były. Wyniki są poufne (ceny po rabacie) - trzymaj je poza repozytorium.
// Użycie: node scripts/sas/buduj.js <katalog> <data RRRR-MM-DD> <poprzedni cennik .xlsx>
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { assign } from "./rabaty.js";

const [dir, date, prevFile] = process.argv.slice(2);
if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !prevFile) {
  console.error("Użycie: node scripts/sas/buduj.js <katalog> <RRRR-MM-DD> <poprzedni cennik .xlsx>");
  process.exit(1);
}
const dateLabel = date.split("-").reverse().join(".");
const data = JSON.parse(fs.readFileSync(path.join(dir, "produkty.json"), "utf8"));
const money = (s) => { const v = parseFloat(String(s).replace(/[^\d,]/g, "").replace(",", ".")); return isNaN(v) ? null : v; };
const num = (s) => { const v = parseFloat(String(s || "").replace(",", ".")); return isNaN(v) ? "" : v; };
const round2 = (v) => Math.round(v * 100) / 100;

// Z poprzedniego cennika: rabaty [nazwa, od, do, rabat] i grupy pozycji (indeks -> [grupa, pewność]).
const prev = new ExcelJS.Workbook();
await prev.xlsx.readFile(prevFile);
const cellVal = (c) => (c.value && typeof c.value === "object" && "result" in c.value ? c.value.result : c.value);
const RABATY = [];
(prev.getWorksheet("Rabaty") || { eachRow() {} }).eachRow((row, n) => {
  if (n > 3 && row.getCell(1).value) RABATY.push([String(cellVal(row.getCell(1))), String(cellVal(row.getCell(2)) ?? ""), String(cellVal(row.getCell(3)) ?? ""), Number(cellVal(row.getCell(4))) || 0]);
});
if (!RABATY.length) { console.error("Brak zakładki „Rabaty” w poprzednim cenniku."); process.exit(1); }
const old = {};
prev.getWorksheet("Wszystko").eachRow((row, n) => {
  if (n > 3 && row.getCell(5).value) old[String(row.getCell(5).value)] = [String(cellVal(row.getCell(9)) || ""), String(cellVal(row.getCell(13)) || "")];
});
const hasOld = Object.keys(old).length > 0;

const seen = new Set(), rows = [];
for (const r of data.rows) {
  if (!r.idx || seen.has(r.idx)) continue;
  seen.add(r.idx);
  const promo = r.badges.split(", ").filter(Boolean).map((b) => b.toLowerCase()).join(", ");
  let [group, sure] = old[r.idx] && old[r.idx][0] ? [old[r.idx][0], old[r.idx][1].replace(" (promocja)", "")] : assign(r.grp, r.sub, r.producer, r.name);
  if (/promocja/.test(promo) && sure !== "bez rabatu" && sure !== "potwierdzone") sure = "do sprawdzenia (promocja)";
  rows.push({ ...r, net: money(r.net), gross: money(r.gross), group, sure, promo, wa: num(r.stockWaw), stz: num(r.stockSte), isNew: hasOld && !old[r.idx] });
}

const wb = new ExcelJS.Workbook();
const PLN = '#,##0.00" zł"';
const HEAD = ["Grupa", "Podkategoria", "Producent", "Nazwa", "Indeks", "Jedn.", "Cena katalogowa netto", "Cena katalogowa brutto", "Grupa rabatowa", "Rabat", "Twoja cena netto", "Twoja cena brutto", "Pewność rabatu", "Promocja / nowość", "Stan Warszawa", "Stan Stęszew", "Nowe w cenniku"];
const WIDTH = [18, 26, 16, 70, 13, 6, 12, 12, 30, 7, 12, 12, 24, 16, 9, 9, 9];
const NR = RABATY.length + 3;

function sheetFor(title, list) {
  const ws = wb.addWorksheet(title, { views: [{ state: "frozen", xSplit: 4, ySplit: 3 }] });
  ws.getCell("A1").value = `SAS – ${title} – ceny z rabatami, ${dateLabel} (${list.length} pozycji)`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getRow(3).values = HEAD;
  ws.getRow(3).font = { bold: true };
  WIDTH.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  list.forEach((r, i) => {
    const n = i + 4;
    const row = ws.getRow(n);
    row.values = [r.grp, r.sub, r.producer, r.name, r.idx, r.unit, r.net, r.gross, r.group, null, null, null, r.sure, r.promo, r.wa, r.stz, r.isNew ? "nowe" : ""];
    row.getCell(10).value = { formula: `IFERROR(INDEX(Rabaty!$D$4:$D$${NR},MATCH(I${n},Rabaty!$A$4:$A$${NR},0)),0)` };
    row.getCell(11).value = { formula: `ROUND(G${n}*(1-J${n}),2)` };
    row.getCell(12).value = { formula: `ROUND(K${n}*1.23,2)` };
    [7, 8, 11, 12].forEach((c) => (row.getCell(c).numFmt = PLN));
    row.getCell(10).numFmt = "0%";
    if (r.promo) for (let c = 1; c <= HEAD.length; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  });
  ws.autoFilter = { from: "A3", to: { row: 3, column: HEAD.length } };
}

const info = wb.addWorksheet("Info");
const tops = [...new Set(rows.map((r) => r.grp))];
const cnt = (f) => rows.filter(f).length;
const sures = {};
rows.forEach((r) => (sures[r.sure] = (sures[r.sure] || 0) + 1));
[
  ["Cennik SAS z Twoimi rabatami – cały asortyment"], [],
  [`Pobrano ${dateLabel} z panelu kontrahenta SAS (esklep.sassc.com.pl) – ${rows.length} pozycji, stany magazynów z ${data.stockDate || "-"}.`],
  ["„Cena katalogowa” = cena widoczna w sklepie (PRZED rabatem). „Twoja cena” = po rabacie z zakładki „Rabaty”."],
  ["Twoja cena netto = cena katalogowa netto × (1 − rabat), zaokrąglona do grosza; brutto = netto × 1,23 (tak liczy SAS na zamówieniu)."],
  ["Rabat pobierany jest formułą z zakładki „Rabaty” – zmień tam % (żółte pola), a wszystkie ceny przeliczą się same."],
  ["Kolumna „Pewność rabatu”:"],
  ["   • potwierdzone – rabat zgadza się z Twoimi zamówieniami (Blum 21%)."],
  ["   • przypisane wg nazwy grupy – grupa jednoznacznie pasuje do producenta/rodzaju."],
  ["   • do sprawdzenia – SAS nie pokazuje grupy rabatowej przy produkcie, przypisanie jest moje (np. uchwyty: standard mag. 15% czy na zamówienie 10%)."],
  ["   • do sprawdzenia (promocja) – nie wiadomo, czy rabat łączy się z ceną promocyjną; Twoja cena może być wyższa."],
  ["   • bez rabatu – wzorniki i materiały marketingowe."],
  ["Wiersze na żółto = promocja / nowość / wyprzedaż. Kolumna „Nowe w cenniku” = pozycje, których nie było w poprzednim cenniku."],
  ["Plik zbudowany skryptem scripts/sas (repozytorium generator-stolarski-next) – przy kolejnym cenniku uruchom go od nowa."],
  [],
  ["Liczba pozycji: " + tops.map((t) => `${t}: ${cnt((r) => r.grp === t)}`).join(", ")],
  ["Pewność: " + Object.entries(sures).map(([k, v]) => `${k}: ${v}`).join(", ")],
].forEach((r) => info.addRow(r));
info.getCell("A1").font = { bold: true, size: 14 };
info.getColumn(1).width = 140;

sheetFor("Wszystko", rows);
const SHORT = {
  "Akcesoria meblowe": "Akcesoria", "Blaty robocze i panele wnękowe": "Blaty", "Obrzeża meblowe": "Obrzeża", "Corian® Solid Surface": "Corian",
  "Zlewozmywaki, baterie, akcesoria Franke": "Franke", "Żaluzje i rolety meblowe": "Żaluzje", "Oświetlenie, mediaporty, elektryka": "Oświetlenie",
  "Systemy przesuwne, garderoba": "Przesuwne i garderoba", "Narzędzia do drewna, wkręty": "Narzędzia i wkręty", "Chemia meblowa": "Chemia",
  "Wzorniki i materiały marketingowe": "Wzorniki",
};
tops.forEach((t) => sheetFor((SHORT[t] || t).slice(0, 31), rows.filter((r) => r.grp === t)));

const rab = wb.addWorksheet("Rabaty");
rab.getCell("A1").value = "Moje rabaty – z panelu SAS (zakładka „Moje rabaty”). Żółte pola możesz edytować; procenty przechodzą do następnego cennika.";
rab.getCell("A1").font = { bold: true };
rab.getRow(3).values = ["Nazwa asortymentu", "Okres od", "Okres do", "Rabat", "Liczba produktów w cenniku"];
rab.getRow(3).font = { bold: true };
RABATY.forEach(([n, a, b, d], i) => {
  const r = rab.getRow(i + 4);
  r.values = [n, a, b, d, { formula: `COUNTIF(Wszystko!$I:$I,A${i + 4})` }];
  r.getCell(4).numFmt = "0%";
  r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
});
rab.getColumn(1).width = 44;
rab.getColumn(5).width = 26;

const xlsx = path.join(dir, `Cennik SAS z rabatami ${date}.xlsx`);
await wb.xlsx.writeFile(xlsx);

// Katalog dla aplikacji: [indeks, nazwa, jednostka, cena po rabacie brutto, grupa towarów, nr produktu w sklepie (koszyk),
// stan Warszawa, stan Stęszew].
const disc = new Map(RABATY.map(([n, , , d]) => [n, d]));
const cat = rows.filter((r) => r.net != null).map((r) => [r.idx, r.name, r.unit, round2(round2(r.net * (1 - (disc.get(r.group) || 0))) * 1.23), r.grp, r.pid || "", r.wa, r.stz]);
fs.writeFileSync(path.join(dir, "sasCatalog.json"), JSON.stringify({ format: "gsn-sas-catalog", date, rows: cat }));
console.log(`Zapisano ${xlsx} (${rows.length} pozycji, nowych ${cnt((r) => r.isNew)}) i sasCatalog.json. Pewność:`, sures);
