import { useSyncExternalStore } from 'react';
import { NerdamerBackend } from '../cas/nerdamer/NerdamerBackend';
import { CasRouter } from '../cas/router';
import { SympyBackend } from '../cas/sympy/SympyBackend';
import type { BackendStatus } from '../cas/types';
import { Engine, type EngineSnapshot } from '../core/engine';
import { docStore } from '../document/docStore';

/**
 * App-wide singletons: the CAS backends behind a router, and the evaluation engine fed by the
 * document store. Backends register here in default preference order: SymPy is the most capable;
 * Nerdamer loads instantly and answers (provisionally) while SymPy is still loading.
 */
export const sympy = new SympyBackend();
export const nerdamer = new NerdamerBackend();
export const cas = new CasRouter([sympy, nerdamer]);
export const engine = new Engine(cas);

let preferred: string | null = null;
const sync = () => {
  const doc = docStore.get();
  const next = doc.preferredBackend ?? null;
  if (next !== preferred) {
    preferred = next;
    cas.setPreferred(next);
    engine.invalidate();
  }
  engine.update(doc);
};
sync();
docStore.subscribe(sync);
void cas.init().catch(() => undefined);

export function useEngine(): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

export interface BackendView {
  id: string;
  name: string;
  status: BackendStatus;
}

const snapshotBackends = (): BackendView[] =>
  cas.list().map((b) => ({ id: b.id, name: b.name, status: b.status() }));
let backendsSnapshot = snapshotBackends();
const subscribeBackends = (listener: () => void) =>
  cas.onStatusChange(() => {
    backendsSnapshot = snapshotBackends();
    listener();
  });

/** Each CAS backend with its loading status, in current preference order. */
export function useBackends(): BackendView[] {
  return useSyncExternalStore(subscribeBackends, () => backendsSnapshot);
}
