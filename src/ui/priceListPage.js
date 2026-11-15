// src/ui/priceListPage.js
//
// Okno „Cennik” (przycisk na górnym pasku): wyszukiwarka cen SAS i Heban oraz wycena kompletu szuflady MERIVOBOX
// z CSV do koszyków. Dane z katalogów w Firestore (loadSasCatalog / loadHebanCatalog), liczy core/priceSearch.js.
// Okno jest szerokie, ale działa też na telefonie (.pl-* w styles/global.css).

import { openModal } from "../utils/modal.js";
import { escapeHtml } from "../utils/dom.js";
import { loadSasCatalog } from "../core/sasCatalog.js";
import { loadHebanCatalog } from "../core/hebanCatalog.js";
import { BLUM_COLORS } from "../core/blumDrawer.js";
import {
  PRICE_TYPES, DRAWER_LENGTHS, DRAWER_DEFAULTS, buildItems, searchItems, parseQuickDrawer, drawerQuote,
  csvSas, csvHeban, sheetsList,
} from "../core/priceSearch.js";

const PAGE = 60;
const STORE = "cennik-ustawienia";

const money = (v) => (v == null ? "—" : v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł");
const dmy = (d) => (d ? d.split("-").reverse().join(".") : "brak");

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; }
}
function saveStored(v) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* tryb prywatny */ }
}

function chips(name, list, cur) {
  return list.map(([v, label]) => `<button type="button" class="btn btn-sm${cur === v ? " active" : ""}" data-chip="${name}" data-v="${escapeHtml(String(v))}">${escapeHtml(label)}</button>`).join("");
}

function itemCard(it, open) {
  const main = it.perM2 != null ? money(it.perM2) : money(it.price);
  const small = it.perM2 != null ? `za m²${it.perSheet ? ` · arkusz ${money(it.perSheet)}` : ""}` : `za ${escapeHtml(it.unit || "szt")}`;
  let more = "";
  if (open) {
    const sheets = sheetsList(it);
    more = `<dl class="pl-more">
      <dt>Kod</dt><dd class="pl-code">${escapeHtml(it.code)}</dd>
      <dt>Grupa</dt><dd>${escapeHtml(it.group)}</dd>
      <dt>Cena brutto</dt><dd>${money(it.price)} / ${escapeHtml(it.unit)}</dd>
      ${it.stock ? `<dt>Stan</dt><dd>Warszawa ${it.stock.waw}, Stęszew ${it.stock.ste}</dd>` : ""}
      ${sheets.length ? `<dt>Do zamówienia</dt><dd>${sheets.map((s) => `${s.sheets === 0.5 ? "½" : s.sheets} ark. = <b>${String(s.m2).replace(".", ",")} m²</b> · ${money(s.price)}`).join("<br>")}${it.src === "HEBAN" ? '<br><span class="panel-hint">Heban liczy płyty w m²: wpisz powierzchnię, nie liczbę arkuszy. Połówka arkusza ma dodatkową opłatę za przygotowanie.</span>' : ""}</dd>` : ""}
    </dl><button type="button" class="btn btn-sm" data-copy="${escapeHtml(it.code)}">Kopiuj kod</button>`;
  }
  return `<article class="pl-card" data-id="${escapeHtml(it.src + "|" + it.code)}" tabindex="0">
    <div class="pl-name">${escapeHtml(it.name)}</div>
    <div class="pl-price"><b>${main}</b><small>${small}</small></div>
    <div class="pl-sub"><span class="badge ${it.src === "SAS" ? "badge-info" : "badge-warn"}">${it.src === "SAS" ? "SAS" : "Heban"}</span><span class="pl-code">${escapeHtml(it.code)}</span><span>${PRICE_TYPES[it.type]}</span></div>
    ${more}</article>`;
}

function quoteBlock(title, q, n, csvId, copyId) {
  if (!q) return `<div class="pl-quote"><h3>${title}</h3><div class="empty-note">Brak wszystkich części w katalogu tej hurtowni.</div></div>`;
  const rows = q.lines.map((l) => `<tr><td><b>${l.qty}×</b> ${escapeHtml(l.name.slice(0, 80))}<span class="pl-code">${escapeHtml(l.code)}</span></td><td>${money(l.total)}</td></tr>`).join("");
  return `<div class="pl-quote"><h3>${title}</h3>
    <table class="cost-table"><tbody>${rows}</tbody></table>
    <div class="pl-total">Razem ${money(q.total)} <small>(${money(q.perDrawer)} za szufladę)</small></div>
    <div class="btn-grid"><button type="button" class="btn btn-sm" id="${csvId}">Pobierz CSV do koszyka</button><button type="button" class="btn btn-sm" id="${copyId}">Kopiuj kody</button></div>
  </div>`;
}

export async function openPriceList() {
  const st = { q: "", src: "", typ: "", sort: "rel", shown: PAGE, tab: "search", open: new Set(), cfg: { ...DRAWER_DEFAULTS, ...(loadStored().cfg || {}) } };
  Object.assign(st, { src: loadStored().src || "", typ: loadStored().typ || "", sort: loadStored().sort || "rel" });

  const { bodyEl } = openModal({
    title: "Cennik SAS i Heban", subtitle: "Ceny brutto z katalogów hurtowni (po rabatach)", width: 780,
    body: '<div class="empty-note">Ładowanie katalogów…</div>',
  });

  const [sas, heb] = await Promise.all([loadSasCatalog(), loadHebanCatalog()]);
  if (!sas.rows.length && !heb.rows.length) {
    bodyEl.innerHTML = '<div class="notice notice-warn">Brak katalogów. Zaloguj się kontem z listy dozwolonych i wgraj katalogi w Kosztorysie (przyciski „Wgraj katalog SAS” i „Wgraj katalog Heban”).</div>';
    return;
  }
  const items = buildItems(sas.rows, heb.rows);
  let current = [];

  bodyEl.innerHTML = `
    <div class="pl-tabs"><button type="button" class="btn btn-sm active" data-tab="search">Wyszukiwarka</button><button type="button" class="btn btn-sm" data-tab="drawer">Szuflady Blum</button></div>
    <div class="panel-hint pl-stamp">SAS: ${sas.rows.length.toLocaleString("pl-PL")} poz. z ${dmy(sas.date)} · Heban: ${heb.rows.length.toLocaleString("pl-PL")} poz. z ${dmy(heb.date)}</div>
    <div id="pl-search">
      <div class="field"><input type="search" class="input" id="pl-q" autocomplete="off" placeholder="np. U702 18, dąb halifax, blum 71B3550"></div>
      <div class="pl-chips" id="pl-chips"></div>
      <div class="pl-meta"><span id="pl-count"></span><select class="input" id="pl-sort"><option value="rel">trafność</option><option value="asc">cena rosnąco</option><option value="desc">cena malejąco</option></select></div>
      <div id="pl-list"></div>
      <button type="button" class="btn" id="pl-more" hidden>Pokaż więcej</button>
    </div>
    <div id="pl-drawer" hidden></div>`;

  const $ = (s) => bodyEl.querySelector(s);

  function renderChips() {
    $("#pl-chips").innerHTML = chips("src", [["", "Obie"], ["SAS", "SAS"], ["HEBAN", "Heban"]], st.src)
      + '<span class="pl-sep"></span>'
      + chips("typ", [["", "Wszystko"], ["P", "Płyty"], ["O", "Obrzeża"], ["B", "Blaty"], ["A", "Okucia"]], st.typ);
    $("#pl-sort").value = st.sort;
  }
  function renderList() {
    current = searchItems(items, st);
    $("#pl-count").textContent = current.length ? `${current.length.toLocaleString("pl-PL")} wyników` : "";
    $("#pl-list").innerHTML = current.length
      ? current.slice(0, st.shown).map((it) => itemCard(it, st.open.has(it.src + "|" + it.code))).join("")
      : '<div class="empty-note">Nic nie znaleziono. Spróbuj krótszego słowa albo samego kodu dekoru.</div>';
    $("#pl-more").hidden = current.length <= st.shown;
  }

  function renderDrawer() {
    const c = st.cfg;
    const quote = drawerQuote(sas.rows, heb.rows, c);
    const seg = (key, list) => `<div class="pl-seg">${chips("d-" + key, list, c[key])}</div>`;
    const best = quote.sas && quote.heban ? (quote.sas.total <= quote.heban.total ? "SAS" : "Heban") : "";
    $("#pl-drawer").innerHTML = `
      <div class="field"><input type="search" class="input" id="pl-dq" autocomplete="off" placeholder="szybki wpis, np. merivobox 500 E boxcap biały x6"></div>
      <div class="pl-cfg">
        <label class="field-label">Wysokość</label>${seg("H", [["N", "N 68"], ["M", "M 91"], ["K", "K 129"], ["E", "E"]])}
        ${c.H === "E" ? `<label class="field-label">Wersja E</label>${seg("eVariant", [["boxcap", "Boxcap"], ["reling", "Reling"]])}` : ""}
        <label class="field-label">Długość NL</label>${seg("nl", DRAWER_LENGTHS.map((l) => [l, String(l)]))}
        <label class="field-label">Kolor</label>${seg("color", Object.entries(BLUM_COLORS))}
        <label class="field-label">Nośność</label>${seg("kg", [[40, "40 kg"], [70, "70 kg"]])}
        <label class="field-label">Mocowanie frontu</label>${seg("fix", [["W", "Wkręty"], ["I", "Inserta"]])}
        <label class="field-label">Liczba szuflad</label><div class="pl-seg"><input type="number" class="input" id="pl-n" min="1" max="99" value="${quote.n}"></div>
      </div>
      <div class="pl-quotes">${quoteBlock("SAS", quote.sas, quote.n, "pl-csv-sas", "pl-copy-sas")}${quoteBlock("Heban", quote.heban, quote.n, "pl-csv-heb", "pl-copy-heb")}</div>
      ${best ? `<div class="notice notice-info">Taniej: <b>${best}</b> (${money(Math.min(quote.sas.total, quote.heban.total))}). Dno i ściankę tylną robisz z płyty, nie są wliczone.</div>` : '<div class="panel-hint">Dno i ściankę tylną robisz z płyty, nie są wliczone.</div>'}
      <div class="panel-hint" id="pl-msg"></div>`;
    const msg = (t) => { const m = $("#pl-msg"); if (m) m.textContent = t; };
    const download = (name, text) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg(`Zapisano ${name}. W panelu hurtowni wybierz import CSV do koszyka (SAS: /pl/basket/import). Zamówienie składasz sam.`);
    };
    const copy = (q) => navigator.clipboard.writeText(q.lines.map((l) => `${l.code} × ${l.qty}`).join("\n")).then(() => msg("Skopiowano listę kodów."), () => msg("Nie udało się skopiować."));
    const tag = `merivobox_${c.nl}${c.H}_${c.color}_x${quote.n}`;
    if (quote.sas) { $("#pl-csv-sas").onclick = () => download(`SAS_${tag}.csv`, csvSas(quote.sas)); $("#pl-copy-sas").onclick = () => copy(quote.sas); }
    if (quote.heban) { $("#pl-csv-heb").onclick = () => download(`Heban_${tag}.csv`, csvHeban(quote.heban)); $("#pl-copy-heb").onclick = () => copy(quote.heban); }
  }

  function showTab(tab) {
    st.tab = tab;
    bodyEl.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#pl-search").hidden = tab !== "search";
    $("#pl-drawer").hidden = tab !== "drawer";
    if (tab === "drawer") renderDrawer();
  }

  bodyEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) return showTab(t.dataset.tab);
    const chip = e.target.closest("[data-chip]");
    if (chip) {
      const key = chip.dataset.chip;
      if (key.startsWith("d-")) {
        const k = key.slice(2);
        st.cfg[k] = ["nl", "kg"].includes(k) ? Number(chip.dataset.v) : chip.dataset.v;
        saveStored({ ...loadStored(), cfg: st.cfg });
        return renderDrawer();
      }
      st[key] = chip.dataset.v;
      st.shown = PAGE;
      saveStored({ ...loadStored(), src: st.src, typ: st.typ, sort: st.sort });
      renderChips(); return renderList();
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      navigator.clipboard.writeText(cp.dataset.copy).then(() => { cp.textContent = "Skopiowano"; }, () => { cp.textContent = cp.dataset.copy; });
      return;
    }
    if (e.target.id === "pl-more") { st.shown += PAGE; return renderList(); }
    const card = e.target.closest(".pl-card");
    if (card) {
      const id = card.dataset.id;
      if (st.open.has(id)) st.open.delete(id); else st.open.add(id);
      const it = current.find((x) => x.src + "|" + x.code === id);
      if (it) card.outerHTML = itemCard(it, st.open.has(id));
    }
  });
  let timer;
  bodyEl.addEventListener("input", (e) => {
    if (e.target.id === "pl-q") {
      clearTimeout(timer);
      timer = setTimeout(() => { st.q = e.target.value; st.shown = PAGE; renderList(); }, 120);
    } else if (e.target.id === "pl-dq") {
      clearTimeout(timer);
      timer = setTimeout(() => { st.cfg = parseQuickDrawer(e.target.value, st.cfg); saveStored({ ...loadStored(), cfg: st.cfg }); renderDrawer(); }, 250);
    } else if (e.target.id === "pl-n") {
      const v = parseInt(e.target.value, 10);
      if (v > 0) { st.cfg.n = Math.min(99, v); clearTimeout(timer); timer = setTimeout(renderDrawer, 400); }
    }
  });
  bodyEl.addEventListener("change", (e) => {
    if (e.target.id === "pl-sort") { st.sort = e.target.value; saveStored({ ...loadStored(), src: st.src, typ: st.typ, sort: st.sort }); renderList(); }
  });

  renderChips();
  renderList();
}
