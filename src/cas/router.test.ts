import { describe, expect, it } from 'vitest';
import { CasRouter } from './router';
import type { BackendStatus, CasBackend, CasOpName, CasRequest, CasResult } from './types';

const request: CasRequest = {
  operation: { op: 'evaluate' },
  target: { kind: 'num', value: '1', span: { start: 0, end: 0 } },
  env: [],
};

/** A fake backend that is ready (or not) and either answers or fails. */
function fake(
  id: string,
  opts: { ready: boolean; fails?: boolean; ops?: CasOpName[] },
): CasBackend {
  let state: BackendStatus = { state: opts.ready ? 'ready' : 'loading' };
  return {
    id,
    name: id,
    status: () => state,
    onStatusChange: () => () => undefined,
    init: () => {
      state = { state: 'ready' };
      return Promise.resolve();
    },
    supports: (op) => (opts.ops ?? ['evaluate']).includes(op),
    run: (): Promise<CasResult> =>
      Promise.resolve(
        opts.fails
          ? { ok: false, error: `${id} cannot`, backend: id }
          : { ok: true, value: { kind: 'boolean', value: true }, backend: id },
      ),
  };
}

describe('CasRouter', () => {
  it('uses the preferred backend when it is ready', async () => {
    const r = new CasRouter([fake('a', { ready: true }), fake('b', { ready: true })]);
    expect(await r.run(request)).toMatchObject({ ok: true, backend: 'a' });
    r.setPreferred('b');
    expect(await r.run(request)).toMatchObject({ ok: true, backend: 'b' });
  });

  it('answers provisionally from a ready backend while the preferred one loads', async () => {
    const r = new CasRouter([fake('a', { ready: false }), fake('b', { ready: true })]);
    expect(await r.run(request)).toMatchObject({ ok: true, backend: 'b', provisional: true });
  });

  it('marks failures provisional too while the preferred backend loads', async () => {
    const r = new CasRouter([fake('a', { ready: false }), fake('b', { ready: true, fails: true })]);
    expect(await r.run(request)).toMatchObject({ ok: false, provisional: true });
  });

  it('falls back to the next ready backend when the preferred one cannot do it', async () => {
    const r = new CasRouter([fake('a', { ready: true, fails: true }), fake('b', { ready: true })]);
    const result = await r.run(request);
    expect(result).toMatchObject({ ok: true, backend: 'b', fallback: true });
    expect(result).not.toHaveProperty('provisional');
  });

  it('reports the preferred backend’s failure when no one can do it', async () => {
    const r = new CasRouter([
      fake('a', { ready: true, fails: true }),
      fake('b', { ready: true, fails: true }),
    ]);
    expect(await r.run(request)).toMatchObject({ ok: false, error: 'a cannot' });
  });

  it('skips backends that do not support the operation', async () => {
    const r = new CasRouter([fake('a', { ready: true, ops: [] }), fake('b', { ready: true })]);
    expect(await r.run(request)).toMatchObject({ ok: true, backend: 'b' });
    expect(await new CasRouter([fake('a', { ready: true, ops: [] })]).run(request)).toMatchObject({
      ok: false,
    });
  });

  it('waits for the preferred backend when nothing is ready', async () => {
    const r = new CasRouter([fake('a', { ready: false })]);
    expect(await r.run(request)).toMatchObject({ ok: true, backend: 'a' });
  });
});
