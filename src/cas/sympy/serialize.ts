import { nameKey, type ConstantId, type Definition, type Expr, type Name } from '../../parser/ast';
import type { CasOperation, CasRequest } from '../types';

/**
 * AST → Python source for the SymPy runtime (python/runtime.py). The program declares the
 * symbols it uses, binds the user's definitions (in dependency order), then stores the operation's
 * result in `_result`. Deterministic output: the same request always yields the same program, so
 * the program text doubles as a cache key.
 *
 * Naming: free symbols are `s_<id>` (always a SymPy Symbol named by the symbol key); user
 * definitions are `u_<id>` (constants: values, functions: Python defs, sequences: _Sequence).
 */

export class SerializeError extends Error {}

const CONSTANTS: Record<ConstantId, string> = { pi: 'pi', e: 'E', i: 'I', infinity: 'oo' };

type Py = (args: string[]) => string;
const call =
  (fn: string): Py =>
  (args) =>
    `${fn}(${args.join(', ')})`;

/** Built-in functions (registries/builtins/functions) → SymPy. */
const FUNCTIONS: Record<string, Py> = {
  sin: call('sin'),
  cos: call('cos'),
  tan: call('tan'),
  cot: call('cot'),
  sec: call('sec'),
  csc: call('csc'),
  arcsin: call('asin'),
  arccos: call('acos'),
  arctan: call('atan'),
  arccot: call('acot'),
  arcsec: call('asec'),
  arccsc: call('acsc'),
  sinh: call('sinh'),
  cosh: call('cosh'),
  tanh: call('tanh'),
  coth: call('coth'),
  sech: call('sech'),
  csch: call('csch'),
  arsinh: call('asinh'),
  arcosh: call('acosh'),
  artanh: call('atanh'),
  exp: call('exp'),
  ln: call('log'),
  log: (a) => (a.length === 2 ? `log(${a[0] ?? ''}, ${a[1] ?? ''})` : `log(${a[0] ?? ''}, 10)`),
  floor: call('floor'),
  ceil: call('ceiling'),
  sign: call('sign'),
  gcd: call('_gcd'),
  lcm: call('_lcm'),
  max: call('Max'),
  min: call('Min'),
  binomial: call('binomial'),
};

/** Built-in sequences (by interpretation, e.g. p_n → primes) → SymPy. */
const SEQUENCES: Record<string, Py> = {
  p: call('_prime'),
  F: call('fibonacci'),
};

const RELATIONS = { '=': 'Eq', '<': 'Lt', '>': 'Gt', '<=': 'Le', '>=': 'Ge', '!=': 'Ne' } as const;

/** Python identifier fragment for a symbol key: `v_{max}` → `v__max`, `\alpha` → `Galpha`. */
export function pyId(key: string): string {
  return key
    .replace(/\\/g, 'G')
    .replace(/_\{([^}]*)\}/g, '__$1')
    .replace(/[^A-Za-z0-9_]/g, (c) => `_${c.charCodeAt(0)}_`);
}

const pyString = (s: string) => JSON.stringify(s); // JSON strings are valid Python literals

type DefKind = 'const' | 'func' | 'seq';

class Serializer {
  private readonly symbols = new Set<string>();
  private readonly defined = new Map<string, DefKind>();

  constructor(env: readonly Definition[]) {
    for (const d of env) {
      const key = nameKey(d.name);
      const kind: DefKind = d.kind === 'defConst' ? 'const' : d.kind === 'defFunc' ? 'func' : 'seq';
      this.defined.set(key, kind);
    }
  }

  symbol(name: Name): string {
    const key = nameKey(name);
    this.symbols.add(key);
    return `s_${pyId(key)}`;
  }

  /** Python lines binding the environment's definitions, in the given (dependency) order. */
  environment(env: readonly Definition[]): string[] {
    const lines: string[] = [];
    const sequences = new Map<
      string,
      { rule?: Definition & { kind: 'defSeq' }; bases: string[] }
    >();
    const sequenceOrder: string[] = [];
    for (const d of env) {
      const key = nameKey(d.name);
      const id = `u_${pyId(key)}`;
      switch (d.kind) {
        case 'defConst':
          lines.push(`${id} = ${this.expr(d.body, new Set())}`);
          break;
        case 'defFunc': {
          const params = d.params.map((p) => this.symbol(p));
          const locals = new Set(d.params.map(nameKey));
          lines.push(`def ${id}(${params.join(', ')}):`, `    return ${this.expr(d.body, locals)}`);
          break;
        }
        case 'defSeq':
        case 'defSeqBase': {
          let entry = sequences.get(key);
          if (!entry) {
            entry = { bases: [] };
            sequences.set(key, entry);
            sequenceOrder.push(key);
          }
          if (d.kind === 'defSeq') entry.rule = d;
          else entry.bases.push(`${d.index}: ${this.expr(d.body, new Set())}`);
          break;
        }
      }
    }
    for (const key of sequenceOrder) {
      const entry = sequences.get(key);
      if (!entry?.rule) continue; // base cases without a rule are plain names (settled earlier)
      const index = this.symbol(entry.rule.indexVar);
      const body = this.expr(entry.rule.body, new Set([nameKey(entry.rule.indexVar)]));
      lines.push(
        `u_${pyId(key)} = _Sequence(${pyString(key)}, lambda ${index}: ${body}, {${entry.bases.join(', ')}})`,
      );
    }
    return lines;
  }

  expr(e: Expr, locals: ReadonlySet<string>): string {
    const go = (x: Expr) => this.expr(x, locals);
    switch (e.kind) {
      case 'num':
        return /^[0-9]+$/.test(e.value) ? `Integer(${e.value})` : `Rational(${pyString(e.value)})`;
      case 'var': {
        const key = nameKey(e.name);
        if (!locals.has(key) && this.defined.get(key) === 'const') return `u_${pyId(key)}`;
        return this.symbol(e.name);
      }
      case 'constant':
        return CONSTANTS[e.id];
      case 'neg':
        return `(-${go(e.arg)})`;
      case 'binary': {
        const op = { add: '+', sub: '-', mul: '*', div: '/', pow: '**' }[e.op];
        return `(${go(e.left)} ${op} ${go(e.right)})`;
      }
      case 'factorial':
        return `factorial(${go(e.arg)})`;
      case 'call': {
        const key = nameKey(e.fn);
        const args = e.args.map(go);
        if (this.defined.get(key) === 'func') return `u_${pyId(key)}(${args.join(', ')})`;
        const fn = FUNCTIONS[key];
        if (!fn) throw new SerializeError(`SymPy backend does not know the function "${key}"`);
        return fn(args);
      }
      case 'derivative': {
        const key = nameKey(e.fn);
        if (this.defined.get(key) !== 'func') {
          throw new SerializeError(`"${key}" is not a function defined in this document`);
        }
        return `_derivative(u_${pyId(key)}, ${e.order}, ${e.args.map(go).join(', ')})`;
      }
      case 'index': {
        const key = nameKey(e.seq);
        const index = go(e.index);
        if (this.defined.get(key) === 'seq') return `u_${pyId(key)}(${index})`;
        const builtin = SEQUENCES[key];
        if (!builtin) throw new SerializeError(`SymPy backend does not know the sequence "${key}"`);
        return builtin([index]);
      }
      case 'matrix':
        return `Matrix([${e.rows.map((r) => `[${r.map(go).join(', ')}]`).join(', ')}])`;
      case 'abs':
        return `Abs(${go(e.arg)})`;
      case 'root':
        return e.degree ? `root(${go(e.arg)}, ${go(e.degree)})` : `sqrt(${go(e.arg)})`;
      case 'list': {
        const items = e.items.map(go).join(', ');
        return e.delim === 'set' ? `FiniteSet(${items})` : `Tuple(${items})`;
      }
      case 'integral': {
        const inner = new Set([...locals, nameKey(e.variable)]);
        const body = this.expr(e.integrand, inner);
        const x = this.symbol(e.variable);
        if (e.lower && e.upper) {
          // Definite integrals evaluate numerically (exactly when the bounds are symbolic).
          return `_defint(${body}, ${x}, ${go(e.lower)}, ${go(e.upper)})`;
        }
        return `integrate(${body}, ${x})`;
      }
      case 'diff': {
        const body = this.expr(e.operand, new Set([...locals, nameKey(e.variable)]));
        return `diff(${body}, ${this.symbol(e.variable)}, ${e.order})`;
      }
      case 'limit': {
        const body = this.expr(e.operand, new Set([...locals, nameKey(e.variable)]));
        const dir = pyString(e.direction ?? '+-');
        return `limit(${body}, ${this.symbol(e.variable)}, ${go(e.point)}, ${dir})`;
      }
      case 'bigop': {
        const body = this.expr(e.operand, new Set([...locals, nameKey(e.index)]));
        const fn = e.op === 'sum' ? 'summation' : 'product';
        return `${fn}(${body}, (${this.symbol(e.index)}, ${go(e.lower)}, ${go(e.upper)}))`;
      }
      case 'relation': {
        const parts = e.ops.map((op, k) => {
          const l = e.operands[k];
          const r = e.operands[k + 1];
          if (!l || !r) throw new SerializeError('Malformed relation');
          return `${RELATIONS[op]}(${go(l)}, ${go(r)})`;
        });
        return parts.length === 1 ? (parts[0] ?? '') : `And(${parts.join(', ')})`;
      }
    }
  }

  operation(op: CasOperation, target: string): string {
    const v = (name: Name) => this.symbol(name);
    switch (op.op) {
      case 'evaluate':
        return `_evaluate(${target})`;
      case 'simplify':
        return `simplify(${target})`;
      case 'factor':
        return `_factor(${target})`;
      case 'expand':
        return `expand(${target})`;
      case 'numeric':
        return `_numeric(${target}, ${op.digits ?? 15})`;
      case 'solve':
        return `_solve(${target}, ${v(op.variable)})`;
      case 'derivative':
        return `diff(${target}, ${v(op.variable)}, ${op.order})`;
      case 'integrate': {
        if (op.lower && op.upper) {
          const lo = this.expr(op.lower, new Set());
          const hi = this.expr(op.upper, new Set());
          return `integrate(${target}, (${v(op.variable)}, ${lo}, ${hi}))`;
        }
        return `integrate(${target}, ${v(op.variable)})`;
      }
      case 'limit': {
        const point = this.expr(op.point, new Set());
        return `limit(${target}, ${v(op.variable)}, ${point}, ${pyString(op.direction ?? '+-')})`;
      }
      case 'series': {
        const point = this.expr(op.point, new Set());
        return `series(${target}, ${v(op.variable)}, ${point}, ${op.order}).removeO()`;
      }
    }
  }

  declarations(): string[] {
    return [...this.symbols].sort().map((key) => `s_${pyId(key)} = Symbol(${pyString(key)})`);
  }
}

/** Full Python program for a request; the runtime reads `_result`. */
export function serializeRequest(request: CasRequest): string {
  const s = new Serializer(request.env);
  const env = s.environment(request.env);
  const target = s.expr(request.target, new Set(request.locals ?? []));
  const result = `_result = ${s.operation(request.operation, target)}`;
  return [...s.declarations(), ...env, result].join('\n');
}
