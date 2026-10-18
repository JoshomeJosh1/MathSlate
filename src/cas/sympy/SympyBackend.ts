import * as Comlink from 'comlink';
import type { BackendStatus, CasBackend, CasOpName, CasRequest, CasResult } from '../types';
import { toCasValue, type SympyResultJson } from './fromSympy';
import { SerializeError, serializeRequest } from './serialize';
import type { SympyWorkerApi } from './worker';

const SUPPORTED: ReadonlySet<CasOpName> = new Set<CasOpName>([
  'evaluate',
  'simplify',
  'factor',
  'expand',
  'numeric',
  'solve',
  'derivative',
  'integrate',
  'limit',
  'series',
]);

const TIMED_OUT = Symbol('timed out');

/** Something that runs a generated Python program and returns the runtime's JSON. */
export interface ProgramRunner {
  init(onProgress: (message: string) => void): Promise<void>;
  run(code: string): Promise<string>;
  /** Abandon the current computation (e.g. terminate the worker). */
  reset(): void;
}

/** Runs programs in a dedicated Web Worker; a timed-out computation kills and replaces it. */
export function workerRunner(): ProgramRunner {
  let worker: Worker | null = null;
  let api: Comlink.Remote<SympyWorkerApi> | null = null;
  const ensure = () => {
    if (!worker || !api) {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      api = Comlink.wrap<SympyWorkerApi>(worker);
    }
    return api;
  };
  return {
    init: (onProgress) => ensure().init(Comlink.proxy(onProgress)),
    run: (code) => ensure().run(code),
    reset: () => {
      worker?.terminate();
      worker = null;
      api = null;
    },
  };
}

export interface SympyBackendOptions {
  timeoutMs?: number;
  cacheSize?: number;
}

export class SympyBackend implements CasBackend {
  readonly id = 'sympy';
  readonly name = 'SymPy';
  private state: BackendStatus = { state: 'idle' };
  private readonly listeners = new Set<() => void>();
  private ready: Promise<void> | null = null;
  /** Requests run one at a time (Pyodide is single-threaded); this chains them. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, CasResult>();
  private readonly timeoutMs: number;
  private readonly cacheSize: number;

  constructor(
    private readonly runner: ProgramRunner = workerRunner(),
    options: SympyBackendOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.cacheSize = options.cacheSize ?? 500;
  }

  status(): BackendStatus {
    return this.state;
  }

  onStatusChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  supports(op: CasOpName): boolean {
    return SUPPORTED.has(op);
  }

  init(): Promise<void> {
    this.ready ??= (async () => {
      this.setStatus({ state: 'loading', message: 'Starting SymPy…' });
      try {
        await this.runner.init((message) => {
          this.setStatus({ state: 'loading', message });
        });
        this.setStatus({ state: 'ready' });
      } catch (e) {
        this.ready = null;
        this.setStatus({ state: 'error', message: `SymPy failed to load: ${errorText(e)}` });
        throw e;
      }
    })();
    return this.ready;
  }

  async run(request: CasRequest): Promise<CasResult> {
    let code: string;
    try {
      code = serializeRequest(request);
    } catch (e) {
      if (e instanceof SerializeError) return { ok: false, error: e.message, backend: this.id };
      throw e;
    }
    const cached = this.cache.get(code);
    if (cached) return cached;
    const result = this.enqueue(() => this.execute(code));
    return result;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async execute(code: string): Promise<CasResult> {
    const cached = this.cache.get(code); // may have been filled while queued
    if (cached) return cached;
    await this.init();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        resolve(TIMED_OUT);
      }, this.timeoutMs);
    });
    let raw: string | typeof TIMED_OUT;
    try {
      raw = await Promise.race([this.runner.run(code), timeout]);
    } catch (e) {
      return { ok: false, error: errorText(e), backend: this.id };
    } finally {
      clearTimeout(timer);
    }
    if (raw === TIMED_OUT) {
      // The worker is stuck in Python; replace it. The next request reloads SymPy.
      this.runner.reset();
      this.ready = null;
      this.setStatus({ state: 'idle' });
      return {
        ok: false,
        error: `Gave up after ${Math.round(this.timeoutMs / 1000)} s`,
        backend: this.id,
      };
    }
    const result = parseResult(raw, this.id);
    this.remember(code, result);
    return result;
  }

  private remember(code: string, result: CasResult): void {
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(code, result);
  }

  private setStatus(status: BackendStatus): void {
    this.state = status;
    for (const l of this.listeners) l();
  }
}

export function parseResult(raw: string, backend: string): CasResult {
  const json = JSON.parse(raw) as SympyResultJson;
  if (!json.ok) return { ok: false, error: json.error, backend };
  return { ok: true, value: toCasValue(json.value), backend };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
