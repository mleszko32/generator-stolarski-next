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
      let testRelY = relY + shift;
      let testAbsY = y + testRelY;
      
      // BLOKADA: Zawias nie może uciec poza formatkę drzwi (min 30mm od krawędzi)
      if (testRelY < 30 || testRelY > h - 30) {
          collision = true;
      } else {
          for (const obs of obstacles) {
            if (obs.typ === 'poziom') {
              const sCenter = Number(obs.y) + Number(boardThick) / 2;
              
              // ROZWIĄZANIE: Półki ruchome mają strefę +/- 32mm na podpórki!
              // Zwiększamy strefę bezpieczeństwa wokół półek ruchomych do 60mm.
              const isStructural = obs.isStructural === true;
              const safeZone = isStructural ? 35 : 60; 
              
              if (testAbsY > sCenter - safeZone && testAbsY < sCenter + safeZone) {
                collision = true;
                break;
              }
            } else {
              // Kolizja z innymi przeszkodami (np. szuflady wewnętrzne)
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
        // Przeskakujemy co 32 mm na przemian w górę i w dół (System 32)
        shift = 32 * Math.ceil(attempts / 2) * (attempts % 2 !== 0 ? 1 : -1); 
      } else {
        absY = testAbsY;
        currentRelY = testRelY; 
      }
    }

    // Ostateczne zabezpieczenie: jeśli nie udało się znaleźć miejsca po 15 próbach
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