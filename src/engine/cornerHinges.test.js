import { describe, it, expect, beforeEach } from 'vitest';
import { state, addCornerModule } from '../core/state.js';
import { getCornerDoorHinges, getCornerDoorHingeSide } from './cabinet.js';
import { freshProject, setProject } from '../test/fixtures.js';

describe('zawiasy drzwi szafki narożnej', () => {
  let mod;
  beforeEach(() => {
    setProject(freshProject());
    mod = addCornerModule();
    state.activeModuleId = mod.id;
  });

  it('każde ramię ma drzwi z zawiasami (2 lub więcej na front)', () => {
    const doors = getCornerDoorHinges(mod);
    expect(doors.map(d => d.arm).sort()).toEqual(['A', 'B']);
    doors.forEach(d => expect(d.hinges.length).toBeGreaterThanOrEqual(2));
  });

  it('w trybie oddzielnych frontów strona wynika z openingSide (A: przy narożniku, B: przy boku)', () => {
    const doors = getCornerDoorHinges(mod);
    expect(doors.find(d => d.arm === 'A').side).toBe('left');
    expect(doors.find(d => d.arm === 'B').side).toBe('right');
    expect(doors.find(d => d.arm === 'B').atBok).toBe(true);
    expect(doors.find(d => d.arm === 'A').atBok).toBe(false);
  });

  it('front łamany: skrzydło przy korpusie na boku, drugie od strony narożnika', () => {
    mod.cornerFrontMode = 'bifold';
    mod.cornerFrontOverlap = { primaryArm: 'A' };
    const doors = getCornerDoorHinges(mod);
    const a = doors.find(d => d.arm === 'A'), b = doors.find(d => d.arm === 'B');
    expect(a.side).toBe('right');
    expect(a.atBok).toBe(true);
    expect(b.side).toBe('left');
    expect(b.bifoldSecondary).toBe(true);
    expect(getCornerDoorHingeSide(mod, b.front)).toBe('left');
  });
});
