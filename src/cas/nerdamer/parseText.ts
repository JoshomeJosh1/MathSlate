import { makeName, type Expr, type Name } from '../../parser/ast';

/**
 * Reads Nerdamer's plain-text output ("(-3+x)*(-2+x)", "2*x*sin(x)+x^2*cos(x)", "{3, 2}",
 * "matrix([1, 2], [3, 4])") into our AST, mapping its symbol names back to ours. Throws on anything
 * it does not understand (the caller then reports the result as not displayable).
 */

export class TextParseError extends Error {}

const NO_SPAN = { start: 0, end: 0 };

type Tok = { t: 'num'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'end' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^!(),[\]{}]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new TextParseError(`Unexpected "${src.slice(pos, pos + 10)}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'op', v: m[3] });
  }
  out.push({ t: 'end' });
  return out;
}

const unary =
  (kind: 'abs' | 'factorial') =>
  (args: Expr[]): Expr => ({
    kind,
    arg: one(args),
    span: NO_SPAN,
  });
const builtin =
  (fn: string) =>
  (args: Expr[]): Expr => ({
    kind: 'call',
    fn: makeName(fn),
    args,
    span: NO_SPAN,
  });

const FUNCTIONS: Record<string, (args: Expr[]) => Expr> = {
  sqrt: (args) => ({ kind: 'root', arg: one(args), span: NO_SPAN }),
  cbrt: (args) => ({ kind: 'root', arg: one(args), degree: num('3'), span: NO_SPAN }),
  abs: unary('abs'),
  factorial: unary('factorial'),
  exp: (args) => bin('pow', { kind: 'constant', id: 'e', span: NO_SPAN }, one(args)),
  log: builtin('ln'),
  log10: builtin('log'),
  asin: builtin('arcsin'),
  acos: builtin('arccos'),
  atan: builtin('arctan'),
  acot: builtin('arccot'),
  asec: builtin('arcsec'),
  acsc: builtin('arccsc'),
  asinh: builtin('arsinh'),
  acosh: builtin('arcosh'),
  atanh: builtin('artanh'),
  ...Object.fromEntries(
    [
      'sin',
      'cos',
      'tan',
      'cot',
      'sec',
      'csc',
      'sinh',
      'cosh',
      'tanh',
      'floor',
      'ceil',
      'gcd',
      'lcm',
      'max',
      'min',
    ].map((f) => [f, builtin(f)]),
  ),
};

function one(args: Expr[]): Expr {
  const [a] = args;
  if (!a || args.length !== 1) throw new TextParseError('Expected one argument');
  return a;
}
function num(v: string): Expr {
  return { kind: 'num', value: v, span: NO_SPAN };
}
function bin(op: 'add' | 'sub' | 'mul' | 'div' | 'pow', left: Expr, right: Expr): Expr {
  const e: Expr = { kind: 'binary', op, left, right, span: NO_SPAN };
  if (op === 'mul') e.form = 'juxt';
  return e;
}

export function parseNerdamerText(text: string, names: ReadonlyMap<string, Name>): Expr {
  const toks = tokenize(text);
  let i = 0;
  const peek = () => toks[i] ?? { t: 'end' as const };
  const next = () => toks[i++] ?? { t: 'end' as const };
  const isOp = (v: string) => {
    const t = peek();
    return t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new TextParseError(`Expected "${v}"`);
    i++;
  };
  const list = (close: string): Expr[] => {
    const items: Expr[] = [];
    if (!isOp(close)) {
      items.push(expr(0));
      while (isOp(',')) {
        i++;
        items.push(expr(0));
      }
    }
    expect(close);
    return items;
  };

  const primary = (): Expr => {
    const t = next();
    if (t.t === 'num') return num(t.v);
    if (t.t === 'op') {
      if (t.v === '(') {
        const e = expr(0);
        expect(')');
        return e;
      }
      if (t.v === '[') return { kind: 'list', delim: 'bracket', items: list(']'), span: NO_SPAN };
      if (t.v === '{') return { kind: 'list', delim: 'set', items: list('}'), span: NO_SPAN };
      if (t.v === '-') return { kind: 'neg', arg: expr(25), span: NO_SPAN };
      throw new TextParseError(`Unexpected "${t.v}"`);
    }
    if (t.t !== 'id') throw new TextParseError('Unexpected end');
    if (isOp('(')) {
      i++;
      const args = list(')');
      if (t.v === 'matrix') {
        const rows = args.map((a) => {
          if (a.kind !== 'list') throw new TextParseError('Bad matrix');
          return a.items;
        });
        return { kind: 'matrix', rows, span: NO_SPAN };
      }
      const fn = FUNCTIONS[t.v];
      if (!fn) throw new TextParseError(`Unknown function "${t.v}"`);
      return fn(args);
    }
    switch (t.v) {
      case 'pi':
        return { kind: 'constant', id: 'pi', span: NO_SPAN };
      case 'e':
        return { kind: 'constant', id: 'e', span: NO_SPAN };
      case 'i':
        return { kind: 'constant', id: 'i', span: NO_SPAN };
      case 'Infinity':
        return { kind: 'constant', id: 'infinity', span: NO_SPAN };
    }
    const name = names.get(t.v);
    if (!name) throw new TextParseError(`Unknown name "${t.v}"`);
    return { kind: 'var', name, span: NO_SPAN };
  };

  const BP: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 };
  const expr = (rbp: number): Expr => {
    let left = primary();
    for (;;) {
      const t = peek();
      if (t.t === 'op' && t.v === '!') {
        i++;
        left = { kind: 'factorial', arg: left, span: NO_SPAN };
        continue;
      }
      if (t.t !== 'op' || !(t.v in BP)) break;
      const bp = BP[t.v] ?? 0;
      if (bp <= rbp) break;
      i++;
      const right = expr(t.v === '^' ? bp - 1 : bp);
      const op = ({ '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '^': 'pow' } as const)[
        t.v as '+' | '-' | '*' | '/' | '^'
      ];
      left = bin(op, left, right);
    }
    return left;
  };

  const result = expr(0);
  if (peek().t !== 'end') throw new TextParseError('Trailing input');
  return tidy(result);
}

/** Display clean-ups for Nerdamer's ordering: (-3+x) → x-3, a+(-b) → a-b, 1/2*x → x/2-ish forms. */
export function tidy(e: Expr): Expr {
  switch (e.kind) {
    case 'binary': {
      const left = tidy(e.left);
      const right = tidy(e.right);
      if (e.op === 'add' && left.kind === 'neg' && right.kind !== 'neg') {
        return { ...e, op: 'sub', left: right, right: left.arg };
      }
      if (e.op === 'add' && right.kind === 'neg')
        return { ...e, op: 'sub', left, right: right.arg };
      // x^(1/2) → √x, x^(1/n) → ⁿ√x
      if (
        e.op === 'pow' &&
        right.kind === 'binary' &&
        right.op === 'div' &&
        right.left.kind === 'num' &&
        right.left.value === '1' &&
        right.right.kind === 'num'
      ) {
        return right.right.value === '2'
          ? { kind: 'root', arg: left, span: e.span }
          : { kind: 'root', arg: left, degree: right.right, span: e.span };
      }
      return { ...e, left, right };
    }
    case 'neg':
    case 'abs':
    case 'factorial':
      return { ...e, arg: tidy(e.arg) };
    case 'root':
      return e.degree
        ? { ...e, arg: tidy(e.arg), degree: tidy(e.degree) }
        : { ...e, arg: tidy(e.arg) };
    case 'call':
      return { ...e, args: e.args.map(tidy) };
    case 'list':
      return { ...e, items: e.items.map(tidy) };
    case 'matrix':
      return { ...e, rows: e.rows.map((r) => r.map(tidy)) };
    default:
      return e;
  }
}
