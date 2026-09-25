// src/ui/kosztorysModal.js
// Okno kosztorysu projektu (ceny materiałów i okuć, robocizna, montaż, marża, rabat, VAT).
import { calculateProjectHardware, calculateProjectCost } from "../engine/cabinet.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";

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
export function openKosztorysModal() {
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
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#64748b;"><span>Marża (<span id="kosztorys-foot-marginpct">0</span>%)</span><span id="kosztorys-foot-margin" style="color:#1e293b;">—</span></div>
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
