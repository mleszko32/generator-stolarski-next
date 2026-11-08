// scripts/sas/odbierz.js
//
// Serwer na 127.0.0.1:8765 odbierający wynik `pobierz.js` z panelu SAS i zapisujący go jako
// <katalog>/produkty.json. Zamyka się po odebraniu danych.
// Użycie: node scripts/sas/odbierz.js <katalog>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("Podaj katalog: node scripts/sas/odbierz.js <katalog>"); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://esklep.sassc.com.pl");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.end(); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const file = path.join(dir, "produkty.json");
    fs.writeFileSync(file, body);
    res.end("ok " + body.length);
    console.log("Zapisano", file, body.length, "bajtów");
    server.close();
  });
});
server.listen(8765, "127.0.0.1", () => console.log("Czekam na dane z panelu SAS na http://127.0.0.1:8765"));
