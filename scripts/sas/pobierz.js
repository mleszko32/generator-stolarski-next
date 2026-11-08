// scripts/sas/pobierz.js
//
// Pobieranie całego asortymentu z panelu kontrahenta SAS (esklep.sassc.com.pl) - ceny katalogowe
// i stany magazynów z list kategorii (90 produktów na stronę, przerwa 400 ms między stronami).
//
// Użycie:
//   1. `node scripts/sas/odbierz.js <katalog>` - serwer na 127.0.0.1:8765 zapisze wynik do <katalog>/produkty.json.
//   2. Zaloguj się w panelu SAS, otwórz dowolną stronę panelu, wklej CAŁY ten plik do konsoli (F12) i Enter.
//      Postęp widać w konsoli; na końcu dane idą do serwera z kroku 1 (przeglądarka może zapytać
//      o dostęp do urządzeń w sieci lokalnej - zezwól).
//   3. `node scripts/sas/buduj.js <katalog> <data RRRR-MM-DD> <poprzedni cennik .xlsx>`, potem w Kosztorysie
//      „Wgraj katalog SAS” z <katalog>/sasCatalog.json. Wyniki (ceny po rabacie) trzymaj poza repozytorium.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseDoc = (h) => new DOMParser().parseFromString(h, "text/html");
  const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : "");

  // Drzewo kategorii z menu: „/pl/<kategoria>/list” otwiera grupę, dalej jej podkategorie.
  const home = parseDoc(await fetch("/pl").then((r) => r.text()));
  const links = [...home.querySelectorAll("a")].map((a) => {
    try {
      const u = new URL(a.getAttribute("href"), location.origin);
      return u.host === location.host ? [u.pathname, txt(a).replace(/\s*\(\d+\)$/, "")] : null;
    } catch (e) { return null; }
  }).filter((x) => x && /^\/pl\/[a-z0-9-]+(\/list)?$/.test(x[0]) && !/\/web|basket|wishlist|search|promocje|nowosci|wyprzedaze|partnerzy|pakiety|obsluga|marki/.test(x[0]));
  const tree = [], seen = new Set();
  let top = null;
  for (const [p, t] of links) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p.endsWith("/list")) { top = { slug: p.replace("/list", ""), name: null, subs: [] }; tree.push(top); continue; }
    if (top && p === top.slug) { top.name = t; continue; }
    if (top) top.subs.push({ slug: p, name: t });
  }

  const stockOf = (title, city) => {
    const m = title.match(new RegExp(city + "[^:<]*:\\s*([\\d\\s.,]+)"));
    return m ? m[1].replace(/\s/g, "") : "";
  };
  const rows = [];
  let stockDate = "";
  for (const t of tree) {
    for (const sub of t.subs) {
      for (let p = 1; p < 300; p++) {
        const url = sub.slug + "/aim/category/limit/90/columns/1" + (p > 1 ? "/p/" + p : "");
        const res = await fetch(url);
        if (!res.ok) break;
        const d = parseDoc(await res.text());
        const titles = d.querySelectorAll(".h6.mb-3 a[href*='/product/']");
        titles.forEach((a) => {
          const card = a.closest(".form-float") || a.closest(".col-md-5").parentElement;
          const prod = [...card.querySelectorAll("span.fw-light")].map((s) => s.textContent.trim()).find((s) => s !== "Partner:") || "";
          const st = (card.querySelector(".stock-info-position a") || { getAttribute: () => "" }).getAttribute("data-bs-title") || "";
          const upd = st.match(/aktualizacji stanów ([\d-]+ [\d:]+)/);
          if (upd) stockDate = upd[1];
          rows.push({
            grp: t.name || "Chemia meblowa", sub: sub.name, producer: prod, name: txt(a),
            idx: txt(card.querySelector(".text-muted.fw-light.mb-2")), unit: txt(card.querySelector(".fs-5.text-nowrap")),
            net: txt(card.querySelector("strong.fs-5")), gross: txt(card.querySelector("span.fs-5")),
            badges: [...card.querySelectorAll(".badge")].map((b) => b.textContent.trim()).join(", "),
            stockWaw: stockOf(st, "Warszawa"), stockSte: stockOf(st, "Stęszew"),
          });
        });
        console.log(`${t.name} / ${sub.name} s.${p}: ${titles.length} (razem ${rows.length})`);
        const hasNext = [...d.querySelectorAll(".pagination a")].some((x) => {
          const m = (x.getAttribute("href") || "").match(/\/p\/(\d+)/);
          return m && +m[1] === p + 1;
        });
        await sleep(400);
        if (!hasNext || !titles.length) break;
      }
    }
  }
  const body = JSON.stringify({ stockDate, rows });
  const ok = await fetch("http://127.0.0.1:8765/", { method: "POST", body }).then((r) => r.text());
  console.log("Wysłano", rows.length, "pozycji:", ok);
})();
