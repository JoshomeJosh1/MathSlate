import type { BackendStatus, CasBackend, CasOpName, CasRequest, CasResult } from './types';

/**
 * Routes each request to the most preferred backend that supports the operation. If that backend
 * is still loading, the best *ready* backend answers instead and the result is marked
 * `provisional`; listeners are notified when backends become ready so callers can re-run.
 */
export class CasRouter implements CasBackend {
  readonly id = 'router';
  readonly name = 'CAS router';
  private readonly listeners = new Set<() => void>();
  private preferred: string | null = null;

  constructor(private readonly backends: readonly CasBackend[]) {
    for (const b of backends)
      b.onStatusChange(() => {
        this.notify();
      });
  }

  /** Puts the backend with this id first in the preference order (null = registration order). */
  setPreferred(id: string | null): void {
    this.preferred = id;
    this.notify();
  }

  list(): readonly CasBackend[] {
    return this.ordered();
  }

  status(): BackendStatus {
    const statuses = this.backends.map((b) => b.status());
    if (statuses.some((s) => s.state === 'ready')) {
      const loading = this.backends.find((b) => b.status().state === 'loading');
      return loading ? { state: 'ready', message: `${loading.name} loading…` } : { state: 'ready' };
    }
    const loading = statuses.find((s) => s.state === 'loading');
    if (loading) return loading;
    const error = statuses.find((s) => s.state === 'error');
    return error ?? { state: 'idle' };
  }

  onStatusChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async init(): Promise<void> {
    // Start everything; resolve as soon as any backend is usable.
    const inits = this.backends.map((b) => b.init());
    await Promise.any(inits).catch(() => undefined);
  }

  supports(op: CasOpName): boolean {
    return this.backends.some((b) => b.supports(op));
  }

  async run(request: CasRequest): Promise<CasResult> {
    const candidates = this.ordered().filter((b) => b.supports(request.operation.op));
    const best = candidates[0];
    if (!best) {
      return {
        ok: false,
        error: `No backend supports "${request.operation.op}"`,
        backend: this.id,
      };
    }
    if (best.status().state === 'ready') return best.run(request);
    const fallback = candidates.find((b) => b.status().state === 'ready');
    if (fallback) {
      const result = await fallback.run(request);
      return result.ok ? { ...result, provisional: true } : result;
    }
    await best.init();
    return best.run(request);
  }

  private ordered(): CasBackend[] {
    const list = [...this.backends];
    const i = list.findIndex((b) => b.id === this.preferred);
    if (i > 0) list.unshift(...list.splice(i, 1));
    return list;
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
