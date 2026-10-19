import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, type OutputView } from '../../core/engine';
import { addOutput, emptyDoc, insertRowAfter, type Doc } from '../../document/model';
import type { CasValue } from '../types';
import { createSession, type RunProgram } from './session';
import { SympyBackend } from './SympyBackend';

/**
 * End-to-end: LaTeX rows → analysis → engine → serializer → real SymPy (Pyodide in Node) →
 * result tree → AST → LaTeX. Run with `npm run test:integration` (downloads SymPy once).
 */

let run: RunProgram;

beforeAll(async () => {
  const py = await loadPyodide({ stdout: () => undefined, stderr: () => undefined });
  run = await createSession(py);
}, 120_000);

function backend(): SympyBackend {
  return new SympyBackend({
    init: () => Promise.resolve(),
    run: (code) => Promise.resolve(run(code)),
    reset: () => undefined,
  });
}

/** Builds a document; `rows` entries are latex or [latex, ...commandIds]. */
function makeDoc(rows: (string | [string, ...string[]])[]): Doc {
  let doc: Doc = { ...emptyDoc(), rows: [] };
  for (const r of rows) {
    const [latex, ...commandIds] = Array.isArray(r) ? r : [r];
    const inserted = insertRowAfter(doc, null, latex);
    doc = inserted.doc;
    for (const c of commandIds) doc = addOutput(doc, inserted.id, c);
  }
  return doc;
}

function show(v: CasValue | undefined): string {
  if (!v) return '?';
  switch (v.kind) {
    case 'expr':
      return v.numeric ? `${v.latex} ≈ ${v.numeric.latex}` : v.latex;
    case 'solutions':
      return `{${v.solutions.map((s) => s.latex).join(', ')}}`;
    case 'boolean':
      return String(v.value);
  }
}

function render(o: OutputView): string {
  const body = o.state === 'error' ? `!${o.error ?? ''}` : show(o.value);
  return o.commandId === 'auto' ? body : `${o.commandId}: ${body}`;
}

/** Runs the document through the engine and returns each row's outputs. */
async function outputs(rows: (string | [string, ...string[]])[]): Promise<string[][]> {
  const doc = makeDoc(rows);
  const engine = new Engine(backend(), { debounceMs: 0 });
  engine.update(doc);
  await engine.settled();
  const snapshot = engine.getSnapshot();
  return doc.rows.map((r) => {
    const view = snapshot.rows.get(r.id);
    if (view?.error) return [`!${view.error.message}`];
    return view?.outputs.map(render) ?? [];
  });
}

async function last(rows: (string | [string, ...string[]])[]): Promise<string[]> {
  return (await outputs(rows)).at(-1) ?? [];
}

describe('SymPy backend end to end', { timeout: 60_000 }, () => {
  it('evaluates arithmetic exactly, with decimals', async () => {
    expect(await last(['\\frac13+\\frac16'])).toEqual(['\\frac{1}{2} ≈ 0.5']);
    expect(await last(['2^{10}'])).toEqual(['1024']);
    expect(await last(['\\sqrt8'])).toEqual(['2\\sqrt{2} ≈ 2.82842712474619']);
    expect(await last(['0.1+0.2'])).toEqual(['\\frac{3}{10} ≈ 0.3']);
  });

  it('hides results that just repeat the input', async () => {
    expect(await last(['x^2+1'])).toEqual([]);
    expect(await last(['5'])).toEqual([]);
  });

  it('substitutes definitions across rows', async () => {
    expect(await outputs(['a=123', 'a+1'])).toEqual([[], ['124']]);
    expect(await outputs(['f(x)=x^2+1', 'f(3)', 'f(a+1)'])).toEqual([
      [],
      ['10'],
      ['\\left(a+1\\right)^{2}+1'],
    ]);
    expect(await last(['g(x,y)=xy+1', 'g(2,3)'])).toEqual(['7']);
    expect(await last(['speed=3', 't=4', 'speed\\cdot t'])).toEqual(['12']);
  });

  it('evaluates sequences, recursive and built in', async () => {
    expect(await last(['a_n=a_{n-1}+2', 'a_1=1', 'a_{10}'])).toEqual(['19']);
    expect(await last(['b_n=n^2', 'b_7'])).toEqual(['49']);
    expect(await last(['F_n=F_{n-1}+F_{n-2}', 'F_0=0', 'F_1=1', 'F_{30}'])).toEqual(['832040']);
    expect(await last(['p_{100}'])).toEqual(['541']);
    expect(await last(['F_{20}'])).toEqual(['6765']); // built-in Fibonacci interpretation
    expect(await last(['c_n=c_{n-1}\\cdot2', 'c_0=1', 'c_{500}'])).toHaveLength(1); // deep, no recursion error
  });

  it('runs algebra commands', async () => {
    expect(await last([['x^3-6x^2+11x-6', 'factor']])).toEqual([
      'factor: \\left(x-3\\right)\\left(x-2\\right)\\left(x-1\\right)',
    ]);
    expect(await last([['\\left(x+1\\right)^3', 'expand']])).toEqual(['expand: x^{3}+3x^{2}+3x+1']);
    expect(await last([['360', 'factor']])).toEqual(['factor: 2^{3}\\cdot 3^{2}\\cdot 5']);
    expect(await last([['\\frac{x^2-1}{x-1}', 'simplify']])).toEqual(['simplify: x+1']);
  });

  it('solves equations and inequalities', async () => {
    expect(await last([['x^2-5x+6=0', 'solve']])).toEqual(['solve: {2, 3}']);
    expect(await last([['x^2<4', 'solve']])).toEqual(['solve: -2<x<2']);
    expect(await last([['\\sin x=\\frac12', 'solve']])).toEqual([
      'solve: {\\frac{\\pi}{6}, \\frac{5\\pi}{6}}',
    ]);
  });

  it('does calculus', async () => {
    expect(await last([['x^2\\sin x', 'derivative']])).toEqual([
      'derivative: x^{2}\\cos\\left(x\\right)+2x\\sin\\left(x\\right)',
    ]);
    expect(await last([['f(x)=x\\exponentialE^{x}', 'integrate']])).toEqual([
      'integrate: \\left(x-1\\right)\\exponentialE^{x}',
    ]);
    expect(await last([['\\frac{\\sin x}{x}', 'limit']])).toEqual(['limit: 1']);
    expect(await last([['\\exponentialE^{x}', 'series']])).toEqual([
      'series: \\frac{x^{5}}{120}+\\frac{x^{4}}{24}+\\frac{x^{3}}{6}+\\frac{x^{2}}{2}+x+1',
    ]);
  });

  it('reports errors and cycles on the right rows', async () => {
    expect(await outputs(['a=b+1', 'b=a+1'])).toEqual([
      ['!Circular definition: a → b → a'],
      ['!Circular definition: a → b → a'],
    ]);
    expect(await outputs(['a=1+', 'a+1'])).toEqual([['!Missing operand after "+"'], []]);
    expect(await last(['\\frac{1}{0}'])).toHaveLength(1);
  });

  it('produces LaTeX our parser can read back (for promoting outputs)', async () => {
    const results = await outputs([['\\left(x+2\\right)^4', 'expand', 'factor', 'derivative']]);
    for (const line of results[0] ?? []) expect(line).not.toContain('!');
  });
});

describe('matrices and vectors with SymPy', { timeout: 60_000 }, () => {
  const M = 'M=\\left\\lbrack1,2;3,4\\right\\rbrack';
  it('computes determinants, transposes, traces and ranks', async () => {
    expect(await last([M, '\\det M'])).toEqual(['-2']);
    expect(await last([M, '\\left|M\\right|'])).toEqual(['-2']);
    expect(await last([M, 'M^{T}'])).toEqual(['\\begin{bmatrix}1&3\\\\2&4\\end{bmatrix}']);
    expect(await last([M, '\\tr M'])).toEqual(['5']);
    expect(await last(['\\rank\\left\\lbrack1,2;2,4\\right\\rbrack'])).toEqual(['1']);
    expect(await last(['T=2', 'x^{T}'])).toEqual(['x^{2}']); // T stays a variable
  });

  it('computes dot and cross products and lengths', async () => {
    const u = 'u=\\left\\lbrack1,2,3\\right\\rbrack';
    const w = 'w=\\left\\lbrack4,5,6\\right\\rbrack';
    expect(await last([u, w, 'u\\cdot w'])).toEqual(['32']);
    expect(await last([u, w, 'u\\times w'])).toEqual([
      '\\begin{bmatrix}-3\\\\6\\\\-3\\end{bmatrix}',
    ]);
    expect(await last([u, '\\left|u\\right|'])).toEqual(['\\sqrt{14} ≈ 3.74165738677394']);
    expect(await last(['2\\cdot3'])).toEqual(['6']); // still multiplication
  });

  it('finds eigenvalues and eigenvectors, row reduces, and runs matrix commands', async () => {
    const D = '\\left\\lbrack2,0;0,3\\right\\rbrack';
    expect(await last([`\\eigenvalues\\left(${D}\\right)`])).toEqual(['\\left(2,3\\right)']);
    expect(await last([`\\eigenvectors\\left(${D}\\right)`])).toEqual([
      '\\left(\\left(2,\\begin{bmatrix}1\\\\0\\end{bmatrix}\\right),\\left(3,\\begin{bmatrix}0\\\\1\\end{bmatrix}\\right)\\right)',
    ]);
    const A = '\\left\\lbrack1,2,3;4,5,6\\right\\rbrack';
    expect(await last([`\\rref\\left(${A}\\right)`])).toEqual([
      '\\begin{bmatrix}1&0&-1\\\\0&1&2\\end{bmatrix}',
    ]);
    expect(await last([`\\nullspace\\left(${A}\\right)`])).toEqual([
      '\\left(\\begin{bmatrix}1\\\\-2\\\\1\\end{bmatrix}\\right)',
    ]);
    expect(await last([M, ['M', 'det', 'inverse', 'rank']])).toEqual([
      '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}',
      'det: -2',
      'inverse: \\begin{bmatrix}-2&1\\\\\\frac{3}{2}&-\\frac{1}{2}\\end{bmatrix}',
      'rank: 2',
    ]);
    expect(await last(['\\inverse\\left(\\left\\lbrack1,2;2,4\\right\\rbrack\\right)'])).toEqual([
      '!The matrix is not invertible (its determinant is 0)',
    ]);
  });

  it('treats a 1×1 matrix as a number', async () => {
    const v = 'v=\\left\\lbrack1,2,3\\right\\rbrack';
    expect(await last([v, 'v^{T}v'])).toEqual(['14']);
    expect(await last([v, 'v^{T}v+1'])).toEqual(['15']);
    expect(await last([v, 's=v^{T}v', 's+1'])).toEqual(['15']);
    expect(await last(['\\begin{bmatrix}7\\end{bmatrix}'])).toEqual(['7']);
  });

  it('explains mistakes', async () => {
    expect(await last(['\\det\\left\\lbrack1,2,3\\right\\rbrack'])).toEqual([
      '!The determinant needs a square matrix, not 3×1',
    ]);
    expect(
      await last(['\\left\\lbrack1,2;3,4\\right\\rbrack\\left\\lbrack1,2,3\\right\\rbrack']),
    ).toEqual([
      '!The matrix sizes do not fit: a product needs as many columns on the left as rows on the right, a sum the same size',
    ]);
  });
});

describe('units with SymPy', { timeout: 60_000 }, () => {
  it('computes, converts and checks units', async () => {
    expect(await last(['5\\unit{km}+300\\unit{m}'])).toEqual(['5.3\\unit{km}']);
    expect(await last(['m=70\\unit{kg}', 'm\\cdot9.81\\unit{m/s^{2}}'])).toEqual([
      '686.7\\unit{N}',
    ]);
    expect(await last(['60\\unit{mi}\\to\\unit{km}'])).toEqual(['96.56064\\unit{km}']);
    expect(await last(['\\sqrt{9\\unit{m^{2}}}'])).toEqual(['3\\unit{m}']);
    expect(await last(['x\\unit{m}+2\\unit{m}'])).toEqual(['\\left(x+2\\right)\\unit{m}']);
    expect(await last(['5\\unit{m}+2\\unit{s}'])).toEqual(["!Can't add m and s"]);
    const v = 'v=\\left\\lbrack3\\unit{m},4\\unit{m}\\right\\rbrack';
    expect(await last([v, '2v'])).toEqual(['\\begin{bmatrix}6\\\\8\\end{bmatrix}\\unit{m}']);
    expect(await last([v, '\\left|v\\right|'])).toEqual(['5\\unit{m}']);
    expect(await last([['3x\\unit{m}=12\\unit{m}', 'solve']])).toEqual(['solve: {4}']);
  });
});

describe('calculus notation end to end', { timeout: 60_000 }, () => {
  it('integrates: indefinite symbolically, definite exactly when possible', async () => {
    expect(await last(['\\int x^2\\,dx'])).toEqual(['\\frac{x^{3}}{3}']);
    expect(await last(['\\int x\\exponentialE^{x}\\,dx'])).toEqual([
      '\\left(x-1\\right)\\exponentialE^{x}',
    ]);
    // Exact value (elementary closed form) with its decimal.
    expect(await last(['\\int_0^1x^2\\,dx'])).toEqual(['\\frac{1}{3} ≈ 0.333333333333333']);
    expect(await last(['\\int_0^{\\infty}\\exponentialE^{-x^2}dx'])).toEqual([
      '\\frac{\\sqrt{\\pi}}{2} ≈ 0.886226925452758',
    ]);
    expect(await last(['\\int_0^{\\pi}x\\sin x\\,dx'])).toEqual(['\\pi ≈ 3.14159265358979']);
    // Special-function closed forms are exact too.
    expect(await last(['\\int_0^1\\sin\\left(x^2\\right)dx'])).toEqual([
      '\\frac{\\sqrt{2}\\sqrt{\\pi}\\operatorname{S}\\left(\\frac{\\sqrt{2}}{\\sqrt{\\pi}}\\right)}{2} ≈ 0.310268301723381',
    ]);
    // No closed form at all: the number.
    expect(await last(['\\int_0^1\\exponentialE^{x}\\tan x\\,dx'])).toHaveLength(1);
    // Symbolic bounds or parameters: exact.
    expect(await last(['\\int_0^ax\\,dx'])).toEqual(['\\frac{a^{2}}{2}']);
  });

  it('keeps the variable bound inside the operator', async () => {
    expect(await outputs(['x=3', '\\int x^2\\,dx', '\\frac{d}{dx}x^3'])).toEqual([
      [],
      ['\\frac{x^{3}}{3}'],
      ['3x^{2}'],
    ]);
    expect(await last(['a=2', '\\int_0^ax\\,dx'])).toEqual(['2']);
  });

  it('differentiates, takes limits, sums and multiplies', async () => {
    expect(await last(['\\frac{d}{dx}x^2\\sin x'])).toEqual([
      'x^{2}\\cos\\left(x\\right)+2x\\sin\\left(x\\right)',
    ]);
    expect(await last(['\\frac{d^2}{dx^2}x^5'])).toEqual(['20x^{3}']);
    expect(await last(['\\frac{\\partial}{\\partial y}x^2y^3'])).toEqual(['3x^{2}y^{2}']);
    expect(await last(['f(x)=x^3', '\\frac{d}{dx}f(x)'])).toEqual(['3x^{2}']);
    expect(await last(['\\lim_{x\\to0}\\frac{\\sin x}{x}'])).toEqual(['1']);
    expect(await last(['\\lim_{x\\to\\infty}\\left(1+\\frac1x\\right)^x'])).toEqual([
      '\\exponentialE ≈ 2.71828182845905',
    ]);
    expect(await last(['\\lim_{x\\to0^{+}}\\frac1x'])).toEqual(['\\infty']);
    expect(await last(['\\sum_{k=1}^{n}k'])).toEqual(['\\frac{n^{2}}{2}+\\frac{n}{2}']);
    expect(await last(['\\sum_{k=1}^{100}k'])).toEqual(['5050']);
    expect(await last(['\\sum_{n=1}^{\\infty}\\frac{1}{n^2}'])).toEqual([
      '\\frac{\\pi^{2}}{6} ≈ 1.64493406684823',
    ]);
    expect(await last(['\\prod_{k=1}^{5}k'])).toEqual(['120']);
  });
});

describe('special functions with SymPy', { timeout: 60_000 }, () => {
  it('evaluates them exactly, with decimals', async () => {
    expect(await last(['\\Gamma\\left(5\\right)+\\Gamma\\left(\\frac12\\right)'])).toEqual([
      '\\sqrt{\\pi}+24 ≈ 25.7724538509055',
    ]);
    expect(await last(['\\zeta\\left(2\\right)'])).toEqual([
      '\\frac{\\pi^{2}}{6} ≈ 1.64493406684823',
    ]);
    expect(await last(['Beta(2,3)'])).toEqual(['\\frac{1}{12} ≈ 0.0833333333333333']);
    expect(await last(['Li_2(1)'])).toEqual(['\\frac{\\pi^{2}}{6} ≈ 1.64493406684823']);
    expect(await last(['ellipticK(0)+ellipticE(0)'])).toEqual(['\\pi ≈ 3.14159265358979']);
  });

  it('shows special functions in results, in conventional notation, re-parseable', async () => {
    expect(await last(['\\int\\frac{\\sin x}{x}dx'])).toEqual([
      '\\operatorname{Si}\\left(x\\right)',
    ]);
    expect(await last(['\\int_0^1\\exponentialE^{-x^2}dx'])).toEqual([
      '\\frac{\\sqrt{\\pi}\\operatorname{erf}\\left(1\\right)}{2} ≈ 0.746824132812427',
    ]);
    expect(await last(['\\int\\frac{\\ln\\left(1-x\\right)}{x}dx'])).toEqual([
      '-\\operatorname{Li}_{2}\\left(x\\right)',
    ]);
    expect(await last(['LambertW(1)'])).toEqual([
      '\\operatorname{W}\\left(1\\right) ≈ 0.567143290409784',
    ]);
  });

  it('shows rarer functions with SymPy notation', async () => {
    const [hyper] = await last(['\\int_0^1\\sqrt{1+x^3}\\,dx']);
    expect(hyper).toContain('{}_{2}F_{1}');
    expect(hyper).toContain('≈ 1.11144');
    // ψ(1) = −γ (Euler–Mascheroni constant), shown with SymPy's notation.
    const [eulerGamma] = await last(['\\psi\\left(1\\right)']);
    expect(eulerGamma).toContain('\\gamma');
    expect(eulerGamma).toContain('≈ -0.577215664901533');
  });
});

describe('documentation slate with SymPy', { timeout: 120_000 }, () => {
  it('computes every row without a CAS error', async () => {
    const { documentationDoc } = await import('../../document/documentation');
    const doc = documentationDoc();
    const engine = new Engine(backend(), { debounceMs: 0 });
    engine.update(doc);
    await engine.settled();
    const snapshot = engine.getSnapshot();
    const failures = doc.rows.flatMap((row) =>
      (snapshot.rows.get(row.id)?.outputs ?? [])
        .filter((o) => o.state !== 'ok')
        .map((o) => `${row.latex} [${o.commandId}]: ${o.state} ${o.error ?? ''}`),
    );
    // The units folder demonstrates this error on purpose.
    expect(failures).toEqual(["5\\unit{m}+2\\unit{s} [auto]: error Can't add m and s"]);
  });
});
