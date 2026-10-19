import type { Expr } from '../parser/ast';

/** Generic tree helpers for the AST. */

/** `e` with `f` applied to each direct child expression. */
export function mapChildren(e: Expr, f: (x: Expr) => Expr): Expr {
  switch (e.kind) {
    case 'num':
    case 'var':
    case 'constant':
    case 'unit':
      return e;
    case 'neg':
    case 'factorial':
    case 'abs':
      return { ...e, arg: f(e.arg) };
    case 'binary':
      return { ...e, left: f(e.left), right: f(e.right) };
    case 'call':
    case 'derivative':
      return { ...e, args: e.args.map(f) };
    case 'index':
      return { ...e, index: f(e.index) };
    case 'matrix':
      return { ...e, rows: e.rows.map((r) => r.map(f)) };
    case 'root':
      return e.degree ? { ...e, arg: f(e.arg), degree: f(e.degree) } : { ...e, arg: f(e.arg) };
    case 'list':
      return { ...e, items: e.items.map(f) };
    case 'relation':
      return { ...e, operands: e.operands.map(f) };
    case 'integral': {
      const out: Expr = { ...e, integrand: f(e.integrand) };
      if (e.lower) out.lower = f(e.lower);
      if (e.upper) out.upper = f(e.upper);
      return out;
    }
    case 'diff':
      return { ...e, operand: f(e.operand) };
    case 'limit':
      return { ...e, operand: f(e.operand), point: f(e.point) };
    case 'bigop':
      return { ...e, operand: f(e.operand), lower: f(e.lower), upper: f(e.upper) };
    case 'convert':
      return { ...e, expr: f(e.expr) };
  }
}

export function children(e: Expr): Expr[] {
  const out: Expr[] = [];
  mapChildren(e, (x) => {
    out.push(x);
    return x;
  });
  return out;
}
