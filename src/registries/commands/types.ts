import { preferredVariable, type ShapeFacts, type Target } from '../../core/shape';
import type { Definition, Expr, Name, Statement } from '../../parser/ast';
import { printName } from '../../parser/printLatex';
import type { CasBackend, CasOperation, CasResult } from '../../cas/types';
import type { Args, CommandParam } from './params';

export type { Args, ArgValue, CommandParam } from './params';

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
  /**
   * Short label for chips and output rows: 'factor', 'd/dx'. May depend on the row and the
   * arguments ('d²/dy²').
   */
  title: (ctx: CommandContext, args: Args) => string;
  /** Typed after "/" in the command palette. */
  slash: string;
  aliases?: readonly string[];
  description: string;
  /** Arguments, in the order they are typed after the name in the palette ("diff y 2"). */
  params?: readonly CommandParam[];
  /** Relevance for this row in [0, 1]; 0 hides the command from suggestions. */
  appliesTo: (ctx: CommandContext) => number;
  run: (ctx: CommandContext, cas: CasBackend, args: Args) => Promise<CasResult>;
}

/** A variable argument, or the row's preferred variable. */
export function variableArg(ctx: CommandContext, args: Args, name = 'variable'): Name {
  const a = args[name];
  if (a?.kind === 'variable') return a.name;
  if (a?.kind === 'point') return a.variable;
  return preferredVariable(ctx.facts);
}

/** The default for a variable parameter: the row's preferred variable, as LaTeX. */
export const preferredVariableLatex = (ctx: CommandContext) =>
  printName(preferredVariable(ctx.facts));

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
 * Helper for vector calculus commands (grad, div, …; parser/vectorCalculus.ts): on a function
 * definition, by its parameters; otherwise by the expression's free variables.
 */
export function runVectorCalculus(
  ctx: CommandContext,
  cas: CasBackend,
  fn: string,
): Promise<CasResult> {
  const target = ctx.target.expr;
  const span = target.span;
  const args: Expr[] = [target];
  if (ctx.statement.kind === 'defFunc') {
    const items = ctx.statement.params.map((name): Expr => ({ kind: 'var', name, span }));
    args.push({ kind: 'list', delim: 'paren', items, span });
  }
  return cas.run({
    operation: { op: 'evaluate' },
    target: { kind: 'call', fn: { base: fn }, args, span },
    env: ctx.env,
    locals: ctx.target.locals,
  });
}

/** A scalar function of two or more variables: what grad, the Hessian and ∇² apply to. */
export function isScalarField(facts: ShapeFacts): boolean {
  return !facts.isRelation && !facts.isMatrix && facts.freeVars.length >= 2;
}

/**
 * A vector of expressions in some variables: its number of components (null if unknown), or
 * undefined if it is not one.
 */
export function vectorField(facts: ShapeFacts): number | null | undefined {
  if (!facts.isMatrix || facts.freeVars.length === 0) return undefined;
  const size = facts.matrixSize;
  if (!size) return null;
  if (size.rows !== 1 && size.cols !== 1) return undefined;
  return size.rows * size.cols;
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
