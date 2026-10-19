import * as Comlink from 'comlink';
import type { Expr, Name } from '../../parser/ast';
import { printLatex } from '../../parser/printLatex';
import { InlineError } from '../inline';
import { numberExpr } from '../number';
import type { ProgramRunner } from '../runner';
import type {
  BackendStatus,
  CasBackend,
  CasExpr,
  CasOpName,
  CasRequest,
  CasResult,
} from '../types';
import { parseNerdamerText, TextParseError } from './parseText';
import type { NerdamerReply } from './run';
import { NerdamerUnsupported, serializeNerdamer, type NerdamerJob } from './serialize';
import type { NerdamerWorkerApi } from './worker';

const SUPPORTED: ReadonlySet<CasOpName> = new Set<CasOpName>([
  'evaluate',
  'numeric',
  'simplify',
  'factor',
  'expand',
  'solve',
  'derivative',
  'integrate',
  'limit',
]);

/** Results that are just the unevaluated call mean Nerdamer could not do it. */
const UNEVALUATED = /\b(integrate|defint|limit|sum|product|diff|solve)\(/;

export function nerdamerWorkerRunner(): ProgramRunner {
  let worker: Worker | null = null;
  let api: Comlink.Remote<NerdamerWorkerApi> | null = null;
  const ensure = () => {
    if (!worker || !api) {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      api = Comlink.wrap<NerdamerWorkerApi>(worker);
    }
    return api;
  };
  return {
    init: () => ensure().init(),
    run: (code) => ensure().run(code),
    reset: () => {
      worker?.terminate();
      worker = null;
      api = null;
    },
  };
}

/**
 * Nerdamer (pure JavaScript): loads instantly, so it answers while SymPy is still loading.
 * Weaker than SymPy (no series, recursive sequences, inequalities; numeric definite integrals).
 */
export class NerdamerBackend implements CasBackend {
  readonly id = 'nerdamer';
  readonly name = 'Nerdamer';
  private state: BackendStatus = { state: 'idle' };
  private readonly listeners = new Set<() => void>();
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly cache = new Map<string, CasResult>();

  constructor(
    private readonly runner: ProgramRunner = nerdamerWorkerRunner(),
    private readonly timeoutMs = 8000,
  ) {}

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
      this.setStatus({ state: 'loading', message: 'Loading Nerdamer…' });
      try {
        await this.runner.init(() => undefined);
        this.setStatus({ state: 'ready' });
      } catch (e) {
        this.ready = null;
        this.setStatus({ state: 'error', message: `Nerdamer failed to load: ${String(e)}` });
        throw e;
      }
    })();
    return this.ready;
  }

  async run(request: CasRequest): Promise<CasResult> {
    let job: NerdamerJob;
    let names: Map<string, Name>;
    try {
      ({ job, names } = serializeNerdamer(request));
    } catch (e) {
      if (e instanceof NerdamerUnsupported || e instanceof InlineError) {
        return { ok: false, error: e.message, backend: this.id };
      }
      throw e;
    }
    const code = JSON.stringify(job);
    const cached = this.cache.get(code);
    if (cached) return cached;
    const result = await this.enqueue(() => this.execute(code, job, names));
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(code, result);
    return result;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async execute(
    code: string,
    job: NerdamerJob,
    names: Map<string, Name>,
  ): Promise<CasResult> {
    await this.init();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol('timeout');
    const timeout = new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => {
        resolve(timedOut);
      }, this.timeoutMs);
    });
    let raw: string | typeof timedOut;
    try {
      raw = await Promise.race([this.runner.run(code), timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (raw === timedOut) {
      this.runner.reset();
      this.ready = null;
      return { ok: false, error: 'Nerdamer gave up (too slow)', backend: this.id };
    }
    return toResult(JSON.parse(raw) as NerdamerReply, job, names, this.id);
  }

  private setStatus(status: BackendStatus): void {
    this.state = status;
    for (const l of this.listeners) l();
  }
}

export function toResult(
  reply: NerdamerReply,
  job: NerdamerJob,
  names: ReadonlyMap<string, Name>,
  backend: string,
): CasResult {
  if (!reply.ok) return { ok: false, error: `Nerdamer: ${reply.error}`, backend };
  if (UNEVALUATED.test(reply.text)) {
    return { ok: false, error: 'Nerdamer could not compute this', backend };
  }
  let expr;
  try {
    expr = parseNerdamerText(reply.text, names);
  } catch (e) {
    if (e instanceof TextParseError) {
      return {
        ok: false,
        error: `Nerdamer returned something unsupported: ${reply.text}`,
        backend,
      };
    }
    throw e;
  }
  if (job.solveFor) {
    const items = expr.kind === 'list' ? expr.items : [expr];
    return {
      ok: true,
      value: {
        kind: 'solutions',
        variable: job.solveFor,
        solutions: items.map((s): CasExpr => ({ expr: s, latex: printLatex(s) })),
      },
      backend,
    };
  }
  const numeric = reply.decimal ? decimal(reply.decimal) : null;
  return {
    ok: true,
    value: { kind: 'expr', expr, latex: printLatex(expr), numeric },
    backend,
  };
}

/** Nerdamer prints ~20 digits; show 15 significant digits like SymPy. */
function decimal(text: string): CasExpr {
  const value = String(Number(Number(text).toPrecision(15)));
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const span = { start: 0, end: 0 };
  const num = numberExpr(digits, span);
  const expr: Expr = negative ? { kind: 'neg', arg: num, span } : num;
  return { expr, latex: printLatex(expr) };
}
