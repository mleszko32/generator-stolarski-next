// src/engine/hardware.js
//
// Lista okuć projektu (nóżki, złącza, komplety szuflad, zawiasy, okleina) - wydzielona
// z engine/cabinet.js. Czyta zagregowaną listę formatek z calculateAllProjectParts().
import { state } from "../core/state.js";
import { getDrawerComponents, drawerHardwareKey } from "../core/drawerMath.js";
import { calculateHinges } from "../core/hingeMath.js";
import { getSlopeDrawerHardware, getSlopeFronts } from "../core/slopeCabinet.js";
import { totalEdgeBandingMeters, EDGE_BANDING_RESERVE } from "./edgeBanding.js";
import { recalculateAllLayouts } from "../core/layout.js";
import { calculateAllProjectParts } from "./cabinet.js";
import { getCabinetPanels } from "./cabinetDrillings.js";

export function calculateProjectHardware() {
  recalculateAllLayouts();

  const config = state.project;
  const hardwareList = {};

  config.modules.forEach(mod => {
    const W = parseFloat(mod.dimensions.width) || 600;
    const D = parseFloat(mod.dimensions.depth) || 513;
    const board = config.materials.boardThickness || 18;
    const backThick = config.materials.backThickness || 3;
    const backP = mod.backPanel || { type: 'nakladane', offset: 16 };
    const topBottomDepth = backP.type === 'nut' ? D - backP.offset - backThick : D - backThick;

    const f = { ...(config.front || {}), ...(mod.front || {}) };
    const fc = { ...(config.front?.clearance || {}), ...(mod.front?.clearance || {}) };

    if (mod.legs && mod.legs.active) {
      const legH = parseFloat(mod.legs.height) || 100;
      const legOverrides = mod.legs.heightOverrides || {};
      // Każda nóżka liczona osobno wg swojej (ew. nadpisanej) wysokości — patrz
      // ui/properties.js "Nóżki — wysokości ręczne" — żeby lista zakupów odzwierciedlała
      // realny komplet (np. 3x H-100 + 1x H-90), a nie zawsze 4x ten sam model.
      // Szafka narożna ma 5 nóżek (kształt L ma 5 wypukłych rogów podłogi,
      // patrz render/cornerCabinet3d.js: renderCornerCabinet) - bez nadpisań per-nóżka.
      const legCount = mod.type === 'corner_cabinet' ? 5 : 4;
      for (let i = 0; i < legCount; i++) {
        const ov = legOverrides[i];
        const h = (ov !== undefined && ov !== null && ov !== '') ? (parseFloat(ov) || legH) : legH;
        const legKey = `Nóżka regulowana H-${h}`;
        if (!hardwareList[legKey]) hardwareList[legKey] = { name: legKey, qty: 0, unit: 'szt.' };
        hardwareList[legKey].qty += 1;
      }
    }

    const joinKey = `Złącze korpusowe (Kołek 8x30 + Konfirmat)`;
    if (!hardwareList[joinKey]) hardwareList[joinKey] = { name: joinKey, qty: 0, unit: 'kpl.' };
    // Faktyczna liczba zestawów z otworów korpusu (engine/cabinetDrillings.js - wieńce, trawersy,
    // półki stałe, mocowanie przegród; rozstaw wg engine/carcaseParts.js: jointSetPositions).
    // Każdy zestaw ma jeden wkręt, liczony raz - w formatce poziomej (czoło / lico) albo trawersie
    // pionowym. Szafka narożna i pod skos nie mają jeszcze tych danych - po staremu 8.
    const corpusPanels = getCabinetPanels(mod, config);
    const joinSets = corpusPanels.length
      ? corpusPanels.filter((pn) => pn.kind === "poziom" || pn.kind === "polka" || pn.kind === "trawers-pion")
          .reduce((n, pn) => n + pn.holes.filter((h) => h.kind === "wkret").length, 0)
      : 8;
    hardwareList[joinKey].qty += joinSets;

    // Szafka pod skos: fronty z mod.elements przycięte skosem (core/slopeCabinet.js) -
    // szuflady liczą miejsce pod skosem, trójkąty to blendy bez okuć.
    if (mod.type === 'slope_cabinet') {
      getSlopeDrawerHardware(mod, config).forEach(hwKey => {
        if (!hardwareList[hwKey]) hardwareList[hwKey] = { name: hwKey, qty: 0, unit: 'kpl.' };
        hardwareList[hwKey].qty += 1;
      });
      // Drzwi pod skosem: zawiasy jak w zwykłej szafce (blendy ich nie mają).
      getSlopeFronts(mod, config).filter(fr => fr.type === 'drzwi').forEach(fr => {
        const side = fr.subtype === 'drzwi-lp' ? (String(fr.el.id).includes('-L-') ? 'left' : 'right') : (fr.el.openingSide || 'left');
        const hingeKey = `Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)`;
        if (!hardwareList[hingeKey]) hardwareList[hingeKey] = { name: hingeKey, qty: 0, unit: 'kpl.' };
        hardwareList[hingeKey].qty += calculateHinges(fr.el, board, [], side).length;
      });
      return;
    }

    if (!mod.elements) return;

    const allFronts = mod.elements.filter(el => el.typ === 'front');
    const allObstacles = mod.elements.filter(el => el.typ === 'poziom' || el.subtype === 'szuflada-wewnetrzna');
    // Półka narożna (typ:'poziom-narozny', ui/cornerConfigModal.js) jest
    // wspólna dla OBU ramion (kształt L) - liczy się jako przeszkoda dla
    // zawiasów w każdym z nich, nie tylko w jednym.
    const cornerShelfObstacles = mod.elements.filter(el => el.typ === 'poziom-narozny');

    // Szafka narożna ma dwa NIEZALEŻNE ramiona (cornerArm 'A'/'B') - "góra
    // stosu" i przeszkody dla zawiasów muszą liczyć się OSOBNO w każdym z nich,
    // inaczej front najwyżej w jednym ramieniu mógłby przypadkiem "ukraść"
    // status najwyższego frontowi w drugim (albo dostać kolizję z półką z
    // sąsiedniego ramienia). Dla zwykłego modułu cornerArm jest zawsze
    // undefined -> jedna grupa '_', zachowanie identyczne jak wcześniej.
    const frontsByArm = {};
    allFronts.forEach(f => {
      const key = f.cornerArm || '_';
      (frontsByArm[key] = frontsByArm[key] || []).push(f);
    });

    Object.entries(frontsByArm).forEach(([armKey, fronts]) => {
      const obstacles = allObstacles.filter(o => (o.cornerArm || '_') === armKey).concat(cornerShelfObstacles);
      fronts.sort((a, b) => a.y - b.y);

      fronts.forEach((front, index) => {
        const isInternalDrawer = front.subtype === 'szuflada-wewnetrzna';

        if (front.subtype === 'szuflada' || isInternalDrawer) {
          const isBottomInZone = front.frontIndex === 0;
          const isTopInZone = index === fronts.length - 1;

          let availableSpace = front.h;
          if (isBottomInZone) availableSpace -= (board - (parseFloat(fc.bottom) || 0));
          if (isTopInZone) availableSpace -= (board - (parseFloat(fc.top) || 0));

          const innerWidth = front.baseZone ? (front.baseZone.maxX - front.baseZone.minX) : W - (board * 2);
          const userForcedVariant = front.forceVariant || 'auto';

          const sysName = f.drawerSystem || 'merivobox';
          const drawerComps = getDrawerComponents(sysName, innerWidth, topBottomDepth, availableSpace, userForcedVariant, front.drawerSideHeight);

          if (drawerComps) {
            const hwKey = drawerHardwareKey(sysName, drawerComps);
            if (!hardwareList[hwKey]) hardwareList[hwKey] = { name: hwKey, qty: 0, unit: 'kpl.' };
            hardwareList[hwKey].qty += 1;
          }
        }
        else if (front.subtype.includes('drzwi')) {
          const side = front.subtype === 'drzwi-lp' ? (front.id.includes('-L-') ? 'left' : 'right') : (front.openingSide || 'left');
          const hinges = calculateHinges(front, board, obstacles, side);
          const hingeCount = hinges.length;

          // Front łamany szafki narożnej (mod.cornerFrontMode === 'bifold', wybór
          // w ui/cornerConfigModal.js): dwa skrzydła połączone zawiasem
          // uzupełniającym CLIP top 60° (Blum 79T8500), a skrzydło przy korpusie
          // wisi na zawiasie 155°/170°. Puszka zawiasu 60° siedzi w tym samym
          // skrzydle co puszka 155°/170° (katalog Blum, drzwi składane), więc obu
          // jest tyle samo, co zawiasów tego skrzydła; drugie skrzydło nie ma
          // własnych zawiasów przy korpusie.
          if (mod.type === 'corner_cabinet' && mod.cornerFrontMode === 'bifold' && front.cornerArm) {
            const primaryArm = mod.cornerFrontOverlap?.primaryArm || 'A';
            if (front.cornerArm === primaryArm) {
              const wideKey = `Zawias 155°/170° do drzwi składanych (skrzydło przy korpusie)`;
              const foldKey = `Zawias uzupełniający 60° do drzwi składanych (Blum 79T8500)`;
              [wideKey, foldKey].forEach(k => {
                if (!hardwareList[k]) hardwareList[k] = { name: k, qty: 0, unit: 'kpl.' };
                hardwareList[k].qty += hingeCount;
              });
              return;
            }
            const hasPartner = allFronts.some(o => o.cornerArm === primaryArm && (o.subtype || '').includes('drzwi') && o.y < front.y + front.h && o.y + o.h > front.y);
            if (hasPartner) return;
          }

          const hingeKey = `Zawias meblowy + prowadnik krzyżakowy (puszka 35mm)`;
          if (!hardwareList[hingeKey]) hardwareList[hingeKey] = { name: hingeKey, qty: 0, unit: 'kpl.' };
          hardwareList[hingeKey].qty += hingeCount;
        }
      });
    });
  });

  // Okleina krawędziowa: wszystkie formatki dookoła (poza plecami HDF) - patrz
  // engine/edgeBanding.js. Ilość w metrach bieżących z zapasem (EDGE_BANDING_RESERVE).
  const edgeMeters = totalEdgeBandingMeters(calculateAllProjectParts(), state.project.edgeBanding);
  if (edgeMeters > 0) {
    const edgeKey = `Okleina krawędziowa (mb, formatki dookoła + ${Math.round(EDGE_BANDING_RESERVE * 100)}% zapasu)`;
    hardwareList[edgeKey] = { name: edgeKey, qty: Math.ceil(edgeMeters * (1 + EDGE_BANDING_RESERVE) * 10) / 10, unit: 'mb' };
  }

  return Object.values(hardwareList);
}
