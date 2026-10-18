import type { CasBackend, CasResult, CasValue } from '../cas/types';
import type { Doc, RowId } from '../document/model';
import { printLatex } from '../parser/printLatex';
import { statementToSexpr } from '../parser/sexpr';
import {
  commands,
  suggestCommands,
  type Command,
  type CommandContext,
} from '../registries/commands';
import { analyzeRows, type RowAnalysis } from './analyze';
import { buildDependencies } from './deps';
import { shapeOf, targetOf } from './shape';

/**
 * Turns the document into what the UI shows: per row, its analysis, error, output rows (auto
 * evaluation + attached commands) and suggested commands. Re-runs on every document change;
 * results for unchanged requests come from the backend's cache, so only rows whose inputs or
 * dependencies changed are actually recomputed.
 */

export interface OutputView {
  /** OutputSpec id, or `<rowId>:auto` for automatic evaluation. */
  id: string;
  commandId: string;
  /** Label shown on the output row ('' for auto evaluation). */
  title: string;
  /** Stable out_k label (command outputs only, for now). */
  label: number | null;
  state: 'pending' | 'ok' | 'error';
  value?: CasValue;
  error?: string;
  backend?: string;
  /** Answered by a fallback backend while the preferred one loads; recomputed when it is ready. */
  provisional?: boolean;
  /** The preferred backend could not do this, so another one answered. */
  fallback?: boolean;
  /** A quick first answer (e.g. a definite integral numerically); the full one is on its way. */
  refining?: boolean;
  /** True while a recomputation is pending and `value` is from the previous version. */
  stale?: boolean;
}

export interface RowView {
  rowId: RowId;
  analysis: RowAnalysis;
  error: { message: string; span?: { start: number; end: number } } | null;
  outputs: OutputView[];
  /** Relevant commands not yet attached, most relevant first, with row-specific titles. */
  suggestions: { command: Command; title: string }[];
}

export interface EngineSnapshot {
  rows: ReadonlyMap<RowId, RowView>;
}

interface Job {
  rowId: RowId;
  outputId: string;
  key: string;
  run: () => Promise<CasResult>;
  /** A quick first pass shown while `run` (which may be slow) is in progress. */
  preview?: () => Promise<CasResult>;
  /** Automatic evaluation: hide results that add nothing (see `addsNothing`). */
  auto?: { inputLatex: string; computes: boolean };
}

export interface EngineOptions {
  debounceMs?: number;
}

export class Engine {
  private snapshot: EngineSnapshot = { rows: new Map() };
  private readonly listeners = new Set<() => void>();
  private doc: Doc | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly debounceMs: number;
  /** Last request key per output id, to keep showing old values while recomputing. */
  private keys = new Map<string, string>();
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly cas: CasBackend,
    options: EngineOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 150;
    cas.onStatusChange(() => {
      // A backend became ready: re-run so provisional/pending outputs get upgraded.
      if (cas.status().state === 'ready') this.schedule(0);
    });
  }

  getSnapshot = (): EngineSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Forget which results are current (e.g. after switching backends) and recompute all. */
  invalidate(): void {
    this.keys = new Map();
    this.schedule(0);
  }

  update(doc: Doc): void {
    this.doc = doc;
    this.schedule(this.debounceMs);
  }

  /** Resolves when the current recomputation has finished (for tests). */
  settled(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.timer === undefined) void this.idle.then(resolve);
        else setTimeout(check, 5);
      };
      check();
    });
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.idle = this.recompute();
    }, delay);
  }

  private async recompute(): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    const generation = ++this.generation;

    const analyses = analyzeRows(
      doc.rows.map((r) => ({ id: r.id, latex: r.kind === 'note' ? '' : r.latex })),
      { interpretationChoices: doc.interpretations },
    );
    const deps = buildDependencies(analyses);
    const previous = this.snapshot.rows;
    const rows = new Map<RowId, RowView>();
    const jobs: Job[] = [];
    const keys = new Map<string, string>();

    analyses.forEach((analysis, i) => {
      const row = doc.rows[i];
      if (!row) return;
      const view: RowView = { rowId: row.id, analysis, error: null, outputs: [], suggestions: [] };
      rows.set(row.id, view);
      if (analysis.error) {
        view.error = { message: analysis.error.message, span: analysis.error.span };
        return;
      }
      const cycle = deps.cycles.get(i);
      if (cycle) {
        view.error = { message: cycle };
        return;
      }
      const statement = analysis.statement;
      const target = statement && targetOf(statement);
      if (!statement || !target) return;
      const blocker = deps.blockedBy(i);
      if (blocker !== null) {
        view.error = { message: `Depends on line ${blocker + 1}, which has an error` };
        return;
      }

      const env = deps.environment(i);
      const ctx: CommandContext = { statement, target, env, facts: shapeOf(target.expr, env) };
      const envKey = env.map(statementToSexpr).join(';');
      const baseKey = `${statementToSexpr(statement)}|${envKey}`;
      const prev = previous.get(row.id);

      const addJob = (
        output: Omit<OutputView, 'state'>,
        job: Omit<Job, 'rowId' | 'outputId' | 'key'>,
      ) => {
        const key = `${output.commandId}|${baseKey}`;
        keys.set(output.id, key);
        const old = prev?.outputs.find((o) => o.id === output.id);
        const unchanged = old && this.keys.get(output.id) === key && old.state !== 'pending';
        view.outputs.push(
          unchanged
            ? { ...old, title: output.title, label: output.label }
            : {
                ...output,
                state: 'pending',
                ...(old?.value ? { value: old.value, stale: true } : {}),
              },
        );
        if (!unchanged || old.provisional || old.refining)
          jobs.push({ ...job, rowId: row.id, outputId: output.id, key });
      };

      // Automatic evaluation.
      if (statement.kind === 'expr' || statement.kind === 'defConst') {
        const evaluate: Command = {
          id: 'auto',
          title: () => '',
          slash: '',
          description: '',
          appliesTo: () => 0,
          run: (c, cas) =>
            cas.run({
              operation: { op: 'evaluate' },
              target: c.target.expr,
              env: c.env,
              locals: c.target.locals,
            }),
        };
        // Definite integrals: show a quick numeric value first, then the exact one if it exists.
        const preview = ctx.facts.hasDefiniteIntegral
          ? () =>
              this.cas.run({
                operation: { op: 'evaluate', numericIntegrals: true },
                target: target.expr,
                env,
                locals: target.locals,
              })
          : undefined;
        addJob(
          { id: `${row.id}:auto`, commandId: 'auto', title: '', label: null },
          {
            run: () => evaluate.run(ctx, this.cas),
            ...(preview ? { preview } : {}),
            auto: {
              inputLatex: printLatex(target.expr),
              computes: analysis.refs.length > 0 || ctx.facts.hasOperators,
            },
          },
        );
      }

      // Commands attached by the user.
      for (const spec of row.outputs) {
        const command = commands.get(spec.commandId);
        if (!command) continue;
        addJob(
          { id: spec.id, commandId: spec.commandId, title: command.title(ctx), label: spec.label },
          { run: () => command.run(ctx, this.cas) },
        );
      }

      const attached = new Set(row.outputs.map((o) => o.commandId));
      view.suggestions = suggestCommands(ctx)
        .filter((c) => !attached.has(c.id))
        .map((command) => ({ command, title: command.title(ctx) }));
    });

    this.keys = keys;
    this.publish(rows);

    // Quick first passes for every row before any slow full evaluation, so one hard row never
    // holds up the rest of the document.
    for (const job of jobs) {
      if (!job.preview) continue;
      if (generation !== this.generation) return;
      const result = await job.preview();
      if (generation !== this.generation) return;
      if (result.ok) this.apply(job, result, true);
    }
    for (const job of jobs) {
      if (generation !== this.generation) return;
      const result = await job.run();
      if (generation !== this.generation) return;
      this.apply(job, result, false);
    }
  }

  /** Publishes one job's result into its output row. */
  private apply(job: Job, result: CasResult, refining: boolean): void {
    const current = new Map(this.snapshot.rows);
    const view = current.get(job.rowId);
    if (!view) return;
    const outputs = view.outputs.flatMap((o): OutputView[] => {
      if (o.id !== job.outputId) return [o];
      if (!result.ok) {
        const failed: OutputView = {
          ...o,
          state: 'error',
          error: result.error,
          backend: result.backend,
          stale: false,
        };
        // A fallback backend's failure is retried once the preferred backend is ready.
        if (result.provisional) failed.provisional = true;
        else delete failed.provisional;
        return [failed];
      }
      if (job.auto && addsNothing(result.value, job.auto)) return [];
      const next: OutputView = {
        ...o,
        state: 'ok',
        value: result.value,
        backend: result.backend,
        stale: false,
      };
      if (result.provisional) next.provisional = true;
      else delete next.provisional;
      if (result.fallback) next.fallback = true;
      else delete next.fallback;
      if (refining) next.refining = true;
      else delete next.refining;
      delete next.error;
      return [next];
    });
    current.set(job.rowId, { ...view, outputs });
    this.publish(current);
  }

  private publish(rows: Map<RowId, RowView>): void {
    this.snapshot = { rows };
    for (const l of this.listeners) l();
  }
}

/**
 * An automatic result is only worth showing if it says more than the input did: not when it
 * repeats the input, and not when a row that uses no definitions merely comes back as another
 * symbolic expression (evaluation only reorders terms there; /simplify is the explicit tool).
 */
function addsNothing(
  value: CasValue,
  { inputLatex, computes }: { inputLatex: string; computes: boolean },
): boolean {
  if (value.kind !== 'expr' || value.numeric !== null) return false;
  if (value.latex === inputLatex) return true;
  const symbolic = value.expr !== null && shapeOf(value.expr, []).freeVars.length > 0;
  return symbolic && !computes;
}
