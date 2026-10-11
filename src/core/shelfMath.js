// src/core/shelfMath.js
/**
 * Automatycznie generuje układ półek (oblicza równe światła).
 * Resztka z zaokrągleń milimetrów ląduje zawsze na samej górze.
 * 
 * @param {number} internalHeight - Wysokość wnętrza korpusu (światło szafki)
 * @param {number} boardThick - Grubość płyty (np. 18)
 * @param {number} shelfCount - Ile półek chcemy wstawić
 * @returns {Array} Tablica obiektów półek
 */
export function autoDistributeShelves(internalHeight, boardThick, shelfCount) {
  const shelves = [];
  if (shelfCount <= 0) return shelves;

  const totalClearance = internalHeight - (shelfCount * boardThick);
  const standardGap = Math.round(totalClearance / (shelfCount + 1) * 10) / 10;
  
  let currentY = standardGap; 

  for (let i = 0; i < shelfCount; i++) {
    shelves.push({
      typ: 'poziom',
      isStructural: false, 
      w: '100%', 
      h: boardThick,
      y: currentY          
    });
    
    currentY += boardThick + standardGap;
  }
  
  return shelves;
}