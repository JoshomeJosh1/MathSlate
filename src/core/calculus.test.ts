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

describe('calculus notation', () => {
  it.each([
    // Integrals
    ['\\int x^2\\,dx', '(int (^ x 2) x)'],
    ['\\int x^2dx', '(int (^ x 2) x)'],
    ['\\int x^2\\,\\mathrm{d}x', '(int (^ x 2) x)'],
    ['\\int x^2\\,\\differentialD x', '(int (^ x 2) x)'],
    ['\\int\\sin x\\,dx', '(int (sin x) x)'],
    ['\\int x+1\\,dx', '(int (+ x 1) x)'],
    ['\\int dx', '(int 1 x)'],
    ['\\int_0^1 x^2\\,dx', '(int (^ x 2) x 0 1)'],
    ['\\int_{0}^{\\pi}\\sin x\\,dx', '(int (sin x) x 0 #pi)'],
    ['\\int_{\\placeholder{}}^{\\placeholder{}}x\\,dx', '(int x x)'], // MathLive's empty bounds
    ['\\int t\\,dt+1', '(+ (int t t) 1)'],
    ['2\\int x\\,dx', '(* 2 (int x x))'],
    ['\\int\\int xy\\,dx\\,dy', '(int (int (* x y) x) y)'],
    ['\\int\\left(x+d\\right)dx', '(int (+ x d) x)'], // a "d" inside parentheses is a variable
    // Derivatives
    ['\\frac{d}{dx}x^2', '(diff (^ x 2) x 1)'],
    ['\\frac{d}{dx}\\left(x^2+1\\right)', '(diff (+ (^ x 2) 1) x 1)'],
    ['\\frac{d}{dx}\\sin x', '(diff (sin x) x 1)'],
    ['\\frac{d^2}{dx^2}x^3', '(diff (^ x 3) x 2)'],
    ['\\frac{\\mathrm{d}}{\\mathrm{d}t}t^2', '(diff (^ t 2) t 1)'],
    ['\\frac{\\partial}{\\partial x}x^2y', '(pdiff (* (^ x 2) y) x 1)'],
    ['\\frac{d}{dx}x^2+1', '(+ (diff (^ x 2) x 1) 1)'],
    ['\\frac{dy}{dx}', '(diff y x 1)'],
    ['\\frac{d}{d}', '(/ d d)'], // not a derivative
    // Limits
    ['\\lim_{x\\to0}\\frac{\\sin x}{x}', '(lim (/ (sin x) x) x 0)'],
    [
      '\\lim_{x\\to\\infty}\\left(1+\\frac{1}{x}\\right)^x',
      '(lim (^ (+ 1 (/ 1 x)) x) x #infinity)',
    ],
    ['\\lim_{x\\to0^{+}}x\\ln x', '(lim (* x (ln x)) x 0 +)'],
    ['\\lim_{x\\to0^{-}}\\frac{1}{x}', '(lim (/ 1 x) x 0 -)'],
    // Sums and products
    ['\\sum_{k=1}^{n}k^2', '(sum (^ k 2) k 1 n)'],
    ['\\sum_{k=1}^{10}k+1', '(+ (sum k k 1 10) 1)'],
    ['\\sum_{n=1}^{\\infty}\\frac{1}{n^2}', '(sum (/ 1 (^ n 2)) n 1 #infinity)'],
    ['\\prod_{k=1}^{5}k', '(prod k k 1 5)'],
  ])('%s → %s', (input, expected) => {
    expect(last(input)).toBe(expected);
  });

  it('binds the variable inside the operator', () => {
    expect(last('x=3', '\\int x^2\\,dx')).toBe('(int (^ x 2) x)');
    const rows = analyzeRows(
      ['x=3', 'a=2', '\\int_0^a x\\,dx'].map((latex, i) => ({ id: `r${i}`, latex })),
    );
    expect(rows[2]?.refs).toEqual(['a']); // x is bound, a (a bound) is a reference
  });

  it.each([
    ['\\int_0^1x\\,', 'Missing "dx" at the end of the integral'],
    ['\\int_0x\\,dx', 'A definite integral needs both a lower and an upper bound'],
    ['\\frac{d}{dx}', 'Write what to differentiate after d/dx'],
    ['\\lim_{x}x', 'Expected "\\to" after the limit variable'],
    ['\\sum k', 'Write \\sum with bounds, e.g. \\sum_{n=1}^{10}'],
  ])('reports %s', (input, message) => {
    expect(last(input)).toBe(`!${message}`);
  });

  it.each([
    '\\int x^2\\,dx',
    '\\int_0^1 x^2+1\\,dx',
    '\\left(\\int x\\,dx\\right)^2',
    '\\frac{d}{dx}\\left(x^2\\sin x\\right)',
    '\\frac{d^3}{dx^3}x^5',
    '\\frac{\\partial}{\\partial y}x^2y^3',
    '\\lim_{x\\to0^{+}}x\\ln x',
    '\\sum_{k=1}^{n}k^2',
    '\\prod_{k=1}^{5}\\left(k+1\\right)',
  ])('round-trips %s', (input) => {
    const [first] = analyzeRows([{ id: 'r', latex: input }]);
    if (!first?.statement) throw new Error(first?.error?.message ?? 'no statement');
    const printed = printStatement(first.statement);
    const [again] = analyzeRows([{ id: 'r', latex: printed }]);
    expect(again?.error?.message).toBeUndefined();
    expect(again?.statement && statementToSexpr(again.statement)).toBe(
      statementToSexpr(first.statement),
    );
  });
});

describe('vector calculus', () => {
  const f = 'f(x,y)=x^2y';
  const field = 'F(x,y,z)=[yz, xz, xy]';
  it.each([
    // A defined function by name (by its parameters), or called (at its arguments)
    [[f, '\\nabla f'], '(grad f)'],
    [[f, '\\nabla f(1,2)'], '(grad (f 1 2))'],
    [[f, '\\grad f'], '(grad f)'],
    [[f, '\\operatorname{grad}(f)'], '(grad f)'],
    [[f, '\\hessian(f)'], '(hessian f)'],
    [[f, '\\nabla^2 f'], '(laplacian f)'],
    [[f, '\\nabla^{2}f+1'], '(+ (laplacian f) 1)'],
    [[field, '\\nabla\\cdot F'], '(div F)'],
    [[field, '\\nabla\\times F'], '(curl F)'],
    [[field, '\\operatorname{div}F'], '(div F)'],
    [[field, '\\curl F(1,2,3)'], '(curl (F 1 2 3))'],
    [[field, '\\jacobian(F)'], '(jacobian F)'],
    // Expressions; the operand is taken like a function's argument
    [['\\nabla(x^2y)'], '(grad (* (^ x 2) y))'],
    [['\\nabla x^2y+1'], '(+ (grad (* (^ x 2) y)) 1)'],
    // Listed variables
    [['\\nabla_{x,y}(x^2yz)'], '(grad (* (* (^ x 2) y) z) (tuple x y))'],
    [['\\nabla_{x_1,x_2}x_1x_2'], '(grad (* x_{1} x_{2}) (tuple x_{1} x_{2}))'],
    [['\\jacobian([u^2v, uv], (u, v))'], '(jacobian [[(* (^ u 2) v)] [(* u v)]] (tuple u v))'],
  ])('reads %j', (rows, sexpr) => {
    expect(last(...rows)).toBe(sexpr);
  });

  it('binds listed variables inside the operand', () => {
    expect(last('x=3', '\\nabla_{x,y}(x^2y)')).toBe('(grad (* (^ x 2) y) (tuple x y))');
    const rows = analyzeRows(
      ['x=3', f, '\\nabla_{x,y}(x^2y)', '\\nabla f'].map((latex, i) => ({ id: `r${i}`, latex })),
    );
    expect(rows[2]?.refs).toEqual([]);
    expect(rows[3]?.refs).toEqual(['f']);
  });

  it.each([
    ['\\nabla', 'Write what ∇ applies to after it'],
    ['\\operatorname{div}', '"div" needs an argument'],
    ['\\nabla^3 f', 'Only ∇² (the Laplacian) takes a power here'],
    ['\\nabla_{x,x}x^2', 'The variable x is listed twice'],
    ['\\nabla_{x,2}x^2', 'List the variables as letters, e.g. (x, y)'],
    [
      '\\nabla_x x^2',
      '∇ by one vector variable is not supported yet: list the variables, e.g. ∇_{x,y}',
    ],
    ['\\grad_{x,y}(x^2, (x,y))', 'Give the variables once: in the subscript or in brackets'],
    ['\\grad(x, y, z)', '"grad" takes 1 to 2 arguments, got 3'],
  ])('reports %s', (input, message) => {
    expect(last(input)).toBe(`!${message}`);
  });

  it.each([
    [f, '\\nabla f'],
    [f, '\\nabla f(1,2)'],
    [f, '\\nabla^2 f+1'],
    [f, '\\hessian(f)'],
    [field, '\\nabla\\cdot F'],
    [field, '\\nabla\\times F\\left(1,2,3\\right)'],
    [field, '\\jacobian(F)'],
    ['', '\\nabla_{x,y}(x^2yz)'],
    ['', '\\operatorname{div}[x, y]'],
    ['', '2\\nabla(x^2)y'],
    ['', '\\jacobian([u^2v, uv], (u, v))'],
  ])('round-trips %s / %s', (definition, input) => {
    const rows = (latex: string) =>
      analyzeRows([definition, latex].map((l, i) => ({ id: `r${i}`, latex: l }))).at(-1);
    const first = rows(input);
    if (!first?.statement) throw new Error(first?.error?.message ?? 'no statement');
    const again = rows(printStatement(first.statement));
    expect(again?.error?.message).toBeUndefined();
    expect(again?.statement && statementToSexpr(again.statement)).toBe(
      statementToSexpr(first.statement),
    );
  });
});
