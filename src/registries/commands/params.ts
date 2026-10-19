import type { SnippetResult } from '../../core/analyze';
import { isUnitSymbol } from '../../core/units';
import { makeName, nameKey, type Expr, type Name, type UnitFactor } from '../../parser/ast';
import { MathError } from '../../parser/errors';
import { parseUnitText } from '../../parser/units';
import type { CommandContext } from './types';

/**
 * Command arguments. A command lists its parameters; the palette shows a field for each,
 * filled with the default for the row, and an attached command stores only the arguments the
 * user changed (as LaTeX), so the others keep following the row.
 */

export type ParamKind =
  /** A single variable: x, t, \theta, v_{max}. */
  | 'variable'
  /** A whole number ≥ 0: an order, a number of digits. */
  | 'count'
  /** Any expression: a bound, a value. */
  | 'expr'
  /**
   * A variable and a value: `x=1`, `x\to0`, `x\to0^{+}` (one-sided); just a value means the
   * default variable at that value.
   */
  | 'point'
  /** A unit: km, [km], \unit{km}. */
  | 'unit';

export interface CommandParam {
  name: string;
  /** Shown beside its field: 'variable', 'order', 'about'. */
  label: string;
  kind: ParamKind;
  /** Optional parameters may be left empty (an indefinite integral has no bounds). */
  optional?: boolean;
  /** The default for the row, as LaTeX ('' for an empty optional parameter). */
  default: (ctx: CommandContext) => string;
}

export type ArgValue =
  | { kind: 'variable'; name: Name }
  | { kind: 'count'; value: number }
  | { kind: 'expr'; expr: Expr }
  | { kind: 'point'; variable: Name; point: Expr; side?: '+' | '-' }
  | { kind: 'unit'; factors: UnitFactor[] }
  | { kind: 'empty' };

export type Args = Readonly<Record<string, ArgValue>>;

/** Reads a snippet of LaTeX in the document's context. */
export type Resolve = (latex: string) => SnippetResult;

export class ArgError extends Error {}

/** The arguments for a command: stored ones where set, defaults for the rest. */
export function readArgs(
  params: readonly CommandParam[],
  stored: Readonly<Record<string, string>> | undefined,
  ctx: CommandContext,
  resolve: Resolve,
): { args: Args; refs: string[] } {
  const args: Record<string, ArgValue> = {};
  const refs: string[] = [];
  for (const p of params) {
    const latex = (stored?.[p.name] ?? p.default(ctx)).trim();
    try {
      args[p.name] = readArg(p, latex, ctx, resolve, refs);
    } catch (e) {
      if (!(e instanceof ArgError || e instanceof MathError)) throw e;
      throw new ArgError(`${p.label}: ${e.message}`);
    }
  }
  return { args, refs };
}

/** The default arguments for a row (empty if a default does not make sense there). */
export function defaultArgs(
  command: { params?: readonly CommandParam[] },
  ctx: CommandContext,
  resolve: Resolve,
): Args {
  try {
    return readArgs(command.params ?? [], undefined, ctx, resolve).args;
  } catch (e) {
    if (e instanceof ArgError) return {};
    throw e;
  }
}

function readArg(
  p: CommandParam,
  latex: string,
  ctx: CommandContext,
  resolve: Resolve,
  refs: string[],
): ArgValue {
  if (latex === '' || /^\\placeholder\{\}$/.test(latex)) {
    if (p.optional) return { kind: 'empty' };
    throw new ArgError('fill this in');
  }
  const expr = (text: string): Expr => {
    const r = resolve(text);
    if (!r.ok) throw new ArgError(r.error);
    if (r.statement.kind !== 'expr') throw new ArgError('needs an expression, not an equation');
    refs.push(...r.refs);
    return r.statement.expr;
  };
  switch (p.kind) {
    case 'variable':
      return { kind: 'variable', name: variableOf(expr(latex)) };
    case 'count': {
      const e = expr(latex);
      if (e.kind !== 'num' || !/^[0-9]+$/.test(e.value))
        throw new ArgError('needs a whole number, e.g. 2');
      return { kind: 'count', value: Number(e.value) };
    }
    case 'expr':
      return { kind: 'expr', expr: expr(latex) };
    case 'unit': {
      const text = latex
        .replace(/^\\unit\{(.*)\}$/, '$1')
        .replace(/^\\left\\lbrack\s*(.*)\\right\\rbrack$/, '$1')
        .replace(/^\[(.*)\]$/, '$1');
      const factors = parseUnitText(text, { start: 0, end: latex.length });
      const unknown = factors.find((f) => !isUnitSymbol(f.symbol));
      if (unknown) throw new ArgError(`unknown unit "${unknown.symbol}"`);
      return { kind: 'unit', factors };
    }
    case 'point': {
      // A one-sided approach is a trailing ^{+} / ^{-} / + / − on the value.
      let text = latex;
      let side: '+' | '-' | undefined;
      const sided = /(?:\^\{?([+-])\}?|([+-]))\s*$/.exec(text);
      if (sided && /[^+\-\s^{]/.test(text.slice(0, sided.index))) {
        side = (sided[1] ?? sided[2]) as '+' | '-';
        text = text.slice(0, sided.index);
      }
      const split = /^(.*?)(?:=|\\to|\\rightarrow|->)(.*)$/.exec(text);
      const variable = split?.[1]?.trim()
        ? variableOf(expr(split[1]))
        : (defaultVariable(ctx) ?? makeName('x'));
      const point = expr(split ? (split[2] ?? '') : text);
      return side ? { kind: 'point', variable, point, side } : { kind: 'point', variable, point };
    }
  }
}

function variableOf(e: Expr): Name {
  if (e.kind === 'var') return e.name;
  throw new ArgError('needs a variable, e.g. x');
}

function defaultVariable(ctx: CommandContext): Name | undefined {
  return ctx.facts.freeVars[0];
}

/** How an argument reads in a title: x, 1, km. */
export function argText(value: ArgValue | undefined): string {
  if (!value) return '';
  switch (value.kind) {
    case 'variable':
      return nameKey(value.name);
    case 'count':
      return String(value.value);
    default:
      return '';
  }
}
