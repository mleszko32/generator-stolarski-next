import { describe, it, expect, beforeEach } from 'vitest';
import { generateSidePanelSVG } from './viewer2d.js';
import { freshProject, baseModule, setProject } from '../test/fixtures.js';

describe('generateSidePanelSVG - otwory pod podpórki półki', () => {
  beforeEach(() => {
    setProject(freshProject({
      modules: [baseModule({
        elements: [{ id: 'p1', typ: 'poziom', x: 18, y: 351, w: 564, h: 18, isStructural: false }],
      })],
    }));
  });

  it('środek otworu leży 2.5 mm niżej niż półka (górna krawędź podpórki równo z półką)', () => {
    const svg = generateSidePanelSVG(720, 510, []);
    // Wysokość liczona od dołu boku (sideH = 720): półka y=351 -> środkowy otwór
    // na 348.5, czyli svgY = 720 - 348.5 = 371.5. Sąsiednie rzędy +/-32.
    const cys = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="2.5" fill="#ea580c"/g)].map(m => parseFloat(m[1]));
    expect(cys).toContain(371.5);
    expect(cys).toContain(371.5 - 32);
    expect(cys).toContain(371.5 + 32);
    // żaden otwór nie leży na samej wysokości półki (720 - 351 = 369)
    expect(cys).not.toContain(369);
  });
});

describe('generateSidePanelSVG - strona zawiasów drzwi', () => {
  const door = (openingSide) => ({
    id: 'front-1', typ: 'front', subtype: 'drzwi', openingSide,
    x: 1.5, y: 2, w: 597, h: 715,
    baseZone: { minX: 18, maxX: 582, minY: 18, maxY: 702 },
  });

  it('podpisuje drzwi prawe/lewe i stronę zawiasów', () => {
    setProject(freshProject({ modules: [baseModule({ elements: [door('right')] })] }));
    let svg = generateSidePanelSVG(720, 510, []);
    expect(svg).toContain('Drzwi prawe');
    expect(svg).toContain('zawiasy z prawej');

    setProject(freshProject({ modules: [baseModule({ elements: [door('left')] })] }));
    svg = generateSidePanelSVG(720, 510, []);
    expect(svg).toContain('Drzwi lewe');
    expect(svg).toContain('zawiasy z lewej');
  });
});
