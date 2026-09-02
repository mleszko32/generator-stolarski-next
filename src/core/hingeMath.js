// src/core/hingeMath.js
import { state } from './state.js';

export function calculateHinges(front, boardThick, obstacles, side) {
  const h = Math.round(front.h); 
  const y = Math.round(front.y); 
  
  const mod = state.project.modules.find(m => m.elements && m.elements.some(e => e.id === front.id));
  
  const globalHinges = state.project.front?.hinges || { topOffset: 100, bottomOffset: 100, margin: 40, forceCount: 0 };
  const localHinges = mod?.front?.hinges || {};
  
  const hingeSettings = { ...globalHinges, ...localHinges };
  
  const topDist = Number(hingeSettings.topOffset ?? 100);
  const bottomDist = Number(hingeSettings.bottomOffset ?? 100);
  const customMargin = Number(hingeSettings.margin ?? 40);
  
  let count = 2;
  
  if (front.forceHingeCount && front.forceHingeCount > 0) {
      count = parseInt(front.forceHingeCount);
  } else if (hingeSettings.forceCount && hingeSettings.forceCount > 0) {
      count = parseInt(hingeSettings.forceCount);
  } else {
      if (h > 2000) count = 5;
      else if (h > 1600) count = 4;
      else if (h > 900) count = 3;
  }
  
  if (count < 2) count = 2;

  let cupRelPositions = [];
  
  if (count === 2) {
    cupRelPositions = [bottomDist, h - topDist];
  } else {
    const step = Math.round((h - topDist - bottomDist) / (count - 1));
    for (let i = 0; i < count; i++) {
      if (i === 0) {
         cupRelPositions.push(bottomDist);
      } else if (i === count - 1) {
         cupRelPositions.push(h - topDist); 
      } else {
         cupRelPositions.push(bottomDist + i * step);
      }
    }
  }

  const hinges = cupRelPositions.map(relY => {
    let currentRelY = relY;          
    let absY = y + currentRelY;      
    
    let collision = true;
    let attempt = 0;
    let shift = 0;
    
    // Zwiększony limit prób, ponieważ teraz skaczemy tylko o 1 mm
    while (collision && attempt < 400) {
      collision = false;
      let testRelY = relY + shift;
      let testAbsY = y + testRelY; 
      
      if (testRelY < 30 || testRelY > h - 30) {
          collision = true;
      } else {
          for (const obs of obstacles) {
            if (obs.typ === 'poziom') {
              const shelfBottomEdge = Number(obs.y);
              const shelfTopEdge = Number(obs.y) + (Number(obs.h) || Number(boardThick));
              
              const plateHoleBottom = testAbsY - 16;
              const plateHoleTop = testAbsY + 16;

              // Usunięto ukryte +32mm dla półek ruchomych - margines to czysta wartość z panelu UI
              const totalMargin = customMargin;

              if ((plateHoleTop + totalMargin > shelfBottomEdge) && (plateHoleBottom - totalMargin < shelfTopEdge)) {
                collision = true;
                break;
              }
            } else {
              let obsMin = Number(obs.y);
              let obsMax = Number(obs.y) + Number(obs.h);
              if (testAbsY + 35 > obsMin && testAbsY - 35 < obsMax) {
                collision = true;
                break;
              }
            }
          }
      }
      
      if (collision) {
        attempt++;
        // Płynne przesuwanie co 1 mm (góra-dół na przemian), aż znajdzie idealne miejsce
        shift = Math.ceil(attempt / 2) * (attempt % 2 !== 0 ? 1 : -1); 
      } else {
        absY = testAbsY;
        currentRelY = testRelY; 
      }
    }

    if (collision) {
       currentRelY = relY;
       absY = y + relY;
    }

    return {
      y: Math.round(absY),             
      relY: Math.round(currentRelY),   
      side: side,
      cupXOffset: 22.5,
      isAdjusted: Math.round(currentRelY) !== Math.round(relY)
    };
  });

  return hinges;
}