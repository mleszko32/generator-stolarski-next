// src/hardware/blum.js

// Słownik z unikalnymi offsetami montażowymi dla systemów szuflad Blum
const BLUM_OFFSETS = {
  'merivobox': { railOffset: 54, frontHolesBase: 33.5 },
  'legrabox': { railOffset: 38, frontHolesBase: 25 }, 
  'tandembox': { railOffset: 33, frontHolesBase: 22 }
};

export function getBlumMountingData(cabinetConfig, drawers, systemType = 'merivobox') {
  const config = {
    bottomPanelThickness: 18,
    isInsetBottom: true,
    // Pobieramy dynamicznie luzy ustawione w interfejsie przez użytkownika
    bottomGap: cabinetConfig?.front?.clearance?.bottom || 0,
    gapBetweenFronts: cabinetConfig?.front?.gap !== undefined ? cabinetConfig.front.gap : 3,
    ...cabinetConfig
  };

  // Pobieramy parametry montażowe dla wybranego systemu (zabezpieczenie fallbackiem na Merivobox)
  const systemParams = BLUM_OFFSETS[systemType.toLowerCase()] || BLUM_OFFSETS['merivobox'];

  const results = [];
  let currentFrontBottom = config.bottomGap;

  drawers.forEach((drawer, index) => {
    const frontBottom = currentFrontBottom;
    const frontTop = frontBottom + drawer.frontHeight;

    // NOWA LOGIKA DLA OSI Y PROWADNIC
    let slideY;
    if (index === 0) {
      // Pierwsza prowadnica: od wewnętrznej strony dna (wieniec 18 mm + offset)
      const innerBottom = config.isInsetBottom ? config.bottomPanelThickness : 0;
      slideY = innerBottom + systemParams.railOffset;
    } else {
      // Kolejne prowadnice: pozycjonowane względem dolnej krawędzi swojego frontu
      slideY = frontBottom + systemParams.railOffset;
    }

    // Otwory montażowe na boku korpusu (System 32)
    const slideHoles = [
      { x: 37, y: slideY, desc: "Otwór przedni 1" },
      { x: 69, y: slideY, desc: "Otwór przedni 2" },
      { x: 261, y: slideY, desc: "Otwór środkowy" }
    ];
    
    if (drawer.nominalLength >= 450) {
      slideHoles.push({ x: 357, y: slideY, desc: "Otwór tylny" });
    }

    // NOWA LOGIKA DLA NAWIERTÓW FRONTU
    let localFrontHolesBase = systemParams.frontHolesBase;

    // Korekta tylko dla pierwszej szuflady (nadmiar zakrywający wieniec dolny)
    if (index === 0) {
      const bottomOverlap = config.bottomPanelThickness - config.bottomGap; 
      localFrontHolesBase += bottomOverlap;
    }

    // Otwory montażowe na froncie (lokalne, liczone od dolnej krawędzi formatki)
    const frontHoles = [
      { y: localFrontHolesBase, xOffset: 12, diameter: 10, desc: `Front ${index+1}: Dolny otwór` },
      { y: localFrontHolesBase + 32, xOffset: 12, diameter: 10, desc: `Front ${index+1}: Górny otwór` }
    ];

    results.push({
      level: index + 1,
      variant: drawer.variant,
      nominalLength: drawer.nominalLength,
      slideSideHoles: slideHoles,
      frontHoles: frontHoles,
      frontBounds: { bottom: frontBottom, top: frontTop, height: drawer.frontHeight }
    });

    // Kolejny front podnosi się o wysokość obecnego + szczelina
    currentFrontBottom = frontTop + config.gapBetweenFronts;
  });

  return results;
}