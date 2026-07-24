// src/hardware/blum.js

// Słownik z unikalnymi offsetami montażowymi dla systemów szuflad Blum
const BLUM_OFFSETS = {
  'merivobox': { railOffset: 54, frontHolesBase: 33.5, frontHolesXBase: 20.5 },
  'legrabox': { railOffset: 38, frontHolesBase: 25, frontHolesXBase: 21.5 }, 
  'tandembox': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
};

export function getBlumMountingData(cabinetConfig, drawers, systemType = 'merivobox') {
  // Wyłączamy logi, skoro już wiemy jak wygląda struktura
  // console.log("Surowe dane wpadające do blum.js:", JSON.stringify(cabinetConfig, null, 2));

  // 1. Grubość płyty wczytujemy z obiektu 'materials'
  const boardThickness = Number(cabinetConfig?.materials?.boardThickness ?? 18);

  const config = {
    bottomPanelThickness: boardThickness,
    sidePanelThickness: boardThickness,
    isInsetBottom: true,
    
    // 2. Luzy wczytujemy z obiektu 'front' używając poprawnych ścieżek
    bottomGap: Number(cabinetConfig?.front?.clearance?.bottom ?? 0),
    sideGap: Number(cabinetConfig?.front?.clearance?.sides ?? 1.5), // Używamy 'sides' zamiast 'side'
    gapBetweenFronts: Number(cabinetConfig?.front?.gap ?? 3),
    
    ...cabinetConfig
  };

  // Pobieramy parametry montażowe dla wybranego systemu
  const systemParams = BLUM_OFFSETS[systemType.toLowerCase()] || BLUM_OFFSETS['merivobox'];

  const results = [];
  let currentFrontBottom = config.bottomGap;

  drawers.forEach((drawer, index) => {
    const frontBottom = currentFrontBottom;
    const frontTop = frontBottom + drawer.frontHeight;

    // --- OŚ Y PROWADNIC NA BOKU KORPUSU ---
    let slideY;
    if (index === 0) {
      // Pierwsza prowadnica: od wewnętrznej strony dna (wieniec + offset)
      const innerBottom = config.isInsetBottom ? config.bottomPanelThickness : 0;
      slideY = innerBottom + systemParams.railOffset;
    } else {
      // Kolejne prowadnice: pozycjonowane względem dolnej krawędzi swojego frontu
      slideY = frontBottom + systemParams.railOffset;
    }

    const slideHoles = [
      { x: 37, y: slideY, desc: "Otwór przedni 1" },
      { x: 69, y: slideY, desc: "Otwór przedni 2" },
      { x: 261, y: slideY, desc: "Otwór środkowy" }
    ];
    
    if (drawer.nominalLength >= 450) {
      slideHoles.push({ x: 357, y: slideY, desc: "Otwór tylny" });
    }

    // --- OŚ Y NAWIERTÓW FRONTU ---
    let localFrontHolesBase = systemParams.frontHolesBase;
    
    // Korekta dla pierwszej szuflady (nadmiar zakrywający wieniec dolny)
    if (index === 0) {
      const bottomOverlap = config.bottomPanelThickness - config.bottomGap; 
      localFrontHolesBase += bottomOverlap;
    }

    // --- OŚ X NAWIERTÓW FRONTU ---
    // Obliczamy nałożenie frontu na bok (grubość boku - luz boczny)
    const frontOverlapX = config.sidePanelThickness - config.sideGap;
    // Oś X to baza systemu + nałożenie frontu
    const localFrontHolesX = systemParams.frontHolesXBase + frontOverlapX;

    // Otwory montażowe na froncie (lokalne, liczone od dolnej krawędzi formatki oraz od boków)
    // Otwory montażowe na froncie (średnica 3 mm)
    const frontHoles = [
      { y: localFrontHolesBase, xOffset: localFrontHolesX, diameter: 3, desc: `Front ${index+1}: Dolny otwór` },
      { y: localFrontHolesBase + 32, xOffset: localFrontHolesX, diameter: 3, desc: `Front ${index+1}: Górny otwór` }
    ];

    // Dodatkowy otwór na reling dla wysokiej szuflady (front od 280 mm w górę)
    if (drawer.frontHeight >= 280) {
      frontHoles.push({
        y: localFrontHolesBase + 160, 
        xOffset: localFrontHolesX, 
        diameter: 3, 
        desc: `Front ${index+1}: Otwór na reling`
      });
    }

    results.push({
      level: index + 1,
      variant: drawer.variant,
      nominalLength: drawer.nominalLength,
      slideSideHoles: slideHoles,
      frontHoles: frontHoles,
      frontBounds: { bottom: frontBottom, top: frontTop, height: drawer.frontHeight }
    });

    // Kolejny front podnosi się o wysokość obecnego + szczelina pozioma
    currentFrontBottom = frontTop + config.gapBetweenFronts;
  });

  return results;
}