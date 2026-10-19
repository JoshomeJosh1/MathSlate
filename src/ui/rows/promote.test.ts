import { describe, expect, it } from 'vitest';
import type { CasExpr, CasValue } from '../../cas/types';
import { makeName } from '../../parser/ast';
import { promotableLatex, shownValue } from './promote';

const SPAN = { start: 0, end: 0 };
const num = (value: string): CasExpr => ({
  expr: { kind: 'num', value, span: SPAN },
  latex: value,
});
const exact = (latex: string): CasExpr => ({
  expr: { kind: 'var', name: makeName('x'), span: SPAN },
  latex,
});

describe('shownValue with decimals', () => {
  it('replaces exact numbers by their decimal', () => {
    const value: CasValue = {
      kind: 'expr',
      ...exact('\\frac{\\pi}{2}'),
      numeric: num('1.5707963'),
    };
    expect(shownValue(value, false)).toBe(value);
    const shown = shownValue(value, true);
    expect(shown).toMatchObject({ kind: 'expr', latex: '1.5707963', numeric: null });
    expect(promotableLatex(shown)).toEqual(['1.5707963']);
  });

  it('keeps symbolic results and solutions without a decimal', () => {
    const symbolic: CasValue = { kind: 'expr', ...exact('x^{2}+1'), numeric: null };
    expect(shownValue(symbolic, true)).toBe(symbolic);
    const solutions: CasValue = {
      kind: 'solutions',
      variable: makeName('x'),
      solutions: [
        { ...exact('-\\sqrt{2}'), numeric: num('-1.41421') },
        { ...num('3'), numeric: null },
      ],
    };
    expect(promotableLatex(shownValue(solutions, true))).toEqual(['x=-1.41421', 'x=3']);
  });
});
