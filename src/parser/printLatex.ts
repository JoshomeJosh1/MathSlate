import type { ConstantId, Expr, Name, RelOp, Statement } from './ast';
import { FUNCTION_LATEX, SUBSCRIPT_FIRST } from './functionNames';
import { LATEX_FUNCTION_COMMANDS } from './lexer';
import { unitText } from './units';

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
    case 'convert':
      return 0;
    case 'binary':
      return e.op === 'add' || e.op === 'sub' ? 1 : e.op === 'mul' ? 2 : e.op === 'pow' ? 3 : 5;
    case 'neg':
      return 2;
    case 'factorial':
    case 'integral': // ends in "dx": parenthesise it when raised to a power
      return 4;
    default:
      return 5;
  }
}

const paren = (s: string) => `\\left(${s}\\right)`;

export function printName(name: Name): string {
  // Multi-letter names print upright, as recognised names are shown in the editor (decorate.ts).
  const base = /^[A-Za-z]{2,}$/.test(name.base) ? `\\mathrm{${name.base}}` : name.base;
  return name.sub === undefined ? base : `${base}_{${name.sub}}`;
}

function printFunctionName(name: Name): string {
  if (name.sub !== undefined) return printName(name);
  const special = FUNCTION_LATEX[name.base];
  if (special) return special;
  if (LATEX_FUNCTION_COMMANDS.has(name.base)) return `\\${name.base}`;
  // Multi-letter function names are upright operator names: \operatorname{erf}, \operatorname{lcm}.
  return /^[A-Za-z]{2,}$/.test(name.base) ? `\\operatorname{${name.base}}` : printName(name);
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
    case 'unit':
      return `\\unit{${unitText(e.factors)}}`;
    case 'convert':
      return `${wrap(e.expr, 1)}\\to\\unit{${unitText(e.target)}}`;
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
      if (SUBSCRIPT_FIRST.has(e.fn.base) && e.args.length >= 2 && e.args[0]) {
        // J_n(x), Li_s(x): the first argument is a subscript.
        const [first, ...rest] = e.args;
        return `${printFunctionName(e.fn)}_{${printLatex(first)}}${paren(rest.map(printLatex).join(','))}`;
      }
      return `${printFunctionName(e.fn)}${paren(e.args.map(printLatex).join(','))}`;
    case 'derivative':
      return `${printName(e.fn)}^{${'\\prime'.repeat(e.order)}}${paren(e.args.map(printLatex).join(','))}`;
    case 'index':
      return `${printName(e.seq)}_{${printLatex(e.index)}}`;
    case 'matrix':
      return `\\begin{bmatrix}${e.rows.map((r) => r.map(printLatex).join('&')).join('\\\\')}\\end{bmatrix}`;
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
    case 'integral': {
      const bounds = e.lower && e.upper ? `_{${printLatex(e.lower)}}^{${printLatex(e.upper)}}` : '';
      // The space keeps "\int x" from reading as the command "\intx".
      return `\\int${bounds} ${printLatex(e.integrand)}\\,\\mathrm{d}${printName(e.variable)}`;
    }
    case 'diff': {
      const d = e.partial ? '\\partial' : '\\mathrm{d}';
      const n = e.order === 1 ? '' : `^{${e.order}}`;
      const sep = e.partial ? ' ' : '';
      return `\\frac{${d}${n}}{${d}${sep}${printName(e.variable)}${n}}${paren(printLatex(e.operand))}`;
    }
    case 'limit': {
      const dir = e.direction ? `^{${e.direction}}` : '';
      return `\\lim_{${printName(e.variable)}\\to ${printLatex(e.point)}${dir}}${paren(printLatex(e.operand))}`;
    }
    case 'bigop':
      return `\\${e.op}_{${printName(e.index)}=${printLatex(e.lower)}}^{${printLatex(e.upper)}}${paren(printLatex(e.operand))}`;
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
  // A quantity: 5\unit{km}, (x+1)\unit{m} (the unit draws its own space).
  if (e.right.kind === 'unit' && e.left.kind !== 'unit') return '';
  if (e.form === 'juxt') {
    // After a number: 2x, 2\sin…  Before a command: x\cos(x), x\left(x+1\right) — a command
    // cannot merge with the letters before it into a longer name.
    if (e.left.kind === 'num' && !/^[0-9.]/.test(right) && !left.endsWith('.')) return '';
    if (right.startsWith('\\') && !right.startsWith('\\cdot')) return '';
    // After a power, subscript or bracket (x^{2}y, (x+1)y): the letters cannot merge into a name.
    if ((left.endsWith('}') || left.endsWith(')')) && /^[A-Za-z]/.test(right)) return '';
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
