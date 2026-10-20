import { describe, expect, it } from 'vitest';
import { analyzeRows } from '../../core/analyze';
import { insertedLatex } from './keyboardLayouts';

/**
 * Every key of the math keyboard inserts LaTeX that MathSlate understands, once its boxes are
 * filled in and it has what it needs around it (a bare ∫ needs an integrand and dx, → a limit).
 */
const contexts = (latex: string) => [
  latex,
  `${latex} x`,
  `x ${latex} y`,
  `${latex}_1`,
  `${latex} x^2\\,dx`,
  `\\lim_{x ${latex} 0}x`,
];

describe('math keyboard', () => {
  it('inserts only LaTeX that MathSlate understands', () => {
    const failing = insertedLatex().filter((raw) => {
      // Boxes filled with 2, except the first box of a sum/product (k=1) and a limit (x).
      const first = /^\\(sum|prod)/.test(raw) ? 'k=1' : raw.startsWith('\\lim') ? 'x' : '2';
      let box = 0;
      const latex = raw.replace(/#@/g, 'x').replace(/#\?/g, () => (box++ === 0 ? first : '2'));
      const rows = analyzeRows(contexts(latex).map((l, i) => ({ id: `r${i}`, latex: l })));
      return rows.every((r) => r.error !== null);
    });
    expect(failing).toEqual([]);
  });
});
