// src/ui/kosztorysModal.js
// Okno kosztorysu projektu (ceny materiałów i okuć, robocizna, montaż, marża, rabat, VAT).
import { calculateProjectCost } from "../engine/cost.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../utils/dom.js";
import { initPropertiesPanel } from "./properties.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { showCustomDialog } from "../core/storage.js";
import { loadPriceDefaults, savePriceDefaults, applyPriceDefaults, exportPriceDefaultsJson, importPriceDefaultsJson } from "../core/priceLibrary.js";
import { showAlert } from "../utils/modal.js";

// "Zastosuj do wszystkich dolnych/górnych" (zgłoszona potrzeba: w kuchni
// fronty szafek dolnych i wiszących często mają inny materiał/kolor, ale
// wewnątrz każdej grupy zwykle ten sam - bez tego trzeba by klikać front po
// froncie w każdej szafce z osobna). Słupki/szafki narożne CELOWO pominięte -
// fizycznie nie są ani jednoznacznie "dolne", ani "górne", więc zostają do
// ręcznego przypisania per front (ui/properties.js).
const BULK_ZONES = [
    { type: 'base_cabinet', label: 'dolnych' },
    { type: 'upper_cabinet', label: 'górnych' },
];
export function applyMaterialToZone(materialId, moduleType) {
    (state.project.modules || []).forEach(mod => {
        if (mod.type !== moduleType) return;
        (mod.elements || []).forEach(el => { if (el.typ === 'front') el.materialId = materialId; });
    });
}

function formatPLN(n) {
    return (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

// Etykiety kategorii formatek (patrz engine/cabinet.js: kategorie części).
// Front NIE ma tu wpisu - ma własny katalog materiałów (pricing.frontMaterials,
// core/state.js), renderowany osobno w renderMaterialRows() niżej (frontRowHtml)
// bo jedna wspólna cena nie starcza (lakier / fornir / okleina to różne ceny/m²).
// Nowe materiały dopisuje się przy froncie (ui/properties.js: "+ Nowy materiał…"),
// nie tutaj - tu pokazuje się wiersz tylko dla materiału, którego jakiś front
// faktycznie już używa (ta sama zasada co dla Korpus/Szuflada/Plecy).
const MATERIAL_LABELS = {
    Korpus: 'Korpus',
    Szuflada: 'Szuflady (dno, tył)',
    Plecy: 'Plecy (HDF)'
};

const numField = (id, value, unit, extra = '') =>
    `<span class="cost-input"><input type="number" class="input" id="kosztorys-${id}" value="${value}" step="any" min="0" ${extra}> ${unit}</span>`;

// Szacunkowy kosztorys materiałowy - ceny płyty/HDF/okuć edytowalne na żywo,
// zapisywane bezpośrednio w state.project.pricing (patrz core/state.js:
// ensurePricingDefaults), więc lecą do chmury razem z resztą projektu przy
// zwykłym "Zapisz projekt" - nie ma tu osobnego przycisku zapisu. Lista
// okuć jest dynamiczna (patrz engine/hardware.js: calculateProjectHardware),
// więc ceny okuć trzymane są w słowniku nazwa->cena, uzupełnianym o nowe
// pozycje w miarę jak pojawiają się w projekcie.
// root: element, w którym budujemy edytor (sekcja "Kosztorys" okna Produkcja albo treść okna).
export function mountKosztorys(root) {
    const pricing = state.project.pricing;

    const foot = (label, id, extra = '') => `<div class="cost-line${extra}"><span>${label}</span><span id="kosztorys-foot-${id}">—</span></div>`;

    root.innerHTML = `
            <section class="cost-section">
                <div class="btn-row" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <button id="kosztorys-price-save" type="button" class="btn btn-sm"><i class="ti ti-device-floppy" aria-hidden="true"></i> Zapisz jako domyślne ceny</button>
                    <button id="kosztorys-price-load" type="button" class="btn btn-sm"><i class="ti ti-download" aria-hidden="true"></i> Wczytaj z bazy cen</button>
                    <button id="kosztorys-price-export" type="button" class="btn btn-sm"><i class="ti ti-file-export" aria-hidden="true"></i> Eksport (plik JSON)</button>
                    <button id="kosztorys-price-import" type="button" class="btn btn-sm"><i class="ti ti-upload" aria-hidden="true"></i> Import z pliku</button>
                    <input id="kosztorys-price-file" type="file" accept="application/json,.json" style="display:none">
                </div>
                <div class="hint" style="margin-bottom:14px;">Baza cen to jeden zapamiętany cennik w tej przeglądarce (materiały, fronty, okucia) - "Zapisz" zapamiętuje ceny z TEGO projektu, "Wczytaj" nakłada je na aktywny projekt bez kasowania pozycji, których baza nie zna. Eksport/import JSON przenosi bazę na inny komputer.</div>
                <h3>Materiały płytowe</h3>
                <table class="cost-table">
                    <thead><tr><th>Materiał</th><th class="num">Powierzchnia</th><th class="num">Cena / m²</th><th class="num">Koszt</th><th></th></tr></thead>
                    <tbody id="kosztorys-materials-tbody"></tbody>
                    <tbody><tr><td>Cięcie formatek (hurtownia)</td><td class="num" id="kosztorys-cut-count">—</td><td class="num">${numField('cutting', pricing.cuttingPerPart, 'zł/szt.')}</td><td class="num" id="kosztorys-cut-cost">—</td><td></td></tr></tbody>
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
                <h3>Robocizna, lakiernia, montaż, transport</h3>
                <table class="cost-table">
                    <tbody>
                        <tr><td>Robocizna (warsztat)</td><td class="num">${numField('labor-hours', pricing.labor.hours, 'h')}</td><td class="num">${numField('labor-rate', pricing.labor.rate, 'zł/h')}</td><td class="num" id="kosztorys-labor-cost">—</td></tr>
                        <tr><td>Lakiernia</td><td class="num">${numField('lacquer-hours', pricing.lacquer.hours, 'h')}</td><td class="num">${numField('lacquer-rate', pricing.lacquer.rate, 'zł/h')}</td><td class="num" id="kosztorys-lacquer-cost">—</td></tr>
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
                ${foot('Cięcie formatek', 'cutting')}
                ${foot('Okucia', 'okucia')}
                ${foot('Robocizna', 'labor')}
                ${foot('Lakiernia', 'lacquer')}
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
        modal.querySelectorAll('.kosztorys-front-mat-price').forEach(input => {
            const mat = pricing.frontMaterials.find(m => m.id === input.getAttribute('data-material-id'));
            if (mat) mat.pricePerM2 = parseFloat(input.value) || 0;
        });
        modal.querySelectorAll('.kosztorys-mat-name').forEach(input => {
            const mat = pricing.frontMaterials.find(m => m.id === input.getAttribute('data-material-id'));
            if (mat) mat.name = input.value.trim() || 'Bez nazwy';
        });
        modal.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            const name = input.getAttribute('data-name');
            pricing.hardware[name] = parseFloat(input.value) || 0;
        });
        pricing.marginPercent = parseFloat(modal.querySelector('#kosztorys-margin').value) || 0;

        const num = (id) => Math.max(0, parseFloat(modal.querySelector(id).value) || 0);
        pricing.labor = { hours: num('#kosztorys-labor-hours'), rate: num('#kosztorys-labor-rate') };
        pricing.lacquer = { hours: num('#kosztorys-lacquer-hours'), rate: num('#kosztorys-lacquer-rate') };
        pricing.cuttingPerPart = num('#kosztorys-cutting');
        pricing.assembly = { hours: num('#kosztorys-assembly-hours'), rate: num('#kosztorys-assembly-rate') };
        pricing.transport = num('#kosztorys-transport');
        pricing.discountPercent = Math.min(100, num('#kosztorys-discount'));
        pricing.vatPercent = num('#kosztorys-vat');

        const cost = calculateProjectCost();

        modal.querySelectorAll('.kosztorys-mat-area').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat && !m.materialId);
            cell.textContent = (line ? line.areaM2 : 0).toFixed(2) + ' m²';
        });
        modal.querySelectorAll('.kosztorys-mat-cost').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat && !m.materialId);
            cell.textContent = formatPLN(line ? line.cost : 0);
        });
        modal.querySelectorAll('.kosztorys-front-mat-area').forEach(cell => {
            const id = cell.getAttribute('data-material-id');
            const line = cost.materials.find(m => m.materialId === id);
            cell.textContent = (line ? line.areaM2 : 0).toFixed(2) + ' m²';
        });
        modal.querySelectorAll('.kosztorys-front-mat-cost').forEach(cell => {
            const id = cell.getAttribute('data-material-id');
            const line = cost.materials.find(m => m.materialId === id);
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
        set('#kosztorys-cut-count', cost.cutPartsCount + ' szt.');
        set('#kosztorys-cut-cost', formatPLN(cost.cuttingCost));
        set('#kosztorys-foot-cutting', formatPLN(cost.cuttingCost));
        set('#kosztorys-labor-cost', formatPLN(cost.laborCost));
        set('#kosztorys-lacquer-cost', formatPLN(cost.lacquerCost));
        set('#kosztorys-foot-lacquer', formatPLN(cost.lacquerCost));
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

    // Materiały frontów dostają wiersz TYLKO gdy jakiś front faktycznie ich
    // używa (zgłoszona uwaga - lista nie ma zaśmiecać się nieużywanymi
    // pozycjami katalogu) - dokładnie ta sama zasada co już dla Korpus/
    // Szuflada/Plecy. Nowy materiał powstaje więc NIE tutaj, tylko przy
    // froncie (ui/properties.js: "+ Nowy materiał…" w wyborze per front) -
    // dopiero gdy jest przypisany, ma tu sens pokazać mu wiersz do wyceny.
    function renderMaterialRows() {
        const cost = calculateProjectCost();
        const korpusHtml = cost.materials.filter(m => m.category === 'Korpus').map(otherRowHtml).join('');
        const frontHtml = cost.materials.filter(m => m.category === 'Front').map(frontRowHtml).join('');
        const restHtml = cost.materials.filter(m => m.category !== 'Korpus' && m.category !== 'Front').map(otherRowHtml).join('');

        materialsTbody.innerHTML = (korpusHtml + frontHtml + restHtml) || `<tr><td colspan="5" class="empty-note">Projekt jest pusty</td></tr>`;

        materialsTbody.querySelectorAll('.kosztorys-mat-price, .kosztorys-front-mat-price, .kosztorys-mat-name').forEach(input => {
            input.addEventListener('input', recalc);
        });
        // Nazwa materiału: odśwież listę per front (ui/properties.js) dopiero po
        // skończeniu wpisywania (change, nie input) - żeby nie przerywać pisania
        // pełnym przebudowaniem panelu na każdą literę.
        materialsTbody.querySelectorAll('.kosztorys-mat-name').forEach(input => {
            input.addEventListener('change', initPropertiesPanel);
        });
        materialsTbody.querySelectorAll('.kosztorys-mat-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-material-id');
                if (pricing.frontMaterials.length <= 1) return; // zawsze musi zostać co najmniej jeden (fallback dla frontów bez wybranego materiału)
                pricing.frontMaterials = pricing.frontMaterials.filter(m => m.id !== id);
                renderMaterialRows();
                recalc();
                initPropertiesPanel(); // odśwież listę materiałów w wyborze per front (ui/properties.js), jeśli otwarta
            });
        });
        materialsTbody.querySelectorAll('.kosztorys-mat-bulk').forEach(btn => {
            btn.addEventListener('click', () => {
                applyMaterialToZone(btn.getAttribute('data-material-id'), btn.getAttribute('data-zone-type'));
                renderMaterialRows();
                recalc();
                initPropertiesPanel();
                update3D();
                updateSidebar();
            });
        });
    }

    function otherRowHtml(m) {
        return `
            <tr>
                <td>${escapeHtml(MATERIAL_LABELS[m.category] || m.category)}</td>
                <td class="num kosztorys-mat-area" data-cat="${escapeHtml(m.category)}">${m.areaM2.toFixed(2)}&nbsp;m²</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-mat-price" data-cat="${escapeHtml(m.category)}" value="${m.pricePerM2}" step="1" min="0"> zł</span></td>
                <td class="num kosztorys-mat-cost" data-cat="${escapeHtml(m.category)}"><b>${formatPLN(m.cost)}</b></td>
                <td></td>
            </tr>`;
    }

    function frontRowHtml(m) {
        const canDelete = pricing.frontMaterials.length > 1;
        const bulkBtns = BULK_ZONES.map(z =>
            `<button type="button" class="kosztorys-mat-bulk" data-material-id="${escapeHtml(m.materialId)}" data-zone-type="${escapeHtml(z.type)}">wszystkich ${escapeHtml(z.label)}</button>`
        ).join(' · ');
        return `
            <tr>
                <td><input type="text" class="input kosztorys-mat-name" data-material-id="${escapeHtml(m.materialId)}" value="${escapeHtml(m.materialName)}" placeholder="Nazwa materiału frontu"></td>
                <td class="num kosztorys-front-mat-area" data-material-id="${escapeHtml(m.materialId)}">${m.areaM2.toFixed(2)}&nbsp;m²</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-front-mat-price" data-material-id="${escapeHtml(m.materialId)}" value="${m.pricePerM2}" step="1" min="0"> zł</span></td>
                <td class="num kosztorys-front-mat-cost" data-material-id="${escapeHtml(m.materialId)}"><b>${formatPLN(m.cost)}</b></td>
                <td>${canDelete ? `<button type="button" class="icon-btn kosztorys-mat-del" data-material-id="${escapeHtml(m.materialId)}" title="Usuń materiał"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}</td>
            </tr>
            <tr class="kosztorys-mat-bulk-row"><td colspan="5">Zastosuj do: ${bulkBtns}</td></tr>`;
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

    modal.querySelector('#kosztorys-price-save').addEventListener('click', async () => {
        const ok = await showCustomDialog('confirm', 'Zapisz jako domyślne ceny', 'Nadpisać zapisaną bazę cen aktualnym cennikiem tego projektu?', '', 'Zapisz', 'Anuluj');
        if (!ok) return;
        savePriceDefaults(pricing);
    });
    modal.querySelector('#kosztorys-price-load').addEventListener('click', async () => {
        const snapshot = loadPriceDefaults();
        if (!snapshot) {
            showAlert('Baza cen jest pusta - najpierw zapisz ceny z jakiegoś projektu jako domyślne (albo zaimportuj plik).');
            return;
        }
        const savedDate = new Date(snapshot.savedAt).toLocaleDateString('pl-PL');
        const ok = await showCustomDialog('confirm', 'Wczytaj z bazy cen', `Nałożyć zapisane ceny (z ${savedDate}) na ten projekt? Pozycje, których baza nie zna, zostaną bez zmian.`, '', 'Wczytaj', 'Anuluj');
        if (!ok) return;
        applyPriceDefaults(pricing, snapshot);
        renderMaterialRows();
        renderHardwareRows();
        recalc();
        initPropertiesPanel(); // katalog frontMaterials mógł dostać nowe pozycje - odśwież selektor materiału przy frontach
    });
    modal.querySelector('#kosztorys-price-export').addEventListener('click', () => {
        if (!loadPriceDefaults()) {
            showAlert('Baza cen jest pusta - najpierw zapisz ceny jako domyślne.');
            return;
        }
        const blob = new Blob([exportPriceDefaultsJson()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'baza-cen.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const priceFileInput = modal.querySelector('#kosztorys-price-file');
    modal.querySelector('#kosztorys-price-import').addEventListener('click', () => priceFileInput.click());
    priceFileInput.addEventListener('change', async () => {
        const file = priceFileInput.files && priceFileInput.files[0];
        if (!file) return;
        const ok = importPriceDefaultsJson(await file.text());
        priceFileInput.value = '';
        showAlert(ok ? 'Baza cen zaimportowana. Użyj „Wczytaj z bazy cen", żeby nałożyć ją na ten projekt.' : '❌ To nie jest poprawny plik bazy cen.');
    });

    renderMaterialRows();
    renderHardwareRows();
    recalc();
    modal.querySelector('#kosztorys-margin').addEventListener('input', recalc);
    ['labor-hours','labor-rate','lacquer-hours','lacquer-rate','cutting','assembly-hours','assembly-rate','transport','discount','vat'].forEach(k => modal.querySelector('#kosztorys-' + k).addEventListener('input', recalc));
}
