import type { BinaryOp, Cst, GroupDelim, MulForm } from './cst';
import { MathError, spanOf, type Span } from './errors';
import { tokenize, type Delim, type OpSymbol, type RelSymbol, type Token } from './lexer';

/**
 * Hand-written Pratt parser: LaTeX → CST for a single row.
 *
 * Binding powers (higher binds tighter):
 *   relations (=, <, \le, …)            top level only, may chain
 *   + -                                 20
 *   \cdot \times * / \div               30 (left-assoc)
 *   juxtaposition (implicit ×)          35: tighter than explicit operators, so letter runs stay
 *                                       together: speed\cdot time = speed·(time), a/2b = a/(2b)
 *   prefix -                            operand parsed at 30 (-2x = -(2x), -x^2 = -(x^2))
 *   ^ _ ' ! \%                          postfix on a primary
 * `^`, `_`, \frac and \sqrt take LaTeX arguments: one braced group or a single character.
 */

const ADD_BP = 20;
const MUL_BP = 30;
const JUXT_BP = 35;

const MATRIX_ENVS = new Set([
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'smallmatrix',
]);

const OPENERS: Partial<Record<Delim, { close: Delim; group: GroupDelim; label: string }>> = {
  '(': { close: ')', group: 'paren', label: ')' },
  '[': { close: ']', group: 'bracket', label: ']' },
  lset: { close: 'rset', group: 'set', label: '\\}' },
};

/** Empty-input result: rows with only whitespace parse to `null`. */
export function parseLatex(src: string): Cst | null {
  return new Parser(src).parseRow();
}

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  /** Depth of open |…| without an explicit \left| — a bare | then closes instead of opening. */
  private absDepth = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  parseRow(): Cst | null {
    if (this.peek().kind === 'eof') return null;
    const result = this.parseRelation();
    const t = this.peek();
    if (t.kind !== 'eof') throw new MathError(`Unexpected ${describe(t)}`, t.span);
    return result;
  }

  // ---------------------------------------------------------------- token helpers

  private peek(offset = 0): Token {
    const t = this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
    if (!t) throw new Error('token stream is empty');
    return t;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private isDelim(t: Token, d: Delim): boolean {
    return t.kind === 'delim' && t.delim === d;
  }

  private expectDelim(d: Delim, label: string, openSpan: Span): Token {
    const t = this.peek();
    if (!this.isDelim(t, d)) {
      throw new MathError(
        t.kind === 'eof' ? `Missing "${label}"` : `Expected "${label}" but found ${describe(t)}`,
        t.kind === 'eof' ? spanOf(openSpan, t.span) : t.span,
      );
    }
    return this.next();
  }

  // ---------------------------------------------------------------- expressions

  private parseRelation(): Cst {
    const first = this.parseExpr(0);
    const ops: RelSymbol[] = [];
    const operands: Cst[] = [first];
    for (let t = this.peek(); t.kind === 'rel'; t = this.peek()) {
      this.next();
      ops.push(t.op);
      if (this.peek().kind === 'eof') {
        throw new MathError(`Missing right-hand side after "${relLabel(t.op)}"`, t.span);
      }
      operands.push(this.parseExpr(0));
    }
    if (ops.length === 0) return first;
    const last = operands[operands.length - 1] ?? first;
    return { type: 'relation', ops, operands, span: spanOf(first.span, last.span) };
  }

  private parseExpr(rbp: number): Cst {
    let left = this.parsePrefix();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op') {
        const info = binaryInfo(t.op);
        if (!info)
          throw new MathError(`"${t.op === 'pm' ? '±' : '∓'}" is not supported yet`, t.span);
        if (info.bp <= rbp) break;
        this.next();
        if (this.peek().kind === 'eof') {
          throw new MathError(`Missing operand after ${describe(t)}`, t.span);
        }
        const right = this.parseExpr(info.bp);
        const node: Cst = {
          type: 'binary',
          op: info.op,
          left,
          right,
          span: spanOf(left.span, right.span),
        };
        if (info.form) node.form = info.form;
        left = node;
      } else if (this.startsPrimary(t)) {
        // Implicit multiplication: collect a flat juxtaposition so the resolver can see letter runs.
        if (JUXT_BP <= rbp) break;
        const right = this.parseExpr(JUXT_BP);
        left =
          left.type === 'juxt'
            ? { type: 'juxt', items: [...left.items, right], span: spanOf(left.span, right.span) }
            : { type: 'juxt', items: [left, right], span: spanOf(left.span, right.span) };
      } else {
        break;
      }
    }
    return left;
  }

  private parsePrefix(): Cst {
    const t = this.peek();
    if (t.kind === 'op' && (t.op === '-' || t.op === '+')) {
      this.next();
      if (this.peek().kind === 'eof')
        throw new MathError(`Missing operand after "${t.op}"`, t.span);
      const arg = this.parseExpr(MUL_BP);
      return t.op === '-' ? { type: 'neg', arg, span: spanOf(t.span, arg.span) } : arg;
    }
    return this.parsePostfix(this.parsePrimary());
  }

  /** Can `t` begin an operand? Used to detect implicit multiplication. */
  private startsPrimary(t: Token): boolean {
    switch (t.kind) {
      case 'num':
      case 'letter':
      case 'opname':
      case 'fn':
      case 'special':
      case 'cmd':
      case 'placeholder':
        return true;
      case 'env':
        return t.which === 'begin';
      case 'delim':
        return t.delim === '(' || t.delim === '[' || t.delim === 'lset' || t.delim === '{';
      case 'pipe':
        return t.role === 'open' || (t.role === 'either' && this.absDepth === 0);
      default:
        return false;
    }
  }

  private parsePostfix(base: Cst): Cst {
    let node = base;
    for (;;) {
      const t = this.peek();
      if (t.kind === 'sub') {
        if (node.type === 'sub' && node !== base) {
          throw new MathError('Double subscript: use braces, e.g. x_{12}', t.span);
        }
        this.next();
        const sub = this.parseScriptArg(t);
        node = { type: 'sub', base: node, sub, span: spanOf(node.span, sub.span) };
      } else if (t.kind === 'sup') {
        if (node.type === 'pow' && node !== base) {
          throw new MathError('Double exponent: use braces, e.g. x^{2^{3}}', t.span);
        }
        this.next();
        const primes = this.tryPrimeScript();
        if (primes) {
          node = {
            type: 'prime',
            base: node,
            count: primes.count,
            span: spanOf(node.span, primes.span),
          };
        } else {
          const exp = this.parseScriptArg(t);
          node = { type: 'pow', base: node, exp, span: spanOf(node.span, exp.span) };
        }
      } else if (t.kind === 'prime') {
        this.next();
        node =
          node.type === 'prime'
            ? { ...node, count: node.count + 1, span: spanOf(node.span, t.span) }
            : { type: 'prime', base: node, count: 1, span: spanOf(node.span, t.span) };
      } else if (t.kind === 'bang') {
        this.next();
        node = { type: 'factorial', arg: node, span: spanOf(node.span, t.span) };
      } else if (t.kind === 'percent') {
        this.next();
        node = { type: 'percent', arg: node, span: spanOf(node.span, t.span) };
      } else {
        return node;
      }
    }
  }

  /** `^{\prime}` / `^{\prime\prime}` (MathLive's rendering of f'). */
  private tryPrimeScript(): { count: number; span: Span } | null {
    const open = this.peek();
    if (!this.isDelim(open, '{')) return null;
    let k = 1;
    while (this.peek(k).kind === 'prime') k++;
    const close = this.peek(k);
    if (k === 1 || !this.isDelim(close, '}')) return null;
    this.pos += k + 1;
    return { count: k - 1, span: spanOf(open.span, close.span) };
  }

  /**
   * A LaTeX macro argument: `{…}` (any expression) or a single character. A multi-digit number
   * is split so `\frac23` is 2/3 and `x^23` is x²·3, as in LaTeX.
   */
  private parseScriptArg(owner: Token): Cst {
    const t = this.peek();
    if (this.isDelim(t, '{')) {
      this.next();
      // MathLive quirk: typing "log_2" yields \log_{_2}.
      if (owner.kind === 'sub' && this.peek().kind === 'sub') this.next();
      if (this.isDelim(this.peek(), '}')) {
        throw new MathError('Empty group', spanOf(t.span, this.peek().span));
      }
      const inner = this.parseRelation();
      this.expectDelim('}', '}', t.span);
      return inner;
    }
    if (t.kind === 'num' && t.value.length > 1) {
      const first: Cst = {
        type: 'num',
        value: t.value.charAt(0),
        span: { start: t.span.start, end: t.span.start + 1 },
      };
      this.tokens[this.pos] = {
        kind: 'num',
        value: t.value.slice(1),
        span: { start: t.span.start + 1, end: t.span.end },
      };
      return first;
    }
    if (
      t.kind === 'num' ||
      t.kind === 'letter' ||
      t.kind === 'special' ||
      t.kind === 'opname' ||
      t.kind === 'placeholder' ||
      (t.kind === 'cmd' && t.name !== 'binom')
    ) {
      return this.parsePrimary();
    }
    if (t.kind === 'fn') {
      this.next();
      return { type: 'opname', name: t.name, span: t.span };
    }
    const what =
      owner.kind === 'sub' ? 'subscript' : owner.kind === 'sup' ? 'exponent' : 'argument';
    throw new MathError(
      t.kind === 'eof' ? `Missing ${what}` : `Unexpected ${describe(t)} in ${what}`,
      t.kind === 'eof' ? owner.span : t.span,
    );
  }

  private parsePrimary(): Cst {
    const t = this.next();
    switch (t.kind) {
      case 'num':
        if (t.value === '.') throw new MathError('Invalid number', t.span);
        return { type: 'num', value: t.value, span: t.span };
      case 'letter':
        return { type: 'letter', name: t.name, span: t.span };
      case 'opname':
        return { type: 'opname', name: t.name, span: t.span };
      case 'special':
        return { type: 'special', id: t.id, span: t.span };
      case 'placeholder':
        throw new MathError('Fill in the empty box', t.span);
      case 'fn':
        return this.parseFunction(t);
      case 'cmd':
        return this.parseCommand(t);
      case 'env':
        if (t.which === 'begin') return this.parseEnvironment(t);
        throw new MathError(`Unexpected \\end{${t.env}}`, t.span);
      case 'delim':
        return this.parseDelimited(t);
      case 'pipe':
        if (t.role === 'close') break;
        return this.parseAbs(t);
      case 'eof':
        throw new MathError('Missing expression', t.span);
      default:
        break;
    }
    throw new MathError(`Unexpected ${describe(t)}`, t.span);
  }

  private parseDelimited(open: Token & { kind: 'delim' }): Cst {
    if (open.delim === '{') {
      // Plain TeX grouping: {x+1} is just x+1.
      if (this.isDelim(this.peek(), '}')) {
        throw new MathError('Empty group', spanOf(open.span, this.peek().span));
      }
      const inner = this.parseRelation();
      this.expectDelim('}', '}', open.span);
      return inner;
    }
    const info = OPENERS[open.delim];
    if (!info) throw new MathError(`Unexpected ${describe(open)}`, open.span);
    const saved = this.absDepth;
    this.absDepth = 0;
    const items: Cst[] = [];
    if (!this.isDelim(this.peek(), info.close)) {
      for (;;) {
        items.push(this.parseRelation());
        if (this.peek().kind !== 'comma') break;
        this.next();
      }
    }
    const close = this.expectDelim(info.close, info.label, open.span);
    this.absDepth = saved;
    const span = spanOf(open.span, close.span);
    // SymPy prints matrices as \left[\begin{matrix}…\end{matrix}\right]; fold the brackets in.
    const only = items.length === 1 ? items[0] : undefined;
    if (only?.type === 'matrix' && only.env === 'matrix' && info.group !== 'set') {
      return { ...only, env: info.group === 'paren' ? 'pmatrix' : 'bmatrix', span };
    }
    if (items.length === 0 && info.group === 'paren')
      throw new MathError('Empty parentheses', span);
    return { type: 'group', delim: info.group, items, span };
  }

  private parseAbs(open: Token): Cst {
    this.absDepth++;
    const arg = this.parseExpr(0);
    this.absDepth--;
    const close = this.peek();
    if (close.kind !== 'pipe' || close.role === 'open') {
      throw new MathError(
        close.kind === 'eof' ? 'Missing closing "|"' : `Expected "|" but found ${describe(close)}`,
        close.kind === 'eof' ? spanOf(open.span, close.span) : close.span,
      );
    }
    this.next();
    return { type: 'abs', arg, span: spanOf(open.span, close.span) };
  }

  private parseCommand(t: Token & { kind: 'cmd' }): Cst {
    switch (t.name) {
      case 'frac': {
        const num = this.parseScriptArg(t);
        const den = this.parseScriptArg(t);
        return { type: 'frac', num, den, span: spanOf(t.span, den.span) };
      }
      case 'binom': {
        const n = this.parseScriptArg(t);
        const k = this.parseScriptArg(t);
        return { type: 'binom', n, k, span: spanOf(t.span, k.span) };
      }
      case 'sqrt': {
        let index: Cst | undefined;
        const open = this.peek();
        if (this.isDelim(open, '[')) {
          this.next();
          index = this.parseExpr(0);
          this.expectDelim(']', ']', open.span);
        }
        const arg = this.parseScriptArg(t);
        const span = spanOf(t.span, arg.span);
        return index ? { type: 'sqrt', arg, index, span } : { type: 'sqrt', arg, span };
      }
      default:
        throw new MathError(`Unexpected \\${t.name}`, t.span);
    }
  }

  private parseEnvironment(begin: Token & { kind: 'env' }): Cst {
    if (!MATRIX_ENVS.has(begin.env)) {
      throw new MathError(`The "${begin.env}" environment is not supported`, begin.span);
    }
    const rows: Cst[][] = [];
    let row: Cst[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === 'env' && t.which === 'end') {
        this.next();
        if (t.env !== begin.env) {
          throw new MathError(`\\begin{${begin.env}} ended by \\end{${t.env}}`, t.span);
        }
        if (row.length > 0) rows.push(row);
        const span = spanOf(begin.span, t.span);
        if (rows.length === 0) throw new MathError('Empty matrix', span);
        const width = rows[0]?.length ?? 0;
        const bad = rows.find((r) => r.length !== width);
        if (bad) {
          throw new MathError('All matrix rows must have the same number of entries', span);
        }
        return { type: 'matrix', env: begin.env, rows, span };
      }
      if (t.kind === 'eof') {
        throw new MathError(`Missing \\end{${begin.env}}`, spanOf(begin.span, t.span));
      }
      if (t.kind === 'amp' || t.kind === 'rowsep') {
        throw new MathError('Empty matrix entry', t.span);
      }
      row.push(this.parseRelation());
      const sep = this.peek();
      if (sep.kind === 'amp') {
        this.next();
      } else if (sep.kind === 'rowsep') {
        this.next();
        rows.push(row);
        row = [];
      } else if (sep.kind === 'eof') {
        throw new MathError(`Missing \\end{${begin.env}}`, spanOf(begin.span, sep.span));
      } else if (!(sep.kind === 'env' && sep.which === 'end')) {
        throw new MathError(`Unexpected ${describe(sep)} in matrix`, sep.span);
      }
    }
  }

  /**
   * \sin x, \sin^2 x, \log_2 8, \gcd(a,b). Without parentheses the argument is a run of
   * implicitly multiplied factors that stops at the next function: \sin 2x \cos x = sin(2x)·cos(x).
   */
  private parseFunction(t: Token & { kind: 'fn' }): Cst {
    let sub: Cst | undefined;
    let power: Cst | undefined;
    for (let s = this.peek(); s.kind === 'sub' || s.kind === 'sup'; s = this.peek()) {
      this.next();
      if (s.kind === 'sub') {
        if (sub) throw new MathError('Double subscript', s.span);
        sub = this.parseScriptArg(s);
      } else {
        if (power) throw new MathError('Double exponent', s.span);
        power = this.parseScriptArg(s);
      }
    }
    let arg: Cst | undefined;
    const a = this.peek();
    if (this.isDelim(a, '(')) {
      // No postfix here: \sin(x)^2 is (sin x)^2, applied by the caller's parsePostfix.
      arg = this.parsePrimary();
    } else if (this.startsPrimary(a) || (a.kind === 'op' && a.op === '-')) {
      const factors: Cst[] = [this.parsePrefix()];
      while (this.startsPrimary(this.peek()) && this.peek().kind !== 'fn') {
        factors.push(this.parsePostfix(this.parsePrimary()));
      }
      const first = factors[0];
      const last = factors[factors.length - 1];
      if (!first || !last) throw new Error('unreachable');
      arg =
        factors.length === 1
          ? first
          : { type: 'juxt', items: factors, span: spanOf(first.span, last.span) };
    }
    const end = arg ?? power ?? sub;
    const node: Cst = {
      type: 'fnapp',
      name: t.name,
      span: end ? spanOf(t.span, end.span) : t.span,
    };
    if (sub) node.sub = sub;
    if (power) node.power = power;
    if (arg) node.arg = arg;
    return node;
  }
}

function binaryInfo(op: OpSymbol): { op: BinaryOp; bp: number; form?: MulForm } | null {
  switch (op) {
    case '+':
      return { op: 'add', bp: ADD_BP };
    case '-':
      return { op: 'sub', bp: ADD_BP };
    case '*':
      return { op: 'mul', bp: MUL_BP, form: 'star' };
    case 'cdot':
      return { op: 'mul', bp: MUL_BP, form: 'cdot' };
    case 'times':
      return { op: 'mul', bp: MUL_BP, form: 'times' };
    case '/':
    case 'div':
      return { op: 'div', bp: MUL_BP };
    case 'pm':
    case 'mp':
      return null;
  }
}

function relLabel(op: RelSymbol): string {
  return { '=': '=', '<': '<', '>': '>', '<=': '≤', '>=': '≥', '!=': '≠' }[op];
}

function describe(t: Token): string {
  switch (t.kind) {
    case 'eof':
      return 'end of input';
    case 'num':
      return `number ${t.value}`;
    case 'letter':
      return `"${t.name}"`;
    case 'opname':
    case 'fn':
      return `"${t.name}"`;
    case 'op':
      return `"${{ '+': '+', '-': '−', '*': '*', '/': '/', cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓' }[t.op]}"`;
    case 'rel':
      return `"${relLabel(t.op)}"`;
    case 'delim':
      return `"${{ '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}', lset: '{', rset: '}' }[t.delim]}"`;
    case 'pipe':
      return '"|"';
    case 'comma':
      return '","';
    case 'amp':
      return '"&"';
    case 'rowsep':
      return 'line break';
    case 'bang':
      return '"!"';
    case 'sub':
      return 'subscript';
    case 'sup':
      return 'exponent';
    case 'env':
      return `\\${t.which}{${t.env}}`;
    default:
      return `"${t.kind}"`;
  }
}
