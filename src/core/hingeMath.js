// src/core/hingeMath.js

export function calculateHinges(front, boardThick, obstacles, side) {
  // Wymuszamy pełne milimetry już na starcie
  const h = Math.round(front.h); 
  const y = Math.round(front.y); 
  
  let count = 2;
  if (h > 2000) count = 5;
  else if (h > 1600) count = 4;
  else if (h > 900) count = 3;

  let cupRelPositions = [];
  const edgeDist = 100;
  
  if (count === 2) {
    cupRelPositions = [edgeDist, h - edgeDist];
  } else {
    // Krok między zawiasami zaokrąglony do pełnych mm
    const step = Math.round((h - 2 * edgeDist) / (count - 1));
    for (let i = 0; i < count; i++) {
      if (i === 0) {
         cupRelPositions.push(edgeDist);
      } else if (i === count - 1) {
         // Ostatni zawias trzyma twarde 100 mm od góry
         cupRelPositions.push(h - edgeDist); 
      } else {
         cupRelPositions.push(edgeDist + i * step);
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
      let testAbsY = y + currentRelY + shift;
      
      for (const obs of obstacles) {
        if (obs.typ === 'poziom') {
          const sCenter = obs.y + boardThick / 2;
          if (testAbsY > sCenter - 65 && testAbsY < sCenter + 65) {
            collision = true;
            break;
          }
        } else {
          let obsMin = obs.y;
          let obsMax = obs.y + obs.h;
          if (testAbsY + 35 > obsMin && testAbsY - 35 < obsMax) {
            collision = true;
            break;
          }
        }
      }
      
      if (collision) {
        attempts++;
        shift = 32 * Math.ceil(attempts / 2) * (attempts % 2 !== 0 ? 1 : -1); 
      } else {
        absY = testAbsY;
        currentRelY = currentRelY + shift; 
      }
    }

    return {
      // Zwracamy czyste, zaokrąglone wartości do rysowania
      y: Math.round(absY),             
      relY: Math.round(currentRelY),   
      side: side,
      cupXOffset: 22.5     
    };
  });

  return hinges;
}