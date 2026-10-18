import { describe, expect, it } from 'vitest';
import { printStatement } from '../parser/printLatex';
import { statementToSexpr } from '../parser/sexpr';
import { analyzeRows } from './analyze';

function last(...latex: string[]): string {
  const r = analyzeRows(latex.map((l, i) => ({ id: `r${i}`, latex: l }))).at(-1);
  if (!r) return '?';
  if (r.error) return `!${r.error.message}`;
  return r.statement ? statementToSexpr(r.statement) : '?';
}

describe('special functions', () => {
  it.each([
    // Typed names (called with brackets)
    ['erf(x)', '(erf x)'],
    ['Si(x)+Ci(x)', '(+ (Si x) (Ci x))'],
    ['Beta(2,3)', '(Beta 2 3)'],
    ['LambertW(1)', '(LambertW 1)'],
    ['besselJ(0,x)', '(besselJ 0 x)'],
    ['besselJ_0(x)', '(besselJ 0 x)'],
    ['Li_2(x)', '(Li 2 x)'],
    // Conventional LaTeX spellings
    ['\\Gamma\\left(x\\right)', '(gamma x)'],
    ['\\Gamma\\left(s,x\\right)', '(gamma s x)'],
    ['\\gamma\\left(s,x\\right)', '(lowergamma s x)'],
    ['\\zeta\\left(2\\right)', '(zeta 2)'],
    ['\\psi\\left(x\\right)', '(digamma x)'],
    ['\\operatorname{S}\\left(x\\right)', '(fresnelS x)'],
    ['\\operatorname{C}\\left(x\\right)', '(fresnelC x)'],
    ['\\operatorname{B}\\left(2,3\\right)', '(Beta 2 3)'],
    ['\\operatorname{W}\\left(x\\right)', '(LambertW x)'],
    ['\\operatorname{J}_{n}\\left(x\\right)', '(besselJ n x)'],
    ['\\operatorname{K}_{1}\\left(x\\right)', '(besselK 1 x)'], // Bessel K: subscripted
    ['\\operatorname{K}\\left(m\\right)', '(ellipticK m)'], // elliptic K: no subscript
    ['\\operatorname{Li}_{2}\\left(x\\right)', '(Li 2 x)'],
    ['\\operatorname{erf}\\left(x\\right)', '(erf x)'],
    // Without brackets the names are ordinary symbols
    ['2\\zeta', '(* 2 \\zeta)'],
    ['\\Gamma+1', '(+ \\Gamma 1)'],
    ['Si', '(* S #i)'],
    ['C\\left(x+1\\right)', '(* C (+ x 1))'],
    ['S\\left(x\\right)', '(* S x)'],
    ['\\operatorname{S}', 'S'],
    // A user definition still shadows a built-in name
    [['erf(t)=t^2', 'erf(3)'], '(erf 3)'],
  ])('%j → %s', (input, expected) => {
    expect(last(...(Array.isArray(input) ? input : [input]))).toBe(expected);
  });

  it('rejects the wrong number of arguments', () => {
    expect(last('Beta(1)')).toBe('!"Beta" takes 2 arguments, got 1');
  });

  it.each([
    '\\Gamma\\left(x\\right)+\\gamma\\left(s,x\\right)+\\zeta\\left(s\\right)',
    'fresnelS(x)+fresnelC(x)',
    'besselJ(0,x)+besselK(1,x)+ellipticK(x)',
    'Li_2(x)+erf(x)+Si(x)+LambertW(x)',
    'Beta(2,3)+\\psi\\left(1,x\\right)',
  ])('round-trips %s in conventional notation', (input) => {
    const [first] = analyzeRows([{ id: 'r', latex: input }]);
    if (!first?.statement) throw new Error(first?.error?.message ?? 'no statement');
    const printed = printStatement(first.statement);
    const [again] = analyzeRows([{ id: 'r', latex: printed }]);
    expect(again?.error?.message).toBeUndefined();
    expect(again?.statement && statementToSexpr(again.statement)).toBe(
      statementToSexpr(first.statement),
    );
  });

  it('prints conventional names', () => {
    const print = (latex: string) => {
      const [r] = analyzeRows([{ id: 'r', latex }]);
      return r?.statement ? printStatement(r.statement) : '?';
    };
    expect(print('fresnelS(x)')).toBe('\\operatorname{S}\\left(x\\right)');
    expect(print('besselJ(0,x)')).toBe('\\operatorname{J}_{0}\\left(x\\right)');
    expect(print('gamma(x)')).toBe('\\Gamma\\left(x\\right)');
    expect(print('erf(x)')).toBe('\\operatorname{erf}\\left(x\\right)');
  });
});
