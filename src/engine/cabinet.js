import { state } from "../core/state.js";

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
    { name: "Bok lewy", length: height, width: sideDepth, qty: 1 },
    { name: "Bok prawy", length: height, width: sideDepth, qty: 1 },
    { name: "Wieniec dolny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Wieniec górny", length: innerWidth, width: topBottomDepth, qty: 1 },
    { name: "Plecy (HDF)", length: backHeight, width: backWidth, qty: 1 }
  ];

  // LOGIKA FRONTÓW (Strefy - Algorytm BLUM)
  if (state.project.front.active) {
    const fc = state.project.front.clearance;
    const gap = state.project.front.gap;
    
    // Domyślna wartość to "1" (jeden front na całość)
    const distributionStr = String(state.project.front.distribution || "1").trim();
    
    let parsedZones = [];

    // SCENARIUSZ 1: Pojedyncza liczba (np. "3") -> równe fronty
    if (!distributionStr.includes(':') && !distributionStr.includes(',') && !isNaN(distributionStr)) {
      const count = parseInt(distributionStr, 10);
      for (let i = 0; i < count; i++) {
        parsedZones.push({ type: 'fr', value: 1 });
      }
    } else {
      // SCENARIUSZ 2: Ciąg z separatorami (Blum używa dwukropka)
      const separator = distributionStr.includes(':') ? ':' : ',';
      const zones = distributionStr.split(separator).map(s => s.trim());
      
      parsedZones = zones.map(zone => {
        // Zabezpieczenie, gdyby ktoś wciąż używał "fr"
        if (zone.toLowerCase().endsWith('fr')) {
          return { type: 'fr', value: parseFloat(zone) || 1 };
        }
        
        const val = parseFloat(zone);
        // HEURYSTYKA: liczby <= 10 to "części/udziały" (zmienne), powyżej 10 to milimetry (stałe)
        if (val <= 10) {
          return { type: 'fr', value: val };
        } else {
          return { type: 'fixed', value: val };
        }
      });
    }

    const count = parsedZones.length;
    const frontWidth = width - (fc.sides * 2);
    
    // Odliczamy luzy skrajne i wszystkie szczeliny między frontami
    let availableHeight = height - fc.top - fc.bottom - ((count - 1) * gap);

    let fixedTotal = 0;
    let frTotal = 0;

    // Podliczamy, ile miejsca zajmują fronty stałe, a ile części zmiennych mamy do obdzielenia
    parsedZones.forEach(zone => {
      if (zone.type === 'fixed') fixedTotal += zone.value;
      if (zone.type === 'fr') frTotal += zone.value;
    });

    // Z dostępnego światła wycinamy stałe wymiary
    availableHeight -= fixedTotal;
    
    // Obliczamy ile milimetrów przypada na jedną jednostkę zmienną ("1")
    const singleFrValue = frTotal > 0 ? availableHeight / frTotal : 0;

    // Generowanie formatek (Kolejność: Front 1 to sam dół, kolejne idą w górę)
    parsedZones.forEach((zone, index) => {
      const frontHeight = zone.type === 'fixed' ? zone.value : zone.value * singleFrValue;
      
      parts.push({
        name: `Front ${index + 1} (${zone.type === 'fixed' ? 'stały' : 'zmienny'})`,
        length: Number(frontHeight.toFixed(1)), // Dokładność do 0.1 mm
        width: frontWidth,
        qty: 1
      });
    });
  }

  return parts;
}