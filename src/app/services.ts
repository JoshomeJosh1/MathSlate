import { useSyncExternalStore } from 'react';
import { CasRouter } from '../cas/router';
import { SympyBackend } from '../cas/sympy/SympyBackend';
import type { BackendStatus } from '../cas/types';
import { Engine, type EngineSnapshot } from '../core/engine';
import { docStore } from '../document/docStore';

/**
 * App-wide singletons: the CAS backends behind a router, and the evaluation engine fed by the
 * document store. Backends register here (preferred first).
 */
export const sympy = new SympyBackend();
export const cas = new CasRouter([sympy]);
export const engine = new Engine(cas);

engine.update(docStore.get());
docStore.subscribe(() => {
  engine.update(docStore.get());
});
void cas.init().catch(() => undefined);

export function useEngine(): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

let statusSnapshot: BackendStatus = cas.status();
const subscribeStatus = (listener: () => void) =>
  cas.onStatusChange(() => {
    statusSnapshot = cas.status();
    listener();
  });

export function useCasStatus(): BackendStatus {
  return useSyncExternalStore(subscribeStatus, () => statusSnapshot);
}
