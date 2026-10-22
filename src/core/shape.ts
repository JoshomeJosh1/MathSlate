import {
  makeName,
  nameKey,
  type Definition,
  type Expr,
  type Name,
  type Statement,
} from '../parser/ast';
import { VECTOR_CALCULUS } from '../parser/vectorCalculus';

/**
 * Cheap static facts about an expression, used by commands to judge relevance and pick a
 * variable without asking the CAS.
 */
export interface ShapeFacts {
  /** Free variables (not defined in the document, not bound locally), sorted. */
  freeVars: Name[];
  isRelation: boolean;
  isEquation: boolean;
  /** Its value is a matrix or vector: a literal, a name defined as one, or arithmetic on them. */
  isMatrix: boolean;
  /** Its size, when it can be told without computing (null if unknown or not a matrix). */
  matrixSize: { rows: number; cols: number } | null;
  /** Built only from numbers, free variables, + − × and non-negative integer powers. */
  isPolynomial: boolean;
  /** Highest total degree if polynomial (0 for constants). */
  degree: number;
  /** Contains a power of a sum or a product of sums: something expand would change. */
  hasExpandableProduct: boolean;
  /** No free variables at all: evaluates to a number (or matrix of numbers). */
  isConstant: boolean;
  hasFunctions: boolean;
  /** Contains calculus operators or sequence terms: evaluating it computes something. */
  hasOperators: boolean;
  /** Contains a definite integral (evaluated in two passes: quick numeric, then exact). */
  hasDefiniteIntegral: boolean;
  /** Contains units (`5\unit{km}`) or a conversion: evaluating it computes something. */
  hasUnits: boolean;
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
  let hasOperators = false;
  let hasDefiniteIntegral = false;
  let hasUnits = false;
  const bound: string[] = [];
  const within = (name: Name, body: Expr) => {
    bound.push(nameKey(name));
    visit(body);
    bound.pop();
  };

  const visit = (e: Expr): void => {
    switch (e.kind) {
      case 'var': {
        const key = nameKey(e.name);
        if (!defined.has(key) && !bound.includes(key)) free.set(key, e.name);
        return;
      }
      case 'integral':
        hasOperators = true;
        if (e.lower) hasDefiniteIntegral = true;
        within(e.variable, e.integrand);
        if (e.lower) visit(e.lower);
        if (e.upper) visit(e.upper);
        return;
      case 'diff':
        hasOperators = true;
        within(e.variable, e.operand);
        return;
      case 'limit':
        hasOperators = true;
        within(e.variable, e.operand);
        visit(e.point);
        return;
      case 'bigop':
        hasOperators = true;
        within(e.index, e.operand);
        visit(e.lower);
        visit(e.upper);
        return;
      case 'call': {
        hasFunctions = true;
        const [operand, vars] = e.args;
        if (VECTOR_CALCULUS.has(e.fn.base) && operand) {
          // Differentiates: computes something; listed variables are bound in the operand.
          hasOperators = true;
          const names = vars?.kind === 'list' ? vars.items : [];
          for (const v of names) if (v.kind === 'var') bound.push(nameKey(v.name));
          visit(operand);
          bound.splice(bound.length - names.length, names.length);
          return;
        }
        e.args.forEach(visit);
        return;
      }
      case 'derivative':
        hasFunctions = true;
        hasOperators = true;
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
        hasOperators = true;
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
      case 'convert':
        hasUnits = true;
        visit(e.expr);
        return;
      case 'unit':
        hasUnits = true;
        return;
      case 'num':
      case 'constant':
        return;
    }
  };
  visit(expr);

  const poly = polynomialDegree(expr, defined);
  const size = matrixSize(expr, env, 0);
  const freeVars = [...free.values()].sort((a, b) => nameKey(a).localeCompare(nameKey(b)));
  return {
    freeVars,
    isRelation: expr.kind === 'relation',
    isEquation: expr.kind === 'relation' && expr.ops.length === 1 && expr.ops[0] === '=',
    isMatrix: size !== null,
    matrixSize: size === 'unknown' ? null : size,
    isPolynomial: poly !== null,
    degree: poly ?? 0,
    hasExpandableProduct,
    isConstant: freeVars.length === 0,
    hasFunctions,
    hasOperators,
    hasDefiniteIntegral,
    hasUnits,
  };
}

type Size = { rows: number; cols: number } | 'unknown' | null;

const VECTOR_VALUED = new Set(['grad', 'curl', 'jacobian', 'hessian']);

/** Functions of a matrix whose value is a matrix: how they change its size. */
const MATRIX_FUNCTIONS: Partial<Record<string, (s: { rows: number; cols: number }) => Size>> = {
  transpose: (s) => ({ rows: s.cols, cols: s.rows }),
  inverse: (s) => s,
  rref: (s) => s,
};

/**
 * Whether an expression's value is a matrix, and its size if that is clear from the source:
 * null (not a matrix), 'unknown' (a matrix of unknown size), or rows × columns.
 */
function matrixSize(e: Expr, env: readonly Definition[], depth: number): Size {
  if (depth > 20) return null; // definitions that refer to each other
  const go = (x: Expr) => matrixSize(x, env, depth + 1);
  switch (e.kind) {
    case 'matrix':
      return { rows: e.rows.length, cols: e.rows[0]?.length ?? 0 };
    case 'var': {
      const key = nameKey(e.name);
      const def = env.find((d) => d.kind === 'defConst' && nameKey(d.name) === key);
      return def && def.kind === 'defConst' ? go(def.body) : null;
    }
    case 'neg':
    case 'convert':
      return go(e.kind === 'neg' ? e.arg : e.expr);
    case 'call': {
      // Vector calculus: grad and curl are vectors, jacobian and hessian matrices.
      if (VECTOR_VALUED.has(e.fn.base)) return 'unknown';
      const fn = MATRIX_FUNCTIONS[e.fn.base];
      const arg = e.args[0] ? go(e.args[0]) : null;
      if (!fn || arg === null) return null;
      return arg === 'unknown' ? 'unknown' : fn(arg);
    }
    case 'binary': {
      const l = go(e.left);
      if (e.op === 'pow') {
        if (l === null || l === 'unknown') return l;
        const transposed = e.right.kind === 'var' && nameKey(e.right.name) === 'T';
        return transposed ? { rows: l.cols, cols: l.rows } : l;
      }
      const r = go(e.right);
      if (l === null) return e.op === 'div' ? null : r; // a number times a matrix
      if (r === null) return l;
      if (l === 'unknown' || r === 'unknown') return 'unknown';
      if (e.op === 'mul' && e.form !== 'cdot' && e.form !== 'times') {
        // A product of matrices; a 1×1 result is a number (vᵀw).
        return l.rows === 1 && r.cols === 1 ? null : { rows: l.rows, cols: r.cols };
      }
      if (e.op === 'mul') return e.form === 'times' ? l : null; // u×w is a vector, u·w a number
      return l;
    }
    default:
      return null;
  }
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
    case 'unit':
      return 0;
    case 'convert':
      return polynomialDegree(e.expr, defined);
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
