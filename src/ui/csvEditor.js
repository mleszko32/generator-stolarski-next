// src/ui/csvEditor.js
// Edytor i eksport CSV listy formatek (przycisk "Eksport CSV" w oknie Produkcja).
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";

function openCsvEditorModal(partsList) {
    const catOrder = { 'Korpus': 1, 'Front': 2, 'Szuflada': 3, 'Plecy': 4, 'Inne': 5 };
    const displayFilters = [
        { value: 'all', label: 'Wszystko' },
        { value: 'Korpus', label: 'Korpus' },
        { value: 'Front', label: 'Fronty' },
        { value: 'Plecy', label: 'Plecy' },
        { value: 'Szuflada', label: 'Szuflady' }
    ];
    let displayFilter = 'all';

    partsList.sort((a, b) => (catOrder[a.category] || 99) - (catOrder[b.category] || 99));

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
        alignItems: 'center', justifyContent: 'center'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        backgroundColor: '#fff', width: '95%', maxWidth: '900px', maxHeight: '90vh',
        borderRadius: '8px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
    });

    const header = document.createElement('div');
    header.innerHTML = `
        <h2 style="margin:0 0 12px 0; color:#1e293b;">Menedżer formatek (Pre-flight)</h2>
        <div id="csv-display-filters" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
        <div id="csv-filter-count" style="font-size:12px; color:#64748b; margin-bottom:8px;"></div>
    `;
    
    const tableContainer = document.createElement('div');
    Object.assign(tableContainer.style, { overflowY: 'auto', flexGrow: '1', marginBottom: '15px' });

    let tableHtml = `
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
        <thead style="background: #f8fafc; position: sticky; top: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <tr>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Kategoria</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Nazwa elementu</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 90px;">Dł. (mm)</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 90px;">Szer. (mm)</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 70px;">Ilość</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1;">Źródło / Szafki</th>
            <th style="padding: 10px; border-bottom: 2px solid #cbd5e1; width: 50px;">Usuń</th>
          </tr>
        </thead>
        <tbody id="csv-editor-tbody">
    `;

    partsList.forEach((p, idx) => {
        let catColor = '#94a3b8';
        if(p.category === 'Korpus') catColor = '#3b82f6';
        if(p.category === 'Front') catColor = '#8b5cf6';
        if(p.category === 'Szuflada') catColor = '#f59e0b';
        if(p.category === 'Plecy') catColor = '#10b981';

        tableHtml += `
          <tr data-category="${escapeHtml(p.category || 'Inne')}" style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
            <td style="padding: 6px;"><input type="text" class="csv-cat-input" value="${escapeHtml(p.category || 'Inne')}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-weight:bold; color:${catColor};"></td>
            <td style="padding: 6px;"><input type="text" value="${escapeHtml(p.name)}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.length}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.width}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="${p.qty}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="text" value="${escapeHtml(p.modules.join(' + '))}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-size:11px; color:#64748b;"></td>
            <td style="padding: 6px; text-align:center;"><button class="btn-del-row" style="background:#ef4444; color:white; border:none; border-radius:3px; cursor:pointer; padding:4px 8px;"><i class="ti ti-x" aria-hidden="true"></i></button></td>
          </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    tableContainer.innerHTML = tableHtml;

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' });
    
    footer.innerHTML = `
        <button id="csv-btn-add" style="background:#3b82f6; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold;"><i class="ti ti-plus" aria-hidden="true"></i> Dodaj pusty wiersz</button>
        <div style="display: flex; gap: 10px; align-items: center;">
            <button id="csv-btn-cancel" style="background:#94a3b8; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">Anuluj</button>
            <button id="csv-btn-save" style="background:#10b981; color:white; border:none; padding:10px 15px; border-radius:5px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);"><i class="ti ti-device-floppy" aria-hidden="true"></i> Pobierz plik CSV</button>
        </div>
    `;

    modal.appendChild(header);
    modal.appendChild(tableContainer);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function getRowCategory(tr) {
        const catInput = tr.querySelector('.csv-cat-input');
        return (catInput ? catInput.value : tr.getAttribute('data-category') || 'Inne').trim();
    }

    function applyDisplayFilter() {
        const rows = document.querySelectorAll('#csv-editor-tbody tr');
        let visible = 0;
        rows.forEach(tr => {
            const cat = getRowCategory(tr);
            tr.setAttribute('data-category', cat);
            const show = displayFilter === 'all' || cat === displayFilter;
            tr.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        const countEl = document.getElementById('csv-filter-count');
        if (countEl) {
            const label = displayFilters.find(f => f.value === displayFilter)?.label || 'Wszystko';
            countEl.textContent = visible === 0
                ? `Brak formatek w widoku: ${label}`
                : `Widoczne formatki: ${visible} (${label})`;
        }

        document.querySelectorAll('#csv-display-filters .csv-filter-btn').forEach(btn => {
            const active = btn.getAttribute('data-filter') === displayFilter;
            btn.style.background = active ? '#1e293b' : '#f8fafc';
            btn.style.color = active ? '#ffffff' : '#334155';
            btn.style.borderColor = active ? '#1e293b' : '#cbd5e1';
        });
    }

    function renderFilterButtons() {
        const wrap = document.getElementById('csv-display-filters');
        wrap.innerHTML = displayFilters.map(f => `
            <button type="button" class="csv-filter-btn" data-filter="${f.value}"
                style="padding:7px 12px; border-radius:999px; border:1px solid #cbd5e1; background:#f8fafc; color:#334155; cursor:pointer; font-weight:bold; font-size:12px;">
                ${f.label}
            </button>
        `).join('');
        wrap.querySelectorAll('.csv-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                displayFilter = btn.getAttribute('data-filter');
                applyDisplayFilter();
            });
        });
    }

    document.getElementById('csv-btn-add').addEventListener('click', () => {
        const tbody = document.getElementById('csv-editor-tbody');
        const defaultCat = displayFilter === 'all' ? 'Inne' : displayFilter;
        const tr = document.createElement('tr');
        tr.setAttribute('data-category', defaultCat);
        tr.style.borderBottom = "1px solid #e2e8f0";
        tr.innerHTML = `
            <td style="padding: 6px;"><input type="text" class="csv-cat-input" value="${defaultCat}" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-weight:bold; color:#ef4444;"></td>
            <td style="padding: 6px;"><input type="text" value="Nowa formatka" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="0" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="0" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="number" value="1" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px;"></td>
            <td style="padding: 6px;"><input type="text" value="Ręcznie dodane" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:3px; font-size:11px; color:#64748b;"></td>
            <td style="padding: 6px; text-align:center;"><button class="btn-del-row" style="background:#ef4444; color:white; border:none; border-radius:3px; cursor:pointer; padding:4px 8px;"><i class="ti ti-x" aria-hidden="true"></i></button></td>
        `;
        tbody.appendChild(tr);
        attachRowEvents();
        applyDisplayFilter();
    });

    function attachRowEvents() {
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = function() {
                this.closest('tr').remove();
                applyDisplayFilter();
            };
        });
        document.querySelectorAll('.csv-cat-input').forEach(inp => {
            inp.onchange = function() {
                this.closest('tr').setAttribute('data-category', this.value.trim());
                applyDisplayFilter();
            };
        });
    }
    renderFilterButtons();
    attachRowEvents();
    applyDisplayFilter();

    document.getElementById('csv-btn-cancel').addEventListener('click', () => { document.body.removeChild(overlay); });

    document.getElementById('csv-btn-save').addEventListener('click', () => {
        const filterMode = displayFilter;
        let csvContent = "\uFEFFKategoria;Nazwa;Dlugosc(mm);Szerokosc(mm);Ilosc;Zrodlo\n";
        
        const rows = document.querySelectorAll('#csv-editor-tbody tr');
        rows.forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const cat = inputs[0].value.replace(/"/g, '""');
            
            if (filterMode !== 'all' && cat !== filterMode) {
                return; 
            }

            const name = inputs[1].value.replace(/"/g, '""');
            const len = inputs[2].value;
            const wid = inputs[3].value;
            const qty = inputs[4].value;
            const src = inputs[5].value.replace(/"/g, '""');
            
            csvContent += `"${cat}";"${name}";${len};${wid};${qty};"${src}"\n`;
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
        
        document.body.removeChild(overlay);
    });
}

// Akcje wyjściowe wyciągnięte z updateSidebar - wołane z lewego panelu i z okna
// Produkcja (ui/productionHub.js). Każda liczy potrzebne dane w chwili
// wywołania, nie polega na zmiennych z renderu panelu.
export function openCsvExport() {
  const allParts = calculateAllProjectParts();
  if (allParts.length === 0) {
    alert("Twój projekt jest pusty. Dodaj szafkę, aby wygenerować formatki.");
    return;
  }
  openCsvEditorModal(allParts);
}
