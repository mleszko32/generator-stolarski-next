// src/ui/csvEditor.js
// Edytor i eksport CSV listy formatek (przycisk "Eksport CSV" w oknie Produkcja).
import { collectProjectParts } from "../engine/cabinet.js";
import { aggregateByFurniture, furnitureChoices } from "../core/furnitureGroups.js";
import { state } from "../core/state.js";
import { escapeHtml, downloadFile } from "../utils/dom.js";
import { openModal, showAlert } from "../utils/modal.js";
import { getPartEdges, describeEdges } from "../engine/edgeBanding.js";
import { buildFc2Csv, fc2SymbolSlots, getFc2Settings } from "../engine/fc2Export.js";
import { scheduleCheckpoint } from "../core/history.js";
import { baseCategory } from "../core/materialCatalog.js";

const DISPLAY_FILTERS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'Korpus', label: 'Korpus' },
    { value: 'Front', label: 'Fronty' },
    { value: 'Plecy', label: 'Plecy' },
    { value: 'Szuflada', label: 'Szuflady' }
];
const CAT_ORDER = { 'Korpus': 1, 'Front': 2, 'Szuflada': 3, 'Plecy': 4, 'Inne': 5 };

// meta: { materialId, edges, furniture } - materiał i krawędzie nie edytowane w tabeli, potrzebne
// do eksportu FC2; furniture = nazwa mebla (przedrostek opisu w FC2/SAS, kolumna „Mebel”).
// Kolejność pól input w wierszu jest ważna (indeksy w saveCsv / collectFc2).
function rowHtml(cat, name, length, width, qty, source, edges, meta = {}) {
    return `
      <tr data-category="${escapeHtml(cat)}" data-mat="${escapeHtml(meta.materialId || '')}" data-edges="${escapeHtml(JSON.stringify(meta.edges || [true, true, true, true]))}">
        <td><input type="text" class="input csv-cat-input" data-cat="${escapeHtml(cat)}" value="${escapeHtml(cat)}"></td>
        <td><input type="text" class="input" value="${escapeHtml(name)}"></td>
        <td><input type="text" class="input csv-furn-input" value="${escapeHtml(meta.furniture || '')}" title="Mebel - przedrostek opisu formatki w FC2 / SAS"></td>
        <td><input type="number" class="input" value="${length}"></td>
        <td><input type="number" class="input" value="${width}"></td>
        <td><input type="number" class="input" value="${qty}"></td>
        <td><input type="text" class="input csv-small" value="${escapeHtml(source)}"></td>
        <td><input type="text" class="input csv-small" value="${escapeHtml(edges)}"></td>
        <td class="csv-del"><button type="button" class="btn btn-sm btn-danger btn-del-row" title="Usuń wiersz"><i class="ti ti-x" aria-hidden="true"></i></button></td>
      </tr>`;
}

// rawParts = formatki z collectProjectParts (każda z furnitureKey); tabela sumuje je w obrębie
// mebla tylko z zaznaczonych mebli.
function openCsvEditorModal(rawParts) {
    let displayFilter = 'all';
    const rules = state.project.edgeBanding;
    const fc2 = getFc2Settings(state.project);
    const choices = furnitureChoices(state.project, rawParts);
    let excluded = fc2.excludedFurniture.filter(k => choices.some(c => c.key === k));
    const fc2Slots = fc2SymbolSlots(aggregateByFurniture(rawParts, state.project), state.project);

    function rowsHtml() {
        const partsList = aggregateByFurniture(rawParts, state.project, excluded);
        // „Korpus: <dekor>” obok „Korpus”, każdy dekor zgrupowany razem; w kategorii po meblu
        partsList.sort((a, b) => (CAT_ORDER[baseCategory(a.category)] || 99) - (CAT_ORDER[baseCategory(b.category)] || 99)
            || String(a.category).localeCompare(String(b.category), 'pl')
            || String(a.furnitureLabel).localeCompare(String(b.furnitureLabel), 'pl', { numeric: true }));
        return partsList.map(p => rowHtml(
            p.category || 'Inne', p.name, p.length, p.width, p.qty, (p.modules || []).join(' + '),
            describeEdges(getPartEdges(p, rules)), { materialId: p.materialId, edges: getPartEdges(p, rules), furniture: p.furnitureLabel }
        )).join('');
    }
    const furnitureHtml = choices.length > 1 ? `
            <div class="field"><span>Meble w zestawieniu (odznaczone nie idą do tabeli ani do CSV / FC2 / SAS):</span></div>
            <div class="csv-furniture">
              ${choices.map(c => `<label><input type="checkbox" class="csv-furn-check" data-key="${escapeHtml(c.key)}" ${excluded.includes(c.key) ? '' : 'checked'}> ${escapeHtml(c.label)}</label>`).join('')}
              <button type="button" class="btn btn-sm" id="csv-furn-all">Wszystkie</button>
              <button type="button" class="btn btn-sm" id="csv-furn-none">Żaden</button>
            </div>` : '';

    const dlg = openModal({
        title: 'Menedżer formatek (Pre-flight)',
        subtitle: 'Przed eksportem możesz poprawić, dodać lub usunąć formatki. Zmiany dotyczą tylko pliku CSV.',
        width: 980,
        dismissable: false,
        body: `${furnitureHtml}
            <div id="csv-display-filters" class="csv-filters"></div>
            <div id="csv-filter-count" class="modal-sub" style="margin:8px 0"></div>
            <div class="csv-table-wrap">
              <table class="cost-table csv-table">
                <thead><tr>
                  <th>Kategoria</th><th>Nazwa elementu</th><th style="width:110px">Mebel</th><th style="width:90px">Dł. (mm)</th><th style="width:90px">Szer. (mm)</th>
                  <th style="width:70px">Ilość</th><th>Źródło / Szafki</th><th style="width:110px">Okleina</th><th style="width:50px"></th>
                </tr></thead>
                <tbody id="csv-editor-tbody">${rowsHtml()}</tbody>
              </table>
            </div>
            <details class="fc2-settings" style="margin-top:12px">
              <summary><b>Eksport FC2 / SAS</b> - symbole materiałów i okleiny (zapamiętywane w projekcie)</summary>
              <div class="fc2-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px">
                ${fc2Slots.map(sl => `<label class="field"><span>${escapeHtml(sl.label)}</span><input type="text" class="input fc2-symbol" data-key="${escapeHtml(sl.key)}" value="${escapeHtml(fc2.symbols[sl.key] || '')}" placeholder="${escapeHtml(sl.auto || sl.label)}" title="Puste = ${escapeHtml(sl.auto || sl.label)} (z projektu)">
                  <input type="text" class="input fc2-edge-slot" data-key="${escapeHtml(sl.key)}" value="${escapeHtml(fc2.edges[sl.key] || '')}" placeholder="okleina: jak wspólna" title="Okleina tej płyty (puste = wspólna)"></label>`).join('')}
                <label class="field"><span>Okleina wspólna</span><input type="text" class="input" id="fc2-edge" value="${escapeHtml(fc2.edgeSymbol)}"></label>
                <label class="field" style="align-self:end"><span><input type="checkbox" id="fc2-bolding" ${fc2.bolding ? 'checked' : ''}> Pogrubienie</span></label>
                <label class="field" style="align-self:end"><span><input type="checkbox" id="fc2-grain" ${fc2.grain ? 'checked' : ''}> Struktura (tylko SAS)</span></label>
              </div>
              <div class="hint">Okleina: dłuższe krawędzie = góra/dół, krótsze = lewa/prawa. Puste pole symbolu = indeks SAS płyty z projektu (dekor korpusu, płyta frontu z cennika), a gdy płyty nie ma w bazie SAS - jej nazwa; wpisz symbol tylko, żeby to zmienić. Opis = mebel + nazwa formatki (np. „S.6.2 Bok”), bez polskich liter, maks. 50 znaków.
                SAS: „Kopiuj do SAS” → w eSAS w zamówieniu „Import danych” → „Wklej ze schowka” → „Importuj”. Do SAS formatki idą bez oklejania (okleina tylko w pliku FC2).</div>
            </details>`,
        footer: [
            { label: 'Dodaj pusty wiersz', icon: 'plus', onClick: () => addRow() },
            { label: 'Anuluj' },
            { label: 'Kopiuj do SAS', icon: 'clipboard', onClick: (close) => copySas(close) },
            { label: 'Zapisz plik FC2', icon: 'file-export', onClick: (close) => saveFc2(close) },
            { label: 'Zapisz plik CSV', kind: 'primary', icon: 'device-floppy', onClick: (close) => saveCsv(close) },
        ],
    });
    // "Dodaj" po lewej, reszta po prawej
    dlg.footEl.firstElementChild.style.marginRight = 'auto';
    const root = dlg.modal;

    function getRowCategory(tr) {
        const catInput = tr.querySelector('.csv-cat-input');
        return (catInput ? catInput.value : tr.getAttribute('data-category') || 'Inne').trim();
    }

    function applyDisplayFilter() {
        let visible = 0;
        root.querySelectorAll('#csv-editor-tbody tr').forEach(tr => {
            const cat = getRowCategory(tr);
            tr.setAttribute('data-category', cat);
            const show = displayFilter === 'all' || baseCategory(cat) === displayFilter;
            tr.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        const label = DISPLAY_FILTERS.find(f => f.value === displayFilter)?.label || 'Wszystko';
        root.querySelector('#csv-filter-count').textContent = visible === 0
            ? `Brak formatek w widoku: ${label}`
            : `Widoczne formatki: ${visible} (${label})`;
        root.querySelectorAll('.csv-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === displayFilter);
        });
    }

    function renderFilterButtons() {
        const wrap = root.querySelector('#csv-display-filters');
        wrap.innerHTML = DISPLAY_FILTERS.map(f => `<button type="button" class="btn btn-sm csv-filter-btn" data-filter="${f.value}">${f.label}</button>`).join('');
        wrap.querySelectorAll('.csv-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                displayFilter = btn.getAttribute('data-filter');
                applyDisplayFilter();
            });
        });
    }

    function addRow() {
        const defaultCat = displayFilter === 'all' ? 'Inne' : displayFilter;
        root.querySelector('#csv-editor-tbody').insertAdjacentHTML('beforeend', rowHtml(defaultCat, 'Nowa formatka', 0, 0, 1, 'Ręcznie dodane', 'dookoła'));
        attachRowEvents();
        applyDisplayFilter();
    }

    function attachRowEvents() {
        root.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = function() {
                this.closest('tr').remove();
                applyDisplayFilter();
            };
        });
        root.querySelectorAll('.csv-cat-input').forEach(inp => {
            inp.onchange = function() {
                this.closest('tr').setAttribute('data-category', this.value.trim());
                this.setAttribute('data-cat', this.value.trim());
                applyDisplayFilter();
            };
        });
    }

    function saveCsv(close) {
        const filterMode = displayFilter;
        let csvContent = "﻿Kategoria;Mebel;Nazwa;Dlugosc(mm);Szerokosc(mm);Ilosc;Zrodlo;Okleina\n";

        root.querySelectorAll('#csv-editor-tbody tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const cat = inputs[0].value.replace(/"/g, '""');
            if (filterMode !== 'all' && cat !== filterMode) return;

            const name = inputs[1].value.replace(/"/g, '""');
            const furn = inputs[2].value.replace(/"/g, '""');
            const len = inputs[3].value;
            const wid = inputs[4].value;
            const qty = inputs[5].value;
            const src = inputs[6].value.replace(/"/g, '""');
            const edge = inputs[7].value.replace(/"/g, '""');

            csvContent += `"${cat}";"${furn}";"${name}";${len};${wid};${qty};"${src}";"${edge}"\n`;
        });

        const projName = state.project.name.replace(/\s+/g, '_');
        const fileNameSuffix = filterMode === 'all' ? 'Cale_Zlecenie' : filterMode;
        downloadFile(`Formatki_${fileNameSuffix}_${projName}.csv`, csvContent, 'text/csv;charset=utf-8;');
        close();
    }

    // Eksport FC2: te same wiersze co CSV (z poprawkami z tabeli i filtrem kategorii), symbole z
    // pól pod tabelą. Okleina z ustawień krawędzi formatki; wpisane ręcznie „dookoła”/„brak” wygrywa.
    function saveFc2(close) {
        const { rows, settings } = collectFc2();
        const projName = state.project.name.replace(/\s+/g, '_');
        const fileNameSuffix = displayFilter === 'all' ? 'Cale_Zlecenie' : displayFilter;
        downloadFile(`FC2_${fileNameSuffix}_${projName}.csv`, buildFc2Csv(rows, state.project, settings), 'text/csv;charset=utf-8;');
        close();
    }

    // SAS (eSAS): te same wiersze w układzie FastCut, do schowka - w eSAS „Import danych” → „Wklej ze schowka”.
    async function copySas(close) {
        const { rows, settings } = collectFc2();
        const text = buildFc2Csv(rows, state.project, settings, 'sas');
        try {
            await navigator.clipboard.writeText(text);
            close();
            showAlert(`Skopiowano ${text.trim().split('\r\n').filter(Boolean).length} formatek. W eSAS: zamówienie → „Import danych” → „Wklej ze schowka” → „Importuj”.`);
        } catch (e) {
            const projName = state.project.name.replace(/\s+/g, '_');
            downloadFile(`SAS_${projName}.csv`, text, 'text/csv;charset=utf-8;');
            close();
        }
    }

    function collectFc2() {
        const symbols = {};
        root.querySelectorAll('.fc2-symbol').forEach(inp => { if (inp.value.trim()) symbols[inp.getAttribute('data-key')] = inp.value.trim(); });
        const settings = { excludedFurniture: excluded, symbols: { ...getFc2Settings(state.project).symbols, ...symbols }, edgeSymbol: root.querySelector('#fc2-edge').value.trim(), bolding: root.querySelector('#fc2-bolding').checked, grain: root.querySelector('#fc2-grain').checked };
        root.querySelectorAll('.fc2-symbol').forEach(inp => { if (!inp.value.trim()) delete settings.symbols[inp.getAttribute('data-key')]; });
        settings.edges = { ...getFc2Settings(state.project).edges };
        root.querySelectorAll('.fc2-edge-slot').forEach(inp => {
            const k = inp.getAttribute('data-key');
            if (inp.value.trim()) settings.edges[k] = inp.value.trim(); else delete settings.edges[k];
        });
        state.project.fc2Export = settings;
        scheduleCheckpoint();

        const rows = [];
        root.querySelectorAll('#csv-editor-tbody tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const category = inputs[0].value.trim();
            if (displayFilter !== 'all' && baseCategory(category) !== displayFilter) return;
            const edgeText = inputs[7].value.trim();
            let edges;
            try { edges = JSON.parse(tr.getAttribute('data-edges')); } catch (e) { edges = [true, true, true, true]; }
            if (edgeText === 'dookoła') edges = [true, true, true, true];
            if (edgeText === 'brak') edges = [false, false, false, false];
            rows.push({ category, name: inputs[1].value, furnitureLabel: inputs[2].value, length: inputs[3].value, width: inputs[4].value, qty: inputs[5].value, materialId: tr.getAttribute('data-mat') || undefined, edges });
        });
        return { rows, settings };
    }

    // Zmiana wyboru mebli przelicza tabelę od nowa (ręczne poprawki w wierszach przepadają)
    // i zapamiętuje wybór w projekcie.
    function setExcluded(next) {
        excluded = next;
        state.project.fc2Export = { ...(state.project.fc2Export || {}), excludedFurniture: excluded };
        scheduleCheckpoint();
        root.querySelectorAll('.csv-furn-check').forEach(cb => { cb.checked = !excluded.includes(cb.getAttribute('data-key')); });
        root.querySelector('#csv-editor-tbody').innerHTML = rowsHtml();
        attachRowEvents();
        applyDisplayFilter();
    }
    root.querySelectorAll('.csv-furn-check').forEach(cb => {
        cb.addEventListener('change', () => {
            const key = cb.getAttribute('data-key');
            setExcluded(cb.checked ? excluded.filter(k => k !== key) : [...excluded, key]);
        });
    });
    root.querySelector('#csv-furn-all')?.addEventListener('click', () => setExcluded([]));
    root.querySelector('#csv-furn-none')?.addEventListener('click', () => setExcluded(choices.map(c => c.key)));

    renderFilterButtons();
    attachRowEvents();
    applyDisplayFilter();
}

// Akcja wołana z okna Produkcja (ui/productionHub.js): liczy formatki w chwili
// wywołania, nie polega na zmiennych z renderu panelu.
export function openCsvExport() {
  const allParts = collectProjectParts();
  if (allParts.length === 0) {
    showAlert("Twój projekt jest pusty. Dodaj szafkę, aby wygenerować formatki.");
    return;
  }
  openCsvEditorModal(allParts);
}
