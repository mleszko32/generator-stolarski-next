import { calculateParts, calculateAllProjectParts, calculateProjectHardware, calculateProjectCost } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js"; 
import { state, getActiveModule, addModule, deleteModule, duplicateModule, addSidePanel, deleteSidePanel, addCornerModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel, openCornerBlankPrintView } from "./properties.js";
import { openCutPlanModal } from "./cutPlanModal.js";
import { openProductionHub } from "./productionHub.js";
import { escapeHtml } from "../utils/dom.js";
import { scheduleCheckpoint } from "../core/history.js";
import { renderInteriorEditorIfVisible } from "./interiorEditor.js";

function showLoading(msg) {
    let l = document.getElementById('ai-loader');
    if(!l) {
        l = document.createElement('div');
        l.id = 'ai-loader';
        Object.assign(l.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#10b981', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: '9999',
            fontSize: '24px', fontWeight: 'bold', flexDirection: 'column'
        });
        document.body.appendChild(l);
    }
    l.innerHTML = `<div><i class="ti ti-wand" aria-hidden="true"></i> ${msg}</div><div style="font-size:14px; margin-top:15px; color:#94a3b8;">Sztuczna Inteligencja rozrysowuje wnęki i półki. Cierpliwości...</div>`;
    l.style.display = 'flex';
}

function hideLoading() {
    const l = document.getElementById('ai-loader');
    if(l) l.style.display = 'none';
}

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

function formatPLN(n) {
    return (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

// Szacunkowy kosztorys materiałowy - ceny płyty/HDF/okuć edytowalne na żywo,
// zapisywane bezpośrednio w state.project.pricing (patrz core/state.js:
// ensurePricingDefaults), więc lecą do chmury razem z resztą projektu przy
// zwykłym "Zapisz projekt" - nie ma tu osobnego przycisku zapisu. Lista
// okuć jest dynamiczna (patrz engine/cabinet.js: calculateProjectHardware),
// więc ceny okuć trzymane są w słowniku nazwa->cena, uzupełnianym o nowe
// pozycje w miarę jak pojawiają się w projekcie.
function openKosztorysModal() {
    const pricing = state.project.pricing;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: '10000', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        backgroundColor: '#fff', width: '100%', maxWidth: '640px', borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
    });

    modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:20px 22px 16px 22px; border-bottom:1px solid #e2e8f0;">
            <div>
                <h2 style="margin:0 0 2px 0; font-size:18px; color:#1e293b;"><i class="ti ti-calculator" aria-hidden="true"></i> Kosztorys projektu</h2>
                <p style="margin:0; color:#64748b; font-size:12.5px;">${escapeHtml(state.project.name)} · ceny edytowalne, liczone na żywo</p>
            </div>
            <button id="kosztorys-close" style="border:none; background:#f8fafc; color:#64748b; width:28px; height:28px; border-radius:6px; font-size:14px; cursor:pointer; flex-shrink:0;">✕</button>
        </div>
        <div style="padding:18px 22px; display:flex; flex-direction:column; gap:20px; max-height:60vh; overflow-y:auto;">

            <section>
                <h3 style="margin:0 0 8px 0; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#64748b;">Materiały płytowe</h3>
                <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                    <thead><tr>
                        <th style="text-align:left; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Materiał</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Powierzchnia</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Cena / m²</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Koszt</th>
                    </tr></thead>
                    <tbody id="kosztorys-materials-tbody"></tbody>
                </table>
            </section>

            <section>
                <h3 style="margin:0 0 8px 0; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#64748b;">Okucia</h3>
                <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                    <thead><tr>
                        <th style="text-align:left; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Pozycja</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Ilość</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Cena jedn.</th>
                        <th style="text-align:right; font-size:10.5px; color:#64748b; font-weight:600; padding:0 8px 6px 0; border-bottom:1px solid #cbd5e1;">Koszt</th>
                    </tr></thead>
                    <tbody id="kosztorys-hardware-tbody"></tbody>
                </table>
            </section>

            <section>
                <h3 style="margin:0 0 8px 0; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#64748b;">Robocizna, montaż, transport</h3>
                <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                    <tr><td style="padding:6px 8px 6px 0;">Robocizna (warsztat)</td><td style="text-align:right;"><input type="number" id="kosztorys-labor-hours" value="${pricing.labor.hours}" step="any" min="0" style="width:64px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;h</td><td style="text-align:right;"><input type="number" id="kosztorys-labor-rate" value="${pricing.labor.rate}" step="any" min="0" style="width:70px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;zł/h</td><td id="kosztorys-labor-cost" style="text-align:right; font-weight:600;">—</td></tr>
                    <tr><td style="padding:6px 8px 6px 0;">Montaż</td><td style="text-align:right;"><input type="number" id="kosztorys-assembly-hours" value="${pricing.assembly.hours}" step="any" min="0" style="width:64px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;h</td><td style="text-align:right;"><input type="number" id="kosztorys-assembly-rate" value="${pricing.assembly.rate}" step="any" min="0" style="width:70px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;zł/h</td><td id="kosztorys-assembly-cost" style="text-align:right; font-weight:600;">—</td></tr>
                    <tr><td style="padding:6px 8px 6px 0;">Transport</td><td></td><td style="text-align:right;"><input type="number" id="kosztorys-transport" value="${pricing.transport}" step="any" min="0" style="width:70px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;zł</td><td></td></tr>
                </table>
            </section>

            <div style="display:flex; align-items:center; justify-content:space-between; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:10px 14px;">
                <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600; color:#92400e;">
                    Marża
                    <input type="number" id="kosztorys-margin" value="${pricing.marginPercent}" step="1" min="0" style="width:56px; text-align:right; border:1px solid #fcd34d; border-radius:5px; padding:4px 6px; font-size:12.5px; color:#92400e; font-weight:700;">%
                </label>
                <span style="font-size:11px; color:#92400e; opacity:.8;">liczona od sumy kosztów</span>
            </div>
            <div style="display:flex; gap:24px; font-size:12.5px; font-weight:600; color:#334155;">
                <label>Rabat <input type="number" id="kosztorys-discount" value="${pricing.discountPercent}" step="any" min="0" max="100" style="width:56px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px;">%</label>
                <label>VAT <input type="number" id="kosztorys-vat" value="${pricing.vatPercent}" step="any" min="0" style="width:56px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px;">%</label>
            </div>

        </div>
        <div style="border-top:1px solid #e2e8f0; padding:16px 22px 20px 22px; display:flex; flex-direction:column; gap:6px; background:#f8fafc;">
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Materiały</span><span id="kosztorys-foot-plyty" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Okucia</span><span id="kosztorys-foot-okucia" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Robocizna</span><span id="kosztorys-foot-labor" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Montaż</span><span id="kosztorys-foot-assembly" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Transport</span><span id="kosztorys-foot-transport" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span><b>Suma kosztów</b></span><span id="kosztorys-foot-subtotal" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Robocizna</span><span id="kosztorys-foot-labor" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Montaż</span><span id="kosztorys-foot-assembly" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Transport</span><span id="kosztorys-foot-transport" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span><b>Suma kosztów</b></span><span id="kosztorys-foot-subtotal" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Marża (<span id="kosztorys-foot-marginpct">0</span>%)</span><span id="kosztorys-foot-margin" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Rabat (<span id="kosztorys-foot-discpct">0</span>%)</span><span id="kosztorys-foot-discount" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span><b>Cena netto</b></span><span id="kosztorys-foot-net" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>VAT (<span id="kosztorys-foot-vatpct">23</span>%)</span><span id="kosztorys-foot-vat" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Rabat (<span id="kosztorys-foot-discpct">0</span>%)</span><span id="kosztorys-foot-discount" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span><b>Cena netto</b></span><span id="kosztorys-foot-net" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>VAT (<span id="kosztorys-foot-vatpct">23</span>%)</span><span id="kosztorys-foot-vat" style="color:#1e293b;">—</span></div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:6px; padding-top:10px; border-top:1px dashed #cbd5e1;">
                <span style="font-weight:700; font-size:13px;">Cena brutto</span>
                <span id="kosztorys-foot-total" style="font-weight:800; font-size:22px; color:#059669;">—</span>
            </div>
            <p style="font-size:10.5px; color:#64748b; margin:8px 0 0 0;">Ceny zapisują się razem z projektem (przycisk "Zapisz projekt"). Ilości pobrane z listy formatek i listy okuć.</p>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Etykiety kategorii formatek (patrz engine/cabinet.js: kategorie części)
    // - front to zwykle inny, droższy materiał niż korpus (lakier, fornir,
    //   okleina), stąd osobny, opisowy wiersz zamiast jednej wspólnej "płyty".
    const MATERIAL_LABELS = {
        Korpus: 'Korpus',
        Front: 'Front (lakier / fornir / okleina)',
        Szuflada: 'Szuflady (dno, tył)',
        Plecy: 'Plecy (HDF)'
    };

    const materialsTbody = modal.querySelector('#kosztorys-materials-tbody');
    const hardwareTbody = modal.querySelector('#kosztorys-hardware-tbody');

    function recalc() {
        modal.querySelectorAll('.kosztorys-mat-price').forEach(input => {
            const cat = input.getAttribute('data-cat');
            pricing.materials[cat] = parseFloat(input.value) || 0;
        });
        modal.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            const name = input.getAttribute('data-name');
            pricing.hardware[name] = parseFloat(input.value) || 0;
        });
        pricing.marginPercent = parseFloat(modal.querySelector('#kosztorys-margin').value) || 0;

        const num = (id) => Math.max(0, parseFloat(modal.querySelector(id).value) || 0);
        pricing.labor = { hours: num('#kosztorys-labor-hours'), rate: num('#kosztorys-labor-rate') };
        pricing.assembly = { hours: num('#kosztorys-assembly-hours'), rate: num('#kosztorys-assembly-rate') };
        pricing.transport = num('#kosztorys-transport');
        pricing.discountPercent = Math.min(100, num('#kosztorys-discount'));
        pricing.vatPercent = num('#kosztorys-vat');

        const cost = calculateProjectCost();

        modal.querySelectorAll('.kosztorys-mat-area').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat);
            cell.textContent = (line ? line.areaM2 : 0).toFixed(2) + ' m²';
        });
        modal.querySelectorAll('.kosztorys-mat-cost').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat);
            cell.textContent = formatPLN(line ? line.cost : 0);
        });
        modal.querySelectorAll('.kosztorys-hw-cost').forEach(cell => {
            const name = cell.getAttribute('data-name');
            const line = cost.hardware.find(h => h.name === name);
            cell.textContent = line ? formatPLN(line.cost) : formatPLN(0);
        });

        modal.querySelector('#kosztorys-foot-plyty').textContent = formatPLN(cost.materialsSubtotal);
        modal.querySelector('#kosztorys-foot-okucia').textContent = formatPLN(cost.hardwareSubtotal);
        modal.querySelector('#kosztorys-foot-margin').textContent = formatPLN(cost.marginAmount);
        modal.querySelector('#kosztorys-foot-marginpct').textContent = cost.marginPercent;
        const set = (id, v) => { modal.querySelector(id).textContent = v; };
        set('#kosztorys-labor-cost', formatPLN(cost.laborCost));
        set('#kosztorys-assembly-cost', formatPLN(cost.assemblyCost));
        set('#kosztorys-foot-labor', formatPLN(cost.laborCost));
        set('#kosztorys-foot-assembly', formatPLN(cost.assemblyCost));
        set('#kosztorys-foot-transport', formatPLN(cost.transportCost));
        set('#kosztorys-foot-subtotal', formatPLN(cost.subtotal));
        set('#kosztorys-foot-discpct', cost.discountPercent);
        set('#kosztorys-foot-discount', '−' + formatPLN(cost.discountAmount));
        set('#kosztorys-foot-net', formatPLN(cost.net));
        set('#kosztorys-foot-vatpct', cost.vatPercent);
        set('#kosztorys-foot-vat', formatPLN(cost.vatAmount));
        set('#kosztorys-foot-total', formatPLN(cost.gross));
    }

    function renderMaterialRows() {
        const cost = calculateProjectCost();
        if (cost.materials.length === 0) {
            materialsTbody.innerHTML = `<tr><td colspan="4" style="padding:12px 0; text-align:center; color:#94a3b8;">Projekt jest pusty</td></tr>`;
            return;
        }
        materialsTbody.innerHTML = cost.materials.map((m, idx) => `
            <tr>
                <td style="padding:8px 8px 8px 0; ${idx < cost.materials.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</td>
                <td class="kosztorys-mat-area" data-cat="${escapeHtml(m.category)}" style="padding:8px 8px 8px 0; ${idx < cost.materials.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''} text-align:right;">${m.areaM2.toFixed(2)}&nbsp;m²</td>
                <td style="padding:8px 8px 8px 0; ${idx < cost.materials.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''} text-align:right;"><input type="number" class="kosztorys-mat-price" data-cat="${escapeHtml(m.category)}" value="${m.pricePerM2}" step="1" min="0" style="width:70px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;zł</td>
                <td class="kosztorys-mat-cost" data-cat="${escapeHtml(m.category)}" style="padding:8px 8px 8px 0; ${idx < cost.materials.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''} text-align:right; font-weight:600;">${formatPLN(m.cost)}</td>
            </tr>
        `).join('');
        materialsTbody.querySelectorAll('.kosztorys-mat-price').forEach(input => {
            input.addEventListener('input', recalc);
        });
    }

    function renderHardwareRows() {
        const cost = calculateProjectCost();
        if (cost.hardware.length === 0) {
            hardwareTbody.innerHTML = `<tr><td colspan="4" style="padding:12px 0; text-align:center; color:#94a3b8;">Brak okuć w projekcie</td></tr>`;
            return;
        }
        hardwareTbody.innerHTML = cost.hardware.map(hw => `
            <tr>
                <td style="padding:8px 8px 8px 0; border-bottom:1px solid #f1f5f9;">${escapeHtml(hw.name)}</td>
                <td style="padding:8px 8px 8px 0; border-bottom:1px solid #f1f5f9; text-align:right; white-space:nowrap;">${hw.qty} ${escapeHtml(hw.unit)}</td>
                <td style="padding:8px 8px 8px 0; border-bottom:1px solid #f1f5f9; text-align:right;"><input type="number" class="kosztorys-hw-price" data-name="${escapeHtml(hw.name)}" value="${hw.price}" step="0.1" min="0" style="width:64px; text-align:right; border:1px solid #cbd5e1; border-radius:5px; padding:4px 6px; font-size:12.5px;">&nbsp;zł</td>
                <td class="kosztorys-hw-cost" data-name="${escapeHtml(hw.name)}" style="padding:8px 8px 8px 0; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:600;">${formatPLN(hw.cost)}</td>
            </tr>
        `).join('');
        hardwareTbody.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            input.addEventListener('input', recalc);
        });
    }

    renderMaterialRows();
    renderHardwareRows();
    recalc();

    modal.querySelector('#kosztorys-margin').addEventListener('input', recalc);
    ['labor-hours','labor-rate','assembly-hours','assembly-rate','transport','discount','vat'].forEach(k => modal.querySelector('#kosztorys-' + k).addEventListener('input', recalc));
    modal.querySelector('#kosztorys-close').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
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

export function printHardwareList() {
  const projectHardware = calculateProjectHardware();
    if (projectHardware.length === 0) {
        alert("Lista zakupów jest pusta.");
        return;
    }
    
    const dateStr = new Date().toLocaleDateString('pl-PL');
    
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
          <meta charset="UTF-8">
          <title>Lista Zakupów - ${escapeHtml(state.project.name)}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; max-width: 900px; margin: 0 auto; }
              .header { border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
              .header h1 { margin: 0; color: #0f172a; font-size: 28px; }
              .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
              th { background-color: #f8fafc; color: #334155; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
              td.qty { font-weight: bold; color: #0f172a; text-align: center; width: 80px; font-size: 15px; }
              td.unit { color: #64748b; text-align: center; width: 80px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              
              @media print {
                  body { padding: 0; max-width: 100%; }
                  .no-print { display: none !important; }
                  .header { border-bottom: 2px solid #000; }
                  th { border-bottom: 2px solid #000; background-color: transparent; }
                  tr:nth-child(even) { background-color: transparent; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="margin-bottom: 30px; display: flex; justify-content: flex-end;">
              <button onclick="window.print()" style="padding: 12px 24px; background-color: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  🖨️ Drukuj / Zapisz jako PDF
              </button>
          </div>
          <div class="header">
              <div>
                  <h1>Lista Zakupów: Okucia</h1>
                  <p>Projekt: <strong style="color: #0f172a;">${escapeHtml(state.project.name)}</strong></p>
              </div>
              <div style="text-align: right; color: #64748b; font-size: 14px;">
                  Data wygenerowania: <strong>${dateStr}</strong>
              </div>
          </div>
          <table>
              <thead>
                  <tr>
                      <th>Nazwa okucia / Elementu</th>
                      <th style="text-align: center;">Ilość</th>
                      <th style="text-align: center;">J.m.</th>
                  </tr>
              </thead>
              <tbody>
    `;
    
    projectHardware.forEach(hw => {
        htmlContent += `
          <tr>
              <td>${escapeHtml(hw.name)}</td>
              <td class="qty">${hw.qty}</td>
              <td class="unit">${escapeHtml(hw.unit)}</td>
          </tr>
        `;
    });
    
    htmlContent += `
              </tbody>
          </table>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
              Wygenerowano automatycznie z systemu Generator Stolarski Next
          </div>
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
}

export function openTechnicalDrawing() {
  const activeMod = getActiveModule();
  if (!activeMod) {
    alert("Wybierz szafkę, aby wygenerować rysunek.");
    return;
  }
  const { parts, mountingData } = calculateParts();
    // Szafka narożna ma własny wydruk (rzut z góry + rysunki wieńca, półki,
    // boków i listwy) - interaktywny rysunek boku niżej zakłada prostokątny
    // korpus.
    if (activeMod.type === 'corner_cabinet') {
        openCornerBlankPrintView(activeMod);
        return;
    }
    try {
        const sidePanel = parts.find(p => p.name.toLowerCase().includes('bok'));
        let drawHeight = sidePanel ? sidePanel.length : (parseFloat(activeMod.dimensions.height) || 720);
        let drawDepth = sidePanel ? sidePanel.width : (parseFloat(activeMod.dimensions.depth) || 510);

        const svgContent = generateSidePanelSVG(drawHeight, drawDepth, mountingData || []);

        // Szafa złożona z kilku zgrupowanych modułów (patrz ui/properties.js:
        // "Połącz zaznaczone w grupę") - widok KORPUS już pokazuje całą grupę
        // naraz (viewer2d.js: stackModules), ale klikalny do nawiertów jest
        // tylko AKTYWNY moduł. Guziki niżej pozwalają przełączyć, który to
        // jest, BEZ zamykania okna wydruku - klikając wywołują z powrotem
        // funkcję w oknie aplikacji (window.opener, ta sama origin co blob:),
        // która realnie przełącza state.activeModuleId (dokładnie tak samo,
        // jakby użytkownik kliknął ten moduł na liście po lewej w aplikacji)
        // i oddaje świeży SVG dla nowego aktywnego modułu.
        const groupId = activeMod.groupId;
        const groupModules = groupId
            ? state.project.modules.filter(m => m.groupId === groupId)
            : [];
        // Metadane nagłówka wydruku formatki (A4) - okno wydruku czyta je z
        // window.opener.__printMeta (świeże po przełączeniu modułu grupy), a gdy
        // aplikacja jest niedostępna, z kopii wstrzykniętej do skryptu okna.
        const buildPrintMeta = (m) => ({
            project: state.project.name || '',
            module: m.name || '',
            th: parseFloat(state.project.materials?.boardThickness) || 18,
            date: new Date().toLocaleDateString('pl-PL'),
        });
        window.__printMeta = buildPrintMeta(activeMod);

        window.__printSelectModule = (moduleId) => {
            state.activeModuleId = moduleId;
            update3D();
            updateSidebar();
            initPropertiesPanel();
            const m = state.project.modules.find(mm => mm.id === moduleId);
            if (!m) return null;
            window.__printMeta = buildPrintMeta(m);
            const { parts: mParts, mountingData: mMountingData } = calculateParts();
            const mSidePanel = mParts.find(p => p.name.toLowerCase().includes('bok'));
            const mDrawHeight = mSidePanel ? mSidePanel.length : (parseFloat(m.dimensions.height) || 720);
            const mDrawDepth = mSidePanel ? mSidePanel.width : (parseFloat(m.dimensions.depth) || 510);
            return generateSidePanelSVG(mDrawHeight, mDrawDepth, mMountingData || []);
        };

        const tabsHtml = groupModules.length > 1 ? `
              <div class="module-tabs">
                  ${groupModules.map(m => `<button class="module-tab${m.id === activeMod.id ? ' active' : ''}" data-module-id="${m.id}" onclick="switchModule('${m.id}', this)">${escapeHtml(m.name)}</button>`).join('')}
              </div>
        ` : '';

        const printMetaJson = JSON.stringify(window.__printMeta).replace(/</g, '\\u003c');
        const htmlContent = `
          <!DOCTYPE html>
          <html lang="pl">
          <head>
              <meta charset="UTF-8">
              <title>Wydruk na produkcję (Interaktywny)</title>
              <style>
                  body { margin: 0; padding: 0; background-color: #f1f5f9; display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                  .header { background-color: #ffffff; padding: 16px 24px; border-bottom: 1px solid #cbd5e1; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); z-index: 10; display: flex; flex-direction: column; gap: 10px; }
                  .header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
                  .header-text h1 { margin: 0 0 6px 0; font-size: 20px; color: #0f172a; }
                  .header-text p { margin: 0; font-size: 13px; color: #64748b; }
                  .controls { display: flex; flex-wrap: wrap; gap: 12px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: bold; color: #334155; align-items: center;}
                  .controls label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
                  .controls input { cursor: pointer; width: 16px; height: 16px; }
                  .svg-container { flex-grow: 1; width: 100%; height: 100%; overflow: hidden; background-color: #f8fafc; cursor: grab; }
                  .svg-container:active { cursor: grabbing; }
                  .btn-front { padding: 6px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold; color: #1e3a8a; cursor: pointer; transition: background 0.2s;}
                  .btn-front:hover { background: #e0f2fe; border-color: #3b82f6;}
                  .module-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
                  .module-tab { padding: 6px 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 999px; font-weight: bold; color: #334155; cursor: pointer; font-size: 12px; transition: all 0.15s; }
                  .module-tab:hover { background: #e0f2fe; border-color: #3b82f6; }
                  .module-tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }
                  select.print-scale { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold; color: #334155; background: #fff; }
                  .btn-print { padding: 6px 12px; background: #2563eb; border: 1px solid #2563eb; border-radius: 4px; font-weight: bold; color: #fff; cursor: pointer; }
                  .btn-print:hover { background: #1d4ed8; }
                  /* Wydruk pojedynczej formatki na A4 (printPart niżej): arkusze w mm,
                     jedna formatka na stronie albo kilka arkuszy z zakładką. */
                  #print-root { display: none; }
                  .sheet { box-sizing: border-box; page-break-after: always; break-after: page; overflow: hidden; background: #fff; color: #0f172a; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
                  .sheet:last-child { page-break-after: auto; break-after: auto; }
                  .sheet-portrait { width: 190mm; height: 275mm; }
                  .sheet-landscape { width: 277mm; height: 188mm; }
                  .sh-head { height: 16mm; margin-bottom: 1mm; border-bottom: 0.4mm solid #0f172a; }
                  .sh-title { font-size: 6mm; font-weight: 800; line-height: 8.5mm; }
                  .sh-sub { font-size: 3.1mm; color: #334155; line-height: 4mm; }
                  .sheet svg { display: block; outline: 0.2mm solid #cbd5e1; outline-offset: -0.2mm; }
                  .sh-foot { height: 12mm; margin-top: 1mm; display: flex; align-items: center; justify-content: space-between; gap: 4mm; font-size: 3mm; color: #334155; }
                  .sh-foot .legend span { margin-right: 3.5mm; white-space: nowrap; }
                  .sh-foot .dot { display: inline-block; width: 2.6mm; height: 2.6mm; border-radius: 50%; vertical-align: -0.5mm; margin-right: 1mm; }
                  .sh-foot .scale { text-align: right; white-space: nowrap; }
                  .sh-body { height: 245mm; display: flex; gap: 4mm; overflow: hidden; }
                  .sh-body.stack { flex-direction: column; gap: 3mm; }
                  .sh-draw svg { outline: none; }
                  .sh-table { flex: 1; min-width: 0; font-size: 2.9mm; }
                  .tb-h, .tb-r { display: grid; grid-template-columns: 9mm 17mm 17mm 30mm 1fr; align-items: center; height: 4.3mm; padding: 0 1mm; box-sizing: border-box; white-space: nowrap; }
                  .tb-h { font-weight: 800; background: #e2e8f0; border-bottom: 0.3mm solid #0f172a; }
                  .tb-r { border-bottom: 0.1mm solid #cbd5e1; }
                  .tb-r:nth-child(even) { background: #f1f5f9; }
                  .tb-r .dot { width: 2.2mm; height: 2.2mm; margin-right: 1mm; border-radius: 50%; display: inline-block; vertical-align: -0.3mm; }
                  .sh-foot .scalebar { display: inline-block; height: 2.2mm; border: 0.3mm solid #0f172a; border-top: none; vertical-align: middle; margin-left: 2mm; }
                  @media print {
                      body { height: auto; overflow: visible; display: block; background: white; }
                      .header { display: none; }
                      .svg-container { display: block; overflow: visible; background: white; }
                      body.printing-part { display: block; height: auto; overflow: visible; background: #fff; }
                      body.printing-part .header, body.printing-part .svg-container { display: none !important; }
                      body.printing-part #print-root { display: block; }
                      #print-root, #print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  }
              </style>
          </head>
          <body>
              <div class="header">
                  <div class="header-top">
                      <div class="header-text">
                          <h1>Interaktywny Rysunek Techniczny</h1>
                          <p><b>Kliknij element na korpusie</b> by zobaczyć jego nawierty. Przeciągaj LKM (przesunięcie) | Kółko myszy (Zoom).</p>
                      </div>
                      <div class="controls">
                          <label style="color:#9333ea;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-corpus', this)"> Wieńce/Stałe</label>
                          <label style="color:#ea580c;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-shelf', this)"> Podpórki</label>
                          <label style="color:#16a34a;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-hinge', this)"> Zawiasy</label>
                          <label style="color:#0284c7;"><input type="checkbox" checked onchange="toggleLayer('layer-holes-drawer', this)"> Szuflady</label>
                          <div style="width: 2px; height: 20px; background: #cbd5e1; margin: 0 5px;"></div>
                          <button class="btn-front" onclick="toggleFront('detail-front', this)">🚪 Fronty Zewn.</button>
                          <button class="btn-front" onclick="fitToContent()" title="Wyśrodkuj i przybliż rysunek (także dwuklik na rysunku)">Dopasuj widok</button>
                            <button class="btn-front" onclick="toggleFront('detail-front-inner', this)">📥 Fronty Wewn.</button>
                          <div style="width: 2px; height: 20px; background: #cbd5e1; margin: 0 5px;"></div>
                          <select class="print-scale" id="print-scale" title="Skala wydruku formatki na A4">
                              <option value="auto">1 kartka A4 + wykaz otworów</option>
                              <option value="1">Kilka kartek: 1:1 (do przyłożenia do płyty)</option>
                              <option value="0.5">Kilka kartek: 1:2</option>
                              <option value="0.25">Kilka kartek: 1:4</option>
                          </select>
                          <button class="btn-print" onclick="printPart()" title="Drukuje wybraną (kliknięta na korpusie) formatkę z odwiertami na kartkach A4">Drukuj formatkę (A4)</button>
                      </div>
                  </div>
                  ${tabsHtml}
              </div>
              <div class="svg-container" id="svg-viewport">
                  ${svgContent}
              </div>
              <style id="print-page-style"></style>
              <div id="print-root"></div>
              <script>
                  function toggleLayer(layerName, checkbox) {
                      const elements = document.querySelectorAll('.' + layerName);
                      elements.forEach(el => { el.style.display = checkbox.checked ? '' : 'none'; });
                  }

                  function toggleFront(id, btn) {
                      const el = document.getElementById(id);
                      if (el) {
                          if (el.style.display === 'none') {
                              el.style.display = '';
                              btn.style.background = '#e0f2fe';
                              btn.style.borderColor = '#3b82f6';
                          } else {
                              el.style.display = 'none';
                              btn.style.background = '#fff';
                              btn.style.borderColor = '#cbd5e1';
                          }
                      }
                  }

                  function showDetail(id) {
                      document.querySelectorAll('.detail-view').forEach(el => {
                          el.style.display = 'none';
                      });
                      document.querySelectorAll('.clickable-rect').forEach(el => {
                          el.classList.remove('active-part');
                      });

                      if (id) {
                          const target = document.getElementById(id);
                          if (target) target.style.display = '';

                          const mapRect = document.getElementById('map-' + id);
                          if (mapRect) mapRect.classList.add('active-part');
                      }
                  }

                  function bindSvgPanZoom() {
                      const svg = document.getElementById('side-panel-svg');
                      if (!svg) return;
                      let isPanning = false; let startPoint = { x: 0, y: 0 }; let startViewBox = { x: 0, y: 0 };
                      svg.addEventListener('mousedown', (e) => {
                          isPanning = true; startPoint = { x: e.clientX, y: e.clientY };
                          startViewBox = { x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y }; svg.style.cursor = 'grabbing';
                      });
                      window.addEventListener('mousemove', (e) => {
                          if (!isPanning) return; const CTM = svg.getScreenCTM();
                          const dx = (e.clientX - startPoint.x) / CTM.a; const dy = (e.clientY - startPoint.y) / CTM.d;
                          svg.viewBox.baseVal.x = startViewBox.x - dx; svg.viewBox.baseVal.y = startViewBox.y - dy;
                      });
                      window.addEventListener('mouseup', () => { isPanning = false; svg.style.cursor = 'grab'; });
                      window.addEventListener('mouseleave', () => { isPanning = false; svg.style.cursor = 'grab'; });
                      svg.addEventListener('wheel', (e) => {
                          e.preventDefault(); const zoom = e.deltaY > 0 ? 1.1 : 0.9; const pt = svg.createSVGPoint();
                          pt.x = e.clientX; pt.y = e.clientY; const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                          svg.viewBox.baseVal.x = svgP.x - (svgP.x - svg.viewBox.baseVal.x) * zoom;
                          svg.viewBox.baseVal.y = svgP.y - (svgP.y - svg.viewBox.baseVal.y) * zoom;
                          svg.viewBox.baseVal.width *= zoom; svg.viewBox.baseVal.height *= zoom;
                      }, { passive: false });
                  }

                  // Przełącza, KTÓRY moduł grupy jest aktywny - woła z powrotem funkcję
                  // w oknie aplikacji (window.opener.__printSelectModule, patrz
                  // ui/sidebar.js), która realnie zmienia state.activeModuleId (jakby
                  // kliknięto ten moduł na liście po lewej w aplikacji) i oddaje świeży
                  // SVG - dzięki temu nie trzeba zamykać okna wydruku, żeby zobaczyć
                  // nawierty innego modułu z tej samej grupy.
                  function switchModule(moduleId, btn) {
                      if (!window.opener || window.opener.closed || !window.opener.__printSelectModule) return;
                      const svg = window.opener.__printSelectModule(moduleId);
                      if (!svg) return;
                      document.getElementById('svg-viewport').innerHTML = svg;
                      bindSvgPanZoom();
                      showDetail('detail-left');
                      fitToContent();
                      document.getElementById('side-panel-svg').addEventListener('dblclick', fitToContent);
                      document.querySelectorAll('.module-tab').forEach(t => {
                          t.classList.toggle('active', t === btn);
                      });
                  }

                  // Dopasowanie widoku do WIDOCZNEJ zawartości rysunku (getBBox pomija
                  // elementy z display:none, np. niewłączone widoki frontów) - dzięki
                  // temu po otwarciu rysunek jest wyśrodkowany i przybliżony maksymalnie
                  // do okna, zamiast małej figury na dużym, pustym polu.
                  function fitToContent() {
                      const svg = document.getElementById('side-panel-svg');
                      if (!svg) return;
                      // Suma ramek widocznych elementów-liści (ukryte mają zerowy prostokąt),
                      // z pominięciem długiej linii podłogi (.floor-line) - ona rozciąga się
                      // na cały wirtualny obszar rysunku i zawyżałaby ramkę kilkukrotnie.
                      // Liczymy w pikselach ekranu i przeliczamy z powrotem na układ SVG.
                      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
                      svg.querySelectorAll('rect, line, circle, text, path, polygon, polyline').forEach(function (el) {
                          if (el.classList.contains('floor-line') || el.closest('defs')) return;
                          const r = el.getBoundingClientRect();
                          if (!r.width && !r.height) return;
                          sx0 = Math.min(sx0, r.left); sy0 = Math.min(sy0, r.top);
                          sx1 = Math.max(sx1, r.right); sy1 = Math.max(sy1, r.bottom);
                      });
                      if (!isFinite(sx0)) return;
                      const inv = svg.getScreenCTM().inverse();
                      const p0 = new DOMPoint(sx0, sy0).matrixTransform(inv);
                      const p1 = new DOMPoint(sx1, sy1).matrixTransform(inv);
                      const b = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y) };
                      if (!b.width || !b.height) return;
                      const m = Math.max(b.width, b.height) * 0.04;
                      svg.setAttribute('viewBox', (b.x - m) + ' ' + (b.y - m) + ' ' + (b.width + 2 * m) + ' ' + (b.height + 2 * m));
                  }

                  // Włączenie/wyłączenie widoku frontów zmienia widoczną zawartość - dopasuj ponownie.
                  const toggleFrontRaw = toggleFront;
                  toggleFront = function (id, btn) { toggleFrontRaw(id, btn); fitToContent(); };

                  // ===== Wydruk pojedynczej formatki z odwiertami na kartkach A4 =====
                  // Drukuje TĘ formatkę, którą aktualnie widać (ostatnio kliknięta na
                  // korpusie: bok, przegroda, wieniec, półka). Rysunek jest w mm, więc
                  // skala wydruku = mm papieru na mm formatki: przy 1:1 arkusz można
                  // przyłożyć do płyty. Za duża na jedną kartkę formatka jest cięta na
                  // arkusze (zakładka 8 mm) w skali nie mniejszej niż 1:4, żeby opisy
                  // (wysokości otworów) zostały czytelne - stąd auto nie zmniejsza dalej.
                  var currentDetailId = 'detail-left';
                  var showDetailRaw = showDetail;
                  showDetail = function (id) { showDetailRaw(id); if (id) currentDetailId = id; };

                  var PRINT_META = ${printMetaJson};

                  function escH(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
                  function fmtN(v) { var n = Math.round(parseFloat(v) * 10) / 10; return String(n); }
                  function tileCount(total, size, step) { return total <= size + 0.5 ? 1 : Math.ceil((total - size) / step) + 1; }

                  function printMeta() {
                      try {
                          if (window.opener && !window.opener.closed && window.opener.__printMeta) return window.opener.__printMeta;
                      } catch (e) {}
                      return PRINT_META;
                  }

                  // ===== Tryb "1 kartka A4": rysunek formatki + wykaz otworów =====
                  // Duża formatka (np. bok 2 m) nie da się zmieścić na jednej kartce w skali,
                  // w której opisy przy otworach byłyby czytelne. Zamiast zmniejszać opisy,
                  // rysujemy formatkę w skali (otwory jako punkty z numerami wierszy), a
                  // dokładne wymiary podajemy w tabeli czytelną czcionką (ok. 2,9 mm).
                  // Otwory czytamy z rysunku (okręgi wewnątrz obrysu formatki), więc tabela
                  // zawsze zgadza się z tym, co widać w oknie.
                  function printSingleSheet(g, meta, title, dims) {
                      var rectEl = g.querySelector('rect');
                      if (!rectEl) return false;
                      var rx = parseFloat(rectEl.getAttribute('x')), ry = parseFloat(rectEl.getAttribute('y'));
                      var rw = parseFloat(rectEl.getAttribute('width')), rh = parseFloat(rectEl.getAttribute('height'));
                      if (!(rw > 0 && rh > 0)) return false;

                      var frontAt = 'left';
                      var texts = g.querySelectorAll('text');
                      for (var ti = 0; ti < texts.length; ti++) {
                          if (texts[ti].textContent.trim() === 'PRZÓD') {
                              var tx = parseFloat(texts[ti].getAttribute('x')), ty = parseFloat(texts[ti].getAttribute('y'));
                              frontAt = ty < ry - 1 ? 'top' : (tx > rx + rw / 2 ? 'right' : 'left');
                              break;
                          }
                      }
                      var topView = frontAt === 'top';

                      var holes = [];
                      g.querySelectorAll('circle').forEach(function (c) {
                          var cx = parseFloat(c.getAttribute('cx')), cy = parseFloat(c.getAttribute('cy')), r = parseFloat(c.getAttribute('r'));
                          if (cx < rx - 0.5 || cx > rx + rw + 0.5 || cy < ry - 0.5 || cy > ry + rh + 0.5) return;
                          var fill = (c.getAttribute('fill') || '').toLowerCase();
                          var typ, col = fill;
                          if (fill === '#9333ea') typ = r >= 3 ? 'kołek Ø8' : 'wkręt Ø3';
                          else if (fill === '#ea580c') typ = 'podpórka Ø5';
                          else if (fill === '#0284c7') typ = 'prowadnica Ø5';
                          else if (fill === '#16a34a') typ = 'zawias Ø5';
                          else { typ = 'otwór Ø' + fmtN(2 * r); col = '#334155'; }
                          var prim, sec;
                          if (topView) { prim = cx - rx; sec = cy - ry; }
                          else { prim = (ry + rh) - cy; sec = frontAt === 'left' ? cx - rx : (rx + rw) - cx; }
                          holes.push({ typ: typ, col: col, prim: Math.round(prim * 10) / 10, sec: sec, cx: cx, cy: cy, r: r });
                      });
                      if (!holes.length) return false;

                      var map = {}, rows = [];
                      holes.forEach(function (h) {
                          var key = h.typ + '|' + h.prim;
                          if (!map[key]) { map[key] = { typ: h.typ, col: h.col, prim: h.prim, sec: [] }; rows.push(map[key]); }
                          var sv = fmtN(h.sec);
                          if (map[key].sec.indexOf(sv) < 0) map[key].sec.push(sv);
                      });
                      rows.forEach(function (r) { r.sec.sort(function (a, b) { return parseFloat(a) - parseFloat(b); }); });
                      rows.sort(function (a, b) {
                          var d = topView ? a.prim - b.prim : b.prim - a.prim;
                          return d || a.typ.localeCompare(b.typ);
                      });
                      rows.forEach(function (r, i) { r.nr = i + 1; });

                      // --- rysunek (w mm papieru) ---
                      var tall = !topView && rh >= 1.25 * rw;
                      var zw, zh, s;
                      var ox = 8, oy = 9;
                      if (topView) { zw = 190; s = Math.min((zw - 16) / rw, 105 / rh, 1); zh = rh * s + 24; }
                      else if (tall) { zw = 90; zh = 245; s = Math.min((zw - 26) / rw, (zh - 15) / rh, 1); }
                      else { zw = 190; s = Math.min((zw - 26) / rw, 100 / rh, 1); zh = rh * s + 15; }
                      var pw = rw * s, ph = rh * s;
                      function f2(v) { return Math.round(v * 100) / 100; }

                      var d = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(zw) + 'mm" height="' + f2(zh) + 'mm" viewBox="0 0 ' + f2(zw) + ' ' + f2(zh) + '" style="font-family: Segoe UI, Tahoma, Arial, sans-serif;">';
                      d += '<rect x="' + ox + '" y="' + oy + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#ffffff" stroke="#0f172a" stroke-width="0.3" />';
                      var frontLeft = topView || frontAt === 'left';
                      if (topView) {
                          d += '<text x="' + f2(ox + pw / 2) + '" y="' + (oy - 2) + '" font-size="2.6" font-weight="700" fill="#64748b" text-anchor="middle">PRZÓD</text>';
                          d += '<text x="' + f2(ox + pw - 1.5) + '" y="' + f2(oy + ph - 1.5) + '" font-size="2.6" font-weight="700" fill="#94a3b8" text-anchor="end">TYŁ</text>';
                      } else {
                          d += '<text x="' + ox + '" y="' + (oy - 2) + '" font-size="2.6" font-weight="700" fill="#64748b" text-anchor="start">' + (frontLeft ? 'PRZÓD' : 'TYŁ') + '</text>';
                          d += '<text x="' + f2(ox + pw) + '" y="' + (oy - 2) + '" font-size="2.6" font-weight="700" fill="#64748b" text-anchor="end">' + (frontLeft ? 'TYŁ' : 'PRZÓD') + '</text>';
                      }

                      // pozycje etykiet wierszy (numery) - wiersze o tej samej pozycji dzielą etykietę
                      var byPos = {}, posList = [];
                      rows.forEach(function (r) {
                          var k = String(r.prim);
                          if (!byPos[k]) { byPos[k] = { prim: r.prim, nrs: [] }; posList.push(byPos[k]); }
                          byPos[k].nrs.push(r.nr);
                      });
                      posList.forEach(function (p) { p.nat = topView ? ox + p.prim * s : oy + (rh - p.prim) * s; });
                      posList.sort(function (a, b) { return a.nat - b.nat; });

                      var guides = '', labels = '';
                      if (topView) {
                          var prevX = -99, prevLv = 1;
                          posList.forEach(function (p) {
                              var lv = (p.nat - prevX < 6.5) ? 1 - prevLv : 0;
                              var ly = oy + ph + 6 + lv * 3.8;
                              guides += '<line x1="' + f2(p.nat) + '" y1="' + oy + '" x2="' + f2(p.nat) + '" y2="' + f2(ly - 2) + '" stroke="#cbd5e1" stroke-width="0.12" />';
                              labels += '<text x="' + f2(p.nat) + '" y="' + f2(ly + 0.9) + '" font-size="2.5" font-weight="700" fill="#0f172a" text-anchor="middle">' + p.nrs.join(',') + '</text>';
                              prevX = p.nat; prevLv = lv;
                          });
                      } else {
                          var prevY = -99, xr = ox + pw;
                          posList.forEach(function (p) {
                              var ly = Math.max(p.nat, prevY + 3.1);
                              guides += '<line x1="' + ox + '" y1="' + f2(p.nat) + '" x2="' + f2(xr + 6) + '" y2="' + f2(p.nat) + '" stroke="#cbd5e1" stroke-width="0.12" />';
                              guides += '<line x1="' + f2(xr + 6) + '" y1="' + f2(p.nat) + '" x2="' + f2(xr + 9) + '" y2="' + f2(ly) + '" stroke="#94a3b8" stroke-width="0.12" />';
                              labels += '<text x="' + f2(xr + 10) + '" y="' + f2(ly + 0.9) + '" font-size="2.5" font-weight="700" fill="#0f172a">' + p.nrs.join(',') + '</text>';
                              prevY = ly;
                          });
                      }
                      d += guides;
                      holes.forEach(function (h) {
                          d += '<circle cx="' + f2(ox + (h.cx - rx) * s) + '" cy="' + f2(oy + (h.cy - ry) * s) + '" r="' + f2(Math.max(h.r * s, 0.55)) + '" fill="' + h.col + '" />';
                      });
                      d += labels + '</svg>';

                      // --- tabela (wiersze jako div-y, żeby dało się dzielić na kartki) ---
                      var heads = topView ? ['Nr', 'Od lewej', 'Od prawej', 'Otwór', 'Od przodu'] : ['Nr', 'Od dołu', 'Od góry', 'Otwór', 'Od przodu'];
                      var headHtml = '<div class="tb-h"><span>' + heads.join('</span><span>') + '</span></div>';
                      function rowHtml(r) {
                          var c2 = topView ? rw - r.prim : rh - r.prim;
                          return '<div class="tb-r"><b>' + r.nr + '</b><span>' + fmtN(r.prim) + '</span><span>' + fmtN(c2) + '</span>'
                              + '<span><i class="dot" style="background:' + r.col + '"></i>' + escH(r.typ) + '</span><span>' + r.sec.join(' · ') + '</span></div>';
                      }
                      var ROW = 4.3, BODY = 245;
                      var tableH1 = tall ? BODY : BODY - zh - 3;
                      var cap1 = Math.max(0, Math.floor((tableH1 - ROW) / ROW));
                      var capN = Math.floor((BODY - ROW) / ROW);

                      var chunks = [], idx = 0;
                      chunks.push(rows.slice(0, cap1)); idx = cap1;
                      while (idx < rows.length) { chunks.push(rows.slice(idx, idx + capN)); idx += capN; }
                      var total = chunks.length;

                      var scaleTxt = '1:' + String(Math.round((1 / s) * 10) / 10).replace('.', ',');
                      var legend = '<span class="legend">'
                          + '<span><i class="dot" style="background:#9333ea"></i>kołek Ø8 / wkręt Ø3</span>'
                          + '<span><i class="dot" style="background:#ea580c"></i>podpórka Ø5</span>'
                          + '<span><i class="dot" style="background:#0284c7"></i>prowadnica Ø5</span>'
                          + '<span><i class="dot" style="background:#16a34a"></i>zawias Ø5</span></span>';
                      var foot = '<div class="sh-foot">' + legend + '<span class="scale">rysunek w skali ok. ' + scaleTxt + ' - wymiary otworów wg tabeli (mm)</span></div>';

                      var html = '';
                      chunks.forEach(function (chunk, ci) {
                          var no = total > 1 ? (' · arkusz ' + (ci + 1) + '/' + total) : '';
                          var head = '<div class="sh-head"><div class="sh-title">' + escH(title) + (dims ? ' — ' + escH(dims) : '') + (ci > 0 ? ' (wykaz otworów - ciąg dalszy)' : '') + '</div>'
                              + '<div class="sh-sub">' + escH(meta.project) + ' · ' + escH(meta.module) + ' · gr. płyty ' + fmtN(meta.th) + ' mm' + no + ' · ' + escH(meta.date) + '</div></div>';
                          var tableHtml = chunk.length ? '<div class="sh-table">' + headHtml + chunk.map(rowHtml).join('') + '</div>' : '';
                          var body;
                          if (ci === 0) body = '<div class="sh-body' + (tall ? '' : ' stack') + '"><div class="sh-draw">' + d + '</div>' + tableHtml + '</div>';
                          else body = '<div class="sh-body stack">' + tableHtml + '</div>';
                          html += '<div class="sheet sheet-portrait">' + head + body + foot + '</div>';
                      });

                      document.getElementById('print-root').innerHTML = html;
                      document.getElementById('print-page-style').textContent = '@page { size: A4 portrait; margin: 10mm; }';
                      document.body.classList.add('printing-part');
                      window.onafterprint = function () {
                          document.body.classList.remove('printing-part');
                          document.getElementById('print-root').innerHTML = '';
                      };
                      setTimeout(function () { window.print(); }, 60);
                      return true;
                  }

                  function printPart() {
                      var g = document.getElementById(currentDetailId);
                      if (!g) { alert('Kliknij formatkę na rysunku korpusu, żeby wybrać, którą wydrukować.'); return; }
                      var bb = g.getBBox();
                      if (!bb.width || !bb.height) { alert('Brak rysunku tej formatki do wydruku.'); return; }
                      var meta = printMeta();

                      var titleEl = g.querySelector('text[font-size="16"]');
                      var title = titleEl ? titleEl.textContent : 'Formatka';
                      var pr = g.querySelector('rect');
                      var dims = '';
                      if (pr) {
                          var pw = parseFloat(pr.getAttribute('width')), ph = parseFloat(pr.getAttribute('height'));
                          dims = fmtN(Math.max(pw, ph)) + ' × ' + fmtN(Math.min(pw, ph)) + ' mm';
                      }

                      if (document.getElementById('print-scale').value === 'auto' && printSingleSheet(g, meta, title, dims)) return;

                      // Obszar rysunku na kartce po odjęciu nagłówka (17 mm) i stopki (13 mm), marginesy 10 mm.
                      var orients = [
                          { name: 'portrait', aw: 190, ah: 245 },
                          { name: 'landscape', aw: 277, ah: 158 }
                      ];
                      var OVL = 8, MINREAD = 0.18, M = 14;
                      var sel = document.getElementById('print-scale').value;

                      // Plan wydruku (skala, orientacja) dla danego prostokąta rysunku.
                      function planFor(bw, bh) {
                          orients.forEach(function (x) { x.fit = Math.min(x.aw / bw, x.ah / bh); });
                          var best = orients[0].fit >= orients[1].fit ? orients[0] : orients[1];
                          if (sel === 'auto' && best.fit >= MINREAD) return { s: Math.min(best.fit, 1), o: best };
                          var sc = sel === 'auto' ? MINREAD : parseFloat(sel);
                          var pages = orients.map(function (x) {
                              var ttw = x.aw / sc, tth = x.ah / sc;
                              return tileCount(bw, ttw, ttw - OVL / sc) * tileCount(bh, tth, tth - OVL / sc);
                          });
                          return { s: sc, o: (pages[1] < pages[0]) ? orients[1] : (pages[0] < pages[1] ? orients[0] : best) };
                      }

                      var bb = g.getBBox();
                      var plan = planFor(bb.width + 2 * M, bb.height + 2 * M);

                      // Czytelność: opisy mają w SVG 9-12 jednostek (= mm w skali 1:1). Po
                      // zmniejszeniu skali na papierze byłyby za drobne, więc powiększamy je
                      // tak, żeby najmniejszy opis (9 jednostek) miał na kartce ok. 2,8 mm
                      // wysokości. Powiększone opisy poszerzają rysunek, a to zmienia skalę,
                      // więc dopasowujemy iteracyjnie (kilka przebiegów zbiega). Robimy to na
                      // oryginalnych elementach (getBBox musi zobaczyć nowe, szersze opisy) i
                      // po zbudowaniu arkuszy przywracamy oryginalne rozmiary.
                      var TEXT_MM = 2.8;
                      var touched = [];
                      function restoreFonts() {
                          touched.forEach(function (p) { p[0].setAttribute('font-size', p[1]); });
                          touched = [];
                      }
                      function applyFontK(k) {
                          g.querySelectorAll('text, tspan').forEach(function (t) {
                              var fs0 = t.getAttribute('font-size');
                              if (!fs0) return;
                              touched.push([t, fs0]);
                              t.setAttribute('font-size', String(parseFloat(fs0) * k));
                          });
                      }
                      var textK = 1;
                      for (var it = 0; it < 6; it++) {
                          var kNew = Math.max(1, TEXT_MM / (9 * plan.s));
                          if (Math.abs(kNew - textK) < 0.03) break;
                          textK = kNew;
                          restoreFonts();
                          if (textK > 1.01) applyFontK(textK);
                          bb = g.getBBox();
                          plan = planFor(bb.width + 2 * M, bb.height + 2 * M);
                      }
                      var bx = bb.x - M, by = bb.y - M, bw = bb.width + 2 * M, bh = bb.height + 2 * M;
                      var s = plan.s, o = plan.o;
                      var tw = o.aw / s, th = o.ah / s;
                      var stepx = tw - OVL / s, stepy = th - OVL / s;
                      var nx = tileCount(bw, tw, stepx), ny = tileCount(bh, th, stepy);
                      var total = nx * ny;
                      if (total > 12 && !confirm('Ta formatka w tej skali zajmie ' + total + ' arkuszy A4. Drukować?')) { restoreFonts(); return; }

                      var clone = g.cloneNode(true);
                      clone.style.display = '';
                      var inner = clone.outerHTML;
                      restoreFonts();

                      var ratio = Math.round((1 / s) * 10) / 10;
                      var scaleTxt = '1:' + String(ratio).replace('.', ',');
                      var barMm = 100 * s;
                      var legend = '<span class="legend">'
                          + '<span><i class="dot" style="background:#9333ea"></i>kołek Ø8 + wkręt Ø3</span>'
                          + '<span><i class="dot" style="background:#ea580c"></i>podpórka półki Ø5</span>'
                          + '<span><i class="dot" style="background:#0284c7"></i>prowadnica szuflady Ø5</span>'
                          + '<span><i class="dot" style="background:#16a34a"></i>zawias Ø5</span></span>';

                      var html = '', n = 0;
                      for (var r = 0; r < ny; r++) {
                          for (var c = 0; c < nx; c++) {
                              n++;
                              var vx = nx === 1 ? bx - (tw - bw) / 2 : bx + c * stepx;
                              var vy = ny === 1 ? by - (th - bh) / 2 : by + r * stepy;
                              var sheetNo = total > 1 ? (' · arkusz ' + n + '/' + total + ' (kol. ' + (c + 1) + ', wiersz ' + (r + 1) + ')') : '';
                              html += '<div class="sheet sheet-' + o.name + '">'
                                  + '<div class="sh-head"><div class="sh-title">' + escH(title) + (dims ? ' — ' + escH(dims) : '') + '</div>'
                                  + '<div class="sh-sub">' + escH(meta.project) + ' · ' + escH(meta.module) + ' · gr. płyty ' + fmtN(meta.th) + ' mm · skala ' + scaleTxt + sheetNo + ' · ' + escH(meta.date) + '</div></div>'
                                  + '<svg xmlns="http://www.w3.org/2000/svg" width="' + o.aw + 'mm" height="' + o.ah + 'mm" viewBox="' + vx + ' ' + vy + ' ' + tw + ' ' + th + '" style="font-family: Segoe UI, Tahoma, Arial, sans-serif;">' + inner + '</svg>'
                                  + '<div class="sh-foot">' + legend
                                  + '<span class="scale">drukuj w skali 100% (bez dopasowania do strony) · 100 mm =<span class="scalebar" style="width:' + barMm + 'mm"></span></span></div>'
                                  + '</div>';
                          }
                      }

                      document.getElementById('print-root').innerHTML = html;
                      document.getElementById('print-page-style').textContent = '@page { size: A4 ' + o.name + '; margin: 10mm; }';
                      document.body.classList.add('printing-part');
                      window.onafterprint = function () {
                          document.body.classList.remove('printing-part');
                          document.getElementById('print-root').innerHTML = '';
                      };
                      setTimeout(function () { window.print(); }, 60);
                  }

                  document.body.style.userSelect = 'none';
                  window.onload = () => {
                      showDetail('detail-left');
                      bindSvgPanZoom();
                      fitToContent();
                      const svgEl = document.getElementById('side-panel-svg');
                      if (svgEl) svgEl.addEventListener('dblclick', fitToContent);
                  };
              </script>
          </body>
          </html>`;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
        console.error("Błąd generowania rysunku:", err);
        alert("Wystąpił błąd podczas generowania SVG: " + err.message);
    }
}

export { openKosztorysModal };

export function updateSidebar() {
  scheduleCheckpoint(); // patrz core/history.js — debounce'owany checkpoint historii cofnij/wprzód
  renderInteriorEditorIfVisible(); // patrz ui/interiorEditor.js
  const leftSidebar = document.querySelector(".sidebar-left");
  const { parts, mountingData } = calculateParts();
  const activeMod = getActiveModule();
  const projectHardware = calculateProjectHardware();
  
  let html = `
    <h2 style="font-size: 14px; margin-bottom: 10px; color: #1e293b;">Lista Szafek (Moduły)</h2>
    <div style="font-size: 10px; color: #64748b; margin-bottom: 8px;">Użyj SHIFT aby zaznaczyć wiele szafek.</div>
  `;

  html += `
      <div style="margin-bottom: 15px;">
          <button id="btn-import-ai" class="btn btn-block">
              <i class="ti ti-wand" aria-hidden="true"></i> Zbuduj projekt ze zdjęcia (AI)
          </button>
          <input type="file" id="input-ai-image" accept="image/png, image/jpeg" style="display: none;" />
      </div>
  `;

  if (state.project.modules.length === 0) {
     html += `<div style="font-size: 11px; color: #64748b; margin-bottom: 10px; text-align: center;">Brak szafek. Dodaj pierwszą ręcznie lub wczytaj szkic!</div>`;
  } else {
    const isAllActive = state.activeModuleId === null;
    const bgAll = isAllActive ? '#3b82f6' : '#f8fafc';
    const colorAll = isAllActive ? '#ffffff' : '#1e293b';
    const borderAll = isAllActive ? '#2563eb' : '#cbd5e1';
    
    html += `
      <div id="btn-show-all" style="padding: 10px; margin-bottom: 15px; background-color: ${bgAll}; color: ${colorAll}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${borderAll}; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s;">
        <i class="ti ti-eye-off" aria-hidden="true"></i> Odznacz wszystko
      </div>
    `;

    state.project.modules.forEach(m => {
      // Kliknięcie zgrupowanej szafki zaznacza CAŁĄ grupę (selectedModules),
      // ale tylko JEDNA z nich jest "aktywna" (activeModuleId) - to ona ma
      // otwarty panel właściwości/rysunek techniczny. Bez rozróżnienia obie
      // były podświetlone identycznie na niebiesko, więc nie dało się
      // rozpoznać, który moduł grupy jest faktycznie edytowany (zgłoszony bug).
      const isActive = m.id === state.activeModuleId;
      const isSelected = state.selectedModules && state.selectedModules.has(m.id);
      const bg = isActive ? '#3b82f6' : (isSelected ? '#dbeafe' : '#f8fafc');
      const color = isActive ? '#ffffff' : '#1e293b';
      const border = isActive ? '#2563eb' : (isSelected ? '#93c5fd' : '#cbd5e1');

      let icon = '<i class="ti ti-layout-bottombar" aria-hidden="true"></i>';
      if (m.type === 'upper_cabinet') icon = '<i class="ti ti-cloud" aria-hidden="true"></i>';
      if (m.type === 'tall_cabinet') icon = '<i class="ti ti-layout-sidebar" aria-hidden="true"></i>';
      if (m.type === 'corner_cabinet') icon = '<i class="ti ti-corner-up-right" aria-hidden="true"></i>';

      const groupIcon = m.groupId ? `<span title="Zgrupowana z innymi szafkami" style="color: ${isActive ? '#bae6fd' : '#ef4444'}; font-size:12px; margin-left:6px;">🔗</span>` : '';

      html += `
        <div class="module-item" data-id="${m.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background-color: ${bg}; color: ${color}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${border}; transition: all 0.2s; user-select: none;">
          <div style="flex-grow: 1; pointer-events: none;">
            ${icon} ${escapeHtml(m.name)} ${groupIcon} <span style="font-weight: normal; font-size: 11px; opacity: 0.8; margin-left: 2px;">(${m.dimensions.width}x${m.dimensions.height})</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-mod-action btn-mod-dup" data-id="${m.id}" title="Kopiuj szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-copy" aria-hidden="true"></i></button>
            <button class="btn-mod-action btn-mod-del" data-id="${m.id}" title="Usuń szafkę" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </div>
      `;
    });
  }

  html += `
      <div style="display: flex; gap: 4px; margin-top: 8px;">
        <button id="btn-add-base" class="btn btn-sm" style="flex: 1;" title="Szafka dolna"><i class="ti ti-plus" aria-hidden="true"></i> Dolna</button>
        <button id="btn-add-upper" class="btn btn-sm" style="flex: 1;" title="Szafka wisząca"><i class="ti ti-plus" aria-hidden="true"></i> Wisząca</button>
        <button id="btn-add-tall" class="btn btn-sm" style="flex: 1;" title="Słupek"><i class="ti ti-plus" aria-hidden="true"></i> Słupek</button>
      </div>
      <button id="btn-add-corner" class="btn btn-neutral btn-block btn-sm" style="margin-top: 6px;" title="Szafka narożna z frontem łamanym (front prosty + skośny)"><i class="ti ti-plus" aria-hidden="true"></i> Narożna</button>
      <button id="btn-add-side-panel" class="btn btn-teal btn-block btn-sm" style="margin-top: 6px;" title="Dekoracyjny panel niezależny od modułów, np. na cały słup szafek"><i class="ti ti-plus" aria-hidden="true"></i> Bok dokładany</button>
    </div>
    <hr style="margin: 15px 0; border: 0; border-top: 1px dashed #cbd5e1;">
  `;

  // Boki dokładane (core/state.js: addSidePanel) - samodzielne obiekty
  // projektu (nie właściwość modułu jak blenda), więc osobna lista niezależna
  // od "Lista Szafek" wyżej.
  if (state.project.sidePanels.length > 0) {
    html += `<details open style="margin-bottom: 15px;"><summary style="font-weight: bold; cursor: pointer; outline: none; color: #0f766e;"><i class="ti ti-layout-board" aria-hidden="true"></i> Boki dokładane</summary><div style="margin-top: 8px;">`;
    state.project.sidePanels.forEach(p => {
      const isActive = p.id === state.activeSidePanelId;
      const bg = isActive ? '#0f766e' : '#f0fdfa';
      const color = isActive ? '#ffffff' : '#134e4a';
      const border = isActive ? '#0f766e' : '#99f6e4';
      html += `
        <div class="side-panel-item" data-id="${p.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background-color: ${bg}; color: ${color}; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: 1px solid ${border}; transition: all 0.2s; user-select: none;">
          <div style="flex-grow: 1; pointer-events: none;">
            <i class="ti ti-layout-board" aria-hidden="true"></i> ${escapeHtml(p.name || 'Bok dokładany')} <span style="font-weight: normal; font-size: 11px; opacity: 0.8; margin-left: 2px;">(${p.dimensions.height}×${p.dimensions.depth})</span>
          </div>
          <button class="btn-side-panel-del" data-id="${p.id}" title="Usuń bok dokładany" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 14px; opacity: ${isActive ? 1 : 0.6}; transition: opacity 0.2s;"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      `;
    });
    html += `</div></details>`;
  }

  if (state.project.modules.length > 0) {
    html += `
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px;">
        <button id="btn-production" class="btn btn-block btn-sm">
          <i class="ti ti-building-factory-2" aria-hidden="true"></i> Produkcja i raporty
        </button>
      </div>
    `;
    if (!activeMod) {
      html += `<div style="font-size: 11px; color: #ef4444; margin-top: -10px; margin-bottom: 15px; text-align: center;">Wybierz szafkę, aby wygenerować rysunek.</div>`;
    }
  }

  if (activeMod) {
    html += `<details style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none;">Lista formatek (Aktywna)</summary>`;
    
    html += `
      <div style="overflow-x: auto; margin-top: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; background: #fff;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px; color: #334155; font-weight: bold;">Element</th>
              <th style="padding: 8px; color: #334155; font-weight: bold;">Wymiar (mm)</th>
              <th style="padding: 8px; text-align: center; color: #334155; font-weight: bold;">Ilość</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (parts && parts.length > 0) {
        parts.forEach((part, index) => {
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            html += `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#eff6ff'" onmouseout="this.style.backgroundColor='${rowBg}'">
                    <td style="padding: 8px; font-weight: 600; color: #1e293b;">${escapeHtml(part.name)}</td>
                    <td style="padding: 8px; color: #64748b; white-space: nowrap;">${part.length} &times; ${part.width}</td>
                    <td style="padding: 8px; text-align: center;">
                        <span style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: bold; padding: 2px 8px; border-radius: 12px; min-width: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">
                            ${part.qty}
                        </span>
                    </td>
                </tr>
            `;
        });
    } else {
        html += `<tr><td colspan="3" style="padding: 15px; text-align: center; color: #94a3b8;">Brak elementów</td></tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>
    </details>
    `;

    if (mountingData && mountingData.length > 0) {
      html += `<details style="margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;"><summary style="font-weight: bold; cursor: pointer; outline: none;">Nawierty (Aktywna)</summary><ul class="parts-list" style="margin-top: 10px; padding-left: 0; list-style: none;">`;
      let currentDrawerIndex = 1;
      mountingData.forEach((item) => {
        if (item.type === 'door') {
          const sidePl = item.side === 'left' ? 'Lewe' : 'Prawe';
          const holesHtml = item.hinges.map(h => `Oś Y: <b>${h.y.toFixed(1)} mm</b>`).join('<br>');
          html += `<li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;"><strong>${escapeHtml(item.name)} (${sidePl})</strong><br><div style="margin-top: 4px; color: #1e293b;">Liczba zawiasów: <b>${item.hinges.length} szt.</b></div><div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;"><b>Prowadniki:</b><br>${holesHtml}</div></li>`;
        } else if (item.type === 'drawer') {
          let slideY = item.slideSideHoles && item.slideSideHoles.length > 0 ? item.slideSideHoles[0].y : "Brak";
          let frontHolesHtml = item.frontHoles ? item.frontHoles.map(h => `Y: <b>${Number(h.y).toFixed(1)} mm</b>`).join('<br>') : "";
          html += `<li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #cbd5e1;"><strong>Szuflada ${currentDrawerIndex}</strong><br><div style="margin-top: 4px; color: #1e293b;">Oś prowadnicy: <b>${slideY !== "Brak" ? slideY + ' mm' : 'Brak'}</b></div><div style="margin-top: 6px; font-size: 0.9em; padding-left: 10px; border-left: 3px solid #cbd5e1;"><b>Front (od dołu):</b><br>${frontHolesHtml}</div></li>`;
          currentDrawerIndex++;
        }
      });
      html += `</ul></details>`;
    }
  }

  if (state.project.modules.length > 0) {
    html += `<details style="background: #fffbeb; padding: 10px; border-radius: 6px; border: 1px solid #fcd34d;">`;
    html += `<summary style="font-weight: bold; cursor: pointer; outline: none; color: #92400e;"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Lista zakupów (Okucia)</summary>`;
    html += `<ul class="parts-list" style="margin-top: 10px; padding-left: 20px;">`;
    
    if (projectHardware.length === 0) {
      html += `<li style="font-size: 11px; color: #b45309;">Brak zdefiniowanych okuć w projekcie.</li>`;
    } else {
      projectHardware.forEach(hw => {
        html += `<li style="margin-bottom: 6px; font-size: 12px; color: #78350f;"><strong>${escapeHtml(hw.name)}</strong><br><span style="color: #92400e;">Ilość: <b>${hw.qty} ${escapeHtml(hw.unit)}</b></span></li>`;
      });
    }
    html += `</ul></details>`;
  }

  leftSidebar.innerHTML = html; 

  const btnShowAll = document.getElementById('btn-show-all');
  if (btnShowAll) {
    btnShowAll.addEventListener('click', () => {
      state.activeModuleId = null;
      state.activeSidePanelId = null;
      if (state.selectedModules) state.selectedModules.clear();
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  }

  document.querySelectorAll('.btn-mod-dup').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); 
      duplicateModule(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel(); update3D(); updateSidebar();
    });
  });

  document.querySelectorAll('.btn-mod-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); 
      deleteModule(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel();  update3D(); updateSidebar();
    });
  });

  document.querySelectorAll('.module-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const clickedMod = state.project.modules.find(m => m.id === id);
      
      const gId = clickedMod && clickedMod.groupId;
      const idsToSelect = gId ? state.project.modules.filter(m => m.groupId === gId).map(m => m.id) : [id];
      
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (!state.selectedModules) state.selectedModules = new Set();
          const allSelected = idsToSelect.every(i => state.selectedModules.has(i));
          if (allSelected) {
              idsToSelect.forEach(i => state.selectedModules.delete(i));
              if (state.activeModuleId === id) state.activeModuleId = Array.from(state.selectedModules).pop() || null;
          } else {
              idsToSelect.forEach(i => state.selectedModules.add(i));
              state.activeModuleId = id;
          }
      } else {
          state.selectedModules = new Set(idsToSelect);
          state.activeModuleId = id;
      }
      state.activeSidePanelId = null;

      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  const setupAddBtn = (id, type) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { addModule(type); initPropertiesPanel();  update3D(); updateSidebar(); });
  };
  setupAddBtn('btn-add-base', 'base_cabinet'); setupAddBtn('btn-add-upper', 'upper_cabinet'); setupAddBtn('btn-add-tall', 'tall_cabinet');

  const btnAddCorner = document.getElementById('btn-add-corner');
  if (btnAddCorner) {
    btnAddCorner.addEventListener('click', () => {
      // addCornerModule() sam woła ensureCornerDefaults (core/layout.js) -
      // domyślne fronty obu ramion są bound-based i nadążają za zmianą
      // wymiarów bez ręcznego przeliczania (patrz core/state.js).
      addCornerModule();
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  }

  const btnAddSidePanel = document.getElementById('btn-add-side-panel');
  if (btnAddSidePanel) {
    btnAddSidePanel.addEventListener('click', () => { addSidePanel(); initPropertiesPanel(); update3D(); updateSidebar(); });
  }

  document.querySelectorAll('.side-panel-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      state.activeSidePanelId = id;
      state.activeModuleId = null;
      if (state.selectedModules) state.selectedModules.clear();
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  document.querySelectorAll('.btn-side-panel-del').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSidePanel(e.currentTarget.getAttribute('data-id'));
      initPropertiesPanel();
      update3D();
      updateSidebar();
    });
  });

  const btnAi = document.getElementById('btn-import-ai');
  const inputAi = document.getElementById('input-ai-image');

  if (btnAi && inputAi) {
      btnAi.addEventListener('click', () => {
          inputAi.click();
      });

      inputAi.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const mimeType = file.type;
          showLoading("Rozszyfrowuję strukturę wnęk i półek...");

          const reader = new FileReader();
          reader.onload = async (ev) => {
              const base64Image = ev.target.result.split(',')[1];

              try {
                  const response = await fetch('/api/gemini', { 
                      method: "POST", 
                      headers: { "Content-Type": "application/json" }, 
                      body: JSON.stringify({ base64Image, mimeType }) 
                  });
                  
                  const data = await response.json();
                  
                  if (data.error) throw new Error(data.error.message || data.error);
                  
                  const rawJson = data.candidates[0].content.parts[0].text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                  const aiModules = JSON.parse(rawJson);
                  
                  let currentX = 0;
                  if (state.project.modules.length > 0) {
                      const lastMod = state.project.modules[state.project.modules.length - 1];
                      currentX = lastMod.position.x + parseFloat(lastMod.dimensions.width);
                  }

                  const generatedModules = aiModules.map(aiMod => {
                      const w = parseFloat(aiMod.width) || 600;
                      const h = parseFloat(aiMod.height) || (aiMod.type === 'tall_cabinet' ? 2000 : 720);
                      const d = aiMod.type === 'upper_cabinet' ? 300 : 510;
                      const posY = aiMod.type === 'upper_cabinet' ? 1400 : 0;
                      
                      const mod = {
                          id: 'mod-' + Date.now() + Math.random().toString(36).substr(2,5),
                          name: aiMod.name || 'Moduł AI',
                          type: aiMod.type || 'base_cabinet',
                          dimensions: { width: w, height: h, depth: d },
                          position: { x: currentX, y: posY, z: 0 },
                          legs: { active: aiMod.type !== 'upper_cabinet', height: 100, plinth: true, plinthOffset: 40 },
                          backPanel: { type: 'nakladane', offset: 16 },
                          elements: []
                      };
                      
                      currentX += w; 

                      const th = parseFloat(state.project.materials?.boardThickness) || 18;
                      const internalH = h - (th * 2);
                      const gapFront = parseFloat(state.project.front?.gap) || 3;

                      if (aiMod.sections && aiMod.sections.length > 0) {
                          let currentY = th;
                          const totalSectionsHeight = aiMod.sections.reduce((sum, sec) => sum + (parseFloat(sec.height) || 0), 0);
                          const scale = totalSectionsHeight > 0 ? internalH / totalSectionsHeight : 1;

                          aiMod.sections.forEach((sec, idx) => {
                              const secH = (parseFloat(sec.height) || (internalH / aiMod.sections.length)) * scale;
                              let zoneMinY = currentY;
                              let zoneMaxY = currentY + secH;
                              
                              if (idx === aiMod.sections.length - 1) zoneMaxY = h - th; 

                              const bZone = { minX: th, maxX: w - th, minY: zoneMinY, maxY: zoneMaxY, offsetBottom: 0, offsetTop: 0 };
                              
                              const sType = sec.type || 'drzwi';
                              const count = parseInt(sec.count) || 1;

                              if (sType === 'szuflady') {
                                  for(let i = 0; i < count; i++) {
                                      mod.elements.push({
                                          id: 'front-' + Date.now() + Math.random().toString(36).substr(2,5),
                                          typ: 'front', subtype: 'szuflada',
                                          baseZone: { ...bZone },
                                          frontCount: count, distribution: count.toString(), frontIndex: i, gap: gapFront, forceVariant: 'auto', forceNL: null
                                      });
                                  }
                              } else if (sType === 'drzwi_lp') {
                                  mod.elements.push({ id: 'front-L-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 0, gap: gapFront });
                                  mod.elements.push({ id: 'front-P-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi-lp', baseZone: { ...bZone }, frontCount: 2, frontIndex: 1, gap: gapFront });
                              } else if (sType === 'drzwi') {
                                  mod.elements.push({ id: 'front-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi', baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: gapFront, openingSide: 'left' });
                              }
                              
                              if (idx < aiMod.sections.length - 1) {
                                  mod.elements.push({
                                      id: 'poziom-' + Date.now() + Math.random().toString(36).substring(2, 6),
                                      typ: 'poziom', x: th, y: zoneMaxY, w: w - (th * 2), h: th, isStructural: true 
                                  });
                                  currentY = zoneMaxY + th;
                              }
                          });
                      } else {
                          const bZone = { minX: th, maxX: w - th, minY: th, maxY: h - th, offsetBottom: 0, offsetTop: 0 };
                          mod.elements.push({ id: 'front-' + Date.now() + Math.random(), typ: 'front', subtype: 'drzwi', baseZone: { ...bZone }, frontCount: 1, frontIndex: 0, gap: gapFront, openingSide: 'left' });
                      }

                      return mod;
                  });

                  state.project.modules.push(...generatedModules);
                  hideLoading();
                  initPropertiesPanel();
                  updateSidebar();
                  update3D();
                  
              } catch(err) {
                  hideLoading();
                  alert("⚠️ Sztuczna Inteligencja napotkała problem: " + err.message);
              }
              inputAi.value = "";
          };
          reader.readAsDataURL(file);
      });
  }

 const printBtn = document.getElementById('btn-print-2d');
  if (printBtn && activeMod) {
    printBtn.addEventListener('click', () => openTechnicalDrawing());
  }

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => openCsvExport());
  }

  const exportHardwareBtn = document.getElementById('btn-export-hardware');
  if (exportHardwareBtn) {
    exportHardwareBtn.addEventListener('click', () => printHardwareList());
  }

  const productionBtn = document.getElementById('btn-production');
  if (productionBtn) productionBtn.addEventListener('click', () => openProductionHub());

  const cutPlanBtn = document.getElementById('btn-cutplan');
  if (cutPlanBtn) {
    cutPlanBtn.addEventListener('click', () => {
      openCutPlanModal();
    });
  }

  const kosztorysBtn = document.getElementById('btn-kosztorys');
  if (kosztorysBtn) {
    kosztorysBtn.addEventListener('click', () => {
      openKosztorysModal();
    });
  }
}