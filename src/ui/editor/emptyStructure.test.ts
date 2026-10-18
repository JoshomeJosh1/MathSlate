import { describe, expect, it } from 'vitest';
import { emptyStructureRange, isEmptyStructure } from './emptyStructure';

/**
 * Readings MathLive gave for 1+\sqrt{\placeholder{}}+2 (offsets 0–7: 2 is before √, 3–4 inside
 * it, 5 after it), recorded in the browser.
 */
const P = '\\placeholder{}';
const S = `\\sqrt{${P}}`;
const READINGS: Record<string, string> = {
  '0,1': '1', '0,2': '1+', '0,3': '1+', '0,4': `1+${P}`, '0,5': `1+${S}`, '0,6': `1+${S}+`,
  '0,7': `1+${S}+2`, '1,2': '+', '1,3': '+', '1,4': `+${P}`, '1,5': `+${S}`, '1,6': `+${S}+`,
  '1,7': `+${S}+2`, '2,3': '', '2,4': P, '2,5': S, '2,6': `${S}+`, '2,7': `${S}+2`, '3,4': P,
  '3,5': S, '3,6': `${S}+`, '3,7': `${S}+2`, '4,5': '', '4,6': '+', '4,7': '+2', '5,6': '+',
  '5,7': '+2', '6,7': '2',
}; // prettier-ignore
const read = (a: number, b: number) => READINGS[`${a},${b}`] ?? '';

describe('finding the empty structure next to the caret', () => {
  it('finds √□ after the caret (Delete) and before it (Backspace)', () => {
    expect(emptyStructureRange(read, 2, 7, 'forward')).toEqual([2, 5]);
    expect(emptyStructureRange(read, 5, 7, 'backward')).toEqual([2, 5]);
  });

  it('ignores neighbours that are not empty structures', () => {
    expect(emptyStructureRange(read, 1, 7, 'forward')).toBeNull(); // "+"
    expect(emptyStructureRange(read, 5, 7, 'forward')).toBeNull(); // "+"
    expect(emptyStructureRange(read, 2, 7, 'backward')).toBeNull(); // "+"
    expect(emptyStructureRange(read, 7, 7, 'forward')).toBeNull(); // end
  });
});

describe('empty structures (deleted whole)', () => {
  it.each([
    '\\sqrt{\\placeholder{}}',
    '\\sqrt[\\placeholder{}]{\\placeholder{}}',
    '\\frac{\\placeholder{}}{\\placeholder{}}',
    '\\binom{\\placeholder{}}{\\placeholder{}}',
    '\\sum_{\\placeholder{}}^{\\placeholder{}}',
    '\\int_{\\placeholder{}}^{\\placeholder{}}',
    '\\lim_{\\placeholder{}\\to\\placeholder{}}',
  ])('%s', (latex) => {
    expect(isEmptyStructure(latex)).toBe(true);
  });

  it.each([
    '\\sqrt{2}',
    '\\frac{1}{\\placeholder{}}',
    '\\lim_{x\\to\\placeholder{}}',
    '\\pi',
    '\\int',
    'x',
    '',
    '\\left(\\placeholder{}\\right)',
  ])('not %s', (latex) => {
    expect(isEmptyStructure(latex)).toBe(false);
  });
});
