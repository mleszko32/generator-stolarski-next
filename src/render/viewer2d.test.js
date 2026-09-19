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
