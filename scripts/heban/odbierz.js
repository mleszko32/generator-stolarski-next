// scripts/heban/odbierz.js
//
// Serwer na 127.0.0.1:8765 odbierający wynik `pobierz.js` z panelu Heban i zapisujący go jako
// <katalog>/produkty.json. Zamyka się po odebraniu danych. Adres panelu (nagłówek CORS) można podać drugim
// argumentem, gdy Heban go zmieni.
// Użycie: node scripts/heban/odbierz.js <katalog> [adres panelu, domyślnie http://185.11.62.23]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const origin = process.argv[3] || "http://185.11.62.23";
if (!dir) { console.error("Podaj katalog: node scripts/heban/odbierz.js <katalog>"); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", origin);
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
server.listen(8765, "127.0.0.1", () => console.log(`Czekam na dane z panelu Heban (${origin}) na http://127.0.0.1:8765`));
