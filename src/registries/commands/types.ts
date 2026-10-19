import type { ShapeFacts, Target } from '../../core/shape';
import type { Definition, Statement } from '../../parser/ast';
import type { CasBackend, CasOperation, CasResult } from '../../cas/types';

export interface CommandContext {
  statement: Statement;
  /** The expression the command acts on (a definition's body, or the row's expression). */
  target: Target;
  /** Definitions the row depends on, in dependency order. */
  env: readonly Definition[];
  facts: ShapeFacts;
}

export interface Command {
  /** Stable id stored in documents. Never rename. */
  id: string;
  /** Short label for chips and output rows: 'factor', 'd/dx'. May depend on the row (variable). */
  title: (ctx: CommandContext) => string;
  /** Typed after "/" in the command palette. */
  slash: string;
  aliases?: readonly string[];
  description: string;
  /** Relevance for this row in [0, 1]; 0 hides the command from suggestions. */
  appliesTo: (ctx: CommandContext) => number;
  run: (ctx: CommandContext, cas: CasBackend) => Promise<CasResult>;
}

/** Helper for commands that apply a built-in function to the row's value: det(M), rref(M). */
export function runFunction(ctx: CommandContext, cas: CasBackend, fn: string): Promise<CasResult> {
  const target = ctx.target.expr;
  return cas.run({
    operation: { op: 'evaluate' },
    target: { kind: 'call', fn: { base: fn }, args: [target], span: target.span },
    env: ctx.env,
    locals: ctx.target.locals,
  });
}

/**
 * Relevance of a matrix command from the row's matrix size: square, other (not square, not a
 * vector), unknown size, and a vector (one row or column; most matrix commands mean little there).
 */
export function matrixRelevance(
  facts: ShapeFacts,
  square: number,
  other: number,
  unknown: number,
  vector = 0,
): number {
  if (!facts.isMatrix) return 0;
  const size = facts.matrixSize;
  if (!size) return unknown;
  if (size.rows === 1 || size.cols === 1) return vector;
  return size.rows === size.cols ? square : other;
}

/** Helper for the common case: one CAS operation on the row's target. */
export function runOperation(
  ctx: CommandContext,
  cas: CasBackend,
  operation: CasOperation,
): Promise<CasResult> {
  return cas.run({ operation, target: ctx.target.expr, env: ctx.env, locals: ctx.target.locals });
}
