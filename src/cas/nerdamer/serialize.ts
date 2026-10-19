import { nameKey, type ConstantId, type Expr, type Name } from '../../parser/ast';
import { inlineDefinitions } from '../inline';
import type { CasOperation, CasRequest } from '../types';

/**
 * AST → a Nerdamer expression string. Definitions are inlined first (Nerdamer has no scope), and
 * every symbol is renamed to a safe identifier (sym0, sym1, …) so names like v_{max} or \alpha
 * cannot clash with Nerdamer's own names; `names` maps them back when reading the result.
 */

export class NerdamerUnsupported extends Error {}

export interface NerdamerJob {
  /** The expression for nerdamer(...). */
  expr: string;
  /** Also compute a decimal approximation when the result is a constant. */
  numeric: boolean;
  /** For solve: the variable, so solutions can be shown as x = …. */
  solveFor?: Name;
}

const CONSTANTS: Record<ConstantId, string> = { pi: 'pi', e: 'e', i: 'i', infinity: 'Infinity' };

/** Built-in function names (registries/builtins/functions) → Nerdamer. */
const FUNCTIONS: Record<string, (args: string[]) => string> = {
  sin: (a) => `sin(${a.join(',')})`,
  cos: (a) => `cos(${a.join(',')})`,
  tan: (a) => `tan(${a.join(',')})`,
  cot: (a) => `cot(${a.join(',')})`,
  sec: (a) => `sec(${a.join(',')})`,
  csc: (a) => `csc(${a.join(',')})`,
  arcsin: (a) => `asin(${a.join(',')})`,
  arccos: (a) => `acos(${a.join(',')})`,
  arctan: (a) => `atan(${a.join(',')})`,
  arccot: (a) => `acot(${a.join(',')})`,
  arcsec: (a) => `asec(${a.join(',')})`,
  arccsc: (a) => `acsc(${a.join(',')})`,
  sinh: (a) => `sinh(${a.join(',')})`,
  cosh: (a) => `cosh(${a.join(',')})`,
  tanh: (a) => `tanh(${a.join(',')})`,
  arsinh: (a) => `asinh(${a.join(',')})`,
  arcosh: (a) => `acosh(${a.join(',')})`,
  artanh: (a) => `atanh(${a.join(',')})`,
  exp: (a) => `e^(${a.join(',')})`,
  ln: (a) => `log(${a.join(',')})`,
  log: (a) => (a.length === 2 ? `log(${a[0] ?? ''})/log(${a[1] ?? ''})` : `log10(${a[0] ?? ''})`),
  floor: (a) => `floor(${a.join(',')})`,
  ceil: (a) => `ceil(${a.join(',')})`,
  gcd: (a) => `gcd(${a.join(',')})`,
  lcm: (a) => `lcm(${a.join(',')})`,
  max: (a) => `max(${a.join(',')})`,
  min: (a) => `min(${a.join(',')})`,
};

class Serializer {
  readonly names = new Map<string, Name>();
  private readonly ids = new Map<string, string>();

  id(name: Name): string {
    const key = nameKey(name);
    let id = this.ids.get(key);
    if (!id) {
      id = `sym${this.ids.size}`;
      this.ids.set(key, id);
      this.names.set(id, name);
    }
    return id;
  }

  expr(e: Expr): string {
    const go = (x: Expr) => this.expr(x);
    switch (e.kind) {
      case 'num':
        return e.value.startsWith('.') ? `0${e.value}` : e.value;
      case 'var':
        return this.id(e.name);
      case 'constant':
        return CONSTANTS[e.id];
      case 'unit':
      case 'convert':
        // Units are expanded into base-unit symbols before a request reaches a backend.
        throw new Error('units reached the Nerdamer serializer');
      case 'neg':
        return `(-(${go(e.arg)}))`;
      case 'binary': {
        const op = { add: '+', sub: '-', mul: '*', div: '/', pow: '^' }[e.op];
        return `(${go(e.left)})${op}(${go(e.right)})`;
      }
      case 'factorial':
        return `factorial(${go(e.arg)})`;
      case 'abs':
        return `abs(${go(e.arg)})`;
      case 'root':
        return e.degree ? `(${go(e.arg)})^(1/(${go(e.degree)}))` : `sqrt(${go(e.arg)})`;
      case 'call': {
        const fn = FUNCTIONS[nameKey(e.fn)];
        if (!fn) throw new NerdamerUnsupported(`Nerdamer does not support "${nameKey(e.fn)}"`);
        return fn(e.args.map(go));
      }
      case 'matrix':
        return `matrix(${e.rows.map((r) => `[${r.map(go).join(',')}]`).join(',')})`;
      case 'list':
        if (e.delim === 'set') throw new NerdamerUnsupported('Nerdamer does not support sets');
        return `[${e.items.map(go).join(',')}]`;
      case 'relation': {
        const [l, r] = e.operands;
        if (e.ops.length !== 1 || e.ops[0] !== '=' || !l || !r) {
          throw new NerdamerUnsupported('Nerdamer only supports equations, not inequalities');
        }
        return `${go(l)}=${go(r)}`;
      }
      case 'integral': {
        const x = this.id(e.variable);
        return e.lower && e.upper
          ? `defint(${go(e.integrand)},${x},${go(e.lower)},${go(e.upper)})`
          : `integrate(${go(e.integrand)},${x})`;
      }
      case 'diff':
        return `diff(${go(e.operand)},${this.id(e.variable)},${e.order})`;
      case 'limit':
        if (e.direction)
          throw new NerdamerUnsupported('Nerdamer does not support one-sided limits');
        return `limit(${go(e.operand)},${this.id(e.variable)},${go(e.point)})`;
      case 'bigop':
        return `${e.op === 'sum' ? 'sum' : 'product'}(${go(e.operand)},${this.id(e.index)},${go(e.lower)},${go(e.upper)})`;
      case 'index':
      case 'derivative':
        throw new NerdamerUnsupported('This needs the SymPy backend');
    }
  }
}

export function serializeNerdamer(request: CasRequest): {
  job: NerdamerJob;
  names: Map<string, Name>;
} {
  const s = new Serializer();
  const target = inlineDefinitions(request.target, request.env, request.locals);
  const expr = s.expr(target);
  const job = operationJob(request.operation, expr, s, target);
  return { job, names: s.names };
}

function operationJob(op: CasOperation, expr: string, s: Serializer, target: Expr): NerdamerJob {
  switch (op.op) {
    case 'evaluate':
      return { expr, numeric: true };
    case 'numeric':
      return { expr, numeric: true };
    case 'simplify':
      return { expr: `simplify(${expr})`, numeric: false };
    case 'factor':
      if (target.kind === 'num') throw new NerdamerUnsupported('Integer factorisation needs SymPy');
      return { expr: `factor(${expr})`, numeric: false };
    case 'expand':
      return { expr: `expand(${expr})`, numeric: false };
    case 'solve':
      return { expr: `solve(${expr},${s.id(op.variable)})`, numeric: false, solveFor: op.variable };
    case 'derivative':
      return { expr: `diff(${expr},${s.id(op.variable)},${op.order})`, numeric: false };
    case 'integrate': {
      const x = s.id(op.variable);
      if (op.lower && op.upper) {
        return {
          expr: `defint(${expr},${x},${s.expr(op.lower)},${s.expr(op.upper)})`,
          numeric: false,
        };
      }
      return { expr: `integrate(${expr},${x})`, numeric: false };
    }
    case 'limit':
      if (op.direction) throw new NerdamerUnsupported('Nerdamer does not support one-sided limits');
      return { expr: `limit(${expr},${s.id(op.variable)},${s.expr(op.point)})`, numeric: false };
    case 'series':
      throw new NerdamerUnsupported('Series need the SymPy backend');
  }
}
