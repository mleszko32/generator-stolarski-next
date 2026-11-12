// src/engine/cabinet.js
import { state } from "../core/state.js";
import { calculateDrawerHoles, drawerComponentsToParts } from "../core/drawerMath.js";
import { drawerSpec, drawerBaseY, isBottomOverlayFront } from "../core/drawerSpec.js";
import { innerFrontSpec } from "../core/drawerAssembly.js";
import { corpusInnerDepth } from "../core/backPanel.js";
import { calculateHinges, stackedHingeObstacles } from "../core/hingeMath.js";
import { fmtMm } from "../utils/math.js";
import { getWorktopParts } from "../core/worktops.js";
import { recalculateAllLayouts, getCornerDepths, getModuleBox } from "../core/layout.js";
import { getCorpusHoles, getPionMountHoles, getCorpusParts, getBackPanelParts } from "./carcaseParts.js";
import { getCornerCorpusParts } from "./cornerParts.js";
import { getSlopeCabinetParts, getSlopeFrontParts } from "../core/slopeCabinet.js";
import { getBlindPanel, getBlindStile, blindGeometry, getBlindCorner } from "../core/blindCorner.js";
import { frontClearance } from "../core/autoClearance.js";
import { isFlap } from "../core/liftFlap.js";
import { splitPlinthRun, maxPlinthLength } from "./plinthSplit.js";
import { buildPlinthRuns } from "./plinthRuns.js";
import { shelfStiffener } from "../core/shelfStiffener.js";
import { KORPUS, korpusCategory, moduleKorpusDecor, PLECY, plecyCategory, moduleBackDecor } from "../core/materialCatalog.js";
import { furnitureGroups, sharedFurnitureKey, COLLECTIVE_KEY } from "../core/furnitureGroups.js";
import { getDishwasherParts } from "../core/dishwasher.js";
import { moduleBoardThickness, sidePanelLayers } from "../core/boardThickness.js";

export function calculateParts() {
  // Fronty muszą mieć aktualne el.x/y/w/h zanim policzymy z nich formatki.
  // Nie zakładamy, że update3D() (render) pobiegł wcześniej.
  recalculateAllLayouts();

  const activeModuleId = state.activeModuleId;
  const mod = state.project.modules.find(m => m.id === activeModuleId);
  if (!mod) return { parts: [], mountingData: [] };
  return calculateModuleParts(mod);
}

// Formatki i dane wierceń (mountingData) jednej, dowolnej szafki - to samo co calculateParts()
// dla aktywnej, używane też przez instrukcje montażu (core/cabinetDrillings.js). Wymaga
// aktualnego layoutu (recalculateAllLayouts / recalculateLayout).
export function calculateModuleParts(mod) {
  const config = state.project;
  let rawParts = [];
  let mountingData = [];

  // Szafka narożna (mod.type === 'corner_cabinet') ma dwa ramiona zamiast
  // jednego prostokątnego korpusu - getCorpusParts/getBackPanelParts
  // zakładają jeden wspólny width/depth i dałyby błędne formatki, więc ma
  // własną, równoległą funkcję (patrz getCornerCorpusParts niżej).
  // getCorpusHoles (nawierty łączeń kołek+wkręt) też zakłada jeden
  // prostokątny korpus - dla narożnika pomijamy (brak jeszcze rysunku
  // technicznego dla tego typu modułu, patrz plan boki dokładane/narożnik).
  if (mod.type === 'corner_cabinet') {
      rawParts.push(...getCornerCorpusParts(mod, config));
  } else if (mod.type === 'slope_cabinet') {
      // Szafka pod skos: formatki korpusu i wnętrza z core/slopeCabinet.js.
      rawParts.push(...getSlopeCabinetParts(mod, config));
      rawParts.push(...getSlopeFrontParts(mod, config));
  } else {
      rawParts.push(...getCorpusParts(mod, config));
      rawParts.push(...getBackPanelParts(mod, config));
      mountingData.push(...getCorpusHoles(mod, config));
  }
  // Szafka pod skos ma wnętrze i fronty już policzone wyżej (przycięte skosem).
  if (mod.type !== 'slope_cabinet') {
    rawParts.push(...getInteriorParts(mod, config));

    const frontsAndDrawers = getFrontsAndDrawers(mod, config);
    rawParts.push(...frontsAndDrawers.parts);

    mountingData.push(...frontsAndDrawers.mountingData);
    mountingData.push(...getPionMountHoles(mod, config));
    mountingData.push(...getGlobalHingesForModule(mod, config));
  }

  const aggregated = {};
  rawParts.forEach(part => {
     // materialId w kluczu: dwa fronty o tym samym rozmiarze, ale innym
     // materiale (core/state.js: pricing.frontMaterials), to RÓŻNE formatki -
     // bez tego druga po prostu zliczyłaby się do ilości pierwszej.
     const key = `${part.category}_${part.name}_${part.length}_${part.width}_${part.materialId || ''}`;
     if (aggregated[key]) {
         aggregated[key].qty += part.qty;
     } else {
         aggregated[key] = { ...part };
     }
  });

  return { parts: Object.values(aggregated), mountingData };
}

function getGlobalHingesForModule(targetMod, config) {
  const mountingData = [];
  const th = moduleBoardThickness(targetMod, config);
  // Odcisk w pokoju z uwzględnieniem obrotu (getModuleBox) - wcześniej szerokość/głębokość
  // brane wprost z dimensions dawały przy obrocie 90/270 fantomowe nachodzenie sąsiednich
  // szafek w rzędzie na bocznej ścianie i cudze zawiasy na boku.
  const rotOf = (m) => ((parseFloat(m.rotation) || 0) % 360 + 360) % 360;
  const target = getModuleBox(targetMod);
  const targetAbsY = target.y0;
  const targetH = parseFloat(targetMod.dimensions.height);

  config.modules.forEach(sourceMod => {
      const source = getModuleBox(sourceMod);
      const sourceAbsY = source.y0;

      const overlapX = Math.max(0, Math.min(target.x1, source.x1) - Math.max(target.x0, source.x0));
      // Samo nachodzenie w X nie wystarcza - dwie szafki stojące przy różnych
      // ścianach (różne Z) mogą przypadkiem mieć nakładający się zakres X, co
      // dawało fantomowe "globalne" zawiasy (dublujące się nawierty prawie w tym
      // samym miejscu na boku) dla drzwi z zupełnie innej, niepowiązanej szafki
      // (zgłoszony bug). Drzwi "spinające" dwie szafki muszą stać w tym samym
      // miejscu pokoju i patrzeć w tę samą stronę, więc wymagamy nachodzenia też w Z
      // i tego samego obrotu.
      const overlapZ = Math.max(0, Math.min(target.z1, source.z1) - Math.max(target.z0, source.z0));

      if (overlapX > 10 && overlapZ > 10 && rotOf(sourceMod) === rotOf(targetMod)) {
          if (sourceMod.elements) {
              // Drzwi szafki ślepej wiszące od strony narożnika (listwa / zaślepka) mają
              // prowadniki na listwie albo zaślepce, nie na boku - flaga parallelMount.
              const blindG = blindGeometry(sourceMod, config);
              const fronts = sourceMod.elements.filter(el => el.typ === 'front' && el.subtype.includes('drzwi') && !(blindG && !(el.w >= 1)) && !isFlap(el));
              const obstacles = stackedHingeObstacles(sourceMod, config.modules, th);
              fronts.forEach(front => {
                  const side = front.subtype === 'drzwi-lp' ? (front.id.includes('-L-') ? 'left' : 'right') : (front.openingSide || 'left');
                  const hinges = calculateHinges(front, th, obstacles, side);

                  const translatedHinges = hinges.map(h => {
                      const hingeAbsY = sourceAbsY + h.y; 
                      const localY = hingeAbsY - targetAbsY; 
                      const isLocal = localY >= -5 && localY <= targetH + 5;
                      return { ...h, y: localY, isLocal: isLocal };
                  });

                  if (translatedHinges.some(h => h.isLocal) || sourceMod.id === targetMod.id) {
                      let partName = `Drzwi ${side === 'left' ? 'Lewe' : 'Prawe'}`;
                      const parallelMount = blindG && blindG.mount !== 'bok' && side === blindG.side ? blindG.mount : null;
                      mountingData.push({ type: 'door', name: partName, side: side, frontId: front.id, hinges: translatedHinges, ...(parallelMount ? { parallelMount } : {}) });
                  }
              });
          }
      }
  });
  return mountingData;
}

// Wszystkie formatki projektu BEZ agregacji - każda z nazwą szafki (moduleName).
// Potrzebne do etykiet i rozkroju, gdzie liczy się, do której szafki należy
// dana sztuka; calculateAllProjectParts() niżej scala je w listę zbiorczą.
export function collectProjectParts() {
  recalculateAllLayouts();

  const config = state.project;
  let allParts = [];
  // mebel każdej formatki (furnitureKey) - do wyboru mebli i opisu w rozkroju (core/furnitureGroups.js)
  const furn = furnitureGroups(config);

  config.modules.forEach(mod => {
    const modParts = [];
    if (mod.type === 'corner_cabinet') {
        modParts.push(...getCornerCorpusParts(mod, config));
    } else if (mod.type === 'slope_cabinet') {
        modParts.push(...getSlopeCabinetParts(mod, config));
        modParts.push(...getSlopeFrontParts(mod, config));
    } else {
        modParts.push(...getCorpusParts(mod, config));
        modParts.push(...getBackPanelParts(mod, config));
    }
    if (mod.type !== 'slope_cabinet') {
      modParts.push(...getInteriorParts(mod, config));
      modParts.push(...getFrontsAndDrawers(mod, config).parts);
    }

    // Dekor korpusu tej szafki: formatki z płyty korpusu -> „Korpus: <dekor>” (fronty, szuflady, HDF bez zmian).
    const korpusCat = korpusCategory(moduleKorpusDecor(mod));
    // Plecy HDF w kolorze wybranym przy szafce (mod.backPanel.decor) -> „Plecy: <dekor>”.
    const plecyCat = plecyCategory(moduleBackDecor(mod));
    // Skrzynki szuflad drewnianych (MOVENTO) z płyty korpusu tej szafki (front.drawerBoxFromKorpus) - „Korpus: <dekor>”.
    const boxFromKorpus = !!({ ...(config.front || {}), ...(mod.front || {}) }).drawerBoxFromKorpus;
    allParts.push(...modParts.map(p => ({ ...p, ...(boxFromKorpus && p.woodenBox ? { materialId: undefined } : {}), category: p.category === KORPUS || (boxFromKorpus && p.woodenBox) ? korpusCat : p.category === PLECY ? plecyCat : p.category, moduleName: mod.name, furnitureKey: furn.moduleKey.get(mod.id) })));
  });

  // Boki dokładane (core/state.js: addSidePanel) NIE należą do żadnego
  // modułu - mają obejmować kilka szafek naraz (np. cały słup dolna+górna),
  // więc trafiają do wspólnej listy formatek projektu, ale nie do
  // calculateParts() (lista formatek AKTYWNEGO modułu).
  (config.sidePanels || []).forEach(panel => {
    allParts.push(...getSidePanelParts(panel, config).map(p => ({ ...p, moduleName: panel.name || (panel.kind === 'blenda' ? 'Blenda' : panel.kind === 'poziomy' ? 'Panel poziomy' : panel.kind === 'zmywarka' ? 'Zmywarka' : 'Bok dokładany'), furnitureKey: furn.panelKey.get(panel.id) })));
  });

  // Biegi cokołu z domkniętymi narożnikami - engine/plinthRuns.js (wspólne z 3D).
  const plinthRuns = buildPlinthRuns(config);

  // Bieg dłuższy niż arkusz (pełna ściana kuchni) dzielimy na części łączone na
  // stykach szafek - inaczej formatka nie zmieściłaby się w rozkroju.
  const plinthMax = maxPlinthLength(config.cutPlan);
  plinthRuns.forEach((run, index) => {
    const pieces = splitPlinthRun(run.runLen, run.joints, plinthMax);
    pieces.forEach((len, i) => {
      allParts.push({
        name: pieces.length > 1
          ? `Cokół dolny (Odcinek ${index + 1}, część ${i + 1}/${pieces.length})`
          : `Cokół dolny (Odcinek ${index + 1})`,
        length: parseFloat(len.toFixed(1)),
        width: parseFloat(run.h.toFixed(1)),
        qty: 1,
        category: run.mat.category,
        ...(run.mat.materialId ? { materialId: run.mat.materialId } : {}),
        moduleName: "Elementy zbiorcze",
        furnitureKey: sharedFurnitureKey(run.mods.map(m => furn.moduleKey.get(m.id) || furn.panelKey.get(m.id)))
      });
    });
  });

  // Blaty (core/worktops.js) - kategoria "Blat": w liście formatek i kosztorysie,
  // ale poza rozkrojem płyt i okleiną (cięte osobno z płyt 4100/2050).
  allParts.push(...getWorktopParts(config).map(p => ({ ...p, furnitureKey: COLLECTIVE_KEY })));

  return allParts;
}

export function calculateAllProjectParts() {
  const allParts = collectProjectParts();
  const aggregated = {};
  allParts.forEach(part => {
     // materialId w kluczu - patrz calculateParts() wyżej (ten sam powód).
     const key = `${part.category}_${part.name}_${part.length}_${part.width}_${part.materialId || ''}`;
     if (aggregated[key]) {
         aggregated[key].qty += part.qty;
         if (!aggregated[key].modules.includes(part.moduleName)) {
             aggregated[key].modules.push(part.moduleName);
         }
     } else {
         aggregated[key] = {
             category: part.category || "Inne",
             name: part.name,
             length: part.length,
             width: part.width,
             qty: part.qty,
             materialId: part.materialId,
             defaultEdges: part.defaultEdges,
             modules: [part.moduleName]
         };
     }
  });

  return Object.values(aggregated);
}

function getInteriorParts(mod, config) {
  const parts = [];
  if (!mod.elements || mod.elements.length === 0) return parts;

  const { depth, width } = mod.dimensions;
  const board = moduleBoardThickness(mod, config);

  const f = { ...(config.front || {}), ...(mod.front || {}) };
  const frontType = f.type || 'nakladane';
  const isInset = frontType === 'wpuszczane';

  const depthFor = (d) => corpusInnerDepth(mod, config, parseFloat(d) || 0) - (isInset ? board : 0);
  const innerPartDepth = depthFor(depth);
  // Szafka narożna ma DWIE niezależne głębokości ramion (core/layout.js:
  // getCornerDepths) - półka/przegroda w ramieniu B musi liczyć się z
  // depthB, nie ze wspólnym `depth` (=depthA) jak reszta modułów, inaczej
  // przy depthA≠depthB formatka wychodziłaby błędnej głębokości.
  const cornerDepths = mod.type === 'corner_cabinet' ? getCornerDepths(mod) : null;
  const innerPartDepthForEl = (el) => {
    if (!cornerDepths) return innerPartDepth;
    return depthFor(el.cornerArm === 'B' ? cornerDepths.depthB : cornerDepths.depthA);
  };

  mod.elements.forEach(el => {
    if (el.typ === 'pion') {
      parts.push({ name: `Przegroda pionowa`, length: parseFloat((el.h || 0).toFixed(1)), width: innerPartDepthForEl(el), qty: 1, category: "Korpus" });
    } else if (el.typ === 'poziom' && !el.isStructural) {
      // NAPRAWA: sama nazwa "P<szerokość_modułu>" myliła, gdy przegroda pionowa
      // dzieli moduł na wnęki węższe niż cały korpus - półka miała np. 458mm,
      // a nazwa sugerowała pełne 960mm (zgłoszony bug). Realna długość (el.w)
      // i tak trafiała poprawnie do kolumny "Wymiar", więc dopisujemy ją też
      // w nazwie w nawiasie - zawsze, niezależnie czy półka jest na całą
      // szerokość czy nie, żeby format był przewidywalny na liście formatek.
      const realW = fmtMm(el.w || 0);
      parts.push({ name: `P${width} (${realW})`, length: parseFloat((el.w || 0).toFixed(1)), width: innerPartDepthForEl(el) - 5, qty: 1, category: "Korpus" });
    }
    // Listwa usztywniająca pod długą półką (stałą i ruchomą) - core/shelfStiffener.js.
    const stiff = shelfStiffener(mod, el, config);
    if (stiff) parts.push({ name: `Listwa usztywniająca półki`, length: stiff.length, width: stiff.height, qty: 1, category: "Korpus" });
  });

  return parts;
}

function getFrontsAndDrawers(mod, config) {
  const parts = [];
  const mountingData = [];
  // Szafka ślepa: front przycięty do zera (leży w całości w części ślepej) nie istnieje -
  // bez formatki i bez okuć (kontrola projektu zgłasza go osobno).
  const isBlind = !!getBlindCorner(mod);
  const fronts = mod.elements ? mod.elements.filter(el => el.typ === 'front' && !(isBlind && !(el.w >= 1))) : [];

  // Szafka ślepa (core/blindCorner.js): zaślepka części ślepej - formatka z płyty frontowej.
  const blindPanel = getBlindPanel(mod, config);
  if (blindPanel) {
    const materialId = blindPanel.materialId ?? (fronts[0] && fronts[0].materialId);
    parts.push({ name: 'Zaślepka szafki ślepej', length: blindPanel.h, width: blindPanel.w, qty: 1, category: 'Front', materialId });
  }
  // Listwa między wieńcami (mocowanie drzwi na zawiasie równoległym + zaślepki).
  const stile = getBlindStile(mod, config);
  if (stile) parts.push({ name: 'Listwa szafki ślepej', length: stile.h, width: stile.w, qty: 1, category: 'Korpus' });

  if (fronts.length === 0) return { parts, mountingData };
  fronts.sort((a, b) => a.y - b.y);

  const board = moduleBoardThickness(mod, config);
  const fc = frontClearance(mod, config);

  fronts.forEach((front, index) => {
    let partName = "Front";
    if (front.subtype === 'szuflada') { partName = `Front szuflady`; } 
    else if (front.subtype === 'szuflada-wewnetrzna') { partName = `Front szuflady wewn.`; } 
    else if (front.subtype === 'drzwi' || front.subtype === 'drzwi-lp') {
      // Bez strony zawiasów w nazwie: lewe i prawe drzwi tego samego wymiaru to jedna
      // formatka do zamówienia (sumują się na liście); stronę zawiasów i otwory podają
      // rysunki wierceń (mountingData) i lista okuć.
      partName = 'Drzwi';
    }

    // Czoło szuflady wewnętrznej MERIVOBOX to gotowy element systemu z listy okuć, nie formatka;
    // w pozostałych systemach (metalowych i drewnianych) czoło jest z płyty.
    if (!(front.subtype === 'szuflada-wewnetrzna' && innerFrontIsSystem(mod, config))) {
      // front szuflady wewn. siedzi w korpusie - z płyty korpusu, gdy skrzynki są z korpusu (drawerBoxFromKorpus)
      const ofBox = front.subtype === 'szuflada-wewnetrzna' ? { woodenBox: true } : {};
      parts.push({ name: partName, length: parseFloat((front.h || 0).toFixed(1)), width: parseFloat((front.w || 0).toFixed(1)), qty: 1, category: "Front", materialId: front.materialId, ...ofBox });
    }

    if (front.subtype.includes('szuflada')) {
      // Wnęka, głębokość, NL i skrzynka - wspólne z listą okuć i 3D (core/drawerSpec.js).
      const spec = drawerSpec(mod, front, config);
      const { system: sysName, isInset, innerThick, innerSetback, simulatedSpace, nl: drawerNL } = spec;

      // NAPRAWA: korekta "dolnego frontu" w calculateDrawerHoles (core/drawerMath.js)
      // zakłada, że front na dole stosu ZJEŻDŻA na wieniec dolny (styl nakładany) -
      // dla frontu wpuszczanego front.y jest już liczone od wnętrza (bez zjazdu na
      // wieniec, patrz core/layout.js), więc bez tego warunku otwory prowadnicy/frontu
      // wychodziłyby o całą grubość płyty za wysoko dla wpuszczanego dolnego frontu.
      // Sprawdzamy geometrię (baseZone.minY ~ th), nie tag "boundBottom" - starsze
      // projekty (import AI w sidebar.js) budują baseZone bez tego taga wcale, więc
      // poleganie tylko na nim wyłączyłoby korektę też dla zwykłych, nakładanych
      // frontów w tych projektach.
      // Czoło szuflady wewnętrznej też stoi w świetle korpusu - warunek w isBottomOverlayFront.
      const isBottomOverlay = isBottomOverlayFront(front, board, isInset);
      const zoneBottom = front.baseZone ? (parseFloat(front.baseZone.minY) || 0) + (parseFloat(front.baseZone.offsetBottom) || 0) : null;
      // Szuflada wewnętrzna drewniana: prowadnica od dołu szczeliny czoła (drawerBaseY).
      const holeY = spec.comps?.woodenBox && front.subtype === 'szuflada-wewnetrzna' ? drawerBaseY(front, board, isInset) : front.y;
      const drawerHoles = calculateDrawerHoles(sysName, holeY, simulatedSpace, board, front.frontIndex, isBottomOverlay, drawerNL, zoneBottom, fc);
      if (drawerHoles) { 
        const adjustedHoles = JSON.parse(JSON.stringify(drawerHoles));
        
        if (front.subtype === 'szuflada-wewnetrzna') {
            const totalSetback = innerThick + innerSetback; 
            if (adjustedHoles.slideSideHoles) {
                adjustedHoles.slideSideHoles.forEach(h => {
                    h.x += totalSetback; 
                });
            }
        }

        if (adjustedHoles.frontHoles) {
            adjustedHoles.frontHoles.forEach(h => {
                // Zakład frontu na krawędź wnęki (kolumna za przegrodą: krawędź przegrody, nie boku).
                const actualOverlapLeft = spec.openingX0 - (front.x || 0);
                const actualOverlapRight = ((front.x || 0) + (front.w || 0)) - spec.openingX1;
                const innerDist = 20.5;
                
                h.xOffsetLeft = actualOverlapLeft + innerDist;
                h.xOffsetRight = actualOverlapRight + innerDist;
            });
        }

        adjustedHoles.frontId = front.id; 
        adjustedHoles.type = 'drawer'; 
        mountingData.push(adjustedHoles); 
      }

      // Skrzynka z wnęki w świetle (szerokość z baseZone), patrz core/drawerSpec.js.
      if (spec.comps) parts.push(...drawerComponentsToParts(spec.comps));
    } 
  });

  return { parts, mountingData };
}

// Blenda (core/state.js: addBlenda): czoło (dekor frontów) + kołnierz mocujący (płyta
// korpusu), jak dawne blendy szafki. Kołnierz biegnie wzdłuż krawędzi czoła wskazanej w
// panel.flange: lewa/prawa - równolegle do wysokości, gora/dol - do szerokości.
function getBlendaParts(panel, config) {
  const th = parseFloat(config.materials?.boardThickness) || 18;
  const w = parseFloat(panel.dimensions?.width) || 0;
  const h = parseFloat(panel.dimensions?.height) || 0;
  const d = parseFloat(panel.dimensions?.depth) || 0;
  const label = panel.decor ? `Blenda (${panel.decor})` : 'Blenda';
  const base = panel.name ? `${label} — ${panel.name}` : label;
  const parts = [{ name: `${base} (Czoło)`, length: h, width: w, qty: 1, category: "Front", materialId: panel.materialId }];
  const flange = panel.flange || 'prawa';
  if (flange !== 'brak' && d - th > 0) {
    const along = (flange === 'lewa' || flange === 'prawa') ? h : w;
    // listwa z płyty korpusu szafki, do której jest przykręcona (panel.flangeDecor), inaczej zwykły Korpus
    parts.push({ name: "Listwa mocująca", length: along, width: d - th, qty: 1, category: korpusCategory(panel.flangeDecor) });
  }
  return parts;
}

// Bok dokładany (core/state.js: addSidePanel) to samodzielny, płaski
// obiekt projektu (nie właściwość jednego modułu jak blenda) - fizycznie
// to tylko jedna płyta (front, dekor), więc jedna formatka: wysokość x
// głębokość (grubość to grubość samej płyty, nie osobny wymiar cięcia).
// Kategoria "Front", bo to zwykle ten sam, droższy dekor co fronty (lakier/
// fornir/okleina) - w Kosztorysie (calculateProjectCost) liczy się razem
// z frontami, dając realną sumę m² tego dekoru do wyceny.
// Czoło szuflady wewnętrznej systemowe - tylko tam, gdzie program kupuje je na liście okuć
// (innerFrontSpec w core/drawerAssembly.js: MERIVOBOX, profil ZV4.1042M + mocowania). Każdy inny
// system (GTV Axis Pro, antaro, TANDEMBOX, LEGRABOX, skrzynki drewniane) dostaje czoło z płyty -
// inaczej czoła nie było ani w formatkach, ani w okuciach.
function innerFrontIsSystem(mod, config) {
  const sys = String({ ...(config.front || {}), ...(mod.front || {}) }.drawerSystem || "merivobox").toLowerCase();
  return !!innerFrontSpec(sys, "M", 500);
}

function getSidePanelParts(panel, config) {
  if (panel.kind === 'blenda') return getBlendaParts(panel, config);
  if (panel.kind === 'zmywarka') return getDishwasherParts(panel, config);
  // Płyta grubsza niż jedna płyta (36 mm = 2 × 18 mm) to płyty sklejone: tyle formatek, ile warstw.
  const layers = sidePanelLayers(panel, config);
  const glued = layers > 1 ? ` [sklejane ×${layers}]` : '';
  return getSinglePanelParts(panel).map(p => ({ ...p, name: p.name + glued, qty: p.qty * layers }));
}

function getSinglePanelParts(panel) {
  if (panel.kind === 'poziomy') {
    // Panel poziomy (core/state.js: addHorizontalPanel): płyta korpusu długość × głębokość,
    // okleina domyślnie tylko na jednej dłuższej krawędzi (przód).
    // Z materiałem z cennika frontów (panel.materialId, np. lakier jak fronty nad nim) i bez
    // dekoru - formatka frontu w tym materiale, jak bok dokładany (lakierowana, bez okleiny).
    const label = panel.decor ? `Panel poziomy (${panel.decor})` : 'Panel poziomy';
    const asFront = !String(panel.decor || '').trim() && !!panel.materialId;
    return [{
      name: panel.name ? `${label} — ${panel.name}` : label,
      length: parseFloat(panel.dimensions?.width) || 0,
      width: parseFloat(panel.dimensions?.depth) || 0,
      qty: 1,
      ...(asFront
        ? { category: "Front", materialId: panel.materialId }
        : { category: korpusCategory(panel.decor), defaultEdges: [true, false, false, false] }), // wypełniony dekor = „Korpus: <dekor>”
    }];
  }
  // Bok dokładany z wypełnionym dekorem to płyta korpusu w tym dekorze („Korpus: <dekor>”),
  // liczona razem z szafkami w tym samym dekorze; bez dekoru - jak dotąd front z cennika frontów.
  const decor = String(panel.decor || '').trim();
  // Płyta leżąca (szersza niż wysoka - blat biurka, półka ścienna): formatka szerokość × głębokość.
  const w = parseFloat(panel.dimensions?.width) || 0, h = parseFloat(panel.dimensions?.height) || 0;
  const flat = w > h;
  const kind = flat ? 'Płyta pozioma' : 'Bok dokładany';
  const label = panel.decor ? `${kind} (${panel.decor})` : kind;
  const name = panel.name ? `${label} — ${panel.name}` : label;
  return [{
    name,
    length: flat ? w : h,
    width: parseFloat(panel.dimensions?.depth) || 0,
    qty: 1,
    ...(decor ? { category: korpusCategory(decor) } : { category: "Front", materialId: panel.materialId }),
  }];
}