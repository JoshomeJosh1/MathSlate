import { describe, expect, it } from 'vitest';
import { analyzeRows } from '../core/analyze';
import { printStatement } from './printLatex';
import { statementToSexpr } from './sexpr';

/** Parses the last row in context, prints it, re-parses the printed form in the same context. */
function roundTrip(rows: string[]): { printed: string; before: string; after: string } {
  const analyse = (latex: string[]) => {
    const result = analyzeRows(latex.map((l, i) => ({ id: `r${i}`, latex: l }))).at(-1);
    if (!result?.statement)
      throw new Error(
        `failed to analyse ${JSON.stringify(latex)}: ${result?.error?.message ?? ''}`,
      );
    return result.statement;
  };
  const statement = analyse(rows);
  const printed = printStatement(statement);
  const reparsed = analyse([...rows.slice(0, -1), printed]);
  return { printed, before: statementToSexpr(statement), after: statementToSexpr(reparsed) };
}

const CASES: string[][] = [
  ['1+2-3'],
  ['1-\\left(2-3\\right)'],
  ['1-\\left(2+3\\right)'],
  ['2x+1'],
  ['2xy'],
  ['x\\cdot y'],
  ['a\\left(b\\cdot c\\right)'],
  ['-x^2'],
  ['\\left(-x\\right)^2'],
  ['x+\\left(-y\\right)'],
  ['x\\left(-2\\right)'],
  ['-2x'],
  ['2^{x+1}'],
  ['\\left(x+1\\right)^2'],
  ['x^{2^{3}}'],
  ['\\left(x^2\\right)^3'],
  ['\\frac{x+1}{x-1}'],
  ['\\frac{1}{2}x'],
  ['\\sqrt{x}+\\sqrt[3]{x}'],
  ['\\left|x-1\\right|'],
  ['\\left(n+1\\right)!'],
  ['n!'],
  ['\\pi+\\exponentialE+\\imaginaryI+\\infty'],
  ['\\sin x\\cos x'],
  ['\\sin^2x'],
  ['\\sin^{-1}x'],
  ['\\log_2 8'],
  ['\\ln\\left(x+1\\right)'],
  ['\\binom{5}{2}'],
  ['\\gcd\\left(4,6\\right)'],
  ['\\operatorname{lcm}\\left(4,6\\right)'],
  ['f(x)=x^2', 'f(3)+f^{\\prime}(2)'],
  ['f(x)=x^2'],
  ['g(x,y)=xy'],
  ['speed=3'],
  ['speed=3', '2speed'],
  ['v_{max}=1'],
  ['x_1+x_2'],
  ['\\alpha_1\\beta'],
  ['a_n=a_{n-1}+2'],
  ['a_n=a_{n-1}+2', 'a_1=1'],
  ['a_n=n^2', 'a_{k+1}'],
  ['p_5+F_{10}'],
  ['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'],
  ['A=\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}', '2A^2'],
  ['\\left(1,2\\right)'],
  ['\\left\\lbrack1,2\\right\\rbrack'],
  ['\\left\\lbrace1,2\\right\\rbrace'],
  ['x^2=4'],
  ['0<x\\le1'],
  ['x\\ne2'],
  ['50\\%'],
  ['1.5x'],
  ['2\\cdot3'],
  ['x\\times y'],
];

describe('printLatex round-trip', () => {
  it.each(CASES)('%s', (...rows: string[]) => {
    const { before, after } = roundTrip(rows);
    expect(after).toBe(before);
  });

  it('prints readable canonical LaTeX', () => {
    expect(roundTrip(['2x+1']).printed).toBe('2x+1');
    expect(roundTrip(['xy']).printed).toBe('x\\cdot y');
    expect(roundTrip(['speed=3']).printed).toBe('\\operatorname{speed}=3');
    expect(roundTrip(['f(x)=x^2']).printed).toBe('f\\left(x\\right)=x^{2}');
    expect(roundTrip(['\\sin^2x']).printed).toBe('\\sin\\left(x\\right)^{2}');
  });
});
