import { numberExpr } from '../cas/number';
import type { CasBackend, CasExpr, CasRequest, CasResult, CasValue } from '../cas/types';
import { makeName, type Expr, type UnitFactor } from '../parser/ast';
import { printLatex } from '../parser/printLatex';
import { unitText } from '../parser/units';
import { children, mapChildren } from './walk';
import { BASE_UNITS, NAMED_UNITS, units, type Dimension } from '../registries/units';

/**
 * Units of measurement, for every backend at once: backends know nothing about units.
 *
 * A request's units are expanded into base-unit symbols (`5\unit{km}` → `5·1000·@m`), which the
 * backend treats as ordinary positive symbols and simplifies like any other (5000·@m + 300·@m =
 * 5300·@m). The answer's base units are then checked (m + s is an error) and shown in a unit the
 * row used for that dimension (km), the `→` target, a named unit (N, J, …) or base units, by
 * asking the backend for answer ÷ unit, which no longer has units.
 */

const NO_SPAN = { start: 0, end: 0 };
/** Base-unit symbols sent to backends: `@m`, `@kg` (a name no one can type). */
const BASE_MARK = '@';

export const isUnitSymbol = (symbol: string): boolean => units.has(symbol);

class UnitError extends Error {}

export function hasUnits(e: Expr): boolean {
  return e.kind === 'unit' || e.kind === 'convert' || children(e).some(hasUnits);
}

const num = (value: string): Expr => ({ kind: 'num', value, span: NO_SPAN });
const bin = (op: 'mul' | 'div' | 'pow', left: Expr, right: Expr): Expr => ({
  kind: 'binary',
  op,
  left,
  right,
  span: NO_SPAN,
});
const integer = (n: number): Expr =>
  n < 0 ? { kind: 'neg', arg: num(String(-n)), span: NO_SPAN } : num(String(n));
const power = (base: Expr, n: number): Expr => (n === 1 ? base : bin('pow', base, integer(n)));
const product = (items: Expr[]): Expr => {
  const [first, ...rest] = items;
  return first ? rest.reduce((a, b) => bin('mul', a, b), first) : num('1');
};

// ---------------------------------------------------------------- dimensions

const dimensionOf = (factors: readonly UnitFactor[]): Dimension => {
  const d: Dimension = {};
  for (const f of factors) {
    const info = units.get(f.symbol);
    if (!info) throw new UnitError(`Unknown unit "${f.symbol}"`);
    for (const b of BASE_UNITS) d[b] = (d[b] ?? 0) + (info.dimension[b] ?? 0) * f.power;
  }
  return d;
};

const sameDimension = (a: Dimension, b: Dimension) =>
  BASE_UNITS.every((u) => (a[u] ?? 0) === (b[u] ?? 0));
const isDimensionless = (d: Dimension) => BASE_UNITS.every((u) => (d[u] ?? 0) === 0);

const baseFactors = (d: Dimension): UnitFactor[] =>
  BASE_UNITS.filter((b) => (d[b] ?? 0) !== 0).map((b) => ({ symbol: b, power: d[b] ?? 0 }));

/** For messages: "m", "kg·m/s^2", "a number". */
const describe = (d: Dimension) =>
  isDimensionless(d) ? 'a number' : unitText(baseFactors(d)).replace(/\\cdot /g, '·');

const scaled = (d: Dimension, k: number): Dimension => {
  const out: Dimension = {};
  for (const b of BASE_UNITS) {
    const v = (d[b] ?? 0) * k;
    if (!Number.isInteger(v)) throw new UnitError('Fractional powers of units are not supported');
    out[b] = v;
  }
  return out;
};

const combined = (a: Dimension, b: Dimension, sign: 1 | -1): Dimension => {
  const out: Dimension = {};
  for (const u of BASE_UNITS) out[u] = (a[u] ?? 0) + sign * (b[u] ?? 0);
  return out;
};

/** A plain number written in an exponent: 2, -1, 1/2. */
function numberValue(e: Expr): number | null {
  if (e.kind === 'num') return Number(e.value);
  if (e.kind === 'neg') {
    const v = numberValue(e.arg);
    return v === null ? null : -v;
  }
  if (e.kind === 'binary' && e.op === 'div') {
    const a = numberValue(e.left);
    const b = numberValue(e.right);
    return a === null || b === null ? null : a / b;
  }
  return null;
}

/** The dimension of a backend's answer, written with base-unit symbols. */
function dimensionOfAnswer(e: Expr): Dimension {
  switch (e.kind) {
    case 'var':
      return e.name.base.startsWith(BASE_MARK) ? { [e.name.base.slice(1)]: 1 } : {};
    case 'num':
    case 'constant':
      return {};
    case 'neg':
    case 'abs':
      return dimensionOfAnswer(e.arg);
    case 'binary': {
      const left = dimensionOfAnswer(e.left);
      if (e.op === 'pow') {
        const exp = dimensionOfAnswer(e.right);
        if (!isDimensionless(exp)) throw new UnitError('An exponent cannot have units');
        if (isDimensionless(left)) return {};
        const k = numberValue(e.right);
        if (k === null) throw new UnitError('A unit can only be raised to a number');
        return scaled(left, k);
      }
      const right = dimensionOfAnswer(e.right);
      if (e.op === 'mul') return combined(left, right, 1);
      if (e.op === 'div') return combined(left, right, -1);
      if (!sameDimension(left, right)) {
        throw new UnitError(`Can't add ${describe(left)} and ${describe(right)}`);
      }
      return left;
    }
    case 'root': {
      const d = dimensionOfAnswer(e.arg);
      const degree = e.degree ? numberValue(e.degree) : 2;
      if (isDimensionless(d)) return {};
      if (degree === null) throw new UnitError('A root of a unit needs a number as its degree');
      return scaled(d, 1 / degree);
    }
    case 'matrix': {
      // A vector or matrix of quantities: every entry in the same unit (a 0 fits any).
      const entries = e.rows.flat().filter((x) => !(x.kind === 'num' && Number(x.value) === 0));
      const [first, ...rest] = entries.map(dimensionOfAnswer);
      if (first && rest.some((d) => !sameDimension(first, d))) {
        throw new UnitError('All entries of a vector or matrix must have the same units');
      }
      return first ?? {};
    }
    case 'relation': {
      const [first, ...rest] = e.operands.map(dimensionOfAnswer);
      if (first && rest.some((d) => !sameDimension(first, d))) {
        throw new UnitError('Both sides must have the same units');
      }
      return first ?? {};
    }
    default:
      // Functions, matrices, calculus: their arguments must be plain numbers.
      for (const c of children(e)) {
        if (!isDimensionless(dimensionOfAnswer(c))) {
          throw new UnitError('Units can only be multiplied, divided, added and raised to powers');
        }
      }
      return {};
  }
}

// ---------------------------------------------------------------- expansion

/** A unit's value in base-unit symbols: km → 1000·@m, N → @kg·@m·@s^{-2}. */
function unitValue(factors: readonly UnitFactor[]): Expr {
  return product(
    factors.map((f) => {
      const info = units.get(f.symbol);
      if (!info) throw new UnitError(`Unknown unit "${f.symbol}"`);
      const dims = BASE_UNITS.filter((b) => (info.dimension[b] ?? 0) !== 0).map((b) =>
        power(
          { kind: 'var', name: makeName(BASE_MARK + b), span: NO_SPAN },
          info.dimension[b] ?? 0,
        ),
      );
      const pi: Expr[] = info.piPower
        ? [power({ kind: 'constant', id: 'pi', span: NO_SPAN }, info.piPower)]
        : [];
      return power(product([...info.factors.map(num), ...pi, ...dims]), f.power);
    }),
  );
}

/** Replaces units by their values in base units, and drops a `→` conversion. */
export function expandUnits(e: Expr): Expr {
  if (e.kind === 'unit') return unitValue(e.factors);
  if (e.kind === 'convert') return expandUnits(e.expr);
  return mapChildren(e, expandUnits);
}

/** The units a row wrote, in order, compound ones also by their parts (km/h: km/h, km, h). */
function writtenUnits(e: Expr, out: UnitFactor[][]): void {
  if (e.kind === 'unit') {
    out.push(e.factors);
    if (e.factors.length > 1) for (const f of e.factors) out.push([{ symbol: f.symbol, power: 1 }]);
  }
  children(e).forEach((c) => {
    writtenUnits(c, out);
  });
}

function displayUnit(d: Dimension, written: readonly UnitFactor[][]): UnitFactor[] {
  const fits = (u: readonly UnitFactor[]) => sameDimension(dimensionOf(u), d);
  const own = written.find(fits);
  if (own) return [...own];
  const named = NAMED_UNITS.map((symbol) => [{ symbol, power: 1 }]).find(fits);
  return named ?? baseFactors(d);
}

// ---------------------------------------------------------------- the backend wrapper

/** A backend that understands units, around one that does not. */
export function withUnits(inner: CasBackend): CasBackend {
  return {
    id: inner.id,
    name: inner.name,
    status: () => inner.status(),
    onStatusChange: (listener) => inner.onStatusChange(listener),
    init: () => inner.init(),
    supports: (op) => inner.supports(op),
    run: (request) => runWithUnits(inner, request),
  };
}

async function runWithUnits(inner: CasBackend, request: CasRequest): Promise<CasResult> {
  const { target, env } = request;
  if (!hasUnits(target) && !env.some((d) => hasUnits(d.body))) return inner.run(request);
  const convertTo = target.kind === 'convert' ? target.target : null;
  const written: UnitFactor[][] = [];
  writtenUnits(target, written);
  env.forEach((d) => {
    writtenUnits(d.body, written);
  });
  let result: CasResult;
  try {
    result = await inner.run({
      ...request,
      target: expandUnits(target),
      env: env.map((d) => ({ ...d, body: expandUnits(d.body) })),
    });
    if (!result.ok) return result;
    const value = await present(inner, result.value, convertTo, written);
    return { ...result, value };
  } catch (err) {
    if (!(err instanceof UnitError)) throw err;
    return { ok: false, error: err.message, backend: inner.id };
  }
}

async function present(
  inner: CasBackend,
  value: CasValue,
  convertTo: readonly UnitFactor[] | null,
  written: readonly UnitFactor[][],
): Promise<CasValue> {
  if (value.kind === 'expr') {
    if (!value.expr) return value;
    const shown = await quantity(inner, value.expr, convertTo, written);
    return shown ? { kind: 'expr', ...shown } : value;
  }
  if (value.kind === 'solutions') {
    const solutions = await Promise.all(
      value.solutions.map(async (s) => {
        const shown = s.expr && (await quantity(inner, s.expr, null, written));
        return shown ? { expr: shown.expr, latex: shown.latex } : s;
      }),
    );
    return { ...value, solutions };
  }
  return value;
}

/**
 * An answer in base units shown in a unit: the backend computes answer ÷ unit (a plain number
 * or expression), which is then written next to the unit. Null if the answer has no units and
 * none was asked for.
 */
async function quantity(
  inner: CasBackend,
  answer: Expr,
  convertTo: readonly UnitFactor[] | null,
  written: readonly UnitFactor[][],
): Promise<(CasExpr & { numeric: CasExpr | null }) | null> {
  const d = dimensionOfAnswer(answer);
  if (isDimensionless(d) && !convertTo) return null;
  const unit = convertTo ?? displayUnit(d, written);
  const unitDimension = dimensionOf(unit);
  if (!sameDimension(unitDimension, d)) {
    throw new UnitError(
      `Can't convert ${describe(d)} to ${unitText(unit).replace(/\\cdot /g, '·')}`,
    );
  }
  // Evaluating cancels the units of a number; a symbolic amount ((x·m + 2m)/m) may need simplify.
  const ratio = bin('div', answer, unitValue(unit));
  let r = await inner.run({ operation: { op: 'evaluate' }, target: ratio, env: [] });
  if (r.ok && r.value.kind === 'expr' && r.value.expr && hasBaseUnits(r.value.expr)) {
    r = await inner.run({ operation: { op: 'simplify' }, target: ratio, env: [] });
  }
  if (!r.ok) throw new UnitError(r.error);
  if (r.value.kind !== 'expr' || !r.value.expr || hasBaseUnits(r.value.expr)) {
    throw new UnitError("Couldn't separate the units from the value");
  }
  const node: Expr = { kind: 'unit', factors: [...unit], span: NO_SPAN };
  const withUnit = (coefficient: Expr): CasExpr => {
    const expr = bin('mul', coefficient, node);
    return { expr, latex: printLatex(expr) };
  };
  // A rational amount reads best as a decimal: 5.3 km, not 53/10 km.
  const decimal = decimalOf(r.value.expr);
  if (decimal) return { ...withUnit(decimal), numeric: null };
  const numeric = r.value.numeric?.expr ? withUnit(r.value.numeric.expr) : null;
  return { ...withUnit(r.value.expr), numeric };
}

const hasBaseUnits = (e: Expr): boolean =>
  (e.kind === 'var' && e.name.base.startsWith(BASE_MARK)) || children(e).some(hasBaseUnits);

/** A rational number (2, -0.5, 53/10) as a decimal of up to 15 significant digits, or null. */
function decimalOf(e: Expr): Expr | null {
  const value = numberValue(e);
  if (value === null || !Number.isFinite(value)) return null;
  const text = String(Number(Math.abs(value).toPrecision(15)));
  const amount = numberExpr(text, NO_SPAN);
  return value < 0 ? { kind: 'neg', arg: amount, span: NO_SPAN } : amount;
}
