// scripts/heban/pobierz.js
//
// Pobieranie asortymentu z panelu kontrahenta hurtowni Heban (Comarch B2B, http://185.11.62.23) - kody, nazwy,
// jednostki i ceny kontrahenta z API panelu. Lista artykułów idzie po grupach towarowych (001…164, bez
// wyprzedaży/koszy/gadżetów), cena każdego artykułu osobnym zapytaniem (kilka naraz; serwer odpowiada ok. 14 cen
// na sekundę, więc całość ~25 tys. pozycji trwa ok. 30-40 minut - nie zamykaj karty).
//
// Użycie:
//   1. `node scripts/heban/odbierz.js <katalog>` - serwer na 127.0.0.1:8765 zapisze wynik do <katalog>/produkty.json.
//   2. Zaloguj się w panelu Heban, otwórz dowolną stronę panelu, wklej CAŁY ten plik do konsoli (F12) i Enter.
//      Postęp widać w konsoli; na końcu dane idą do serwera z kroku 1 (przeglądarka może zapytać o dostęp do
//      urządzeń w sieci lokalnej - zezwól).
//   3. `node scripts/heban/buduj.js <katalog> <data RRRR-MM-DD>`, potem w Kosztorysie „Wgraj katalog Heban”
//      z <katalog>/hebanCatalog.json. Wyniki (ceny kontrahenta) trzymaj poza repozytorium.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getJson = async (url, opts) => {
    for (let i = 0; i < 4; i++) {
      try { const r = await fetch(url, opts); if (r.ok) return await r.json(); } catch (e) { /* ponów */ }
      await sleep(1000 * (i + 1));
    }
    return null;
  };

  // Grupy towarowe najwyższego poziomu („004 PŁYTY LAMINOWANE”, „053 HETTICH”…). Grupy „000 …” to inne drzewa
  // tych samych artykułów, a meble/dekoracje bez numeru to nie asortyment stolarski.
  const tree = await getJson("/api/items/treeXl", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const groups = (tree?.groups || []).filter((g) => /^\d{3}[ .]/.test(g.name) && !/^(000|998|999)/.test(g.name)
    && !/KOSZ|NAJEM|GADŻET|OPAKOWANIA|MEBLE USŁUGI/i.test(g.name));
  console.log("Grup:", groups.length);

  // Lista artykułów (bez cen) z każdej grupy, artykuł w kilku grupach tylko raz.
  const base = [], seen = new Set();
  for (const g of groups) {
    for (let p = 1, pages = 1; p <= pages; p++) {
      const j = await getJson(`/api/items/articleListXl/?groupId=${g.id}&filterInGroup=false&pageNumber=${p}&sortMode=NameAsc&onlyAvailable=false&warehouseId=1&stockLevelFilter=0`);
      if (!j) break;
      pages = j.paging?.totalPages || 1;
      for (const x of j.articleList || []) {
        if (seen.has(x.article.id)) continue;
        seen.add(x.article.id);
        base.push({ g: g.name, id: x.article.id, k: x.article.code?.value || "", n: x.article.name || "" });
      }
    }
    console.log(`${g.name}: razem ${base.length}`);
  }

  // Ceny: kilka zapytań naraz.
  let next = 0, done = 0;
  async function worker() {
    while (next < base.length) {
      const r = base[next++];
      const a = await getJson(`/api/items/articleFromListXl/?articleId=${r.id}&warehouseId=1`);
      if (a) { r.j = (a.unit?.basicUnit || "").trim(); r.net = a.price?.netPrice ?? null; r.bru = a.price?.grossPrice ?? null; r.ean = a.ean || ""; }
      if (++done % 500 === 0) console.log(`ceny: ${done} / ${base.length}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const body = JSON.stringify({ rows: base });
  const ok = await fetch("http://127.0.0.1:8765/", { method: "POST", body }).then((r) => r.text());
  console.log("Wysłano", base.length, "pozycji:", ok);
})();
