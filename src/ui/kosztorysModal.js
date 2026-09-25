// src/ui/kosztorysModal.js
// Okno kosztorysu projektu (ceny materiałów i okuć, robocizna, montaż, marża, rabat, VAT).
import { calculateProjectHardware, calculateProjectCost } from "../engine/cabinet.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal } from "../utils/modal.js";

function formatPLN(n) {
    return (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

// Etykiety kategorii formatek (patrz engine/cabinet.js: kategorie części)
// - front to zwykle inny, droższy materiał niż korpus (lakier, fornir,
//   okleina), stąd osobny, opisowy wiersz zamiast jednej wspólnej "płyty".
const MATERIAL_LABELS = {
    Korpus: 'Korpus',
    Front: 'Front (lakier / fornir / okleina)',
    Szuflada: 'Szuflady (dno, tył)',
    Plecy: 'Plecy (HDF)'
};

const numField = (id, value, unit, extra = '') =>
    `<span class="cost-input"><input type="number" class="input" id="kosztorys-${id}" value="${value}" step="any" min="0" ${extra}> ${unit}</span>`;

// Szacunkowy kosztorys materiałowy - ceny płyty/HDF/okuć edytowalne na żywo,
// zapisywane bezpośrednio w state.project.pricing (patrz core/state.js:
// ensurePricingDefaults), więc lecą do chmury razem z resztą projektu przy
// zwykłym "Zapisz projekt" - nie ma tu osobnego przycisku zapisu. Lista
// okuć jest dynamiczna (patrz engine/cabinet.js: calculateProjectHardware),
// więc ceny okuć trzymane są w słowniku nazwa->cena, uzupełnianym o nowe
// pozycje w miarę jak pojawiają się w projekcie.
// root: element, w którym budujemy edytor (sekcja "Kosztorys" okna Produkcja albo treść okna).
export function mountKosztorys(root) {
    const pricing = state.project.pricing;

    const foot = (label, id, extra = '') => `<div class="cost-line${extra}"><span>${label}</span><span id="kosztorys-foot-${id}">—</span></div>`;

    root.innerHTML = `
            <section class="cost-section">
                <h3>Materiały płytowe</h3>
                <table class="cost-table">
                    <thead><tr><th>Materiał</th><th class="num">Powierzchnia</th><th class="num">Cena / m²</th><th class="num">Koszt</th></tr></thead>
                    <tbody id="kosztorys-materials-tbody"></tbody>
                </table>
            </section>
            <section class="cost-section">
                <h3>Okucia</h3>
                <table class="cost-table">
                    <thead><tr><th>Pozycja</th><th class="num">Ilość</th><th class="num">Cena jedn.</th><th class="num">Koszt</th></tr></thead>
                    <tbody id="kosztorys-hardware-tbody"></tbody>
                </table>
            </section>
            <section class="cost-section">
                <h3>Robocizna, montaż, transport</h3>
                <table class="cost-table">
                    <tbody>
                        <tr><td>Robocizna (warsztat)</td><td class="num">${numField('labor-hours', pricing.labor.hours, 'h')}</td><td class="num">${numField('labor-rate', pricing.labor.rate, 'zł/h')}</td><td class="num" id="kosztorys-labor-cost">—</td></tr>
                        <tr><td>Montaż</td><td class="num">${numField('assembly-hours', pricing.assembly.hours, 'h')}</td><td class="num">${numField('assembly-rate', pricing.assembly.rate, 'zł/h')}</td><td class="num" id="kosztorys-assembly-cost">—</td></tr>
                        <tr><td>Transport</td><td></td><td class="num">${numField('transport', pricing.transport, 'zł')}</td><td></td></tr>
                    </tbody>
                </table>
            </section>
            <section class="cost-section">
                <h3>Marża, rabat, VAT</h3>
                <div class="field-row">
                    <div class="field"><label>Marża (%) - od sumy kosztów</label><input type="number" class="input" id="kosztorys-margin" value="${pricing.marginPercent}" step="1" min="0"></div>
                    <div class="field"><label>Rabat (%)</label><input type="number" class="input" id="kosztorys-discount" value="${pricing.discountPercent}" step="any" min="0" max="100"></div>
                    <div class="field"><label>VAT (%)</label><input type="number" class="input" id="kosztorys-vat" value="${pricing.vatPercent}" step="any" min="0"></div>
                </div>
            </section>
            <section class="cost-summary">
                ${foot('Materiały', 'plyty')}
                ${foot('Okucia', 'okucia')}
                ${foot('Robocizna', 'labor')}
                ${foot('Montaż', 'assembly')}
                ${foot('Transport', 'transport')}
                ${foot('<b>Suma kosztów</b>', 'subtotal')}
                <div class="cost-line"><span>Marża (<span id="kosztorys-foot-marginpct">0</span>%)</span><span id="kosztorys-foot-margin">—</span></div>
                <div class="cost-line"><span>Rabat (<span id="kosztorys-foot-discpct">0</span>%)</span><span id="kosztorys-foot-discount">—</span></div>
                ${foot('<b>Cena netto</b>', 'net')}
                <div class="cost-line"><span>VAT (<span id="kosztorys-foot-vatpct">23</span>%)</span><span id="kosztorys-foot-vat">—</span></div>
                <div class="cost-line cost-total"><span>Cena brutto</span><span id="kosztorys-foot-total">—</span></div>
            </section>`;
    const modal = root;

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

        const set = (id, v) => { modal.querySelector(id).textContent = v; };
        set('#kosztorys-foot-plyty', formatPLN(cost.materialsSubtotal));
        set('#kosztorys-foot-okucia', formatPLN(cost.hardwareSubtotal));
        set('#kosztorys-foot-margin', formatPLN(cost.marginAmount));
        set('#kosztorys-foot-marginpct', cost.marginPercent);
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
            materialsTbody.innerHTML = `<tr><td colspan="4" class="empty-note">Projekt jest pusty</td></tr>`;
            return;
        }
        materialsTbody.innerHTML = cost.materials.map(m => `
            <tr>
                <td>${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</td>
                <td class="num kosztorys-mat-area" data-cat="${escapeHtml(m.category)}">${m.areaM2.toFixed(2)}&nbsp;m²</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-mat-price" data-cat="${escapeHtml(m.category)}" value="${m.pricePerM2}" step="1" min="0"> zł</span></td>
                <td class="num kosztorys-mat-cost" data-cat="${escapeHtml(m.category)}"><b>${formatPLN(m.cost)}</b></td>
            </tr>
        `).join('');
        materialsTbody.querySelectorAll('.kosztorys-mat-price').forEach(input => {
            input.addEventListener('input', recalc);
        });
    }

    function renderHardwareRows() {
        const cost = calculateProjectCost();
        if (cost.hardware.length === 0) {
            hardwareTbody.innerHTML = `<tr><td colspan="4" class="empty-note">Brak okuć w projekcie</td></tr>`;
            return;
        }
        hardwareTbody.innerHTML = cost.hardware.map(hw => `
            <tr>
                <td>${escapeHtml(hw.name)}</td>
                <td class="num">${hw.qty} ${escapeHtml(hw.unit)}</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-hw-price" data-name="${escapeHtml(hw.name)}" value="${hw.price}" step="0.1" min="0"> zł</span></td>
                <td class="num kosztorys-hw-cost" data-name="${escapeHtml(hw.name)}"><b>${formatPLN(hw.cost)}</b></td>
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
}

export function openKosztorysModal() {
    const dlg = openModal({
        title: 'Kosztorys projektu',
        subtitle: `${state.project.name || 'bez nazwy'} · ceny edytowalne, liczone na żywo. Zapisują się razem z projektem.`,
        width: 680,
        footer: [{ label: 'Zamknij' }],
    });
    mountKosztorys(dlg.bodyEl);
}
