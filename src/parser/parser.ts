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

/** The `env` of a matrix typed inline in square brackets ([1, 2; 3, 4]), shown as a pmatrix. */
export const INLINE_MATRIX = 'inline';

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
  /** > 0 while parsing an integrand, where "d x" is the differential that ends it. */
  private integrandDepth = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  parseRow(): Cst | null {
    if (this.peek().kind === 'eof') return null;
    let result = this.parseRelation();
    if (this.peek().kind === 'to') result = this.parseConversion(result);
    const t = this.peek();
    if (t.kind !== 'eof') throw new MathError(`Unexpected ${describe(t)}`, t.span);
    return result;
  }

  /**
   * `… \to [unit]` ends a row: show the value in that unit. On a definition (`d = vt \to km`)
   * it applies to the right-hand side, so the row still defines d.
   */
  private parseConversion(value: Cst): Cst {
    const to = this.next();
    if (this.peek().kind === 'eof') throw new MathError('Missing unit after "→"', to.span);
    const target = this.parseExpr(0);
    const convert = (expr: Cst): Cst => ({
      type: 'convert',
      expr,
      target,
      span: spanOf(expr.span, target.span),
    });
    if (value.type === 'relation' && value.ops.length === 1 && value.ops[0] === '=') {
      const [lhs, rhs] = value.operands;
      if (lhs && rhs) {
        const operands = [lhs, convert(rhs)];
        return { ...value, operands, span: spanOf(value.span, target.span) };
      }
    }
    return convert(value);
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
        // Inside an integrand, "dx" ends the expression instead of multiplying it.
        if (this.atDifferential()) break;
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
      case 'unit':
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
      // A lone sign, as in the one-sided limit point 0^{+}.
      const sign = this.peek();
      if (
        sign.kind === 'op' &&
        (sign.op === '+' || sign.op === '-') &&
        this.isDelim(this.peek(1), '}')
      ) {
        this.pos += 2;
        return {
          type: 'sign',
          sign: sign.op,
          span: spanOf(t.span, this.tokens[this.pos - 1]?.span ?? sign.span),
        };
      }
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
      case 'opname': {
        const node: Cst = { type: 'opname', name: t.name, span: t.span };
        if (t.operator) node.operator = true;
        if (t.command) node.command = true;
        return node;
      }
      case 'special':
        return { type: 'special', id: t.id, span: t.span };
      case 'unit':
        return { type: 'unit', text: t.text, span: t.span };
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
    const savedIntegrand = this.integrandDepth;
    this.absDepth = 0;
    this.integrandDepth = 0; // a "d x" inside parentheses is not the integral's differential
    // Items separated by commas; in square brackets, rows separated by semicolons.
    const rows: Cst[][] = [[]];
    if (!this.isDelim(this.peek(), info.close)) {
      for (;;) {
        rows[rows.length - 1]?.push(this.parseRelation());
        const sep = this.peek();
        if (sep.kind === 'semicolon' && info.group === 'bracket') rows.push([]);
        else if (sep.kind !== 'comma') break;
        this.next();
      }
    }
    const close = this.expectDelim(info.close, info.label, open.span);
    this.absDepth = saved;
    this.integrandDepth = savedIntegrand;
    const span = spanOf(open.span, close.span);
    const items = rows[0] ?? [];
    // Square brackets with several entries are a matrix written inline: [1, 2; 3, 4], or a
    // column vector: [1, 2, 3]. (One entry in square brackets is a unit.)
    if (info.group === 'bracket' && (rows.length > 1 || items.length > 1)) {
      const matrix = rows.length > 1 ? rows : items.map((item) => [item]);
      const width = matrix[0]?.length ?? 0;
      if (matrix.some((r) => r.length !== width)) {
        throw new MathError('All matrix rows must have the same number of entries', span);
      }
      return { type: 'matrix', env: INLINE_MATRIX, rows: matrix, span };
    }
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
        const derivative = derivativeOperator(num, den);
        if (derivative) {
          // \frac{d}{dx} f: the operand follows (like a function argument); \frac{dy}{dx} has it inside.
          const operand = derivative.operand ?? this.parseOperatorArgument();
          if (!operand) {
            throw new MathError('Write what to differentiate after d/dx', spanOf(t.span, den.span));
          }
          return {
            type: 'deriv',
            operand,
            variable: derivative.variable,
            order: derivative.order,
            partial: derivative.partial,
            dSpans: derivative.dSpans,
            span: spanOf(t.span, operand.span),
          };
        }
        return { type: 'frac', num, den, span: spanOf(t.span, den.span) };
      }
      case 'int':
        return this.parseIntegral(t);
      case 'sum':
      case 'prod':
        return this.parseBigOperator(t, t.name);
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
    if (t.name === 'lim') return this.parseLimit(t);
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
    const arg = this.parseOperatorArgument('function');
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

  /**
   * The operand of a function or operator: a run of implicitly multiplied factors, ending at
   * + − = etc. (and at an integral's dx). Undefined if nothing operand-like follows.
   *
   * - 'function' (\sin, \ln): a parenthesised argument stands alone — \sin(x)^2 is (sin x)^2 —
   *   and the run stops at the next function: \sin x\cos x = sin(x)·cos(x).
   * - 'operator' (d/dx, \lim, \sum, \prod): the whole run, through functions and powers of
   *   parentheses: \lim_{x\to0} x\ln x, \lim_{x\to\infty}(1+1/x)^x.
   */
  private parseOperatorArgument(mode: 'function' | 'operator' = 'operator'): Cst | undefined {
    const a = this.peek();
    if (mode === 'function' && this.isDelim(a, '(')) {
      // No postfix here: \sin(x)^2 is (sin x)^2, applied by the caller's parsePostfix.
      return this.parsePrimary();
    }
    if (!(this.startsPrimary(a) || (a.kind === 'op' && a.op === '-')) || this.atDifferential()) {
      return undefined;
    }
    const factors: Cst[] = [this.parsePrefix()];
    while (
      this.startsPrimary(this.peek()) &&
      (mode === 'operator' || this.peek().kind !== 'fn') &&
      !this.atDifferential()
    ) {
      factors.push(this.parsePostfix(this.parsePrimary()));
    }
    const first = factors[0];
    const last = factors[factors.length - 1];
    if (!first || !last) throw new Error('unreachable');
    return factors.length === 1
      ? first
      : { type: 'juxt', items: factors, span: spanOf(first.span, last.span) };
  }

  /** Inside an integrand, is the next thing the differential "d x" (or \mathrm{d}x, \differentialD x)? */
  private atDifferential(): boolean {
    if (this.integrandDepth === 0) return false;
    const d = this.peek();
    if (d.kind === 'opname') return /^d[A-Za-z]$/.test(d.name); // \mathrm{dx}
    return d.kind === 'letter' && d.name === 'd' && this.peek(1).kind === 'letter';
  }

  /** Consumes the integral's differential and returns its variable. */
  private parseDifferential(owner: Token): { variable: Cst; dSpan?: Span } {
    const d = this.peek();
    if (this.atDifferential()) {
      if (d.kind === 'opname') {
        this.next();
        return {
          variable: {
            type: 'letter',
            name: d.name.slice(1),
            span: { start: d.span.start, end: d.span.end },
          },
        };
      }
      this.next();
      const v = this.next();
      if (v.kind === 'letter') {
        return { variable: { type: 'letter', name: v.name, span: v.span }, dSpan: d.span };
      }
    }
    throw new MathError(
      'Missing "dx" at the end of the integral',
      spanOf(owner.span, d.kind === 'eof' ? d.span : d.span),
    );
  }

  /** A bound in _{…} or ^{…}; an empty MathLive box (\placeholder{}) means "no bound". */
  private parseBound(owner: Token): Cst | undefined {
    const t = this.peek();
    if (t.kind === 'placeholder') {
      this.next();
      return undefined;
    }
    if (
      this.isDelim(t, '{') &&
      this.peek(1).kind === 'placeholder' &&
      this.isDelim(this.peek(2), '}')
    ) {
      this.pos += 3;
      return undefined;
    }
    return this.parseScriptArg(owner);
  }

  /** Reads optional _{…} and ^{…} (either order) after an operator. */
  private parseBounds(): { lower?: Cst; upper?: Cst; lowerToken?: Token } {
    const out: { lower?: Cst; upper?: Cst; lowerToken?: Token } = {};
    for (let s = this.peek(); s.kind === 'sub' || s.kind === 'sup'; s = this.peek()) {
      this.next();
      const bound = this.parseBound(s);
      if (s.kind === 'sub') {
        out.lowerToken = s;
        if (bound) out.lower = bound;
      } else if (bound) {
        out.upper = bound;
      }
    }
    return out;
  }

  /** \int f\,dx (antiderivative) or \int_a^b f\,dx (definite). */
  private parseIntegral(t: Token & { kind: 'cmd' }): Cst {
    const { lower, upper } = this.parseBounds();
    if ((lower === undefined) !== (upper === undefined)) {
      throw new MathError('A definite integral needs both a lower and an upper bound', t.span);
    }
    this.integrandDepth++;
    let integrand: Cst;
    try {
      integrand = this.atDifferential()
        ? { type: 'num', value: '1', span: t.span }
        : this.parseExpr(0);
    } finally {
      this.integrandDepth--;
    }
    this.integrandDepth++;
    let differential: { variable: Cst; dSpan?: Span };
    try {
      differential = this.parseDifferential(t);
    } finally {
      this.integrandDepth--;
    }
    const { variable, dSpan } = differential;
    const node: Cst = {
      type: 'integral',
      integrand,
      variable,
      span: spanOf(t.span, variable.span),
    };
    if (dSpan) node.dSpan = dSpan;
    if (lower && upper) {
      node.lower = lower;
      node.upper = upper;
    }
    return node;
  }

  /** \sum_{n=1}^{N} f and \prod_{k=1}^{n} f. */
  private parseBigOperator(t: Token & { kind: 'cmd' }, op: 'sum' | 'prod'): Cst {
    const { lower, upper } = this.parseBounds();
    const symbol = op === 'sum' ? '\\sum' : '\\prod';
    const lowerOk =
      lower?.type === 'relation' &&
      lower.ops.length === 1 &&
      lower.ops[0] === '=' &&
      lower.operands[0]?.type === 'letter';
    if (!lower || !upper || !lowerOk) {
      throw new MathError(`Write ${symbol} with bounds, e.g. ${symbol}_{n=1}^{10}`, t.span);
    }
    const [index, from] = lower.operands;
    if (!index || !from) throw new Error('unreachable');
    const operand = this.parseOperatorArgument();
    if (!operand)
      throw new MathError(
        `Write what to ${op === 'sum' ? 'add up' : 'multiply'} after ${symbol}`,
        t.span,
      );
    return {
      type: 'bigop',
      op,
      index,
      lower: from,
      upper,
      operand,
      span: spanOf(t.span, operand.span),
    };
  }

  /** \lim_{x\to a} f, \lim_{x\to 0^{+}} f */
  private parseLimit(t: Token & { kind: 'fn' }): Cst {
    const sub = this.peek();
    const open = this.peek(1);
    if (sub.kind !== 'sub' || !this.isDelim(open, '{')) {
      throw new MathError('Write the limit as \\lim_{x\\to a}', t.span);
    }
    this.pos += 2;
    const v = this.next();
    if (v.kind !== 'letter')
      throw new MathError('Expected the limit variable, e.g. x\\to 0', v.span);
    const to = this.next();
    if (to.kind !== 'to') throw new MathError('Expected "\\to" after the limit variable', to.span);
    let point = this.parseExpr(0);
    this.expectDelim('}', '}', open.span);
    let direction: '+' | '-' | undefined;
    if (point.type === 'pow' && point.exp.type === 'sign') {
      direction = point.exp.sign;
      point = point.base;
    }
    const operand = this.parseOperatorArgument();
    if (!operand) throw new MathError('Write what to take the limit of after \\lim', t.span);
    const node: Cst = {
      type: 'limit',
      operand,
      variable: { type: 'letter', name: v.name, span: v.span },
      point,
      span: spanOf(t.span, operand.span),
    };
    if (direction) node.direction = direction;
    return node;
  }
}

/** Recognises \frac{d}{dx}, \frac{d^2}{dx^2}, \frac{dy}{dx}, \frac{\partial}{\partial x}. */
function derivativeOperator(
  num: Cst,
  den: Cst,
): { variable: Cst; order: number; partial: boolean; dSpans: Span[]; operand?: Cst } | null {
  const isD = (c: Cst | undefined): c is Cst & { type: 'letter' } =>
    c?.type === 'letter' && (c.name === 'd' || c.name === '\\partial');
  const integer = (c: Cst) =>
    c.type === 'num' && /^[0-9]+$/.test(c.value) ? Number(c.value) : null;

  let d: (Cst & { type: 'letter' }) | null = null;
  let order = 1;
  let operand: Cst | undefined;
  if (isD(num)) {
    d = num;
  } else if (num.type === 'pow' && isD(num.base) && integer(num.exp) !== null) {
    d = num.base;
    order = integer(num.exp) ?? 1;
  } else if (num.type === 'juxt' && isD(num.items[0]) && num.items.length >= 2) {
    d = num.items[0];
    const rest = num.items.slice(1);
    const first = rest[0];
    const last = rest[rest.length - 1];
    if (!first || !last) return null;
    operand =
      rest.length === 1
        ? first
        : { type: 'juxt', items: rest, span: spanOf(first.span, last.span) };
  }
  if (!d) return null;

  if (den.type !== 'juxt' || den.items.length !== 2) return null;
  const [dd, v] = den.items;
  if (!isD(dd) || dd.name !== d.name || !v) return null;
  let variable: Cst | null = null;
  if (v.type === 'letter' && order === 1) variable = v;
  if (v.type === 'pow' && v.base.type === 'letter' && integer(v.exp) === order) variable = v.base;
  if (!variable) return null;
  const result: {
    variable: Cst;
    order: number;
    partial: boolean;
    dSpans: Span[];
    operand?: Cst;
  } = {
    variable,
    order,
    partial: d.name === '\\partial',
    dSpans: [d.span, dd.span],
  };
  if (operand) result.operand = operand;
  return result;
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
