import { nameKey, type Definition, type Expr, type Name } from '../parser/ast';

/**
 * Substitutes the user's definitions into an expression, for backends that have no notion of a
 * document scope (e.g. Nerdamer): constants are replaced by their (inlined) values, calls to user
 * functions are expanded with their arguments, and closed-form sequences (a_n = n^2) are expanded
 * at their index. Bound variables (function parameters, integration variables…) are never
 * substituted. Recursive sequences and derivatives of user functions cannot be inlined.
 */

export class InlineError extends Error {}

interface Env {
  consts: Map<string, Expr>;
  funcs: Map<string, { params: Name[]; body: Expr }>;
  /** Closed-form sequences only (no base cases, no self-reference). */
  seqs: Map<string, { index: Name; body: Expr }>;
  recursiveSeqs: Set<string>;
}

export function inlineDefinitions(
  target: Expr,
  env: readonly Definition[],
  locals: readonly string[] = [],
): Expr {
  const e: Env = { consts: new Map(), funcs: new Map(), seqs: new Map(), recursiveSeqs: new Set() };
  const withBases = new Set(env.filter((d) => d.kind === 'defSeqBase').map((d) => nameKey(d.name)));
  // Definitions arrive in dependency order, so each body can be inlined against earlier ones.
  for (const d of env) {
    const key = nameKey(d.name);
    switch (d.kind) {
      case 'defConst':
        e.consts.set(key, substitute(d.body, e, new Set()));
        break;
      case 'defFunc':
        e.funcs.set(key, {
          params: d.params,
          body: substitute(d.body, e, new Set(d.params.map(nameKey))),
        });
        break;
      case 'defSeq':
        if (withBases.has(key)) e.recursiveSeqs.add(key);
        else e.seqs.set(key, { index: d.indexVar, body: d.body });
        break;
      case 'defSeqBase':
        break;
    }
  }
  return substitute(target, e, new Set(locals));
}

function substitute(expr: Expr, env: Env, bound: ReadonlySet<string>): Expr {
  const go = (x: Expr, b: ReadonlySet<string> = bound): Expr => substitute(x, env, b);
  const binding = (name: Name) => new Set([...bound, nameKey(name)]);
  switch (expr.kind) {
    case 'num':
    case 'constant':
    case 'unit':
      return expr;
    case 'convert':
      return { ...expr, expr: go(expr.expr) };
    case 'var': {
      const key = nameKey(expr.name);
      if (bound.has(key)) return expr;
      return env.consts.get(key) ?? expr;
    }
    case 'call': {
      const key = nameKey(expr.fn);
      const args = expr.args.map((a) => go(a));
      const fn = env.funcs.get(key);
      if (!fn) return { ...expr, args };
      return replaceVars(
        fn.body,
        new Map(fn.params.map((p, i) => [nameKey(p), args[i] ?? expr] as const)),
      );
    }
    case 'index': {
      const key = nameKey(expr.seq);
      if (env.recursiveSeqs.has(key)) {
        throw new InlineError(`The recursive sequence "${key}" needs the SymPy backend`);
      }
      const seq = env.seqs.get(key);
      if (!seq) throw new InlineError(`The sequence "${key}" needs the SymPy backend`);
      return replaceVars(
        go(seq.body, new Set([nameKey(seq.index)])),
        new Map([[nameKey(seq.index), go(expr.index)]]),
      );
    }
    case 'derivative':
      throw new InlineError('Prime notation needs the SymPy backend');
    case 'neg':
    case 'factorial':
    case 'abs':
      return { ...expr, arg: go(expr.arg) };
    case 'binary':
      return { ...expr, left: go(expr.left), right: go(expr.right) };
    case 'root':
      return expr.degree
        ? { ...expr, arg: go(expr.arg), degree: go(expr.degree) }
        : { ...expr, arg: go(expr.arg) };
    case 'matrix':
      return { ...expr, rows: expr.rows.map((r) => r.map((c) => go(c))) };
    case 'list':
      return { ...expr, items: expr.items.map((i) => go(i)) };
    case 'relation':
      return { ...expr, operands: expr.operands.map((o) => go(o)) };
    case 'integral': {
      const out: Expr = { ...expr, integrand: go(expr.integrand, binding(expr.variable)) };
      if (expr.lower && expr.upper) {
        out.lower = go(expr.lower);
        out.upper = go(expr.upper);
      }
      return out;
    }
    case 'diff':
      return { ...expr, operand: go(expr.operand, binding(expr.variable)) };
    case 'limit':
      return { ...expr, operand: go(expr.operand, binding(expr.variable)), point: go(expr.point) };
    case 'bigop':
      return {
        ...expr,
        operand: go(expr.operand, binding(expr.index)),
        lower: go(expr.lower),
        upper: go(expr.upper),
      };
  }
}

/** Replaces free occurrences of variables (by key) with expressions. */
function replaceVars(expr: Expr, values: ReadonlyMap<string, Expr>): Expr {
  const go = (x: Expr): Expr => replaceVars(x, values);
  const without = (name: Name) => {
    const next = new Map(values);
    next.delete(nameKey(name));
    return next;
  };
  switch (expr.kind) {
    case 'var':
      return values.get(nameKey(expr.name)) ?? expr;
    case 'num':
    case 'constant':
    case 'unit':
      return expr;
    case 'convert':
      return { ...expr, expr: go(expr.expr) };
    case 'call':
    case 'derivative':
      return { ...expr, args: expr.args.map(go) };
    case 'index':
      return { ...expr, index: go(expr.index) };
    case 'neg':
    case 'factorial':
    case 'abs':
      return { ...expr, arg: go(expr.arg) };
    case 'binary':
      return { ...expr, left: go(expr.left), right: go(expr.right) };
    case 'root':
      return expr.degree
        ? { ...expr, arg: go(expr.arg), degree: go(expr.degree) }
        : { ...expr, arg: go(expr.arg) };
    case 'matrix':
      return { ...expr, rows: expr.rows.map((r) => r.map(go)) };
    case 'list':
      return { ...expr, items: expr.items.map(go) };
    case 'relation':
      return { ...expr, operands: expr.operands.map(go) };
    case 'integral': {
      const out: Expr = { ...expr, integrand: replaceVars(expr.integrand, without(expr.variable)) };
      if (expr.lower && expr.upper) {
        out.lower = go(expr.lower);
        out.upper = go(expr.upper);
      }
      return out;
    }
    case 'diff':
      return { ...expr, operand: replaceVars(expr.operand, without(expr.variable)) };
    case 'limit':
      return {
        ...expr,
        operand: replaceVars(expr.operand, without(expr.variable)),
        point: go(expr.point),
      };
    case 'bigop':
      return {
        ...expr,
        operand: replaceVars(expr.operand, without(expr.index)),
        lower: go(expr.lower),
        upper: go(expr.upper),
      };
  }
}
