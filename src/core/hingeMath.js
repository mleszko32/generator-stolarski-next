// src/core/hingeMath.js
import { state } from './state.js';

export function calculateHinges(front, boardThick, obstacles, side) {
  const h = Math.round(front.h); 
  const y = Math.round(front.y); 
  
  // Szukamy modułu, do którego należy ten konkretny front, aby pobrać LOKALNE ustawienia
  const mod = state.project.modules.find(m => m.elements && m.elements.some(e => e.id === front.id));
  
  const globalHinges = state.project.front?.hinges || { topOffset: 100, bottomOffset: 100, margin: 40 };
  const localHinges = mod?.front?.hinges || {};
  
  // Łączymy ustawienia (Lokalne nadpisują globalne)
  const hingeSettings = { ...globalHinges, ...localHinges };
  
  const topDist = Number(hingeSettings.topOffset ?? 100);
  const bottomDist = Number(hingeSettings.bottomOffset ?? 100);
  const customMargin = Number(hingeSettings.margin ?? 40);
  
  let count = 2;
  if (h > 2000) count = 5;
  else if (h > 1600) count = 4;
  else if (h > 900) count = 3;

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
    let attempts = 0;
    let shift = 0;
    
    while (collision && attempts < 15) {
      collision = false;
      let testRelY = relY + shift;
      let testAbsY = y + testRelY; 
      
      // Zabezpieczenie przed ucieczką puszki poza formatkę (sztywne minimum 30mm)
      if (testRelY < 30 || testRelY > h - 30) {
          collision = true;
      } else {
          for (const obs of obstacles) {
            if (obs.typ === 'poziom') {
              const shelfBottomEdge = Number(obs.y);
              const shelfTopEdge = Number(obs.y) + (Number(obs.h) || Number(boardThick));
              
              const plateHoleBottom = testAbsY - 16;
              const plateHoleTop = testAbsY + 16;

              const totalMargin = customMargin + ((obs.isStructural === true) ? 0 : 32);

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
        attempts++;
        shift = 32 * Math.ceil(attempts / 2) * (attempts % 2 !== 0 ? 1 : -1); 
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
      cupXOffset: 22.5     
    };
  });

  return hinges;
}