import type { CasBackend, CasResult, CasValue } from '../cas/types';
import type { Doc, RowId } from '../document/model';
import { printLatex } from '../parser/printLatex';
import { statementToSexpr } from '../parser/sexpr';
import {
  commands,
  suggestCommands,
  type Command,
  type CommandContext,
  ArgError,
  defaultArgs,
  readArgs,
  type Args,
} from '../registries/commands';
import { analyzeDocument, type RowAnalysis } from './analyze';
import { buildDependencies } from './deps';
import type { Definition, Expr, Statement } from '../parser/ast';
import {
  OutputRefError,
  refDefinition,
  renameInDefinition,
  renameOutputRefs,
  usesOutputRefs,
  type OutputRef,
} from './outputRefs';
import { shapeOf, targetOf, type Target } from './shape';
import { withUnits } from './units';

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
  /** What commands see for this row (null if it cannot run commands): for argument defaults. */
  context: CommandContext | null;
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
  /** More of what the result depends on than the row: a command's arguments. */
  keyExtra?: string;
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

  private readonly cas: CasBackend;
  /** The latest value of each output, hidden automatic results included (for ans and out_k). */
  private values = new Map<string, CasValue>();
  /** The request key each output last finished for (not provisionally). */
  private done = new Map<string, string>();

  constructor(cas: CasBackend, options: EngineOptions = {}) {
    // Units are handled here for every backend (see core/units.ts).
    this.cas = withUnits(cas);
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
    this.done = new Map();
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

    const { rows: analyses, resolve } = analyzeDocument(
      // Notes and folder titles are not math.
      doc.rows.map((r) => ({ id: r.id, latex: r.kind ? '' : r.latex })),
      { interpretationChoices: doc.interpretations },
    );
    const deps = buildDependencies(analyses);
    const previous = this.snapshot.rows;
    const rows = new Map<RowId, RowView>();
    const jobs: Job[] = [];
    const keys = new Map<string, string>();

    // Names the document defines itself (its own ans or out wins over the results).
    const userDefined = new Set(analyses.flatMap((a) => (a.defines ? [a.defines] : [])));
    /** Rows that use results (ans, out_k): built after the others, once the results are known. */
    const deferred: {
      i: number;
      row: Doc['rows'][number];
      view: RowView;
      analysis: RowAnalysis;
      statement: Statement;
      baseEnv: Definition[];
    }[] = [];

    const build = (
      row: Doc['rows'][number],
      i: number,
      view: RowView,
      analysis: RowAnalysis,
      statement: Statement,
      target: Target,
      env: Definition[],
      refKey: string,
    ): void => {
      const ctx: CommandContext = { statement, target, env, facts: shapeOf(target.expr, env) };
      const envKey = env.map(statementToSexpr).join(';');
      const baseKey = `${statementToSexpr(statement)}|${envKey}|${refKey}`;
      const prev = previous.get(row.id);

      const addJob = (
        output: Omit<OutputView, 'state'>,
        job: Omit<Job, 'rowId' | 'outputId' | 'key'> & { keyExtra?: string },
      ) => {
        const key = `${output.commandId}|${baseKey}|${job.keyExtra ?? ''}`;
        keys.set(output.id, key);
        const old = prev?.outputs.find((o) => o.id === output.id);
        // A finished automatic result that adds nothing is hidden: keep it so, don't recompute.
        if (!old && output.commandId === 'auto' && this.done.get(output.id) === key) return;
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
            run: () => evaluate.run(ctx, this.cas, {}),
            ...(preview ? { preview } : {}),
            auto: {
              inputLatex: printLatex(target.expr),
              computes: analysis.refs.length > 0 || ctx.facts.hasOperators || ctx.facts.hasUnits,
            },
          },
        );
      }

      // Commands attached by the user, with their arguments (read in the document's context; a
      // name an argument uses brings its definition into the command's environment).
      const read = (latex: string) => resolve(latex, target.locals);
      for (const spec of row.outputs) {
        const command = commands.get(spec.commandId);
        if (!command) continue;
        const base = { id: spec.id, commandId: spec.commandId, label: spec.label };
        let parsed: { args: Args; refs: string[] };
        try {
          parsed = readArgs(command.params ?? [], spec.args, ctx, read);
        } catch (e) {
          if (!(e instanceof ArgError)) throw e;
          const message = e.message;
          addJob(
            { ...base, title: command.title(ctx, {}) },
            { run: () => Promise.resolve({ ok: false, error: message, backend: '' }) },
          );
          continue;
        }
        const { args, refs } = parsed;
        const own = refs.length > 0 ? { ...ctx, env: deps.environment(i, refs) } : ctx;
        const argKey = JSON.stringify(spec.args ?? {});
        const ownEnvKey = own === ctx ? '' : own.env.map(statementToSexpr).join(';');
        addJob(
          { ...base, title: command.title(ctx, args) },
          { run: () => command.run(own, this.cas, args), keyExtra: `${argKey}|${ownEnvKey}` },
        );
      }

      view.context = ctx;
      const attached = new Set(row.outputs.map((o) => o.commandId));
      view.suggestions = suggestCommands(ctx)
        .filter((c) => !attached.has(c.id))
        .map((command) => ({
          command,
          title: command.title(ctx, defaultArgs(command, ctx, read)),
        }));
    };

    analyses.forEach((analysis, i) => {
      const row = doc.rows[i];
      if (!row) return;
      const view: RowView = {
        rowId: row.id,
        analysis,
        error: null,
        outputs: [],
        suggestions: [],
        context: null,
      };
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

      const baseEnv = deps.environment(i);
      // Rows that use results (ans, out_k) are built once the results they use are known.
      const usesResults =
        usesOutputRefs(target.expr, userDefined) ||
        baseEnv.some((d) => usesOutputRefs(d.body, userDefined));
      if (usesResults) {
        deferred.push({ i, row, view, analysis, statement, baseEnv });
        return;
      }
      build(row, i, view, analysis, statement, target, baseEnv, '');
    });

    // Rows using results: rename each use and define it as the result's value, or wait for it.
    const waiting: RowView[] = [];
    const rowOf = new Map<Statement | null, number>(analyses.map((a, j) => [a.statement, j]));
    for (const d of deferred) {
      const computing = new Set(jobs.map((j) => j.outputId));
      const found = new Map<string, OutputRef>();
      try {
        const rename = (e: Expr) => renameOutputRefs(e, d.i, userDefined, found);
        const statement = renameStatement(d.statement, rename);
        const env = d.baseEnv.map((def) =>
          renameInDefinition(def, rowOf.get(def) ?? d.i, userDefined, found),
        );
        const defs: Definition[] = [];
        let pending = false;
        for (const ref of found.values()) {
          const value = this.refValue(ref, d.i, doc, analyses, computing);
          if (value === 'pending') pending = true;
          else defs.push(refDefinition(ref, value));
        }
        const target = targetOf(statement);
        if (!target) continue;
        if (pending) {
          // Show the old results as stale until the results this row uses are ready.
          const prev = previous.get(d.row.id);
          d.view.outputs = (prev?.outputs ?? []).map((o) => ({
            ...o,
            state: 'pending',
            stale: o.value !== undefined,
          }));
          waiting.push(d.view);
          continue;
        }
        build(
          d.row,
          d.i,
          d.view,
          d.analysis,
          statement,
          target,
          [...defs, ...env],
          defs.map(statementToSexpr).join(';'),
        );
      } catch (e) {
        if (!(e instanceof OutputRefError)) throw e;
        d.view.error = { message: e.message };
      }
    }
    if (waiting.length > 0 && jobs.length === 0) {
      // Nothing left to compute, so what they wait for depends on them.
      for (const view of waiting) {
        view.outputs = [];
        view.error = { message: 'This row uses a result that depends on this row' };
      }
    }

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
    // Rows waiting for results computed just now: compute them with those results.
    if (waiting.length > 0 && jobs.length > 0) this.schedule(0);
  }

  /**
   * The value a result reference stands for: the nearest result above `ref.row` (ans) or the
   * output labelled k; 'pending' while it is being computed. `row` is the row using it.
   */
  private refValue(
    ref: OutputRef,
    row: number,
    doc: Doc,
    analyses: readonly RowAnalysis[],
    computing: ReadonlySet<string>,
  ): Expr | 'pending' {
    const valueOf = (id: string, what: string): Expr | 'pending' | null => {
      if (computing.has(id)) return 'pending';
      const v = this.values.get(id);
      return v ? exprOfValue(v, what) : null;
    };
    if (ref.kind === 'ans') {
      for (let k = ref.row - 1; k >= 0; k--) {
        const r = doc.rows[k];
        const statement = analyses[k]?.statement;
        if (!r || r.kind) continue;
        const auto = statement?.kind === 'expr' || statement?.kind === 'defConst';
        const ids = [...(auto ? [`${r.id}:auto`] : []), ...r.outputs.map((o) => o.id)];
        // The last result shown under that row (commands come after the automatic one).
        for (const id of ids.reverse()) {
          const v = valueOf(id, 'ans');
          if (v !== null) return v;
        }
      }
      throw new OutputRefError('There is no result above this row for ans to use');
    }
    const name = `out_${ref.label}`;
    const k = doc.rows.findIndex((r) => r.outputs.some((o) => o.label === ref.label));
    const spec = doc.rows[k]?.outputs.find((o) => o.label === ref.label);
    if (!spec) throw new OutputRefError(`There is no ${name}`);
    if (k === row) throw new OutputRefError(`${name} is a result of this row`);
    const v = valueOf(spec.id, name);
    if (v === null) throw new OutputRefError(`${name} has no value`);
    return v;
  }

  /** Publishes one job's result into its output row. */
  private apply(job: Job, result: CasResult, refining: boolean): void {
    if (result.ok) this.values.set(job.outputId, result.value);
    else this.values.delete(job.outputId);
    if (!refining && !result.provisional) this.done.set(job.outputId, job.key);
    else this.done.delete(job.outputId);
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

/** A result as an expression to use in another row (one value only). */
function exprOfValue(v: CasValue, what: string): Expr {
  if (v.kind === 'expr' && v.expr) return v.expr;
  if (v.kind === 'solutions') {
    const [only, ...more] = v.solutions;
    if (only?.expr && more.length === 0) return only.expr;
    throw new OutputRefError(
      only ? `${what} has several solutions; use one of them` : `${what} has no solutions`,
    );
  }
  throw new OutputRefError(`${what} cannot be used in a calculation`);
}

/** A statement with its expression (or a definition's body) rewritten. */
function renameStatement(s: Statement, f: (e: Expr) => Expr): Statement {
  switch (s.kind) {
    case 'empty':
      return s;
    case 'expr':
      return { ...s, expr: f(s.expr) };
    case 'relation': {
      const e = f(s.expr);
      return e.kind === 'relation' ? { ...s, expr: e } : s;
    }
    default:
      return { ...s, body: f(s.body) };
  }
}
