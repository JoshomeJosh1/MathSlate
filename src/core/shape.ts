import {
  makeName,
  nameKey,
  type Definition,
  type Expr,
  type Name,
  type Statement,
} from '../parser/ast';

/**
 * Cheap static facts about an expression, used by commands to judge relevance and pick a
 * variable without asking the CAS.
 */
export interface ShapeFacts {
  /** Free variables (not defined in the document, not bound locally), sorted. */
  freeVars: Name[];
  isRelation: boolean;
  isEquation: boolean;
  isMatrix: boolean;
  /** Built only from numbers, free variables, + − × and non-negative integer powers. */
  isPolynomial: boolean;
  /** Highest total degree if polynomial (0 for constants). */
  degree: number;
  /** Contains a power of a sum or a product of sums: something expand would change. */
  hasExpandableProduct: boolean;
  /** No free variables at all: evaluates to a number (or matrix of numbers). */
  isConstant: boolean;
  hasFunctions: boolean;
}

export interface Target {
  /** What commands operate on: the expression, relation, or a definition's body. */
  expr: Expr;
  /** Locally bound names (function parameters, sequence index). */
  locals: string[];
}

export function targetOf(s: Statement): Target | null {
  switch (s.kind) {
    case 'empty':
      return null;
    case 'expr':
    case 'relation':
      return { expr: s.expr, locals: [] };
    case 'defConst':
    case 'defSeqBase':
      return { expr: s.body, locals: [] };
    case 'defFunc':
      return { expr: s.body, locals: s.params.map(nameKey) };
    case 'defSeq':
      return { expr: s.body, locals: [nameKey(s.indexVar)] };
  }
}

export function shapeOf(expr: Expr, env: readonly Definition[]): ShapeFacts {
  const defined = new Set(env.map((d) => nameKey(d.name)));
  const free = new Map<string, Name>();
  let hasFunctions = false;
  let hasExpandableProduct = false;

  const visit = (e: Expr): void => {
    switch (e.kind) {
      case 'var':
        if (!defined.has(nameKey(e.name))) free.set(nameKey(e.name), e.name);
        return;
      case 'call':
      case 'derivative':
        hasFunctions = true;
        e.args.forEach(visit);
        return;
      case 'binary':
        if (e.op === 'pow' && isSum(e.left) && isPositiveInteger(e.right))
          hasExpandableProduct = true;
        if (e.op === 'mul' && (isSum(e.left) || isSum(e.right))) hasExpandableProduct = true;
        visit(e.left);
        visit(e.right);
        return;
      case 'neg':
      case 'factorial':
      case 'abs':
        visit(e.arg);
        return;
      case 'root':
        visit(e.arg);
        if (e.degree) visit(e.degree);
        return;
      case 'index':
        hasFunctions = true;
        visit(e.index);
        return;
      case 'matrix':
        e.rows.flat().forEach(visit);
        return;
      case 'list':
        e.items.forEach(visit);
        return;
      case 'relation':
        e.operands.forEach(visit);
        return;
      case 'num':
      case 'constant':
        return;
    }
  };
  visit(expr);

  const poly = polynomialDegree(expr, defined);
  const freeVars = [...free.values()].sort((a, b) => nameKey(a).localeCompare(nameKey(b)));
  return {
    freeVars,
    isRelation: expr.kind === 'relation',
    isEquation: expr.kind === 'relation' && expr.ops.length === 1 && expr.ops[0] === '=',
    isMatrix: expr.kind === 'matrix',
    isPolynomial: poly !== null,
    degree: poly ?? 0,
    hasExpandableProduct,
    isConstant: freeVars.length === 0,
    hasFunctions,
  };
}

/** Variable a command should use: x if present, then t, y, z, then the first free variable. */
export function preferredVariable(facts: ShapeFacts): Name {
  for (const pick of ['x', 't', 'y', 'z']) {
    const found = facts.freeVars.find((v) => nameKey(v) === pick);
    if (found) return found;
  }
  return facts.freeVars[0] ?? makeName('x');
}

function isSum(e: Expr): boolean {
  return e.kind === 'binary' && (e.op === 'add' || e.op === 'sub');
}

function isPositiveInteger(e: Expr): boolean {
  return e.kind === 'num' && /^[0-9]+$/.test(e.value) && Number(e.value) >= 2;
}

/** Total degree if `e` is a polynomial in its free variables, else null. */
function polynomialDegree(e: Expr, defined: ReadonlySet<string>): number | null {
  switch (e.kind) {
    case 'num':
    case 'constant':
      return 0;
    case 'var':
      return defined.has(nameKey(e.name)) ? 0 : 1;
    case 'neg':
      return polynomialDegree(e.arg, defined);
    case 'binary': {
      const l = polynomialDegree(e.left, defined);
      if (l === null) return null;
      if (e.op === 'pow') {
        return e.right.kind === 'num' && /^[0-9]+$/.test(e.right.value)
          ? l * Number(e.right.value)
          : null;
      }
      const r = polynomialDegree(e.right, defined);
      if (r === null) return null;
      if (e.op === 'add' || e.op === 'sub') return Math.max(l, r);
      if (e.op === 'mul') return l + r;
      return r === 0 ? l : null; // division only by constants
    }
    case 'relation': {
      const degrees = e.operands.map((o) => polynomialDegree(o, defined));
      return degrees.every((d): d is number => d !== null) ? Math.max(...degrees) : null;
    }
    default:
      return null;
  }
}
