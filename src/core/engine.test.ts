import { describe, expect, it } from 'vitest';
import type { CasBackend, CasRequest, CasResult } from '../cas/types';
import { emptyDoc, insertRowAfter, type Doc } from '../document/model';
import { Engine, type OutputView } from './engine';

/** A fake CAS that answers instantly and records what it was asked, in order. */
function fakeCas(log: string[]): CasBackend {
  return {
    id: 'fake',
    name: 'Fake',
    status: () => ({ state: 'ready' }),
    onStatusChange: () => () => undefined,
    init: () => Promise.resolve(),
    supports: () => true,
    run: (request: CasRequest): Promise<CasResult> => {
      const quick = request.operation.op === 'evaluate' && request.operation.numericIntegrals;
      log.push(quick ? 'quick' : 'exact');
      return Promise.resolve({
        ok: true,
        backend: 'fake',
        value: {
          kind: 'expr',
          expr: null,
          latex: quick ? '0.333' : '\\frac{1}{3}',
          numeric: null,
        },
      });
    },
  };
}

function docOf(...latex: string[]): Doc {
  let doc: Doc = { ...emptyDoc(), rows: [] };
  for (const l of latex) doc = insertRowAfter(doc, null, l).doc;
  return doc;
}

describe('engine: definite integrals in two passes', () => {
  it('shows a quick numeric value first, then replaces it with the exact one', async () => {
    const log: string[] = [];
    const engine = new Engine(fakeCas(log), { debounceMs: 0 });
    const doc = docOf('\\int_0^1x^2\\,dx');
    const seen: OutputView[] = [];
    engine.subscribe(() => {
      const out = engine.getSnapshot().rows.get(doc.rows[0]?.id ?? '')?.outputs[0];
      if (out?.state === 'ok') seen.push(out);
    });
    engine.update(doc);
    await engine.settled();
    expect(
      seen.map((o) => [o.value?.kind === 'expr' ? o.value.latex : '?', o.refining ?? false]),
    ).toEqual([
      ['0.333', true],
      ['\\frac{1}{3}', false],
    ]);
  });

  it('runs every quick pass before any slow exact pass', async () => {
    const log: string[] = [];
    const engine = new Engine(fakeCas(log), { debounceMs: 0 });
    engine.update(docOf('\\int_0^1x\\,dx', '\\int_0^2x\\,dx', '1+1'));
    await engine.settled();
    expect(log).toEqual(['quick', 'quick', 'exact', 'exact', 'exact']);
  });

  it('gives other rows no quick pass', async () => {
    const log: string[] = [];
    const engine = new Engine(fakeCas(log), { debounceMs: 0 });
    engine.update(docOf('\\int x\\,dx', '\\frac{d}{dx}x^2'));
    await engine.settled();
    expect(log).toEqual(['exact', 'exact']);
  });
});
