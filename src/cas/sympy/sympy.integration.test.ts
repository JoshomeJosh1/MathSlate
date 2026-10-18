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
