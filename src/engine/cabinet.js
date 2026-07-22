import { state } from "../core/state.js";
import { getDrawerComponents } from "../core/drawerMath.js";

export function calculateParts() {
  const { width, height, depth } = state.project.dimensions;
  const board = state.project.materials.boardThickness;
  const backThick = state.project.materials.backThickness;
  const { type, offset, grooveDepth, clearance } = state.project.backPanel;

  const innerWidth = width - (board * 2);
  const totalClearance = clearance * 2; 

  let sideDepth, topBottomDepth, backWidth, backHeight;

  if (type === 'nut') {
    sideDepth = depth;
    topBottomDepth = depth - offset - backThick;
    backWidth = innerWidth + (grooveDepth * 2) - totalClearance;
    backHeight = height - totalClearance;
  } else { 
    sideDepth = depth - backThick;
    topBottomDepth = depth - backThick;
    backWidth = width - totalClearance;
    backHeight = height - totalClearance;
  }

  const parts = [
    { name: "Bok lewy", length: height, width: sideDepth, qty: 1, material: "Płyta 18mm" },
    { name: "Bok prawy", length: height, width: sideDepth, qty: 1, material: "Płyta 18mm" },
    { name: "Wieniec dolny", length: innerWidth, width: topBottomDepth, qty: 1, material: "Płyta 18mm" },
    { name: "Wieniec górny", length: innerWidth, width: topBottomDepth, qty: 1, material: "Płyta 18mm" },
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1, material: "HDF 3mm" }
  ];

  // LOGIKA FRONTÓW I SZUFLAD
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const gap = state.project.front.gap;
    const distributionStr = String(state.project.front.distribution || "1").trim();
    
    let parsedZones = [];

    if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
      const count = parseInt(distributionStr, 10);
      for (let i = 0; i < count; i++) {
        parsedZones.push({ type: 'fr', value: 1 });
      }
    } else {
      const separator = distributionStr.includes(':') ? ':' : ',';
      const zones = distributionStr.split(separator).map(s => s.trim());
      
      parsedZones = zones.map(zone => {
        if (zone.toLowerCase().endsWith('fr')) return { type: 'fr', value: parseFloat(zone) || 1 };
        const val = parseFloat(zone);
        return val <= 10 ? { type: 'fr', value: val } : { type: 'fixed', value: val };
      });
    }

    const count = parsedZones.length;
    const frontWidth = width - (fc.sides * 2);
    let availableHeight = height - fc.top - fc.bottom - ((count - 1) * gap);
    let fixedTotal = 0;
    let frTotal = 0;

    parsedZones.forEach(zone => {
      if (zone.type === 'fixed') fixedTotal += zone.value;
      if (zone.type === 'fr') frTotal += zone.value;
    });

    availableHeight -= fixedTotal;
    const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

    // Przechodzimy po wszystkich strefach i generujemy części
    parsedZones.forEach((zone, index) => {
      const frontHeight = zone.type === 'fixed' ? zone.value : zone.value * singleFrValue;
      
      parts.push({
        name: `Front ${index + 1}`,
        length: Number(frontHeight.toFixed(1)),
        width: frontWidth,
        qty: 1,
        material: "Płyta 18mm"
      });

      // Wyliczamy elementy wewnętrzne, tym razem podając też wysokość frontu (frontHeight)
      const drawerDetails = getDrawerComponents(state.project.front.drawerSystem, innerWidth, topBottomDepth, frontHeight);

      if (drawerDetails) {
        parts.push({
          name: `Dno szuflady ${index + 1} (${drawerDetails.systemName}, NL: ${drawerDetails.nominalLength})`,
          length: Number(drawerDetails.bottom.length.toFixed(1)), 
          width: Number(drawerDetails.bottom.width.toFixed(1)),
          qty: 1,
          material: "Płyta 16mm" 
        });
        
        // Zapisujemy wyliczony konkretny wariant z uwzględnieniem prawidłowej wysokości tyłu
        parts.push({
          name: `Tył szuflady ${index + 1} (Wariant ${drawerDetails.back.variantType})`,
          length: Number(drawerDetails.back.height.toFixed(1)), 
          width: Number(drawerDetails.back.width.toFixed(1)),
          qty: 1,
          material: "Płyta 16mm"
        });
      }
    });
  }

  return parts;
}