import { describe, expect, it } from 'vitest';
import { analyzeRows } from '../core/analyze';
import { buildDependencies } from '../core/deps';
import { commands } from '../registries/commands';
import { exampleDoc } from './examples';

describe('example slate', () => {
  const doc = exampleDoc();
  const math = doc.rows.filter((r) => r.kind !== 'note');
  const analyses = analyzeRows(math.map((r) => ({ id: r.id, latex: r.latex })));
  const deps = buildDependencies(analyses);

  it('only has the intended errors', () => {
    const errors = analyses
      .map((a, i) => [a.latex, a.error?.message ?? deps.cycles.get(i) ?? null] as const)
      .filter(([, message]) => message !== null);
    expect(errors).toEqual([
      ['b=c+1', 'Circular definition: b → c → b'],
      ['c=b+1', 'Circular definition: b → c → b'],
      ['\\frac{1}{\\placeholder{}}', 'Fill in the empty box'],
    ]);
  });

  it('only attaches registered commands', () => {
    for (const row of doc.rows) {
      for (const o of row.outputs) expect(commands.has(o.commandId)).toBe(true);
    }
  });

  it('gives every attached output a unique label', () => {
    const labels = doc.rows.flatMap((r) => r.outputs.map((o) => o.label));
    expect(new Set(labels).size).toBe(labels.length);
    expect(doc.nextOutputLabel).toBe(labels.length + 1);
  });
});
