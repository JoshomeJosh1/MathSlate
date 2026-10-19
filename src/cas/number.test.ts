import { describe, expect, it } from 'vitest';
import { analyzeRows } from '../core/analyze';
import { printLatex } from '../parser/printLatex';
import { numberExpr } from './number';

const span = { start: 0, end: 0 };

describe('decimals from a backend', () => {
  it.each([
    ['1.23e-123', '1.23\\cdot 10^{-123}'],
    ['4.5e+20', '4.5\\cdot 10^{20}'],
    ['1e-07', '10^{-7}'],
    ['2.5E8', '2.5\\cdot 10^{8}'],
    ['0.125', '0.125'],
    ['42', '42'],
  ])('%s → %s', (text, latex) => {
    expect(printLatex(numberExpr(text, span))).toBe(latex);
  });

  it('prints exponent notation as LaTeX the parser reads back', () => {
    const latex = printLatex(numberExpr('1.23e-123', span));
    const [row] = analyzeRows([{ id: 'r', latex }]);
    expect(row?.error).toBeNull();
  });
});
