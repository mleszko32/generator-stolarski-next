// src/ui/technicalDrawing.js
// Rysunek techniczny aktywnej szafki (nawierty, System 32) w osobnym oknie, z
// wydrukiem pojedynczej formatki na A4.
import { calculateParts } from "../engine/cabinet.js";
import { generateSidePanelSVG } from "../render/viewer2d.js";
import { state, getActiveModule } from "../core/state.js";
import { update3D } from "../render/viewer3d.js";
import { initPropertiesPanel, openCornerBlankPrintView } from "./properties.js";
import { escapeHtml } from "../utils/dom.js";

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
                              <option value="auto">1 kartka A4 (wymiary jak na rysunku)</option>
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
                          if (sel === 'auto') return { s: Math.min(best.fit, 1), o: best };   // zawsze jedna kartka
                          var sc = sel === 'auto' ? MINREAD : parseFloat(sel);
                          var pages = orients.map(function (x) {
                              var ttw = x.aw / sc, tth = x.ah / sc;
                              return tileCount(bw, ttw, ttw - OVL / sc) * tileCount(bh, tth, tth - OVL / sc);
                          });
                          return { s: sc, o: (pages[1] < pages[0]) ? orients[1] : (pages[0] < pages[1] ? orients[0] : best) };
                      }

                      var bb = g.getBBox();
                      var plan = planFor(bb.width + 2 * M, bb.height + 2 * M);

                      // Czytelność przy zmniejszonej skali: opisy mają w SVG 9-12 jednostek (=
                      // mm w skali 1:1), a otwory r=1,5-4 i cienkie linie pomocnicze 0,5 - na
                      // kartce w skali np. 1:8 byłyby niewidoczne. Powiększamy więc opisy (tak,
                      // by najmniejszy miał ok. 2,6 mm), kropki otworów (min. 0,55 mm promienia)
                      // i cienkie linie (min. 0,2 mm). Powiększenie opisów jest ograniczone do
                      // x2,25 - opisy sąsiednich otworów są w rysunku co 32 mm, więc większe
                      // zaczęłyby na siebie nachodzić. Powiększone opisy poszerzają rysunek, a to
                      // zmienia skalę, więc dopasowujemy iteracyjnie. Robimy to na oryginalnych
                      // elementach (getBBox musi zobaczyć zmiany), po zbudowaniu arkuszy
                      // przywracamy oryginał.
                      var TEXT_MM = 2.8, TEXT_KMAX = 2.6;
                      var touched = [];
                      function restoreFonts() {
                          touched.forEach(function (p) {
                              if (p[2] === null) p[0].removeAttribute(p[1]); else p[0].setAttribute(p[1], p[2]);
                          });
                          touched = [];
                      }
                      function setAttrTracked(el, attr, val) {
                          touched.push([el, attr, el.getAttribute(attr)]);
                          el.setAttribute(attr, String(val));
                      }
                      function applyBoost(k, sc) {
                          if (titleEl) setAttrTracked(titleEl, 'display', 'none');
                          g.querySelectorAll('text, tspan').forEach(function (t) {
                              var fs0 = t.getAttribute('font-size');
                              if (fs0 && k > 1.01) setAttrTracked(t, 'font-size', parseFloat(fs0) * k);
                              // Na wydruku jasnoszare opisy (druga krawędź w nawiasie) i półprzezroczyste
                              // (skrajne otwory podpórek) wychodzą prawie niewidoczne - ciemniejszy kolor, pełna krycie.
                              if ((t.getAttribute('fill') || '').toLowerCase() === '#94a3b8') setAttrTracked(t, 'fill', '#475569');
                              if (t.getAttribute('opacity')) setAttrTracked(t, 'opacity', '1');
                          });
                          g.querySelectorAll('circle').forEach(function (c) {
                              var r0 = parseFloat(c.getAttribute('r'));
                              var r1 = Math.max(r0, 0.7 / sc);
                              if (r1 > r0 + 0.01) setAttrTracked(c, 'r', r1);
                          });
                          g.querySelectorAll('line, rect, polygon, polyline, path').forEach(function (e) {
                              var w0 = parseFloat(e.getAttribute('stroke-width'));
                              if (!w0) return;
                              var w1 = Math.max(w0, 0.25 / sc);
                              if (w1 > w0 + 0.001) setAttrTracked(e, 'stroke-width', w1);
                          });
                      }
                      // Tytuł formatki jest już w nagłówku arkusza. W rysunku stoi wysoko nad
                      // formatką (wg wysokości całego zestawu modułów) i zawyżał obszar rysunku,
                      // przez co formatka wychodziła w mniejszej skali - ukrywamy go na czas
                      // pomiaru i wydruku.
                      if (titleEl) setAttrTracked(titleEl, 'display', 'none');
                      bb = g.getBBox();
                      plan = planFor(bb.width + 2 * M, bb.height + 2 * M);
                      var textK = 1;
                      for (var it = 0; it < 6; it++) {
                          var kNew = Math.min(TEXT_KMAX, Math.max(1, TEXT_MM / (9 * plan.s)));
                          if (Math.abs(kNew - textK) < 0.03) break;
                          textK = kNew;
                          restoreFonts();
                          applyBoost(textK, plan.s);
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
