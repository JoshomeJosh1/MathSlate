import { describe, expect, it } from 'vitest';
import { Engine, type OutputView } from '../../core/engine';
import { addOutput, emptyDoc, insertRowAfter, type Doc } from '../../document/model';
import type { CasValue } from '../types';
import { NerdamerBackend } from './NerdamerBackend';
import { runNerdamerJob } from './run';
import type { NerdamerJob } from './serialize';

/** End to end through the real engine, with Nerdamer running in-process (it is pure JS). */

function backend(): NerdamerBackend {
  return new NerdamerBackend({
    init: () => Promise.resolve(),
    run: (code) => Promise.resolve(JSON.stringify(runNerdamerJob(JSON.parse(code) as NerdamerJob))),
    reset: () => undefined,
  });
}

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

async function last(rows: (string | [string, ...string[]])[]): Promise<string[]> {
  const doc = makeDoc(rows);
  const engine = new Engine(backend(), { debounceMs: 0 });
  engine.update(doc);
  await engine.settled();
  const row = doc.rows.at(-1);
  const view = row ? engine.getSnapshot().rows.get(row.id) : undefined;
  if (view?.error) return [`!${view.error.message}`];
  return (view?.outputs ?? []).map((o: OutputView) => {
    const body = o.state === 'error' ? `!${o.error ?? ''}` : show(o.value);
    return o.commandId === 'auto' ? body : `${o.commandId}: ${body}`;
  });
}

describe('units, through Nerdamer', () => {
  it('computes with units and shows the answer in a unit the row used', async () => {
    expect(await last(['5\\unit{km}+300\\unit{m}'])).toEqual(['5.3\\unit{km}']);
    expect(await last(['5\\left[km\\right]+300\\left[m\\right]'])).toEqual(['5.3\\unit{km}']);
    expect(await last(['m=70\\unit{kg}', 'm\\cdot9.81\\unit{m/s^{2}}'])).toEqual([
      '686.7\\unit{N}',
    ]);
    expect(
      await last(['\\mathrm{speed}=12\\unit{km/h}', '\\mathrm{speed}\\cdot30\\unit{min}']),
    ).toEqual(['6\\unit{km}']);
  });

  it('converts with →', async () => {
    expect(await last(['5\\unit{km}\\to\\unit{m}'])).toEqual(['5000\\unit{m}']);
    expect(await last(['1\\unit{au}\\to\\unit{km}'])).toEqual(['149597870.7\\unit{km}']);
    expect(await last(['1\\unit{ly}\\to\\unit{Pm}'])).toEqual(['9.4607304725808\\unit{Pm}']);
    // A parsec is exactly 648000/π au.
    expect(await last(['1\\unit{pc}\\to\\unit{au}'])).toEqual([
      '648000\\pi^{-1}\\unit{au} ≈ 206264.806247096\\unit{au}',
    ]);
    // A unit on its own is one of it.
    expect(await last(['\\left[in\\right]\\to\\left[mm\\right]'])).toEqual(['25.4\\unit{mm}']);
    expect(await last(['d=2\\unit{h}\\cdot 30\\unit{km/h}\\to\\unit{mi}'])).toEqual([
      '37.28227153424\\unit{mi}',
    ]);
  });

  it('rejects mismatched units', async () => {
    expect(await last(['5\\unit{m}+2\\unit{s}'])).toEqual(["!Can't add m and s"]);
    expect(await last(['5\\unit{m}\\to\\unit{s}'])).toEqual(["!Can't convert m to s"]);
    // Brackets after a value must hold a unit.
    expect(await last(['3\\left[x\\right]'])).toEqual([
      '!Square brackets hold a unit, e.g. 5[km]; use ( ) to group',
    ]);
  });
});

describe('ans and out_k', () => {
  it('ans is the nearest result above', async () => {
    expect(await last(['2+3', 'ans\\cdot2'])).toEqual(['10']);
    // A hidden automatic result counts (x²+1 adds nothing, but it is still a result).
    expect(await last(['x^2+1', 'ans+1'])).toEqual(['2+x^{2}']);
    // In a definition, ans is the result above the definition's row.
    expect(await last(['3', 'a=ans\\cdot2', '100', 'a+1'])).toEqual(['7']);
  });

  it('out_k is the output labelled k', async () => {
    expect(await last([['x^2-1', 'expand'], 'x+1', 'out_1+1'])).toEqual(['x^{2}']);
  });

  it('ans and out cannot be redefined', async () => {
    expect(await last(['ans=5'])).toEqual(['!"ans" is the result above; use another name']);
    expect(await last(['out_1=5'])).toEqual(['!"out" refers to outputs (out_3); use another name']);
    expect(await last(['ans=5', '7', 'ans+1'])).toEqual(['8']);
  });

  it('explains what cannot be used', async () => {
    expect(await last(['ans+1'])).toEqual(['!There is no result above this row for ans to use']);
    expect(await last(['1', 'out_9'])).toEqual(['!There is no out_9']);
    expect(await last(['out_x'])).toEqual(['!out needs the number of an output: out_3']);
  });
});

describe('matrices through Nerdamer', () => {
  it('shows a 1×1 matrix as a number', async () => {
    expect(
      await last(['\\begin{pmatrix}1&2&3\\end{pmatrix}\\begin{pmatrix}4\\\\5\\\\6\\end{pmatrix}']),
    ).toEqual(['32']);
  });
});

describe('Nerdamer backend end to end', () => {
  it('evaluates exactly, with decimals', async () => {
    expect(await last(['\\frac13+\\frac16'])).toEqual(['\\frac{1}{2}']);
    expect(await last(['\\sqrt{72}'])).toEqual(['6\\sqrt{2} ≈ 8.48528137423857']);
    expect(await last(['e^{i\\pi}+1'])).toEqual(['0']);
    expect(await last(['2^{100}'])).toEqual(['1267650600228229401496703205376']);
  });

  it('inlines constants, functions and closed-form sequences', async () => {
    expect(await last(['a=123', 'a+1'])).toEqual(['124']);
    expect(await last(['f(x)=x^2+1', 'f(3)'])).toEqual(['10']);
    expect(await last(['g(x,y)=xy+1', 'g(2,3)'])).toEqual(['7']);
    expect(await last(['speed=3', 't=4', 'speed\\cdot t'])).toEqual(['12']);
    expect(await last(['b_n=n^2', 'b_7'])).toEqual(['49']);
    expect(await last(['x=3', 'f(x)=x^2', 'f(2)'])).toEqual(['4']); // parameter shadows x = 3
  });

  it('runs algebra commands', async () => {
    expect(await last([['x^3-6x^2+11x-6', 'factor']])).toEqual([
      'factor: \\left(x-3\\right)\\left(x-2\\right)\\left(x-1\\right)',
    ]);
    expect(await last([['\\left(x+1\\right)^3', 'expand']])).toEqual(['expand: 1+3x+3x^{2}+x^{3}']);
    expect(await last([['\\frac{x^2-1}{x-1}', 'simplify']])).toEqual(['simplify: 1+x']);
    expect(await last([['x^2-5x+6=0', 'solve']])).toEqual(['solve: {3, 2}']);
  });

  it('does calculus', async () => {
    expect(await last(['\\int x\\exponentialE^{x}\\,dx'])).toEqual([
      '\\exponentialE^{x}\\left(x-1\\right)',
    ]);
    expect(await last(['\\int_0^1x^2\\,dx'])).toEqual(['0.3333333333333333']);
    expect(await last(['\\frac{d}{dx}x^2\\sin x'])).toEqual([
      '2x\\sin\\left(x\\right)+x^{2}\\cos\\left(x\\right)',
    ]);
    expect(await last(['\\lim_{x\\to0}\\frac{\\sin x}{x}'])).toEqual(['1']);
    expect(await last(['\\sum_{k=1}^{10}k^2'])).toEqual(['385']);
  });

  it('declines what it cannot do, so SymPy can take over', async () => {
    expect(await last(['u_n=u_{n-1}+3', 'u_1=2', 'u_{10}'])).toEqual([
      '!The recursive sequence "u" needs the SymPy backend',
    ]);
    expect(await last(['p_{10}'])).toEqual(['!The sequence "p" needs the SymPy backend']);
    expect(await last(['\\int\\exponentialE^{-x^2}dx'])).toEqual([
      '!Nerdamer could not compute this',
    ]);
    expect(await last([['360', 'factor']])).toEqual(['factor: !Integer factorisation needs SymPy']);
  });
});
