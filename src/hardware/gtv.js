// src/hardware/gtv.js

const GTV_OFFSETS = {
  'gtv_axis_16': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 },
  'gtv_axis_18': { railOffset: 33, frontHolesBase: 22, frontHolesXBase: 15.5 }
};

export function getGtvMountingData(cabinetConfig, drawers, systemType = 'gtv_axis_18') {
  const boardThickness = Number(cabinetConfig?.materials?.boardThickness ?? 18);

  const config = {
    bottomPanelThickness: boardThickness,
    sidePanelThickness: boardThickness,
    isInsetBottom: true,
    bottomGap: Number(cabinetConfig?.front?.clearance?.bottom ?? 0),
    sideGap: Number(cabinetConfig?.front?.clearance?.sides ?? 1.5),
    gapBetweenFronts: Number(cabinetConfig?.front?.gap ?? 3),
    ...cabinetConfig
  };

  const systemParams = GTV_OFFSETS[systemType.toLowerCase()] || GTV_OFFSETS['gtv_axis_18'];
  const results = [];
  let currentFrontBottom = config.bottomGap;

  drawers.forEach((drawer, index) => {
    const frontBottom = currentFrontBottom;
    const frontTop = frontBottom + drawer.frontHeight;

    let slideY = index === 0 
        ? (config.isInsetBottom ? config.bottomPanelThickness : 0) + systemParams.railOffset
        : frontBottom + systemParams.railOffset;

    const slideHoles = [
      { x: 37, y: slideY, desc: "Otwór przedni 1" },
      { x: 69, y: slideY, desc: "Otwór przedni 2" },
      { x: 261, y: slideY, desc: "Otwór środkowy" }
    ];
    
    if (drawer.nominalLength >= 450) {
      slideHoles.push({ x: 357, y: slideY, desc: "Otwór tylny" });
    }

    let localFrontHolesBase = systemParams.frontHolesBase;
    if (index === 0) {
      localFrontHolesBase += (config.bottomPanelThickness - config.bottomGap);
    }

    const frontOverlapX = config.sidePanelThickness - config.sideGap;
    const localFrontHolesX = systemParams.frontHolesXBase + frontOverlapX;

    const frontHoles = [
      { y: localFrontHolesBase, xOffset: localFrontHolesX, diameter: 3, desc: `Front ${index+1}: Dolny otwór` },
      { y: localFrontHolesBase + 32, xOffset: localFrontHolesX, diameter: 3, desc: `Front ${index+1}: Górny otwór` }
    ];

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

    currentFrontBottom = frontTop + config.gapBetweenFronts;
  });

  return results;
}