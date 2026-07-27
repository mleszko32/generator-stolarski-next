// src/core/shelfMath.js
import { state } from "./state.js";

export function calculateShelfHoles() {
  const holes = [];
  const mod = state.project.modules[0];
  if (!mod || !mod.elements) return holes;

  const th = parseFloat(state.project.materials.boardThickness) || 18;
  const depth = parseFloat(mod.dimensions.depth) || 510;

  const xFront = 37;
  const xBack = depth - 37;
  const xCenter = depth / 2;

  mod.elements.forEach(el => {
    if (el.typ === 'poziom') {
      
      if (el.isStructural) {
        // --- PÓŁKA KONSTRUKCYJNA ---
        const yCenter = el.y + (th / 2);
        
        // Zestawy nawiertów: { screw: Wkręt, dowel: Kołek }
        // Standardowo wkręt idzie na linii 37mm, a kołek 32mm obok.
        let structuralSets = [
          { screw: xFront, dowel: xFront + 32 },
          { screw: xBack, dowel: xBack - 32 }
        ];

        // Jeżeli szafka jest głębsza niż 500mm, dodajemy trzeci zestaw na środku
        if (depth > 500) {
          structuralSets.splice(1, 0, { screw: xCenter, dowel: xCenter + 32 });
        }

        structuralSets.forEach(set => {
          // 1. Wkręt (fi 3) - oznaczony jako główne centrum (isCenter: true), by wyciągnąć wymiar na zewnątrz
          holes.push({ 
            x: set.screw, 
            y: yCenter, 
            diameter: 3, 
            color: '#475569', // Szary kolor dla wkrętu
            type: 'konstrukcyjna', 
            isCenter: true, 
            isStructural: true,
            label: String(yCenter) 
          });
          
          // 2. Kołek / Konfirmat (fi 8)
          holes.push({ 
            x: set.dowel, 
            y: yCenter, 
            diameter: 8, 
            color: '#16a34a', // Zielony kolor dla kołka
            type: 'konstrukcyjna', 
            isCenter: false, // false, by uniknąć duplikowania opisu "Oś:" w tym samym miejscu
            isStructural: true,
            label: '' 
          });
        });

      } else {
        // --- PÓŁKA RUCHOMA (Podpórki) ---
        // Zawsze i bezwarunkowo TYLKO dwa rzędy (przód i tył)
        const adjustablePositions = [xFront, xBack];
        
        const supportPinDiameter = 5;
        const supportPinRadius = supportPinDiameter / 2;
        const yBase = el.y - supportPinRadius; 
        const yOffsets = [-32, 0, 32]; // System 32
        
        adjustablePositions.forEach(x => {
          yOffsets.forEach(dy => {
            const yHole = yBase + dy;
            holes.push({
              x: x,
              y: yHole,
              diameter: supportPinDiameter,
              color: dy === 0 ? '#ea580c' : '#fcd34d', // Pomarańczowy środek, zółte poboczne
              type: 'podporka',
              isCenter: dy === 0,
              label: dy === 0 ? Number(yHole.toFixed(1)).toString() : ''
            });
          });
        });
      }
    }
  });

  return holes;
}