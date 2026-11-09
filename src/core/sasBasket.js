// src/core/sasBasket.js
//
// Lista zakupów -> koszyk w sklepie SAS (esklep.sassc.com.pl). Aplikacja nie może sama dodawać do koszyka
// (inna domena, konto zalogowane w sklepie), więc: przycisk w hubie kopiuje listę „GSN-SAS-KOSZYK [...]”,
// a zakładka (bookmarklet) kliknięta na stronie sklepu dodaje pozycje przez ten sam adres co przycisk
// „Do koszyka” (POST /pl/web/basket/add, id = nr produktu w sklepie, quantity). Zamówienie składa użytkownik.
// Czyste funkcje.
import { sasSuggest, rowsFromLink } from "./sasCatalog.js";

export const BASKET_PREFIX = "GSN-SAS-KOSZYK ";

// Pozycje SAS dla okucia: powiązanie z Kosztorysu (pricing.sas.hardware), inaczej automatyczny dobór.
export function hardwareSasRows(rows, links, hwName) {
  return rowsFromLink(rows, (links || {})[hwName]) || sasSuggest(rows, hwName);
}

// hardware: [{ name, qty }] z calculateProjectHardware(). Zwraca { items: [{ pid, idx, name, qty }], missing: [nazwy] }
// - pozycje z tym samym produktem SAS są sumowane, ilość zaokrąglona w górę do całych sztuk.
export function basketItems(hardware, rows, links) {
  const byPid = new Map(), missing = [];
  for (const hw of hardware) {
    const list = hardwareSasRows(rows, links, hw.name);
    if (!list || list.some((r) => !r[5])) { missing.push(hw.name); continue; }
    const hwQty = Number(hw.qty) || 0;
    if (!hwQty) continue;
    list.forEach((r, i) => {
      const it = byPid.get(r[5]) || { pid: r[5], idx: r[0], name: r[1], qty: 0, raw: 0 };
      it.raw += hwQty * ((list.per && list.per[i]) || 1); // opakowania/odcinki: sumuj ułamki, zaokrąglaj na końcu
      it.qty = Math.ceil(it.raw - 1e-9);
      byPid.set(r[5], it);
    });
  }
  return { items: [...byPid.values()].map(({ raw, ...it }) => it), missing };
}

export function basketText(items) {
  return BASKET_PREFIX + JSON.stringify(items.map((i) => [i.pid, i.qty]));
}

// Odczyt listy w zakładce (ta sama logika jest wpisana w BASKET_BOOKMARKLET).
export function parseBasketText(text) {
  const t = String(text || "").trim();
  if (!t.startsWith(BASKET_PREFIX)) return null;
  try {
    const list = JSON.parse(t.slice(BASKET_PREFIX.length));
    return Array.isArray(list) && list.every((x) => Array.isArray(x) && /^\d+$/.test(String(x[0])) && Number.isInteger(x[1]) && x[1] > 0) ? list : null;
  } catch (e) { return null; }
}

// Zakładka do paska zakładek: na stronie sklepu SAS czyta listę ze schowka (albo z okna „wklej”) i dodaje do koszyka.
export const BASKET_BOOKMARKLET = "javascript:(async()=>{if(!/sassc\\.com\\.pl$/.test(location.host)){alert('Otwórz panel kontrahenta SAS (esklep.sassc.com.pl) i kliknij zakładkę jeszcze raz.');return}"
  + "const P='" + BASKET_PREFIX + "';let t='';try{t=await navigator.clipboard.readText()}catch(e){}"
  + "if(!t.startsWith(P))t=prompt('Wklej listę z Generatora (przycisk Do koszyka SAS):')||'';"
  + "let l;try{l=JSON.parse(t.slice(P.length))}catch(e){}if(!t.startsWith(P)||!Array.isArray(l)){alert('To nie jest lista z Generatora Stolarskiego.');return}"
  + "let ok=0;for(const [id,q] of l){const r=await fetch('/pl/web/basket/add',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},"
  + "body:'id='+encodeURIComponent(id)+'&quantity='+encodeURIComponent(q)});if(r.ok)ok++}"
  + "alert('Dodano do koszyka '+ok+' z '+l.length+' pozycji. Sprawdź koszyk przed zamówieniem.');location.reload()})()";
