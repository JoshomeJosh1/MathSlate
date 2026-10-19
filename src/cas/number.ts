import type { Expr } from '../parser/ast';
import type { Span } from '../parser/errors';

/**
 * A decimal from a backend as our AST. Exponent notation (`1.23e-123`, which backends print for
 * very small or large numbers) becomes `1.23 · 10^{-123}`, which reads as maths and parses back.
 */
export function numberExpr(text: string, span: Span): Expr {
  const m = /^([0-9.]+)[eE]([+-]?)0*([0-9]+)$/.exec(text);
  if (!m) return { kind: 'num', value: text, span };
  const [, mantissa = '', sign, digits = ''] = m;
  const exponent: Expr =
    sign === '-'
      ? { kind: 'neg', arg: { kind: 'num', value: digits, span }, span }
      : { kind: 'num', value: digits, span };
  const power: Expr = {
    kind: 'binary',
    op: 'pow',
    left: { kind: 'num', value: '10', span },
    right: exponent,
    span,
  };
  if (mantissa === '1') return power;
  return {
    kind: 'binary',
    op: 'mul',
    form: 'cdot',
    left: { kind: 'num', value: mantissa, span },
    right: power,
    span,
  };
}
