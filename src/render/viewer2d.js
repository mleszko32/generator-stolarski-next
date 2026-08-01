// src/render/viewer2d.js
import { state } from '../core/state.js';

export function generateSidePanelSVG(drawHeight, drawDepth, mountingData) {
    const mod = state.project.modules.find(m => m.id === state.activeModuleId);
    if (!mod) return '<svg></svg>';

    const config = state.project;
    const th = parseFloat(config.materials.boardThickness) || 18;
    const W = parseFloat(mod.dimensions.width) || 600;
    const H = parseFloat(mod.dimensions.height) || 720;
    const D = parseFloat(mod.dimensions.depth) || 513;

    const cons = config.construction || { joinType: 'boki_przelotowe', topType: 'pelny', traverseWidth: 100 };
    const isTopBottomFullWidth = cons.joinType === 'wience_przelotowe';
    const trWidth = cons.traverseWidth || 100;

    let svg = `<svg viewBox="-100 -200 3200 ${H + 400}" xmlns="http://www.w3.org/2000/svg" style="background:#fff; width:100%; height:100%;">`;
    
    svg += `<style>
        .line { stroke: #1e3a8a; stroke-width: 1.5; fill: none; }
        .board { fill: #f8fafc; stroke: #475569; stroke-width: 1; }
        .text-title { font-family: sans-serif; font-size: 16px; font-weight: bold; fill: #1e3a8a; text-anchor: middle; }
        .text-dim { font-family: sans-serif; font-size: 10px; fill: #64748b; text-anchor: middle; }
        .text-coord { font-family: monospace; font-size: 9px; font-weight: bold; }
        .hole { fill: #ea580c; }
        .baseline { stroke: #94a3b8; stroke-dasharray: 4 4; stroke-width: 1; }
    </style>`;

    // --- LEGENDA NAWIERTÓW (Z poprawionym nazewnictwem) ---
    svg += `<g transform="translate(100, -130)">
        <text x="0" y="0" class="text-dim" style="font-weight:bold; fill:#1e293b; text-anchor:start; font-size: 14px;">LEGENDA NAWIERTÓW (Format: [X, Y]):</text>
        
        <circle cx="0" cy="20" r="2.5" style="fill:#ef4444;"/><text x="12" y="24" class="text-dim" style="text-anchor:start; font-size: 12px;">Prowadnik (Zawias)</text>
        <circle cx="0" cy="45" r="2" style="fill:#3b82f6;"/><text x="12" y="49" class="text-dim" style="text-anchor:start; font-size: 12px;">Prowadnica (Szuflada)</text>
        
        <circle cx="220" cy="20" r="2.5" style="fill:#16a34a;"/><text x="232" y="24" class="text-dim" style="text-anchor:start; font-size: 12px;">Wkręt (Konfirmat)</text>
        <circle cx="220" cy="45" r="4" style="fill:#9333ea;"/><text x="232" y="49" class="text-dim" style="text-anchor:start; font-size: 12px;">Kołek drewniany (8mm)</text>
    </g>`;

    svg += `<line x1="-50" y1="${H}" x2="3100" y2="${H}" class="baseline" />`;
    svg += `<text x="3100" y="${H}" class="text-dim" style="text-anchor: end;" dy="-5">0 mm (Baza modułu)</text>`;

    // --- 1. KORPUS WNĘTRZE ---
    let g1 = `<g transform="translate(100, 0)">`;
    g1 += `<text x="${W/2}" y="-30" class="text-title">KORPUS WNĘTRZE</text>`;
    
    let horizontalLevels = [];

    if (isTopBottomFullWidth) {
        g1 += `<rect x="0" y="0" width="${W}" height="${th}" class="board" />`; 
        g1 += `<rect x="0" y="${H - th}" width="${W}" height="${th}" class="board" />`; 
        g1 += `<rect x="0" y="${th}" width="${th}" height="${H - 2*th}" class="board" />`; 
        g1 += `<rect x="${W - th}" y="${th}" width="${th}" height="${H - 2*th}" class="board" />`; 
        horizontalLevels.push(0, th, H - th, H);
    } else {
        g1 += `<rect x="0" y="0" width="${th}" height="${H}" class="board" />`; 
        g1 += `<rect x="${W - th}" y="0" width="${th}" height="${H}" class="board" />`; 
        g1 += `<rect x="${th}" y="${H - th}" width="${W - 2*th}" height="${th}" class="board" />`; 
        horizontalLevels.push(H - th, H);
        if (cons.topType === 'pelny') {
            g1 += `<rect x="${th}" y="0" width="${W - 2*th}" height="${th}" class="board" />`; 
            horizontalLevels.push(0, th);
        } else if (cons.topType === 'trawersy_poziom') {
            g1 += `<rect x="${th}" y="0" width="${W - 2*th}" height="${th}" class="board" />`; 
            horizontalLevels.push(0, th);
        } else if (cons.topType === 'trawersy_pion') {
            g1 += `<rect x="${th}" y="0" width="${W - 2*th}" height="${trWidth}" class="board" />`; 
            horizontalLevels.push(0, trWidth);
        }
    }

    if (mod.elements) {
        mod.elements.forEach(el => {
            if (el.typ === 'poziom' || el.typ === 'pion') {
                let svgY = H - el.y - el.h;
                g1 += `<rect x="${el.x}" y="${svgY}" width="${el.w}" height="${el.h}" class="board" />`;
                if (el.typ === 'poziom') horizontalLevels.push(svgY, svgY + el.h);
            }
        });
    }

    // Warstwa: Prześwity (layer-dim-gaps)
    g1 += `<g class="layer-dim-gaps">`;
    horizontalLevels.sort((a, b) => a - b);
    for (let i = 1; i < horizontalLevels.length - 1; i += 2) {
        let y1 = horizontalLevels[i];
        let y2 = horizontalLevels[i+1];
        if (y2 - y1 > 1) { 
            let midY = (y1 + y2) / 2;
            g1 += `<line x1="${W/2}" y1="${y1}" x2="${W/2}" y2="${y2}" class="line" style="stroke: #94a3b8; stroke-width: 0.5;" />`;
            g1 += `<rect x="${W/2 - 15}" y="${midY - 8}" width="30" height="16" fill="white" />`;
            g1 += `<text x="${W/2}" y="${midY}" class="text-dim" style="fill: #334155; font-weight: bold;" dy="4">${(y2 - y1).toFixed(0)}</text>`;
        }
    }
    g1 += `</g>`; // End layer-dim-gaps
    g1 += `</g>`;
    svg += g1;

    // --- 2. BOK LEWY ---
    let g2 = `<g transform="translate(900, 0)">`;
    g2 += `<text x="${D/2}" y="-30" class="text-title">BOK LEWY (Wewnętrzna strona)</text>`;
    g2 += `<rect x="0" y="0" width="${D}" height="${H}" class="board" />`;
    g2 += `<text x="5" y="${H/2}" class="text-dim" style="text-anchor: start; fill:#94a3b8;" transform="rotate(-90 5,${H/2})">PRZÓD BOKU</text>`;
    g2 += `<text x="${D-5}" y="${H/2}" class="text-dim" style="text-anchor: end; fill:#94a3b8;" transform="rotate(-90 ${D-5},${H/2})">TYŁ BOKU</text>`;
    g2 += `<line x1="37" y1="-10" x2="37" y2="0" stroke="#ef4444" stroke-width="1" />`;
    g2 += `<text x="37" y="-15" class="text-dim" style="fill: #ef4444;">X: 37</text>`;
    
    if (mountingData) {
        mountingData.forEach(item => {
            if (item.type === 'door' && item.side === 'left') {
                item.hinges.forEach(h => {
                    let svgY = H - h.y; 
                    g2 += `<g class="layer-holes-hinge">`;
                    g2 += `<circle cx="37" cy="${svgY}" r="2.5" class="hole" style="fill: #ef4444;" />`;
                    g2 += `<text x="43" y="${svgY}" class="text-coord" style="text-anchor: start; fill: #ef4444;" dy="3">[37, ${h.y.toFixed(1)}]</text>`;
                    g2 += `</g>`;
                });
            } else if (item.type === 'drawer') {
                if (item.slideSideHoles) {
                    item.slideSideHoles.forEach(h => {
                        let svgY = H - h.y;
                        g2 += `<g class="layer-holes-drawer">`;
                        g2 += `<circle cx="37" cy="${svgY}" r="2" class="hole" style="fill: #3b82f6;" />`;
                        g2 += `<text x="43" y="${svgY}" class="text-coord" style="text-anchor: start; fill: #3b82f6;" dy="3">[37, ${h.y.toFixed(1)}]</text>`;
                        g2 += `</g>`;
                    });
                }
            } else if (item.type === 'corpus') {
                item.holes.forEach(h => {
                    let svgY = H - h.y;
                    let holeRadius = h.holeType === 'screw' ? 2.5 : 4;
                    let color = h.holeType === 'screw' ? '#16a34a' : '#9333ea';
                    let holeX = h.xFromFront; // Przód po lewej
                    
                    g2 += `<g class="layer-holes-corpus">`;
                    g2 += `<circle cx="${holeX}" cy="${svgY}" r="${holeRadius}" style="fill: ${color}; opacity: 0.85;" />`;
                    g2 += `<text x="${holeX + 6}" y="${svgY}" class="text-coord" style="text-anchor: start; fill: ${color};" dy="3">[${h.xFromFront}, ${h.y.toFixed(1)}]</text>`;
                    g2 += `</g>`;
                });
            }
        });
    }
    g2 += `</g>`;
    svg += g2;

    // --- 3. BOK PRAWY ---
    let g3 = `<g transform="translate(1600, 0)">`;
    g3 += `<text x="${D/2}" y="-30" class="text-title">BOK PRAWY (Wewnętrzna strona)</text>`;
    g3 += `<rect x="0" y="0" width="${D}" height="${H}" class="board" />`;
    g3 += `<text x="5" y="${H/2}" class="text-dim" style="text-anchor: start; fill:#94a3b8;" transform="rotate(-90 5,${H/2})">TYŁ BOKU</text>`;
    g3 += `<text x="${D-5}" y="${H/2}" class="text-dim" style="text-anchor: end; fill:#94a3b8;" transform="rotate(-90 ${D-5},${H/2})">PRZÓD BOKU</text>`;
    g3 += `<line x1="${D-37}" y1="-10" x2="${D-37}" y2="0" stroke="#ef4444" stroke-width="1" />`;
    g3 += `<text x="${D-37}" y="-15" class="text-dim" style="fill: #ef4444;">X: 37</text>`;
    
    if (mountingData) {
        mountingData.forEach(item => {
            if (item.type === 'door' && item.side === 'right') {
                item.hinges.forEach(h => {
                    let svgY = H - h.y; 
                    g3 += `<g class="layer-holes-hinge">`;
                    g3 += `<circle cx="${D - 37}" cy="${svgY}" r="2.5" class="hole" style="fill: #ef4444;" />`;
                    // Współrzędna X podawana od frontu (dla jasności stolarza)
                    g3 += `<text x="${D - 43}" y="${svgY}" class="text-coord" style="text-anchor: end; fill: #ef4444;" dy="3">[37, ${h.y.toFixed(1)}]</text>`;
                    g3 += `</g>`;
                });
            } else if (item.type === 'drawer') {
                if (item.slideSideHoles) {
                    item.slideSideHoles.forEach(h => {
                        let svgY = H - h.y;
                        g3 += `<g class="layer-holes-drawer">`;
                        g3 += `<circle cx="${D - 37}" cy="${svgY}" r="2" class="hole" style="fill: #3b82f6;" />`;
                        g3 += `<text x="${D - 43}" y="${svgY}" class="text-coord" style="text-anchor: end; fill: #3b82f6;" dy="3">[37, ${h.y.toFixed(1)}]</text>`;
                        g3 += `</g>`;
                    });
                }
            } else if (item.type === 'corpus') {
                item.holes.forEach(h => {
                    let svgY = H - h.y;
                    let holeRadius = h.holeType === 'screw' ? 2.5 : 4;
                    let color = h.holeType === 'screw' ? '#16a34a' : '#9333ea';
                    let holeX = D - h.xFromFront; // Przód po prawej
                    
                    g3 += `<g class="layer-holes-corpus">`;
                    g3 += `<circle cx="${holeX}" cy="${svgY}" r="${holeRadius}" style="fill: ${color}; opacity: 0.85;" />`;
                    g3 += `<text x="${holeX - 6}" y="${svgY}" class="text-coord" style="text-anchor: end; fill: ${color};" dy="3">[${h.xFromFront}, ${h.y.toFixed(1)}]</text>`;
                    g3 += `</g>`;
                });
            }
        });
    }
    g3 += `</g>`;
    svg += g3;

    // --- 4. FRONT ---
    let g4 = `<g transform="translate(2400, 0)">`;
    g4 += `<text x="${W/2}" y="-30" class="text-title">FRONT (Podział zewnętrzny)</text>`;
    g4 += `<rect x="0" y="0" width="${W}" height="${H}" class="board" style="opacity: 0.15;" />`;

    if (mod.elements) {
        mod.elements.forEach(el => {
            if (el.typ === 'front') {
                let svgY = H - el.y - el.h;
                g4 += `<rect x="${el.x}" y="${svgY}" width="${el.w}" height="${el.h}" class="board" style="fill: #eff6ff; stroke: #2563eb; stroke-width: 1.5;" />`;
                g4 += `<text x="${el.x + el.w/2}" y="${svgY + el.h/2}" class="text-dim" style="fill: #1e3a8a; font-weight: bold;">${el.subtype.toUpperCase()}</text>`;
                g4 += `<text x="${el.x + el.w/2}" y="${svgY + el.h/2 + 15}" class="text-dim">${el.w.toFixed(1)} x ${el.h.toFixed(1)}</text>`;
                
                if (el.subtype === 'szuflada' && mountingData) {
                    const drawerData = mountingData.find(d => d.frontId === el.id);
                    if (drawerData && drawerData.frontHoles) {
                        drawerData.frontHoles.forEach(h => {
                            let absY = el.y + h.y;
                            let holeSvgY = H - absY;
                            let holeSvgXLeft = el.x + h.x;
                            let holeSvgXRight = el.x + el.w - h.x;
                            
                            g4 += `<g class="layer-holes-drawer">`;
                            g4 += `<circle cx="${holeSvgXLeft}" cy="${holeSvgY}" r="2" class="hole" style="fill: #2563eb;" />`;
                            g4 += `<circle cx="${holeSvgXRight}" cy="${holeSvgY}" r="2" class="hole" style="fill: #2563eb;" />`;
                            g4 += `</g>`;
                        });
                    }
                }
            }
        });
    }
    g4 += `</g>`;
    svg += g4;

    svg += `</svg>`;
    return svg;
}