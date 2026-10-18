import { useSyncExternalStore } from 'react';

/**
 * Minimal external store. React subscribes via useSyncExternalStore; non-React code (the
 * evaluation engine, persistence) can subscribe directly.
 */
export interface Store<T> {
  get: () => T;
  set: (update: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const next = typeof update === 'function' ? (update as (prev: T) => T)(state) : update;
      if (Object.is(next, state)) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
