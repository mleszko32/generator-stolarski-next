// src/ui/kosztorysModal.js
// Okno kosztorysu projektu (ceny materiałów i okuć, robocizna, montaż, marża, rabat, VAT).
import { calculateProjectCost } from "../engine/cost.js";
import { calculateAllProjectParts } from "../engine/cabinet.js";
import { cuttingQuote, cutGroups } from "../engine/cuttingCost.js";
import { lacquerByColor } from "../engine/lacquerSummary.js";
import { state } from "../core/state.js";
import { scheduleCheckpoint } from "../core/history.js";
import { escapeHtml, downloadFile } from "../utils/dom.js";
import { initPropertiesPanel } from "./properties.js";
import { update3D } from "../render/viewer3d.js";
import { updateSidebar } from "./sidebar.js";
import { showCustomDialog } from "../core/storage.js";
import { loadPriceDefaults, savePriceDefaults, applyPriceDefaults, exportPriceDefaultsJson, importPriceDefaultsJson } from "../core/priceLibrary.js";
import { showAlert } from "../utils/modal.js";
import { baseCategory, catalogLabels, frontMaterialBoard } from "../core/materialCatalog.js";
import { lacquerColor, lacquerSuggestions, lacquerWarning } from "../core/lacquerColors.js";
import { loadSasCatalog, resetSasCatalog, parseSasCatalog, sasLabel, sasFromText, sasPricePerM2, SAS_BOARD_GROUPS, rowsFromLink, linkLabel, linkPrice, linkFromRows, sasSuggest, sasByIndex } from "../core/sasCatalog.js";
import { hardwareSasRows } from "../core/sasBasket.js";
import { saveSasCatalogToCloud, saveHebanCatalogToCloud } from "../core/storage.js";
import { loadHebanCatalog, resetHebanCatalog, parseHebanCatalog, hebanLabel, hebanFromText, hebanByCode, hebanPricePerM2, hebanIsBoard, hebanSuggest, hebanLinkFromRows, hebanRowsFromLink, hebanLinkPrice, hebanLinkLabel, hardwareHebanRows } from "../core/hebanCatalog.js";
import { BLUM_COLORS, drawerOptions, parseDrawerKit } from "../core/blumDrawer.js";
import { pickBoard, categoryDecor, boardOffers } from "../core/boardMatch.js";
import { groupHardware } from "../core/costGroups.js";

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

// Ilość płyty: przy cięciu wg hurtowni płacimy za pełne arkusze (powierzchnia arkuszy, nie formatek)
const areaText = (line) => line
    ? `${line.areaM2.toFixed(2)} m²${line.sheets != null ? ` (${Number.isInteger(line.sheets) ? line.sheets : line.sheets.toFixed(1)} ark.)` : ''}`
    : '0.00 m²';
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

    const drawerOpts = drawerOptions(pricing);
    const foot = (label, id, extra = '') => `<div class="cost-line${extra}"><span>${label}</span><span id="kosztorys-foot-${id}">—</span></div>`;

    const sel = (opt, cur, list) => `<select class="input input-sm" data-opt="${opt}">${list.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    // Sekcja zwijana (<details>) z sumą w nagłówku; stan otwarcia zapamiętany w przeglądarce (kz-open-<id>).
    const sec = (id, title, body, openByDefault) => {
        let open = openByDefault;
        try { const v = localStorage.getItem('kz-open-' + id); if (v !== null) open = v === '1'; } catch (e) { /* bez pamięci */ }
        return `<details class="kz-sec" data-sec="${id}" ${open ? 'open' : ''}><summary><span class="kz-sec-title">${title}</span><span class="kz-sec-sum" id="kosztorys-sum-${id}">—</span></summary><div class="kz-sec-body">${body}</div></details>`;
    };

    root.innerHTML = `
            <div class="kz-sticky">
                <div class="kz-total"><span>Koszty</span><b id="kosztorys-top-subtotal">—</b></div>
                <div class="kz-total"><span>Netto</span><b id="kosztorys-top-net">—</b></div>
                <div class="kz-total kz-total-main"><span>Brutto</span><b id="kosztorys-top-total">—</b></div>
            </div>
            <div class="kz-toolbar">
                <button id="kosztorys-auto" type="button" class="btn btn-primary" title="Płyty z hurtowni, która ma dany dekor (Egger / Woodeco - SAS, Swiss Krono - Heban), okucia z wybranej hurtowni. Czego nie ma - zostaje bez zmian.">Dobierz ceny z hurtowni</button>
                <label class="kz-inline">okucia: <select class="input input-sm" id="kosztorys-hw-source"><option value="sas" ${pricing.hardwareSource !== 'heban' ? 'selected' : ''}>wszystkie z SAS</option><option value="heban" ${pricing.hardwareSource === 'heban' ? 'selected' : ''}>wszystkie z Hebanu</option></select></label>
                <details class="kz-tools">
                    <summary>Cenniki i katalogi</summary>
                    <div class="kz-tools-body">
                        <div class="kz-tools-row"><b>Katalogi hurtowni</b>
                            <button id="kosztorys-sas-upload" type="button" class="btn btn-sm"><i class="ti ti-cloud-upload" aria-hidden="true"></i> Wgraj katalog SAS</button>
                            <input id="kosztorys-sas-file" type="file" accept="application/json,.json" style="display:none">
                            <span id="kosztorys-sas-status" class="hint"></span>
                        </div>
                        <div class="kz-tools-row"><b></b>
                            <button id="kosztorys-heban-upload" type="button" class="btn btn-sm"><i class="ti ti-cloud-upload" aria-hidden="true"></i> Wgraj katalog Heban</button>
                            <input id="kosztorys-heban-file" type="file" accept="application/json,.json" style="display:none">
                            <span id="kosztorys-heban-status" class="hint"></span>
                        </div>
                        <div class="kz-tools-row"><b>Baza cen</b>
                            <button id="kosztorys-price-save" type="button" class="btn btn-sm"><i class="ti ti-device-floppy" aria-hidden="true"></i> Zapisz jako domyślne ceny</button>
                            <button id="kosztorys-price-load" type="button" class="btn btn-sm"><i class="ti ti-download" aria-hidden="true"></i> Wczytaj z bazy cen</button>
                            <button id="kosztorys-price-export" type="button" class="btn btn-sm"><i class="ti ti-file-export" aria-hidden="true"></i> Eksport (plik JSON)</button>
                            <button id="kosztorys-price-import" type="button" class="btn btn-sm"><i class="ti ti-upload" aria-hidden="true"></i> Import z pliku</button>
                            <input id="kosztorys-price-file" type="file" accept="application/json,.json" style="display:none">
                        </div>
                        <div class="hint">Baza cen to jeden zapamiętany cennik w tej przeglądarce (materiały, fronty, okucia) - „Zapisz” zapamiętuje ceny z TEGO projektu, „Wczytaj” nakłada je na aktywny projekt bez kasowania pozycji, których baza nie zna. Eksport/import JSON przenosi bazę na inny komputer.</div>
                    </div>
                </details>
            </div>
            <datalist id="kosztorys-sas-all"></datalist><datalist id="kosztorys-sas-boards"></datalist>
            <datalist id="kosztorys-heban-all"></datalist><datalist id="kosztorys-heban-boards"></datalist>
            ${sec('plyty', 'Płyty i cięcie', `
                <table class="cost-table kz-table">
                    <thead><tr><th>Materiał</th><th>Źródło</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">Koszt</th><th></th></tr></thead>
                    <tbody id="kosztorys-materials-tbody"></tbody>
                    <tbody><tr><td>Cięcie formatek (hurtownia)
                        <div class="kz-opts"><select class="input" id="kosztorys-cut-mode" aria-label="Sposób liczenia cięcia">
                            ${[['manual', 'stawka ręczna'], ['sas', 'SAS (za mb)'], ['heban', 'Heban (za formatkę)']].map(([v, l]) => `<option value="${v}" ${pricing.cutting.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                            <label class="hint"><input type="checkbox" id="kosztorys-cut-express" ${pricing.cutting.express ? 'checked' : ''}> express ×1,5</label>
                            <label class="hint" id="kosztorys-cut-pallet-wrap"><input type="checkbox" id="kosztorys-cut-pallet" ${pricing.cutting.pallet ? 'checked' : ''}> paleta SAS</label></div></td>
                        <td></td><td class="num" id="kosztorys-cut-count">—</td><td class="num"><span id="kosztorys-cut-manual">${numField('cutting', pricing.cuttingPerPart, 'zł/szt.')}</span></td><td class="num" id="kosztorys-cut-cost">—</td><td></td></tr>
                        <tr><td colspan="6" class="hint" id="kosztorys-cut-compare"></td></tr></tbody>
                </table>`, true)}
            ${sec('okucia', 'Okucia i akcesoria', `
                <div class="kz-opts" id="kosztorys-blum-opts">
                    <span class="kz-opts-label">Szuflady Blum:</span>
                    ${sel('color', drawerOpts.color, Object.entries(BLUM_COLORS))}
                    ${sel('kg', drawerOpts.kg, [[40, '40 kg'], [70, '70 kg']])}
                    <span class="hint">wys. E</span>${sel('eVariant', drawerOpts.eVariant, [['reling', 'z relingiem'], ['boxcap', 'z Boxcap']])}
                    <span class="hint">front</span>${sel('fix', drawerOpts.fix, [['W', 'na wkręty'], ['I', 'Inserta']])}
                </div>
                <table class="cost-table kz-table">
                    <thead><tr><th>Pozycja</th><th>Źródło</th><th class="num">Ilość</th><th class="num">Cena jedn.</th><th class="num">Koszt</th><th></th></tr></thead>
                    <tbody id="kosztorys-hardware-tbody"></tbody>
                </table>`, true)}
            ${sec('praca', 'Robocizna, lakiernia, montaż, transport', `
                <table class="cost-table">
                    <thead><tr><th></th><th class="num">Czas</th><th class="num">Stawka</th><th class="num">Koszt</th></tr></thead>
                    <tbody>
                        <tr><td>Robocizna (warsztat)</td><td class="num">${numField('labor-hours', pricing.labor.hours, 'h')}</td><td class="num">${numField('labor-rate', pricing.labor.rate, 'zł/h')}</td><td class="num" id="kosztorys-labor-cost">—</td></tr>
                        <tr><td>Lakiernia</td><td class="num">${numField('lacquer-hours', pricing.lacquer.hours, 'h')}</td><td class="num">${numField('lacquer-rate', pricing.lacquer.rate, 'zł/h')}</td><td class="num" id="kosztorys-lacquer-cost">—</td></tr>
                        <tr><td>Montaż</td><td class="num">${numField('assembly-hours', pricing.assembly.hours, 'h')}</td><td class="num">${numField('assembly-rate', pricing.assembly.rate, 'zł/h')}</td><td class="num" id="kosztorys-assembly-cost">—</td></tr>
                        <tr><td>Transport</td><td></td><td class="num">${numField('transport', pricing.transport, 'zł')}</td><td></td></tr>
                    </tbody>
                </table>
                <div id="kosztorys-lacquer-colors"></div>`, true)}
            ${sec('marza', 'Marża, rabat, VAT', `
                <div class="field-row">
                    <div class="field"><label>Narzut na materiały i okucia (%)</label><input type="number" class="input" id="kosztorys-margin" value="${pricing.marginPercent}" step="1" min="0"></div>
                    <div class="field"><label>Marża na robociznę, montaż, transport (%)</label><input type="number" class="input" id="kosztorys-labor-margin" value="${pricing.laborMarginPercent ?? pricing.marginPercent}" step="1" min="0"></div>
                    <div class="field"><label>Rabat (%)</label><input type="number" class="input" id="kosztorys-discount" value="${pricing.discountPercent}" step="any" min="0" max="100"></div>
                    <div class="field"><label>VAT (%)</label><input type="number" class="input" id="kosztorys-vat" value="${pricing.vatPercent}" step="any" min="0"></div>
                </div>`, true)}
            <section class="cost-summary">
                ${foot('Materiały', 'plyty')}
                ${foot('Cięcie formatek', 'cutting')}
                ${foot('Okucia', 'okucia')}
                ${foot('Robocizna', 'labor')}
                ${foot('Lakiernia', 'lacquer')}
                ${foot('Montaż', 'assembly')}
                ${foot('Transport', 'transport')}
                ${foot('<b>Suma kosztów</b>', 'subtotal')}
                <div class="cost-line"><span>Narzut na materiały i okucia (<span id="kosztorys-foot-marginpct">0</span>%)</span><span id="kosztorys-foot-margin">—</span></div>
                <div class="cost-line"><span>Marża na pracę (<span id="kosztorys-foot-labormarginpct">0</span>%)</span><span id="kosztorys-foot-labormargin">—</span></div>
                <div class="cost-line"><span>Rabat (<span id="kosztorys-foot-discpct">0</span>%)</span><span id="kosztorys-foot-discount">—</span></div>
                ${foot('<b>Cena netto</b>', 'net')}
                <div class="cost-line"><span>VAT (<span id="kosztorys-foot-vatpct">23</span>%)</span><span id="kosztorys-foot-vat">—</span></div>
                <div class="cost-line cost-total"><span>Cena brutto</span><span id="kosztorys-foot-total">—</span></div>
            </section>`;
    root.querySelectorAll('.kz-sec').forEach(d => d.addEventListener('toggle', () => {
        try { localStorage.setItem('kz-open-' + d.dataset.sec, d.open ? '1' : '0'); } catch (e) { /* bez pamięci */ }
    }));
    const modal = root;

    const materialsTbody = modal.querySelector('#kosztorys-materials-tbody');
    const hardwareTbody = modal.querySelector('#kosztorys-hardware-tbody');

    // recalc(INIT) przy otwarciu tylko liczy i pokazuje - nie przepisuje pól do pricing (samo
    // otwarcie kosztorysu nie może oznaczać projektu jako zmienionego). Każde inne wywołanie
    // (zmiana pola, przycisk) zapisuje ceny i robi punkt cofania.
    const INIT = Symbol('init');
    let badgeTimer = null;
    function recalc(arg) {
        if (arg !== INIT) readInputs();
        renderTotals();
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => renderCompare(), 300); // źródło ceny (SAS / Heban / ręcznie) po zmianie pola
    }
    function readInputs() {
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
        // płyta, z której tnie się formatki tego materiału (np. Lakier -> MDF dwustronny z bazy SAS)
        modal.querySelectorAll('.kosztorys-mat-board').forEach(input => {
            const mat = pricing.frontMaterials.find(m => m.id === input.getAttribute('data-material-id'));
            if (!mat) return;
            const v = input.value.trim();
            if (v) mat.board = v; else delete mat.board;
        });
        // kolor lakieru (RAL / NCS) - opis formatek i kolor frontów w 3D
        modal.querySelectorAll('.kosztorys-mat-color').forEach(input => {
            const mat = pricing.frontMaterials.find(m => m.id === input.getAttribute('data-material-id'));
            if (!mat) return;
            const v = input.value.trim();
            if (v) mat.color = v; else delete mat.color;
            const sw = input.parentElement.querySelector('.kosztorys-mat-swatch');
            const c = lacquerColor(v);
            if (sw) { sw.hidden = c == null; if (c != null) sw.style.background = '#' + c.toString(16).padStart(6, '0'); }
            const warn = input.parentElement.querySelector('.kosztorys-mat-color-warn');
            if (warn) { const w = lacquerWarning(v); warn.hidden = !w; warn.textContent = w; }
        });
        modal.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            const name = input.getAttribute('data-name');
            pricing.hardware[name] = parseFloat(input.value) || 0;
        });
        pricing.marginPercent = parseFloat(modal.querySelector('#kosztorys-margin').value) || 0;
        pricing.laborMarginPercent = Math.max(0, parseFloat(modal.querySelector('#kosztorys-labor-margin').value) || 0);

        const num = (id) => Math.max(0, parseFloat(modal.querySelector(id).value) || 0);
        pricing.labor = { hours: num('#kosztorys-labor-hours'), rate: num('#kosztorys-labor-rate') };
        pricing.lacquer = { hours: num('#kosztorys-lacquer-hours'), rate: num('#kosztorys-lacquer-rate') };
        pricing.cuttingPerPart = num('#kosztorys-cutting');
        pricing.cutting = { mode: modal.querySelector('#kosztorys-cut-mode').value, express: modal.querySelector('#kosztorys-cut-express').checked, pallet: modal.querySelector('#kosztorys-cut-pallet').checked };
        pricing.assembly = { hours: num('#kosztorys-assembly-hours'), rate: num('#kosztorys-assembly-rate') };
        pricing.transport = num('#kosztorys-transport');
        pricing.discountPercent = Math.min(100, num('#kosztorys-discount'));
        pricing.vatPercent = num('#kosztorys-vat');
        scheduleCheckpoint();
    }
    // Ile lakieru na jaki kolor: m² jednej strony wszystkich lakierowanych elementów (fronty, blendy, boki, cokoły, panele).
    function renderLacquerColors() {
        const box = modal.querySelector('#kosztorys-lacquer-colors');
        const rows = lacquerByColor(calculateAllProjectParts(), pricing.frontMaterials);
        if (!rows.length) { box.innerHTML = ''; return; }
        const total = rows.reduce((t, r) => t + r.areaM2, 0);
        box.innerHTML = `<table class="cost-table kz-table"><thead><tr><th>Lakier wg koloru</th><th class="num">m² (jedna strona)</th><th class="num">Formatek</th></tr></thead><tbody>`
            + rows.map(r => {
                const c = lacquerColor(r.color);
                const sw = c == null ? '' : `<span class="decor-legend-swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span> `;
                return `<tr><td>${sw}${escapeHtml(r.color)}</td><td class="num">${r.areaM2.toFixed(2)} m²</td><td class="num">${r.pieces}</td></tr>`;
            }).join('')
            + `<tr class="kz-group"><td>Razem do polakierowania</td><td class="num">${total.toFixed(2)} m²</td><td></td></tr></tbody></table>`;
    }

    function renderTotals() {
        const cost = calculateProjectCost();

        modal.querySelectorAll('.kosztorys-mat-area').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat && !m.materialId);
            cell.textContent = areaText(line);
        });
        modal.querySelectorAll('.kosztorys-mat-cost').forEach(cell => {
            const cat = cell.getAttribute('data-cat');
            const line = cost.materials.find(m => m.category === cat && !m.materialId);
            cell.textContent = formatPLN(line ? line.cost : 0);
        });
        modal.querySelectorAll('.kosztorys-front-mat-area').forEach(cell => {
            const id = cell.getAttribute('data-material-id');
            const line = cost.materials.find(m => m.materialId === id);
            cell.textContent = areaText(line);
        });
        modal.querySelectorAll('.kosztorys-front-mat-cost').forEach(cell => {
            const id = cell.getAttribute('data-material-id');
            const line = cost.materials.find(m => m.materialId === id);
            cell.textContent = formatPLN(line ? line.cost : 0);
        });
        modal.querySelectorAll('.kz-board-sum').forEach(cell => {
            const lines = cost.materials.filter(m => m.category === 'Front' && (frontMaterialBoard(pricing.frontMaterials.find(x => x.id === m.materialId)) || '') === cell.dataset.board);
            const area = lines.reduce((t, m) => t + m.areaM2, 0);
            const sheets = lines.some(m => m.sheets != null) ? lines.reduce((t, m) => t + (m.sheets || 0), 0) : null;
            cell.textContent = areaText({ areaM2: area, sheets: sheets == null ? null : Math.round(sheets * 100) / 100 });
        });
        renderLacquerColors();
        modal.querySelectorAll('.kosztorys-hw-cost').forEach(cell => {
            const name = cell.getAttribute('data-name');
            const line = cost.hardware.find(h => h.name === name);
            cell.textContent = line ? formatPLN(line.cost) : formatPLN(0);
        });

        const set = (id, v) => { modal.querySelector(id).textContent = v; };
        // pasek z sumą i sumy w nagłówkach sekcji / grup okuć
        set('#kosztorys-top-subtotal', formatPLN(cost.subtotal));
        set('#kosztorys-top-net', formatPLN(cost.net));
        set('#kosztorys-top-total', formatPLN(cost.gross));
        set('#kosztorys-sum-plyty', formatPLN(cost.materialsSubtotal + cost.cuttingCost));
        set('#kosztorys-sum-okucia', formatPLN(cost.hardwareSubtotal));
        set('#kosztorys-sum-praca', formatPLN(cost.laborCost + cost.lacquerCost + cost.assemblyCost + cost.transportCost));
        set('#kosztorys-sum-marza', `narzut ${cost.marginPercent}% · marża ${cost.laborMarginPercent}% · rabat ${cost.discountPercent}% · VAT ${cost.vatPercent}%`);
        modal.querySelectorAll('.kz-group-sum').forEach(cell => {
            const names = new Set(groupHardware(cost.hardware).find(g => g.id === cell.dataset.group)?.items.map(h => h.name) || []);
            cell.textContent = formatPLN(cost.hardware.filter(h => names.has(h.name)).reduce((t, h) => t + h.cost, 0));
        });
        set('#kosztorys-foot-plyty', formatPLN(cost.materialsSubtotal));
        set('#kosztorys-foot-okucia', formatPLN(cost.hardwareSubtotal));
        set('#kosztorys-foot-margin', formatPLN(cost.goodsMarginAmount));
        set('#kosztorys-foot-marginpct', cost.marginPercent);
        set('#kosztorys-foot-labormargin', formatPLN(cost.laborMarginAmount));
        set('#kosztorys-foot-labormarginpct', cost.laborMarginPercent);
        set('#kosztorys-cut-count', cost.cutPartsCount + ' szt.');
        set('#kosztorys-cut-cost', formatPLN(cost.cuttingCost));
        // sposób liczenia cięcia: pole zł/szt. tylko przy stawce ręcznej, porównanie SAS / Heban pod wierszem
        modal.querySelector('#kosztorys-cut-manual').hidden = cost.cuttingMode !== 'manual';
        modal.querySelector('#kosztorys-cut-pallet-wrap').hidden = cost.cuttingMode !== 'sas';
        const cq = cuttingQuote(cutGroups(calculateAllProjectParts(), state.project.cutPlan, state.project.edgeBanding), pricing.cutting);
        const mb = cq.cutMb.toFixed(1).replace('.', ',');
        set('#kosztorys-cut-compare', cq.pieces
            ? `Szacunek: SAS ${formatPLN(cq.sas.total)} (≈ ${mb} mb cięcia${cq.sas.edging ? ', okleina PREMIUM ' + formatPLN(cq.sas.edging) : ''}${cq.sas.pallet ? ', paleta' : ''}) · Heban ${formatPLN(cq.heban.total)} (${cq.pieces} formatek) · ${cq.sas.total <= cq.heban.total ? 'taniej SAS' : 'taniej Heban'}`
            : '');
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
        // „Korpus” i „Korpus: <dekor>” (dekor korpusu szafki) - każdy dekor osobny wiersz z własną ceną.
        const isKorpus = (m) => baseCategory(m.category) === 'Korpus';
        const korpusHtml = cost.materials.filter(isKorpus).map(otherRowHtml).join('');
        // Materiały frontów na tej samej płycie (np. wszystkie lakiery na MDF W908) pod wspólnym nagłówkiem płyty -
        // arkusze liczą się razem, a rozróżnia je kolor w nazwie wiersza.
        const frontLines = cost.materials.filter(m => m.category === 'Front');
        const boardOf = (m) => frontMaterialBoard(pricing.frontMaterials.find(x => x.id === m.materialId)) || '';
        const frontHtml = [...new Set(frontLines.map(boardOf))].map(board => {
            const lines = frontLines.filter(m => boardOf(m) === board);
            const rows = lines.map(frontRowHtml).join('');
            return board && lines.length > 1
                ? `<tr class="kz-group"><td colspan="2">Płyta: ${escapeHtml(board)} <span class="hint">(${lines.length} kolory / materiały, wspólne arkusze)</span></td><td class="num kz-board-sum" data-board="${escapeHtml(board)}"></td><td colspan="3"></td></tr>${rows}`
                : rows;
        }).join('');
        const restHtml = cost.materials.filter(m => !isKorpus(m) && m.category !== 'Front').map(otherRowHtml).join('');

        materialsTbody.innerHTML = ((korpusHtml + frontHtml + restHtml) || `<tr><td colspan="6" class="empty-note">Projekt jest pusty</td></tr>`)
            + `<tr hidden><td><datalist id="kosztorys-color-catalog">${lacquerSuggestions().map(l => `<option value="${escapeHtml(l)}">`).join('')}</datalist><datalist id="kosztorys-board-catalog">${catalogLabels(state.project).map(l => `<option value="${escapeHtml(l)}">`).join('')}</datalist></td></tr>`;

        materialsTbody.querySelectorAll('.kosztorys-mat-price, .kosztorys-front-mat-price, .kosztorys-mat-name, .kosztorys-mat-board, .kosztorys-mat-color').forEach(input => {
            input.addEventListener('input', recalc);
        });
        bindSasFields(materialsTbody);
        bindHebanFields(materialsTbody);
        // Nazwa materiału: odśwież listę per front (ui/properties.js) dopiero po
        // skończeniu wpisywania (change, nie input) - żeby nie przerywać pisania
        // pełnym przebudowaniem panelu na każdą literę.
        materialsTbody.querySelectorAll('.kosztorys-mat-name').forEach(input => {
            input.addEventListener('change', () => {
                const label = [...materialsTbody.querySelectorAll('.kz-front-name')].find(b => b.dataset.materialId === input.dataset.materialId);
                if (label) label.textContent = input.value.trim() || 'Bez nazwy';
                initPropertiesPanel(); update3D(); // nazwa i kolor lakieru = kolor frontów w 3D
            });
        });
        materialsTbody.querySelectorAll('.kosztorys-mat-color').forEach(input => {
            input.addEventListener('input', () => {
                const label = [...materialsTbody.querySelectorAll('.kz-front-color')].find(b => b.dataset.materialId === input.dataset.materialId);
                if (label) label.textContent = input.value.trim() ? ' · ' + input.value.trim() : '';
            });
            input.addEventListener('change', () => update3D());
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
                <td>${srcBadgeHtml('materials', m.category)}</td>
                <td class="num kosztorys-mat-area" data-cat="${escapeHtml(m.category)}">${areaText(m)}</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-mat-price" data-cat="${escapeHtml(m.category)}" value="${m.pricePerM2}" step="1" min="0"> zł/m²</span></td>
                <td class="num kosztorys-mat-cost" data-cat="${escapeHtml(m.category)}"><b>${formatPLN(m.cost)}</b></td>
                <td>${editBtnHtml()}</td>
            </tr>
            ${priceEditRowHtml('materials', m.category)}`;
    }

    // Pole koloru lakieru z podpowiedziami RAL / NCS i próbką koloru.
    function colorFieldHtml(materialId) {
        const v = (pricing.frontMaterials.find(x => x.id === materialId) || {}).color || '';
        const c = lacquerColor(v);
        const bg = c == null ? '' : '#' + c.toString(16).padStart(6, '0');
        return `<label class="kosztorys-mat-color-label">Kolor (RAL / NCS): <span class="decor-legend-swatch kosztorys-mat-swatch" ${c == null ? 'hidden' : ''} style="background:${bg}"></span> <input type="text" class="input kosztorys-mat-color" list="kosztorys-color-catalog" data-material-id="${escapeHtml(materialId)}" value="${escapeHtml(v)}" placeholder="np. RAL 9016 albo S 0502-Y"> <span class="badge badge-warn kosztorys-mat-color-warn" ${lacquerWarning(v) ? '' : 'hidden'}>${escapeHtml(lacquerWarning(v))}</span></label>`;
    }

    function frontRowHtml(m) {
        const canDelete = pricing.frontMaterials.length > 1;
        const bulkBtns = BULK_ZONES.map(z =>
            `<button type="button" class="kosztorys-mat-bulk" data-material-id="${escapeHtml(m.materialId)}" data-zone-type="${escapeHtml(z.type)}">wszystkich ${escapeHtml(z.label)}</button>`
        ).join(' · ');
        const mat = pricing.frontMaterials.find(x => x.id === m.materialId) || {};
        const board = frontMaterialBoard(mat);
        const lacquer = /lakier/i.test(String(mat.name || ''));
        const note = board ? `płyta: ${board}${lacquer ? ' · lakierowanie liczysz w „Lakierni” (sekcja Robocizna)' : ''}` : '';
        return `
            <tr>
                <td>Front: <b class="kz-front-name" data-material-id="${escapeHtml(m.materialId)}">${escapeHtml(m.materialName)}</b><b class="kz-front-color" data-material-id="${escapeHtml(m.materialId)}">${mat.color ? ' · ' + escapeHtml(mat.color) : ''}</b>${note ? `<div class="hint">${escapeHtml(note)}</div>` : ''}</td>
                <td>${srcBadgeHtml('materials', 'Front:' + m.materialId)}</td>
                <td class="num kosztorys-front-mat-area" data-material-id="${escapeHtml(m.materialId)}">${areaText(m)}</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-front-mat-price" data-material-id="${escapeHtml(m.materialId)}" value="${m.pricePerM2}" step="1" min="0"> zł/m²</span></td>
                <td class="num kosztorys-front-mat-cost" data-material-id="${escapeHtml(m.materialId)}"><b>${formatPLN(m.cost)}</b></td>
                <td class="kz-actions">${editBtnHtml()}<button type="button" class="icon-btn kz-edit" data-edit="front" title="Nazwa, kolor RAL / NCS, płyta formatek, przypisanie do frontów"><i class="ti ti-settings" aria-hidden="true"></i></button>${canDelete ? `<button type="button" class="icon-btn kosztorys-mat-del" data-material-id="${escapeHtml(m.materialId)}" title="Usuń materiał"><i class="ti ti-trash" aria-hidden="true"></i></button>` : ''}</td>
            </tr>
            ${priceEditRowHtml('materials', 'Front:' + m.materialId)}
            <tr class="kosztorys-mat-bulk-row kz-edit-row" data-edit="front" hidden><td colspan="6"><label>Nazwa materiału: <input type="text" class="input kosztorys-mat-name" data-material-id="${escapeHtml(m.materialId)}" value="${escapeHtml(m.materialName)}" placeholder="Nazwa materiału frontu"></label> · ${colorFieldHtml(m.materialId)} · <label class="kosztorys-mat-board-label">Płyta formatek: <input type="text" class="input kosztorys-mat-board" list="kosztorys-board-catalog" data-material-id="${escapeHtml(m.materialId)}" value="${escapeHtml((pricing.frontMaterials.find(x => x.id === m.materialId) || {}).board || '')}" placeholder="np. MDF dwustronny z bazy SAS"></label> · Zastosuj do: ${bulkBtns}</td></tr>`;
    }

    function renderHardwareRows() {
        const cost = calculateProjectCost();
        if (cost.hardware.length === 0) {
            hardwareTbody.innerHTML = `<tr><td colspan="6" class="empty-note">Brak okuć w projekcie</td></tr>`;
            return;
        }
        const rowHtml = (hw) => `
            <tr>
                <td>${escapeHtml(hw.name)}</td>
                <td>${srcBadgeHtml('hardware', hw.name)}</td>
                <td class="num">${hw.qty} ${escapeHtml(hw.unit)}</td>
                <td class="num"><span class="cost-input"><input type="number" class="input kosztorys-hw-price" data-name="${escapeHtml(hw.name)}" value="${hw.price}" step="0.1" min="0"> zł</span></td>
                <td class="num kosztorys-hw-cost" data-name="${escapeHtml(hw.name)}"><b>${formatPLN(hw.cost)}</b></td>
                <td>${editBtnHtml()}</td>
            </tr>
            ${priceEditRowHtml('hardware', hw.name)}`;
        hardwareTbody.innerHTML = groupHardware(cost.hardware).map(g => `
            <tr class="kz-group"><td colspan="4">${escapeHtml(g.label)} <span class="hint">(${g.items.length})</span></td><td class="num kz-group-sum" data-group="${g.id}"></td><td></td></tr>
            ${g.items.map(rowHtml).join('')}`).join('');
        hardwareTbody.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            input.addEventListener('input', recalc);
        });
        bindSasFields(hardwareTbody);
        bindHebanFields(hardwareTbody);
        renderTotals();
        renderCompare();
    }

    // Pole ceny wiersza: płyta („kategoria”), materiał frontu („Front:<id>”), okucie (nazwa).
    function priceInputFor(kind, key) {
        if (kind === 'hardware') return [...modal.querySelectorAll('.kosztorys-hw-price')].find(el => el.getAttribute('data-name') === key) || null;
        if (key.startsWith('Front:')) return [...modal.querySelectorAll('.kosztorys-front-mat-price')].find(el => el.getAttribute('data-material-id') === key.slice(6)) || null;
        return [...modal.querySelectorAll('.kosztorys-mat-price')].find(el => el.getAttribute('data-cat') === key) || null;
    }
    // Wiersz pod pozycją, ten sam dla płyt, frontów i okuć: wyszukiwarka SAS, wyszukiwarka Heban, ceny w obu hurtowniach.
    function priceEditRowHtml(kind, key) {
        return `<tr class="kz-edit-row" data-edit="price" hidden><td colspan="6">${sasFieldHtml(kind, key)}${hebanFieldHtml(kind, key)}<div class="hint kz-compare" data-kind="${kind}" data-key="${escapeHtml(key)}"></div></td></tr>`;
    }

    // Źródło ceny wiersza (uzupełniane w renderCompare) i przycisk rozwijający wybór pozycji z cennika pod wierszem.
    function srcBadgeHtml(kind, key) {
        return `<span class="badge kz-src" data-kind="${kind}" data-key="${escapeHtml(key)}">…</span>`;
    }
    function editBtnHtml(title = 'Wybierz pozycję z cennika SAS / Heban') {
        return `<button type="button" class="icon-btn kz-edit" data-edit="price" title="${escapeHtml(title)}"><i class="ti ti-pencil" aria-hidden="true"></i></button>`;
    }
    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('.kz-edit');
        if (!btn) return;
        // wiersze rozwijane leżą zaraz pod pozycją; przycisk otwiera ten o swoim data-edit
        for (let row = btn.closest('tr').nextElementSibling; row && row.classList.contains('kz-edit-row'); row = row.nextElementSibling) {
            if (row.dataset.edit !== btn.dataset.edit) continue;
            row.hidden = !row.hidden;
            btn.classList.toggle('active', !row.hidden);
        }
    });

    // Pole wyszukiwania w katalogu SAS (core/sasCatalog.js) przy płycie / okuciu. Powiązanie w pricing.sas.
    function sasFieldHtml(kind, key) {
        const list = kind === 'materials' ? 'kosztorys-sas-boards' : 'kosztorys-sas-all';
        const linked = ((pricing.sas || {})[kind] || {})[key] || '';
        return `<div><input type="text" class="input kosztorys-sas" list="${list}" data-kind="${kind}" data-key="${escapeHtml(key)}" data-linked="${escapeHtml(linked)}" value="${escapeHtml(linked)}" placeholder="Szukaj w bazie SAS…"></div>`;
    }

    let sasReady = null;
    function showSasStatus(cat) {
        const el = modal.querySelector('#kosztorys-sas-status');
        if (el) el.textContent = cat.rows.length
            ? `Katalog SAS: ${cat.rows.length} pozycji, z ${cat.date.split('-').reverse().join('.')}`
            : 'Katalog SAS: brak w chmurze (zaloguj się albo wgraj plik sasCatalog.json)';
    }
    loadSasCatalog().then(showSasStatus);
    modal.querySelector('#kosztorys-sas-upload').addEventListener('click', () => modal.querySelector('#kosztorys-sas-file').click());
    modal.querySelector('#kosztorys-sas-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const cat = parseSasCatalog(await file.text());
        if (!cat) { showAlert('To nie jest plik katalogu SAS (sasCatalog.json ze skryptu scripts/sas/buduj.js).'); return; }
        if (!(await saveSasCatalogToCloud(cat))) return;
        resetSasCatalog();
        sasReady = null;
        showSasStatus(cat);
        showAlert(`✅ Wgrano katalog SAS: ${cat.rows.length} pozycji.`);
    });
    // Katalog Heban (core/hebanCatalog.js) - na razie tylko wgrywanie do chmury i stan; ceny w kosztorysie w kolejnym etapie.
    function showHebanStatus(cat) {
        const el = modal.querySelector('#kosztorys-heban-status');
        if (el) el.textContent = cat.rows.length
            ? `Katalog Heban: ${cat.rows.length} pozycji, z ${cat.date.split('-').reverse().join('.')}`
            : 'Katalog Heban: brak w chmurze (zaloguj się albo wgraj plik hebanCatalog.json)';
    }
    loadHebanCatalog().then(showHebanStatus);
    modal.querySelector('#kosztorys-heban-upload').addEventListener('click', () => modal.querySelector('#kosztorys-heban-file').click());
    modal.querySelector('#kosztorys-heban-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const cat = parseHebanCatalog(await file.text());
        if (!cat) { showAlert('To nie jest plik katalogu Heban (hebanCatalog.json ze skryptu scripts/heban/buduj.js).'); return; }
        if (!(await saveHebanCatalogToCloud(cat))) return;
        resetHebanCatalog();
        showHebanStatus(cat);
        showAlert(`✅ Wgrano katalog Heban: ${cat.rows.length} pozycji.`);
    });
    function ensureSasLists() {
        if (!sasReady) sasReady = loadSasCatalog().then(cat => {
            if (!cat.rows.length) sasReady = null; // spróbuj ponownie po zalogowaniu / wgraniu
            const opts = (rows) => rows.map(r => `<option value="${escapeHtml(sasLabel(r))}">`).join('');
            modal.querySelector('#kosztorys-sas-all').innerHTML = opts(cat.rows);
            modal.querySelector('#kosztorys-sas-boards').innerHTML = opts(cat.rows.filter(r => SAS_BOARD_GROUPS.includes(r[4])));
            return cat;
        });
        return sasReady;
    }

    function bindSasFields(container) {
        const fields = [...container.querySelectorAll('.kosztorys-sas')];
        // pola z powiązaniem pokazują pełny opis pozycji (po załadowaniu katalogu)
        if (fields.some(f => f.dataset.linked)) ensureSasLists().then(cat => fields.forEach(f => {
            const list = rowsFromLink(cat.rows, f.dataset.linked);
            if (list) f.value = linkLabel(list);
        }));
        fields.forEach(input => {
            input.addEventListener('focus', ensureSasLists, { once: true });
            input.addEventListener('change', async () => {
                const cat = await ensureSasLists();
                const { kind, key } = input.dataset;
                const links = (pricing.sas = pricing.sas || {});
                links[kind] = links[kind] || {};
                if (!input.value.trim()) { delete links[kind][key]; recalc(); return; }
                const row = sasFromText(cat.rows, input.value);
                if (!row) return;
                const cp = state.project.cutPlan || {};
                const area = ((+cp.sheetW || 2800) * (+cp.sheetH || 2070)) / 1e6;
                const price = kind === 'materials' ? sasPricePerM2(row, area) : row[3];
                if (price == null) return;
                links[kind][key] = row[0];
                input.value = sasLabel(row);
                const priceInput = priceInputFor(kind, key);
                if (priceInput) priceInput.value = String(price);
                recalc();
                if (kind === 'hardware') renderCompare();
            });
        });
    }

    // --- Heban: pola wyszukiwania przy płytach i okuciach, dobór okuć, porównanie z SAS ---
    // Powiązanie w pricing.heban = { materials: { kategoria: kod }, hardware: { nazwa: „kod×ilość|kod×ilość” } }.
    function hebanFieldHtml(kind, key) {
        const list = kind === 'materials' ? 'kosztorys-heban-boards' : 'kosztorys-heban-all';
        const linked = ((pricing.heban || {})[kind] || {})[key] || '';
        return `<div><input type="text" class="input kosztorys-heban" list="${list}" data-kind="${kind}" data-key="${escapeHtml(key)}" data-linked="${escapeHtml(linked)}" value="${escapeHtml(linked)}" placeholder="Szukaj w bazie Heban…"></div>`;
    }

    let hebanReady = null;
    function ensureHebanLists() {
        if (!hebanReady) hebanReady = loadHebanCatalog().then(cat => {
            if (!cat.rows.length) hebanReady = null; // spróbuj ponownie po zalogowaniu / wgraniu
            const opts = (rows) => rows.map(r => `<option value="${escapeHtml(hebanLabel(r))}">`).join('');
            modal.querySelector('#kosztorys-heban-all').innerHTML = opts(cat.rows);
            modal.querySelector('#kosztorys-heban-boards').innerHTML = opts(cat.rows.filter(hebanIsBoard));
            return cat;
        });
        return hebanReady;
    }

    function hebanLinks(kind) {
        const links = (pricing.heban = pricing.heban || {});
        return (links[kind] = links[kind] || {});
    }

    function bindHebanFields(container) {
        const fields = [...container.querySelectorAll('.kosztorys-heban')];
        if (fields.some(f => f.dataset.linked)) ensureHebanLists().then(cat => fields.forEach(f => {
            if (!f.dataset.linked) return;
            if (f.dataset.kind === 'materials') { const r = hebanByCode(cat.rows, f.dataset.linked); if (r) f.value = hebanLabel(r); return; }
            const list = hebanRowsFromLink(cat.rows, f.dataset.linked);
            if (list) f.value = hebanLinkLabel(list);
        }));
        fields.forEach(input => {
            input.addEventListener('focus', ensureHebanLists, { once: true });
            input.addEventListener('change', async () => {
                const cat = await ensureHebanLists();
                const { kind, key } = input.dataset;
                const links = hebanLinks(kind);
                if (!input.value.trim()) { delete links[key]; recalc(); if (kind === 'hardware') renderCompare(); return; }
                const row = hebanFromText(cat.rows, input.value);
                if (!row) return;
                const price = kind === 'materials' ? hebanPricePerM2(row) : row[3];
                if (price == null) return;
                links[key] = kind === 'materials' ? row[0] : hebanLinkFromRows([row]);
                input.value = hebanLabel(row);
                const priceInput = priceInputFor(kind, key);
                if (priceInput) priceInput.value = String(price);
                recalc();
                if (kind === 'hardware') renderCompare();
            });
        });
    }

    // „Dobierz ceny z hurtowni”: płyty z hurtowni, która ma dany dekor (core/boardMatch.js: Egger / Woodeco - SAS,
    // Swiss Krono - Heban, brak w obu - cena zostaje), okucia wszystkie z wybranej hurtowni (pricing.hardwareSource).
    // Pozycja wybrana wcześniej polem wyszukiwania (powiązanie) ma pierwszeństwo - dostaje tylko aktualną cenę.
    const hwSourceSel = modal.querySelector('#kosztorys-hw-source');
    hwSourceSel.addEventListener('change', () => { pricing.hardwareSource = hwSourceSel.value; scheduleCheckpoint(); });
    modal.querySelector('#kosztorys-auto').addEventListener('click', async () => {
        const [sas, heb] = await Promise.all([ensureSasLists(), ensureHebanLists()]);
        if (!sas.rows.length && !heb.rows.length) { showAlert('Brak katalogów SAS i Heban w chmurze - zaloguj się albo wgraj pliki katalogów.'); return; }
        const cp = state.project.cutPlan || {};
        const sheetArea = ((+cp.sheetW || 2800) * (+cp.sheetH || 2070)) / 1e6;
        const sasMat = ((pricing.sas = pricing.sas || {}).materials = pricing.sas.materials || {});
        const hebMat = hebanLinks('materials');
        const boards = { sas: 0, heban: 0, missing: [] };
        // key = klucz powiązania (kategoria albo „Front:<id>”), label = dekor / płyta do dopasowania
        const priceBoard = (input, key, label, shownName) => {
            let pick;
            const sasRow = sasByIndex(sas.rows, sasMat[key]), hebRow = hebanByCode(heb.rows, hebMat[key]);
            if (sasRow) pick = { src: 'sas', row: sasRow, pricePerM2: sasPricePerM2(sasRow, sheetArea) };
            else if (hebRow) pick = { src: 'heban', row: hebRow, pricePerM2: hebanPricePerM2(hebRow) };
            else pick = pickBoard(sas.rows, heb.rows, label, { sheetArea });
            if (!pick || pick.pricePerM2 == null) { boards.missing.push(shownName); return; }
            if (pick.src === 'sas') { sasMat[key] = pick.row[0]; delete hebMat[key]; } else { hebMat[key] = pick.row[0]; delete sasMat[key]; }
            input.value = String(pick.pricePerM2);
            boards[pick.src]++;
        };
        modal.querySelectorAll('.kosztorys-mat-price').forEach(input => {
            const cat = input.getAttribute('data-cat');
            priceBoard(input, cat, categoryDecor(cat, state.project), cat);
        });
        // Fronty: płyta z nazwy materiału (np. „H1386 ST40 18mm”) albo „Płyta formatek” (lakier = MDF W908) - sama płyta,
        // lakierowanie jest w Lakierni.
        modal.querySelectorAll('.kosztorys-front-mat-price').forEach(input => {
            const mat = pricing.frontMaterials.find(m => m.id === input.getAttribute('data-material-id'));
            if (mat) priceBoard(input, 'Front:' + mat.id, frontMaterialBoard(mat) || mat.name, `Front: ${mat.name}`);
        });
        const src = hwSourceSel.value === 'heban' ? 'heban' : 'sas';
        pricing.hardwareSource = src;
        const cat = src === 'sas' ? sas : heb;
        const opts = drawerOptions(pricing);
        const hwLinks = src === 'sas' ? ((pricing.sas.hardware = pricing.sas.hardware || {})) : hebanLinks('hardware');
        let hwFound = 0;
        const hwMissing = [];
        modal.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            const name = input.getAttribute('data-name');
            const list = !cat.rows.length ? null : src === 'sas' ? hardwareSasRows(cat.rows, hwLinks, name, opts) : hardwareHebanRows(cat.rows, hwLinks, name, opts);
            if (!list) { hwMissing.push(name); return; }
            hwLinks[name] = src === 'sas' ? linkFromRows(list) : hebanLinkFromRows(list);
            input.value = String(src === 'sas' ? linkPrice(list) : hebanLinkPrice(list));
            hwFound++;
        });
        recalc();
        renderMaterialRows();
        renderHardwareRows();
        const srcName = src === 'sas' ? 'SAS' : 'Heban';
        const list = (names) => names.map(n => `• ${n}`).join('\n');
        showAlert(`Płyty: ${boards.sas + boards.heban} z ${boards.sas + boards.heban + boards.missing.length} (SAS ${boards.sas}, Heban ${boards.heban}).`
            + (boards.missing.length ? `\nBez ceny (brak w obu hurtowniach albo brak dekoru):\n${list(boards.missing)}` : '')
            + `\n\nOkucia z ${srcName}: ${hwFound} z ${hwFound + hwMissing.length}.`
            + (hwMissing.length ? `\nNie ma w ${srcName} (cena bez zmian - wpisz albo wybierz polem wyszukiwania):\n${list(hwMissing)}` : ''));
    });

    // Pod każdym okuciem: cena z SAS i z Hebanu (powiązanie albo automatyczny dobór), tańsza wyróżniona; kliknięcie
    // wpisuje cenę do pola.
    let compareRun = 0;
    async function renderCompare() {
        const run = ++compareRun;
        const [sas, heb] = await Promise.all([loadSasCatalog(), loadHebanCatalog()]);
        if (run !== compareRun) return;
        const opts = drawerOptions(pricing);
        const cp = state.project.cutPlan || {};
        const sheetArea = ((+cp.sheetW || 2800) * (+cp.sheetH || 2070)) / 1e6;
        const near = (x, y) => x != null && Math.abs(x - y) < 0.005;
        const links = (src, kind) => ((pricing[src] || {})[kind]) || {}; // tylko odczyt - samo otwarcie nie zmienia projektu
        // Oferty obu hurtowni dla wiersza - ta sama zasada dla płyt, frontów i okuć: pozycja wybrana polem wyszukiwania,
        // inaczej automatyczny dobór. { sas, heban } z { price, link } albo null.
        const offersFor = (kind, key) => {
            if (kind === 'hardware') {
                const sl = sas.rows.length ? hardwareSasRows(sas.rows, links('sas', 'hardware'), key, opts) : null;
                const hl = heb.rows.length ? hardwareHebanRows(heb.rows, links('heban', 'hardware'), key, opts) : null;
                return { sas: sl && { price: linkPrice(sl), link: linkFromRows(sl) }, heban: hl && { price: hebanLinkPrice(hl), link: hebanLinkFromRows(hl) } };
            }
            const sRow = sasByIndex(sas.rows, links('sas', 'materials')[key]);
            const hRow = hebanByCode(heb.rows, links('heban', 'materials')[key]);
            const mat = key.startsWith('Front:') ? pricing.frontMaterials.find(m => m.id === key.slice(6)) : null;
            const label = mat ? (frontMaterialBoard(mat) || mat.name) : categoryDecor(key, state.project);
            const auto = (!sRow || !hRow) ? boardOffers(sas.rows, heb.rows, label, { sheetArea }) : { sas: null, heban: null };
            const so = sRow ? { row: sRow, pricePerM2: sasPricePerM2(sRow, sheetArea) } : auto.sas;
            const ho = hRow ? { row: hRow, pricePerM2: hebanPricePerM2(hRow) } : auto.heban;
            return { sas: so && so.pricePerM2 != null && { price: so.pricePerM2, link: so.row[0] }, heban: ho && ho.pricePerM2 != null && { price: ho.pricePerM2, link: ho.row[0] } };
        };
        modal.querySelectorAll('.kz-compare').forEach(cell => {
            const { kind, key } = cell.dataset;
            const input = priceInputFor(kind, key);
            const o = offersFor(kind, key);
            const price = input ? parseFloat(input.value) || 0 : 0;
            // źródło ceny w wierszu: hurtownia, której cena = cena w polu; inaczej „ręcznie” / „brak ceny”
            const badge = [...modal.querySelectorAll(`.kz-src[data-kind="${kind}"]`)].find(x => x.dataset.key === key);
            if (badge) {
                const [text, cls] = !(price > 0) ? ['brak ceny', 'badge-warn'] : near(o.sas && o.sas.price, price) ? ['SAS', 'badge-info']
                    : near(o.heban && o.heban.price, price) ? ['Heban', 'badge-success'] : ['ręcznie', ''];
                badge.textContent = text;
                badge.className = `badge kz-src ${cls}`;
            }
            const offers = [o.sas && { src: 'sas', name: 'SAS', ...o.sas }, o.heban && { src: 'heban', name: 'Heban', ...o.heban }].filter(Boolean);
            if (!offers.length) { cell.textContent = 'Brak w katalogach SAS i Heban - wybierz pozycję polem wyszukiwania albo wpisz cenę.'; return; }
            const min = Math.min(...offers.map(x => x.price));
            const unit = kind === 'materials' ? ' / m²' : '';
            const btns = offers.map((x, i) => `<button type="button" class="kosztorys-pick" data-i="${i}" title="Wpisz tę cenę">${x.name}: ${x.price === min && offers.length > 1 ? `<b>${formatPLN(x.price)}</b>` : formatPLN(x.price)}${unit}</button>`).join(' · ');
            const diff = offers.length > 1 && offers[0].price !== offers[1].price
                ? ` · taniej ${offers.find(x => x.price === min).name} o ${formatPLN(Math.abs(offers[0].price - offers[1].price))}` : '';
            cell.innerHTML = 'Ceny w hurtowniach: ' + btns + diff;
            cell.querySelectorAll('.kosztorys-pick').forEach(btn => btn.addEventListener('click', () => {
                const x = offers[+btn.dataset.i];
                if (!input) return;
                ((pricing[x.src] = pricing[x.src] || {})[kind] = pricing[x.src][kind] || {})[key] = x.link; // wybór zapamiętany jak z pola wyszukiwania
                input.value = String(x.price);
                const field = [...modal.querySelectorAll(`.kosztorys-${x.src}[data-kind="${kind}"]`)].find(f => f.dataset.key === key);
                if (field) { field.value = x.link; field.dataset.linked = x.link; }
                recalc();
            }));
        });
    }

    // Opcje szuflad Blum (pricing.blumDrawer, core/blumDrawer.js). Przy zmianie komplety szuflad z ceną dobraną
    // automatycznie z SAS / Hebanu dostają cenę dla nowych opcji (cena wpisana ręcznie zostaje).
    modal.querySelectorAll('#kosztorys-blum-opts select').forEach(sel => sel.addEventListener('change', async () => {
        const before = drawerOptions(pricing);
        const next = { ...before };
        modal.querySelectorAll('#kosztorys-blum-opts select').forEach(x => { next[x.dataset.opt] = x.dataset.opt === 'kg' ? Number(x.value) : x.value; });
        pricing.blumDrawer = drawerOptions({ blumDrawer: next });
        const after = pricing.blumDrawer;
        const [sas, heb] = await Promise.all([loadSasCatalog(), loadHebanCatalog()]);
        const sources = [
            { cat: sas, links: ((pricing.sas = pricing.sas || {}).hardware = pricing.sas.hardware || {}), suggest: sasSuggest, toLink: linkFromRows, price: linkPrice },
            { cat: heb, links: hebanLinks('hardware'), suggest: hebanSuggest, toLink: hebanLinkFromRows, price: hebanLinkPrice },
        ];
        modal.querySelectorAll('.kosztorys-hw-price').forEach(input => {
            const name = input.getAttribute('data-name');
            if (!parseDrawerKit(name)) return;
            const cur = parseFloat(input.value) || 0;
            let newPrice = null;
            sources.forEach(src => {
                if (!src.cat.rows.length) return;
                const old = src.suggest(src.cat.rows, name, before);
                if (!old) return;
                const autoLinked = src.links[name] === src.toLink(old);
                if (src.links[name] && !autoLinked) return; // pozycja wybrana ręcznie w polu wyszukiwania
                const nw = src.suggest(src.cat.rows, name, after);
                if (autoLinked) { if (nw) src.links[name] = src.toLink(nw); else delete src.links[name]; }
                if (newPrice == null && nw && Math.abs(src.price(old) - cur) < 0.005) newPrice = src.price(nw);
            });
            if (newPrice != null) input.value = String(newPrice);
        });
        recalc();
        renderHardwareRows();
    }));

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
        downloadFile('baza-cen.json', exportPriceDefaultsJson(), 'application/json');
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
    recalc(INIT);
    ['mode', 'express', 'pallet'].forEach(k => modal.querySelector('#kosztorys-cut-' + k).addEventListener('change', recalc));
    modal.querySelector('#kosztorys-margin').addEventListener('input', recalc);
    modal.querySelector('#kosztorys-labor-margin').addEventListener('input', recalc);
    ['labor-hours','labor-rate','lacquer-hours','lacquer-rate','cutting','assembly-hours','assembly-rate','transport','discount','vat'].forEach(k => modal.querySelector('#kosztorys-' + k).addEventListener('input', recalc));
}
