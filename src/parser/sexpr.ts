import { nameKey, type Expr, type Statement } from './ast';

/**
 * Compact Lisp-like rendering of the AST, for tests and the debug view. Spans and multiplication
 * forms are omitted: `2x + 1` → `(+ (* 2 x) 1)`.
 */
export function exprToSexpr(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'var':
      return nameKey(e.name);
    case 'constant':
      return `#${e.id}`;
    case 'neg':
      return `(- ${exprToSexpr(e.arg)})`;
    case 'binary': {
      const op = { add: '+', sub: '-', mul: '*', div: '/', pow: '^' }[e.op];
      return `(${op} ${exprToSexpr(e.left)} ${exprToSexpr(e.right)})`;
    }
    case 'factorial':
      return `(! ${exprToSexpr(e.arg)})`;
    case 'call':
      return `(${nameKey(e.fn)}${e.args.map((a) => ` ${exprToSexpr(a)}`).join('')})`;
    case 'derivative':
      return `(${nameKey(e.fn)}${"'".repeat(e.order)}${e.args.map((a) => ` ${exprToSexpr(a)}`).join('')})`;
    case 'index':
      return `(_ ${nameKey(e.seq)} ${exprToSexpr(e.index)})`;
    case 'matrix':
      return `[${e.rows.map((r) => `[${r.map(exprToSexpr).join(' ')}]`).join(' ')}]`;
    case 'abs':
      return `(abs ${exprToSexpr(e.arg)})`;
    case 'root':
      return e.degree
        ? `(root ${exprToSexpr(e.arg)} ${exprToSexpr(e.degree)})`
        : `(sqrt ${exprToSexpr(e.arg)})`;
    case 'list': {
      const tag = { paren: 'tuple', bracket: 'list', set: 'set' }[e.delim];
      return `(${tag}${e.items.map((a) => ` ${exprToSexpr(a)}`).join('')})`;
    }
    case 'integral': {
      const bounds = e.lower && e.upper ? ` ${exprToSexpr(e.lower)} ${exprToSexpr(e.upper)}` : '';
      return `(int ${exprToSexpr(e.integrand)} ${nameKey(e.variable)}${bounds})`;
    }
    case 'diff':
      return `(${e.partial ? 'pdiff' : 'diff'} ${exprToSexpr(e.operand)} ${nameKey(e.variable)} ${e.order})`;
    case 'limit':
      return `(lim ${exprToSexpr(e.operand)} ${nameKey(e.variable)} ${exprToSexpr(e.point)}${e.direction ? ` ${e.direction}` : ''})`;
    case 'bigop':
      return `(${e.op} ${exprToSexpr(e.operand)} ${nameKey(e.index)} ${exprToSexpr(e.lower)} ${exprToSexpr(e.upper)})`;
    case 'relation': {
      const parts = [exprToSexpr(e.operands[0] ?? e)];
      e.ops.forEach((op, k) => {
        const operand = e.operands[k + 1];
        if (operand) parts.push(op, exprToSexpr(operand));
      });
      return e.ops.length === 1
        ? `(${e.ops[0] ?? ''} ${parts[0] ?? ''} ${parts[2] ?? ''})`
        : `(rel ${parts.join(' ')})`;
    }
  }
}

export function statementToSexpr(s: Statement): string {
  switch (s.kind) {
    case 'empty':
      return '(empty)';
    case 'expr':
    case 'relation':
      return exprToSexpr(s.expr);
    case 'defConst':
      return `(def ${nameKey(s.name)} ${exprToSexpr(s.body)})`;
    case 'defFunc':
      return `(defn ${nameKey(s.name)} (${s.params.map(nameKey).join(' ')}) ${exprToSexpr(s.body)})`;
    case 'defSeq':
      return `(defseq ${nameKey(s.name)} ${nameKey(s.indexVar)} ${exprToSexpr(s.body)})`;
    case 'defSeqBase':
      return `(base ${nameKey(s.name)} ${s.index} ${exprToSexpr(s.body)})`;
  }
}
