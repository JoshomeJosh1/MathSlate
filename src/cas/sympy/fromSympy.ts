import { makeName, type ConstantId, type Expr, type Name, type RelOp } from '../../parser/ast';
import type { MulForm } from '../../parser/cst';
import { printLatex } from '../../parser/printLatex';
import type { CasExpr, CasValue } from '../types';

/** JSON shapes produced by runtime.py's `_tree`. */
export type SympyTree =
  | { t: 'int'; v: string }
  | { t: 'float'; v: string }
  | { t: 'sym'; name: string }
  | { t: 'const'; id: ConstantId }
  | { t: 'neg' | 'sqrt' | 'abs' | 'factorial'; a: SympyTree }
  | { t: 'add' | 'sub' | 'div' | 'pow'; l: SympyTree; r: SympyTree }
  | { t: 'mul'; l: SympyTree; r: SympyTree; form?: MulForm }
  | { t: 'root'; a: SympyTree; n: SympyTree }
  | { t: 'call'; fn: string; args: SympyTree[] }
  | { t: 'index'; seq: string; i: SympyTree }
  | { t: 'matrix'; rows: SympyTree[][] }
  | { t: 'list'; delim: 'paren' | 'set'; items: SympyTree[] }
  | { t: 'rel'; op: RelOp; l: SympyTree; r: SympyTree }
  | { t: 'and'; items: SympyTree[] }
  | { t: 'bool'; v: boolean };

export interface SympyValueJson {
  tree: SympyTree | null;
  latex: string;
}

export type SympyResultJson =
  | {
      ok: true;
      value:
        | ({ kind: 'expr'; numeric: SympyValueJson | null } & SympyValueJson)
        | { kind: 'solutions'; variable: string; solutions: SympyValueJson[] }
        | { kind: 'boolean'; value: boolean };
    }
  | { ok: false; error: string };

const NO_SPAN = { start: 0, end: 0 };

/** Inverse of nameKey: `v_{max}` → { base: 'v', sub: 'max' }. */
export function parseNameKey(key: string): Name {
  const m = /^(.*?)_\{(.*)\}$/.exec(key);
  return m?.[1] !== undefined && m[2] !== undefined ? makeName(m[1], m[2]) : makeName(key);
}

/** Converts a result tree to our AST; null if it contains something we cannot represent. */
export function treeToExpr(t: SympyTree): Expr | null {
  const span = NO_SPAN;
  const bin = (
    op: 'add' | 'sub' | 'mul' | 'div' | 'pow',
    l: SympyTree,
    r: SympyTree,
  ): Expr | null => {
    const left = treeToExpr(l);
    const right = treeToExpr(r);
    return left && right ? { kind: 'binary', op, left, right, span } : null;
  };
  const all = (items: SympyTree[]): Expr[] | null => {
    const out = items.map(treeToExpr);
    return out.every((x): x is Expr => x !== null) ? out : null;
  };
  switch (t.t) {
    case 'int':
    case 'float':
      return { kind: 'num', value: t.v, span };
    case 'sym':
      return { kind: 'var', name: parseNameKey(t.name), span };
    case 'const':
      return { kind: 'constant', id: t.id, span };
    case 'neg': {
      const arg = treeToExpr(t.a);
      return arg && { kind: 'neg', arg, span };
    }
    case 'sqrt': {
      const arg = treeToExpr(t.a);
      return arg && { kind: 'root', arg, span };
    }
    case 'abs': {
      const arg = treeToExpr(t.a);
      return arg && { kind: 'abs', arg, span };
    }
    case 'factorial': {
      const arg = treeToExpr(t.a);
      return arg && { kind: 'factorial', arg, span };
    }
    case 'root': {
      const arg = treeToExpr(t.a);
      const degree = treeToExpr(t.n);
      return arg && degree && { kind: 'root', arg, degree, span };
    }
    case 'add':
    case 'sub':
    case 'div':
    case 'pow':
      return bin(t.t, t.l, t.r);
    case 'mul': {
      const node = bin('mul', t.l, t.r);
      if (node?.kind === 'binary') {
        // Prefer juxtaposition (2x) unless the runtime asked for an explicit dot (2·3).
        node.form = t.form ?? 'juxt';
      }
      return node;
    }
    case 'call': {
      const args = all(t.args);
      return args && { kind: 'call', fn: makeName(t.fn), args, span };
    }
    case 'index': {
      const index = treeToExpr(t.i);
      return index && { kind: 'index', seq: parseNameKey(t.seq), index, span };
    }
    case 'matrix': {
      const rows = t.rows.map(all);
      return rows.every((r): r is Expr[] => r !== null) ? { kind: 'matrix', rows, span } : null;
    }
    case 'list': {
      const items = all(t.items);
      return items && { kind: 'list', delim: t.delim, items, span };
    }
    case 'rel': {
      const l = treeToExpr(t.l);
      const r = treeToExpr(t.r);
      return l && r && { kind: 'relation', ops: [t.op], operands: [l, r], span };
    }
    case 'and':
      return chainRelations(t.items);
    case 'bool':
      return null;
  }
}

/** And(a < x, x < b) → a < x < b when the relations share their middle operand. */
function chainRelations(items: SympyTree[]): Expr | null {
  const rels = items.map(treeToExpr);
  if (rels.length !== 2) return null;
  const [a, b] = rels;
  if (a?.kind !== 'relation' || b?.kind !== 'relation') return null;
  const aRight = a.operands[1];
  const bLeft = b.operands[0];
  const bRight = b.operands[1];
  const aOp = a.ops[0];
  const bOp = b.ops[0];
  if (!aRight || !bLeft || !bRight || !aOp || !bOp) return null;
  if (printLatex(aRight) !== printLatex(bLeft)) return null;
  return {
    kind: 'relation',
    ops: [aOp, bOp],
    operands: [a.operands[0] ?? aRight, aRight, bRight],
    span: NO_SPAN,
  };
}

function casExpr(v: SympyValueJson): CasExpr {
  const expr = v.tree ? treeToExpr(v.tree) : null;
  return { expr, latex: expr ? printLatex(expr) : v.latex };
}

export function toCasValue(v: Extract<SympyResultJson, { ok: true }>['value']): CasValue {
  switch (v.kind) {
    case 'expr':
      return { kind: 'expr', ...casExpr(v), numeric: v.numeric ? casExpr(v.numeric) : null };
    case 'solutions':
      return {
        kind: 'solutions',
        variable: parseNameKey(v.variable),
        solutions: v.solutions.map(casExpr),
      };
    case 'boolean':
      return { kind: 'boolean', value: v.value };
  }
}
