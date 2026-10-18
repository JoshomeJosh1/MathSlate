import type { ConstantId, Expr, Name, RelOp, Statement } from './ast';
import { FUNCTION_COMMANDS } from './lexer';

/**
 * AST → canonical LaTeX that our own parser reads back to the same tree (in the same document
 * context). Used for promoting CAS results to input rows and for displaying normalised input.
 */

const CONSTANTS: Record<ConstantId, string> = {
  pi: '\\pi',
  e: '\\exponentialE',
  i: '\\imaginaryI',
  infinity: '\\infty',
};

const RELATIONS: Record<RelOp, string> = {
  '=': '=',
  '<': '<',
  '>': '>',
  '<=': '\\le',
  '>=': '\\ge',
  '!=': '\\ne',
};

/** Precedence for parenthesisation; atoms (including \frac) are highest. */
function prec(e: Expr): number {
  switch (e.kind) {
    case 'relation':
      return 0;
    case 'binary':
      return e.op === 'add' || e.op === 'sub' ? 1 : e.op === 'mul' ? 2 : e.op === 'pow' ? 3 : 5;
    case 'neg':
      return 2;
    case 'factorial':
      return 4;
    default:
      return 5;
  }
}

const paren = (s: string) => `\\left(${s}\\right)`;

export function printName(name: Name): string {
  const base = /^[A-Za-z]{2,}$/.test(name.base) ? `\\operatorname{${name.base}}` : name.base;
  return name.sub === undefined ? base : `${base}_{${name.sub}}`;
}

function printFunctionName(name: Name): string {
  if (name.sub === undefined && FUNCTION_COMMANDS.has(name.base)) return `\\${name.base}`;
  return printName(name);
}

export function printLatex(e: Expr): string {
  const wrap = (child: Expr, minPrec: number) => {
    const s = printLatex(child);
    return prec(child) < minPrec ? paren(s) : s;
  };
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'var':
      return printName(e.name);
    case 'constant':
      return CONSTANTS[e.id];
    case 'neg':
      return `-${wrap(e.arg, 2)}`;
    case 'binary':
      switch (e.op) {
        case 'add':
        case 'sub': {
          const right = e.right.kind === 'neg' ? paren(printLatex(e.right)) : wrap(e.right, 2);
          return `${wrap(e.left, 1)}${e.op === 'add' ? '+' : '-'}${right}`;
        }
        case 'mul': {
          const left = wrap(e.left, 2);
          const right =
            e.right.kind === 'neg' || prec(e.right) <= 2
              ? paren(printLatex(e.right))
              : printLatex(e.right);
          return `${left}${mulSeparator(e, left, right)}${right}`;
        }
        case 'div':
          return `\\frac{${printLatex(e.left)}}{${printLatex(e.right)}}`;
        case 'pow':
          return `${wrap(e.left, 5)}^{${printLatex(e.right)}}`;
      }
      break;
    case 'factorial':
      return `${wrap(e.arg, 5)}!`;
    case 'call':
      if (e.fn.base === 'log' && e.args.length === 2 && e.args[0] && e.args[1]) {
        return `\\log_{${printLatex(e.args[1])}}${paren(printLatex(e.args[0]))}`;
      }
      if (e.fn.base === 'binomial' && e.args.length === 2 && e.args[0] && e.args[1]) {
        return `\\binom{${printLatex(e.args[0])}}{${printLatex(e.args[1])}}`;
      }
      return `${printFunctionName(e.fn)}${paren(e.args.map(printLatex).join(','))}`;
    case 'derivative':
      return `${printName(e.fn)}^{${'\\prime'.repeat(e.order)}}${paren(e.args.map(printLatex).join(','))}`;
    case 'index':
      return `${printName(e.seq)}_{${printLatex(e.index)}}`;
    case 'matrix':
      return `\\begin{pmatrix}${e.rows.map((r) => r.map(printLatex).join('&')).join('\\\\')}\\end{pmatrix}`;
    case 'abs':
      return `\\left|${printLatex(e.arg)}\\right|`;
    case 'root':
      return e.degree
        ? `\\sqrt[${printLatex(e.degree)}]{${printLatex(e.arg)}}`
        : `\\sqrt{${printLatex(e.arg)}}`;
    case 'list': {
      const items = e.items.map(printLatex).join(',');
      if (e.delim === 'paren') return paren(items);
      if (e.delim === 'bracket') return `\\left\\lbrack ${items}\\right\\rbrack`;
      return `\\left\\lbrace ${items}\\right\\rbrace`;
    }
    case 'relation': {
      let out = wrap(e.operands[0] ?? e, 1);
      e.ops.forEach((op, k) => {
        const operand = e.operands[k + 1];
        if (operand) out += `${RELATIONS[op]}${wrap(operand, 1)}`;
      });
      return out;
    }
  }
  throw new Error('unreachable');
}

/**
 * Juxtaposition is only printed where it cannot be misread: after a number, before something
 * that does not start with a digit (2x, 2\sin…, 2\left(…). Elsewhere \cdot keeps letters from
 * merging into a longer name.
 */
function mulSeparator(e: Expr & { kind: 'binary' }, left: string, right: string): string {
  if (e.form === 'times') return '\\times ';
  if (e.form === 'juxt' && e.left.kind === 'num' && !/^[0-9.]/.test(right) && !left.endsWith('.')) {
    return '';
  }
  return '\\cdot ';
}

export function printStatement(s: Statement): string {
  switch (s.kind) {
    case 'empty':
      return '';
    case 'expr':
    case 'relation':
      return printLatex(s.expr);
    case 'defConst':
      return `${printName(s.name)}=${printLatex(s.body)}`;
    case 'defFunc':
      return `${printName(s.name)}${paren(s.params.map(printName).join(','))}=${printLatex(s.body)}`;
    case 'defSeq':
      return `${printName(s.name)}_{${printName(s.indexVar)}}=${printLatex(s.body)}`;
    case 'defSeqBase':
      return `${printName(s.name)}_{${s.index}}=${printLatex(s.body)}`;
  }
}
