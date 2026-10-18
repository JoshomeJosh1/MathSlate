import { describe, expect, it } from 'vitest';
import { statementToSexpr } from '../parser/sexpr';
import { analyzeRows, type RowAnalysis } from './analyze';

/** Analyse rows; render each as an S-expression or `!message @start-end`. */
function render(r: RowAnalysis): string {
  if (r.error) return `!${r.error.message} @${r.error.span.start}-${r.error.span.end}`;
  return r.statement ? statementToSexpr(r.statement) : '?';
}
function rows(...latex: string[]): string[] {
  return analyzeRows(latex.map((l, i) => ({ id: `r${i}`, latex: l }))).map(render);
}
/** Result for the last row, given earlier context rows. */
function last(...latex: string[]): string {
  return rows(...latex).at(-1) ?? '';
}

type Case = [input: string | string[], expected: string];
function table(cases: Case[]) {
  it.each(cases.map(([input, expected]) => [Array.isArray(input) ? input : [input], expected]))(
    '%j → %s',
    (input, expected) => {
      expect(last(...input)).toBe(expected);
    },
  );
}

describe('numbers and arithmetic', () => {
  table([
    ['', '(empty)'],
    ['123', '123'],
    ['1.5', '1.5'],
    ['.5', '.5'],
    ['1+2', '(+ 1 2)'],
    ['1-2-3', '(- (- 1 2) 3)'],
    ['2\\cdot3+4', '(+ (* 2 3) 4)'],
    ['2+3\\cdot4', '(+ 2 (* 3 4))'],
    ['2\\times3', '(* 2 3)'],
    ['6/2/3', '(/ (/ 6 2) 3)'],
    ['6\\div2', '(/ 6 2)'],
    ['-x', '(- x)'],
    ['-x^2', '(- (^ x 2))'],
    ['x^{2+1}', '(^ x (+ 2 1))'],
    ['x^23', '(* (^ x 2) 3)'],
    ['x^{23}', '(^ x 23)'],
    ['\\frac12', '(/ 1 2)'],
    ['\\frac23', '(/ 2 3)'],
    ['\\frac{x+1}{x-1}', '(/ (+ x 1) (- x 1))'],
    ['\\frac{\\left(x+1\\right)}{\\left(x-1\\right)}', '(/ (+ x 1) (- x 1))'],
    ['\\sqrt2', '(sqrt 2)'],
    ['\\sqrt{x+1}', '(sqrt (+ x 1))'],
    ['\\sqrt[3]{x}', '(root x 3)'],
    ['5!', '(! 5)'],
    ['\\left|x-1\\right|', '(abs (- x 1))'],
    ['|x|', '(abs x)'],
    ['2|x|', '(* 2 (abs x))'],
    ['50\\%', '(/ 50 100)'],
    ['\\binom{5}{2}', '(binomial 5 2)'],
    ['\\left(1+2\\right)\\cdot3', '(* (+ 1 2) 3)'],
    ['\\pi', '#pi'],
    ['2\\pi', '(* 2 #pi)'],
    ['\\exponentialE^{x}', '(^ #e x)'],
    ['3\\imaginaryI', '(* 3 #i)'],
    ['\\infty', '#infinity'],
  ]);
});

describe('implicit multiplication', () => {
  table([
    ['2x', '(* 2 x)'],
    ['2x^2', '(* 2 (^ x 2))'],
    ['xy', '(* x y)'],
    ['2xy', '(* (* 2 x) y)'],
    ['x\\left(x+1\\right)', '(* x (+ x 1))'],
    ['\\left(x+1\\right)\\left(x-1\\right)', '(* (+ x 1) (- x 1))'],
    ['2\\sin x', '(* 2 (sin x))'],
    ['a/2b', '(/ a (* 2 b))'], // implicit multiplication binds tighter than explicit operators
    ['-2x', '(- (* 2 x))'],
    ['a\\cdot bc', '(* a (* b c))'],
    // Regression: an explicit operator must not split a letter run (was (speed·t)·i·m·e).
    [['speed=12', 'time=3', 'speed\\cdot time'], '(* speed time)'],
    [['time=3', 'm=5', '2\\cdot time'], '(* 2 time)'],
    [['x=2', 'y=3', 'xy'], '(* x y)'],
    [['xy=6', 'xy+1'], '(+ xy 1)'],
    [['speed=3', '2speed'], '(* 2 speed)'],
    [['speed=3', 'speeds'], '(* speed s)'],
    ['speed', '(* (* (* (* s p) #e) #e) d)'], // undefined: letters, and e is Euler's number
    [['ab=1', 'abc'], '(* ab c)'],
    [['ab=1', 'abc=2', 'abc'], 'abc'],
    ['x2', '(* x 2)'],
  ]);
});

describe('functions', () => {
  table([
    ['f(x)=x^2', '(defn f (x) (^ x 2))'],
    ['f\\left(x\\right)=x^2+1', '(defn f (x) (+ (^ x 2) 1))'],
    ['g\\left(x,y\\right)=x\\cdot y', '(defn g (x y) (* x y))'],
    [['f(x)=x^2', 'f(3)'], '(f 3)'],
    [['f(x)=x^2', 'f\\left(a+1\\right)'], '(f (+ a 1))'],
    [['g(x,y)=x+y', 'g(1,2)'], '(g 1 2)'],
    [['f(x)=x^2', 'f(3)^2'], '(^ (f 3) 2)'],
    [['f(x)=x^2', '2f(3)'], '(* 2 (f 3))'],
    [['f(x)=x^2', 'f^{\\prime}\\left(x\\right)'], "(f' x)"],
    [['f(x)=x^2', "f''(x)"], "(f'' x)"],
    [['f(x)=x^2', 'f^{\\doubleprime}\\left(x\\right)'], "(f'' x)"], // MathLive's default for ''
    [['f(x)=x^2', 'f^{\\prime\\prime\\prime}\\left(x\\right)'], "(f''' x)"],
    [['f(x)=x^2', 'f^{\\tripleprime}(x)'], "(f''' x)"],
    [['speed(t)=2t', 'speed(3)'], '(speed 3)'],
    ['x(y)', '(* x y)'],
    // A parameter shadows a global of the same name; locals never merge into longer names.
    [['xy=3', 'f(x,y)=xy'], '(defn f (x y) (* x y))'],
    [['a=5', 'f(a)=a+1'], '(defn f (a) (+ a 1))'],
  ]);
});

describe('built-in functions', () => {
  table([
    ['\\sin x', '(sin x)'],
    ['\\sin\\left(x\\right)', '(sin x)'],
    ['\\sin2x', '(sin (* 2 x))'],
    ['\\sin x+1', '(+ (sin x) 1)'],
    ['\\sin x\\cos x', '(* (sin x) (cos x))'],
    ['\\sin^2x', '(^ (sin x) 2)'],
    ['\\sin\\left(x\\right)^2', '(^ (sin x) 2)'],
    ['\\sin^{-1}x', '(arcsin x)'],
    ['\\ln x', '(ln x)'],
    ['\\log_2 8', '(log 8 2)'],
    ['\\log_{_2}8', '(log 8 2)'], // MathLive's output for typed "log_2"
    ['\\log x', '(log x)'],
    ['\\gcd\\left(12,18\\right)', '(gcd 12 18)'],
    ['\\max\\left(1,2,3\\right)', '(max 1 2 3)'],
    ['\\operatorname{lcm}\\left(4,6\\right)', '(lcm 4 6)'],
    ['lcm\\left(4,6\\right)', '(lcm 4 6)'],
    ['floor\\left(2.5\\right)', '(floor 2.5)'],
    ['-\\sin x', '(- (sin x))'],
  ]);
});

describe('constants and names', () => {
  table([
    ['a=123', '(def a 123)'],
    [['a=123', 'a+1'], '(+ a 1)'],
    ['speed=3', '(def speed 3)'],
    ['v_{max}=10', '(def v_{max} 10)'],
    ['v_{\\max}=10', '(def v_{max} 10)'], // MathLive turns typed "max" into \max
    [['v_{max}=10', '2v_{max}'], '(* 2 v_{max})'],
    ['x_1=3', '(def x_{1} 3)'],
    [['x_1=3', 'x_1+x_2'], '(+ x_{1} x_{2})'],
    ['\\alpha=2', '(def \\alpha 2)'],
    ['\\alpha_1', '\\alpha_{1}'],
    ['\\operatorname{rate}=2', '(def rate 2)'],
    ['y=2x', '(def y (* 2 x))'],
    ['x=x+1', '(= x (+ x 1))'], // self-reference: an equation, not a definition
  ]);
});

describe('sequences', () => {
  table([
    ['a_n=n+1', '(defseq a n (+ n 1))'],
    ['a_{n}=a_{n-1}+2', '(defseq a n (+ (_ a (- n 1)) 2))'],
    [['a_n=a_{n-1}+2', 'a_1=1'], '(base a 1 1)'],
    [['a_n=n^2', 'a_5'], '(_ a 5)'],
    [['a_n=n^2', 'a_{k+1}'], '(_ a (+ k 1))'],
    [['a_n=n^2', '2a_3'], '(* 2 (_ a 3))'],
    [['a_n=n^2', 'a_3^2'], '(^ (_ a 3) 2)'],
    // Without a rule that uses n, a_n = 3 names a constant; a_1 = … without a sequence is a name.
    ['a_n=3', '(def a_{n} 3)'],
    [['a_n=3', 'a_1=1'], '(base a 1 1)'], // …but base cases make it a sequence
    ['b_1=4', '(def b_{1} 4)'],
    ['p_5', '(_ p 5)'], // built-in primes
    ['F_{10}', '(_ F 10)'], // built-in Fibonacci
    [['p_1=7', 'p_1'], 'p_{1}'], // a user definition shadows the built-in term
    [['p_n=n', 'p_3'], '(_ p 3)'],
    ['x_{n+1}', '!"x" is not a sequence, so its subscript must be letters or digits @3-6'],
    ['p', 'p'], // a bare built-in sequence letter is an ordinary variable
  ]);
});

describe('matrices and lists', () => {
  table([
    ['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '[[1 2] [3 4]]'],
    ['\\begin{bmatrix}1\\\\2\\\\3\\end{bmatrix}', '[[1] [2] [3]]'],
    ['\\begin{pmatrix}x&2x\\end{pmatrix}', '[[x (* 2 x)]]'],
    ['\\begin{pmatrix}1&2\\\\3&4\\\\\\end{pmatrix}', '[[1 2] [3 4]]'], // trailing row separator
    ['\\left[\\begin{matrix}1 & 2\\\\3 & 4\\end{matrix}\\right]', '[[1 2] [3 4]]'], // SymPy style
    ['A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '(def A [[1 2] [3 4]])'],
    [['A=\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}', '2A'], '(* 2 A)'],
    ['\\left(1,2\\right)', '(tuple 1 2)'],
    ['\\left\\lbrack1,2,3\\right\\rbrack', '(list 1 2 3)'],
    ['\\left\\lbrace1,2\\right\\rbrace', '(set 1 2)'],
  ]);
});

describe('relations', () => {
  table([
    ['x^2=4', '(= (^ x 2) 4)'],
    ['x\\le2', '(<= x 2)'],
    ['x\\ge2', '(>= x 2)'],
    ['x\\ne2', '(!= x 2)'],
    ['0<x<1', '(rel 0 < x < 1)'],
    ['2x+1=5', '(= (+ (* 2 x) 1) 5)'],
    ['f(x)+1=2', '(= (+ (* f x) 1) 2)'], // not a definition, and f is not a function
  ]);
});

describe('errors with positions', () => {
  table([
    ['1+', '!Missing operand after "+" @1-2'],
    ['\\left(1+2', '!Missing ")" @0-9'],
    ['(1+2', '!Missing ")" @0-4'],
    ['1+2)', '!Unexpected ")" @3-4'],
    ['x=', '!Missing right-hand side after "=" @1-2'],
    ['\\frac{1}{\\placeholder{}}', '!Fill in the empty box @9-23'],
    ['2^3^4', '!Double exponent: use braces, e.g. x^{2^{3}} @3-4'],
    ['x_1_2', '!Double subscript: use braces, e.g. x_{12} @3-4'],
    ['\\foo', '!Unknown command "\\foo" @0-4'],
    ['\\sin', '!"\\sin" needs an argument @0-4'],
    ['\\hom x', '!Unknown function "\\hom" @0-6'],
    [
      '\\begin{pmatrix}1&2\\\\3\\end{pmatrix}',
      '!All matrix rows must have the same number of entries @0-34',
    ],
    ['\\begin{pmatrix}1&2', '!Missing \\end{pmatrix} @0-18'],
    [['f(x)=x', 'f'], '!"f" is a function; write f(…) @0-1'],
    [['f(x)=x', 'f(1,2)'], '!"f" takes 1 argument, got 2 @0-6'],
    [['a_n=n', 'a'], '!"a" is a sequence; write a_{n} @0-1'],
    ["x'", '!Prime (′) can only follow a function name @1-2'],
    ['x\\pm1', '!"±" is not supported yet @1-4'],
    ['|x', '!Missing closing "|" @0-2'],
    ['\\gcd\\left(1\\right)', '!"gcd" takes at least 2 arguments, got 1 @0-18'],
  ]);

  it('reports duplicate definitions on every defining row', () => {
    expect(rows('a=1', 'a=2', 'a')).toEqual([
      '!"a" is defined on more than one line @0-1',
      '!"a" is defined on more than one line @0-1',
      'a',
    ]);
  });

  it('keeps other rows working when one row has an error', () => {
    expect(rows('a=1', '1+', 'a+1')).toEqual([
      '(def a 1)',
      '!Missing operand after "+" @1-2',
      '(+ a 1)',
    ]);
  });
});

describe('dependency references', () => {
  it('records the user symbols each row reads', () => {
    const result = analyzeRows(
      ['a=1', 'f(x)=x+a', 'b_n=b_{n-1}+f(n)', 'b_1=1', 'f(2)+b_3+p_2+x'].map((latex, i) => ({
        id: `r${i}`,
        latex,
      })),
    );
    expect(result.map((r) => [r.defines, [...r.refs].sort()])).toEqual([
      ['a', []],
      ['f', ['a']],
      ['b', ['b', 'f']],
      ['b', []],
      [null, ['b', 'f']],
    ]);
  });
});

describe('symbol interpretations', () => {
  function withChoices(choices: Record<string, string>, ...latex: string[]) {
    return analyzeRows(
      latex.map((l, i) => ({ id: `r${i}`, latex: l })),
      { interpretationChoices: choices },
    );
  }

  table([
    ['e^x', '(^ #e x)'],
    ['2i', '(* 2 #i)'],
    ['\\pi r^2', '(* #pi (^ r 2))'],
    ['p_5', '(_ p 5)'],
    ['p', 'p'], // primes only claim p with a subscript
    [['e=3', 'e+1'], '(+ e 1)'], // a definition beats the interpretation
    [['i=2', '2i'], '(* 2 i)'],
    [['f(e)=e+1', 'f(1)'], '(f 1)'],
  ]);

  it("applies the document's choices", () => {
    const [row] = withChoices({ e: 'variable', p: 'variable' }, 'e^x+p_5');
    expect(row && render(row)).toBe('(+ (^ e x) p_{5})');
  });

  it('records which interpretations each row used', () => {
    const result = withChoices({ i: 'variable' }, 'e+i', 'p_2', '\\pi', 'x');
    expect(result.map((r) => Object.fromEntries(r.interpretations))).toEqual([
      { e: 'euler', i: 'variable' },
      { p: 'primes' },
      { '\\pi': 'pi' },
      {},
    ]);
  });
});
