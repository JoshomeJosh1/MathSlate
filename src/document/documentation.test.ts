import { describe, expect, it } from 'vitest';
import { analyzeRows } from '../core/analyze';
import { buildDependencies } from '../core/deps';
import { nameKey, type Expr, type Statement } from '../parser/ast';
import { commands } from '../registries/commands';
import { builtinFunctions } from '../registries/builtins/functions';
import { builtinSequences } from '../registries/builtins/sequences';
import { interpretations } from '../registries/interpretations';
import { documentationDoc } from './documentation';

/** Everything the documentation demonstrates, collected from the rows' ASTs. */
function collect(statements: Statement[]) {
  const seen = { calls: new Set<string>(), sequences: new Set<string>(), kinds: new Set<string>() };
  const visit = (e: Expr): void => {
    seen.kinds.add(e.kind);
    if (e.kind === 'integral')
      seen.kinds.add(e.lower ? 'integral:definite' : 'integral:indefinite');
    if (e.kind === 'limit' && e.direction) seen.kinds.add('limit:one-sided');
    if (e.kind === 'diff')
      seen.kinds.add(e.partial ? 'diff:partial' : `diff:order${Math.min(e.order, 2)}`);
    if (e.kind === 'bigop') seen.kinds.add(`bigop:${e.op}`);
    if (e.kind === 'constant') seen.kinds.add(`constant:${e.id}`);
    if (e.kind === 'call') seen.calls.add(nameKey(e.fn));
    if (e.kind === 'index') seen.sequences.add(nameKey(e.seq));
    for (const child of children(e)) visit(child);
  };
  for (const s of statements) {
    seen.kinds.add(`statement:${s.kind}`);
    if (s.kind === 'expr' || s.kind === 'relation') visit(s.expr);
    else if (s.kind !== 'empty') visit(s.body);
  }
  return seen;
}

function children(e: Expr): Expr[] {
  switch (e.kind) {
    case 'num':
    case 'var':
    case 'constant':
      return [];
    case 'neg':
    case 'factorial':
    case 'abs':
      return [e.arg];
    case 'binary':
      return [e.left, e.right];
    case 'root':
      return e.degree ? [e.arg, e.degree] : [e.arg];
    case 'call':
    case 'derivative':
      return e.args;
    case 'index':
      return [e.index];
    case 'matrix':
      return e.rows.flat();
    case 'list':
      return e.items;
    case 'relation':
      return e.operands;
    case 'integral':
      return [e.integrand, ...(e.lower && e.upper ? [e.lower, e.upper] : [])];
    case 'diff':
      return [e.operand];
    case 'limit':
      return [e.operand, e.point];
    case 'bigop':
      return [e.operand, e.lower, e.upper];
  }
}

describe('documentation slate', () => {
  const doc = documentationDoc();
  const math = doc.rows.filter((r) => r.kind !== 'note');
  const analyses = analyzeRows(math.map((r) => ({ id: r.id, latex: r.latex })));
  const deps = buildDependencies(analyses);
  const statements = analyses.flatMap((a) => (a.statement ? [a.statement] : []));
  const seen = collect(statements);

  it('only has the intended errors', () => {
    const errors = analyses
      .map((a, i) => [a.latex, a.error?.message ?? deps.cycles.get(i) ?? null] as const)
      .filter(([, message]) => message !== null);
    expect(errors).toEqual([
      ['b=c+1', 'Circular definition: b → c → b'],
      ['c=b+1', 'Circular definition: b → c → b'],
      ['\\frac{1}{\\placeholder{}}', 'Fill in the empty box'],
      ['2^3^4', 'Double exponent: use braces, e.g. x^{2^{3}}'],
    ]);
  });

  it('demonstrates every built-in function', () => {
    const missing = [...builtinFunctions.keys()].filter((f) => !seen.calls.has(f));
    expect(missing).toEqual([]);
  });

  it('describes every built-in function in a note', () => {
    const notes = doc.rows.filter((r) => r.kind === 'note').map((r) => r.latex);
    const missing = [...builtinFunctions.keys()].filter(
      (f) => !notes.some((n) => new RegExp(`\\b${f}\\b`).test(n)),
    );
    expect(missing).toEqual([]);
  });

  it('demonstrates every built-in sequence', () => {
    const missing = [...builtinSequences.keys()].filter((s) => !seen.sequences.has(s));
    expect(missing).toEqual([]);
  });

  it('demonstrates every symbol interpretation (constants and built-in sequences)', () => {
    const used = new Set(analyses.flatMap((a) => [...a.interpretations.keys()]));
    const missing = interpretations.map((i) => i.symbol).filter((s) => !used.has(s));
    expect(missing).toEqual([]);
    for (const id of ['pi', 'e', 'i', 'infinity']) expect(seen.kinds).toContain(`constant:${id}`);
  });

  it('demonstrates every command', () => {
    const attached = new Set(doc.rows.flatMap((r) => r.outputs.map((o) => o.commandId)));
    const missing = [...commands.keys()].filter((c) => !attached.has(c));
    expect(missing).toEqual([]);
  });

  it('demonstrates every kind of expression and statement', () => {
    const required = [
      'statement:defConst',
      'statement:defFunc',
      'statement:defSeq',
      'statement:defSeqBase',
      'statement:relation',
      'statement:expr',
      'integral:indefinite',
      'integral:definite',
      'diff:order1',
      'diff:order2',
      'diff:partial',
      'limit',
      'limit:one-sided',
      'bigop:sum',
      'bigop:prod',
      'derivative',
      'matrix',
      'list',
      'abs',
      'root',
      'factorial',
      'index',
    ];
    expect(required.filter((k) => !seen.kinds.has(k))).toEqual([]);
  });

  it('has notes explaining it', () => {
    expect(doc.rows.filter((r) => r.kind === 'note').length).toBeGreaterThan(20);
  });

  it('gives every attached output a unique label', () => {
    const labels = doc.rows.flatMap((r) => r.outputs.map((o) => o.label));
    expect(new Set(labels).size).toBe(labels.length);
    expect(doc.nextOutputLabel).toBe(labels.length + 1);
  });
});
