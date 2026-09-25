// src/ui/csvEditor.js
// Edytor i eksport CSV listy formatek (przycisk "Eksport CSV" w oknie Produkcja).
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";
import { getPartEdges, describeEdges } from "../engine/edgeBanding.js";

const DISPLAY_FILTERS = [
    { value: 'all', label: 'Wszystko' },
    { value: 'Korpus', label: 'Korpus' },
    { value: 'Front', label: 'Fronty' },
    { value: 'Plecy', label: 'Plecy' },
    { value: 'Szuflada', label: 'Szuflady' }
];
const CAT_ORDER = { 'Korpus': 1, 'Front': 2, 'Szuflada': 3, 'Plecy': 4, 'Inne': 5 };

function rowHtml(cat, name, length, width, qty, source, edges) {
    return `
      <tr data-category="${escapeHtml(cat)}">
        <td><input type="text" class="input csv-cat-input" data-cat="${escapeHtml(cat)}" value="${escapeHtml(cat)}"></td>
        <td><input type="text" class="input" value="${escapeHtml(name)}"></td>
        <td><input type="number" class="input" value="${length}"></td>
        <td><input type="number" class="input" value="${width}"></td>
        <td><input type="number" class="input" value="${qty}"></td>
        <td><input type="text" class="input csv-small" value="${escapeHtml(source)}"></td>
        <td><input type="text" class="input csv-small" value="${escapeHtml(edges)}"></td>
        <td class="csv-del"><button type="button" class="btn btn-sm btn-danger btn-del-row" title="Usuń wiersz"><i class="ti ti-x" aria-hidden="true"></i></button></td>
      </tr>`;
}

function openCsvEditorModal(partsList) {
    let displayFilter = 'all';
    partsList.sort((a, b) => (CAT_ORDER[a.category] || 99) - (CAT_ORDER[b.category] || 99));
    const rules = state.project.edgeBanding;

    const rows = partsList.map(p => rowHtml(
        p.category || 'Inne', p.name, p.length, p.width, p.qty, (p.modules || []).join(' + '),
        describeEdges(getPartEdges(p, rules))
    )).join('');

    const dlg = openModal({
        title: 'Menedżer formatek (Pre-flight)',
        subtitle: 'Przed eksportem możesz poprawić, dodać lub usunąć formatki. Zmiany dotyczą tylko pliku CSV.',
        width: 980,
        dismissable: false,
        body: `
            <div id="csv-display-filters" class="csv-filters"></div>
            <div id="csv-filter-count" class="modal-sub" style="margin:8px 0"></div>
            <div class="csv-table-wrap">
              <table class="cost-table csv-table">
                <thead><tr>
                  <th>Kategoria</th><th>Nazwa elementu</th><th style="width:90px">Dł. (mm)</th><th style="width:90px">Szer. (mm)</th>
                  <th style="width:70px">Ilość</th><th>Źródło / Szafki</th><th style="width:110px">Okleina</th><th style="width:50px"></th>
                </tr></thead>
                <tbody id="csv-editor-tbody">${rows}</tbody>
              </table>
            </div>`,
        footer: [
            { label: 'Dodaj pusty wiersz', icon: 'plus', onClick: () => addRow() },
            { label: 'Anuluj' },
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
            const show = displayFilter === 'all' || cat === displayFilter;
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
        let csvContent = "﻿Kategoria;Nazwa;Dlugosc(mm);Szerokosc(mm);Ilosc;Zrodlo;Okleina\n";

        root.querySelectorAll('#csv-editor-tbody tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const cat = inputs[0].value.replace(/"/g, '""');
            if (filterMode !== 'all' && cat !== filterMode) return;

            const name = inputs[1].value.replace(/"/g, '""');
            const len = inputs[2].value;
            const wid = inputs[3].value;
            const qty = inputs[4].value;
            const src = inputs[5].value.replace(/"/g, '""');
            const edge = inputs[6].value.replace(/"/g, '""');

            csvContent += `"${cat}";"${name}";${len};${wid};${qty};"${src}";"${edge}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);

        const projName = state.project.name.replace(/\s+/g, '_');
        const fileNameSuffix = filterMode === 'all' ? 'Cale_Zlecenie' : filterMode;
        link.download = `Formatki_${fileNameSuffix}_${projName}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        close();
    }

    renderFilterButtons();
    attachRowEvents();
    applyDisplayFilter();
}

// Akcja wołana z okna Produkcja (ui/productionHub.js): liczy formatki w chwili
// wywołania, nie polega na zmiennych z renderu panelu.
export function openCsvExport() {
  const allParts = calculateAllProjectParts();
  if (allParts.length === 0) {
    alert("Twój projekt jest pusty. Dodaj szafkę, aby wygenerować formatki.");
    return;
  }
  openCsvEditorModal(allParts);
}
