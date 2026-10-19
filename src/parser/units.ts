import type { UnitFactor } from './ast';
import { MathError, type Span } from './errors';

/**
 * The text of a unit, as written inside `\unit{…}` or square brackets: unit symbols with
 * optional integer powers, multiplied (`\cdot`, `*`, `.` or a space) and divided by one `/`
 * (the rest is the denominator, parenthesized if it has several factors): `km`, `m/s^{2}`,
 * `kg\cdot m^{2}/s^{2}`, `J/(kg\cdot K)`. Which symbols exist is decided by the caller.
 */
export function parseUnitText(text: string, span: Span): UnitFactor[] {
  const src = text
    .replace(/\\(?:mathrm|text|textrm)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:mu|micro)\b\s*/g, 'µ') // a prefix: \mu m is µm
    .replace(/\\Omega\b|\\ohm\b/g, 'Ω')
    .replace(/\\(?:circ|degree)\b/g, '°')
    .replace(/\\(?:cdot|times)\b|\\[,;: ]/g, ' ');
  const factors: UnitFactor[] = [];
  let sign = 1;
  let i = 0;
  let parens = false;
  const fail = (message: string): never => {
    throw new MathError(message, span);
  };
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === ' ' || c === '*' || c === '.' || c === '{' || c === '}') {
      i++;
    } else if (c === '/') {
      if (sign < 0) fail('Use one "/" in a unit: J/(kg·K)');
      sign = -1;
      i++;
      while (src.charAt(i) === ' ') i++;
      if (src.charAt(i) === '(') {
        parens = true;
        i++;
      }
    } else if (c === ')' && parens) {
      parens = false;
      i++;
    } else if (/[A-Za-zµΩ°]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-zµΩ°]/.test(src.charAt(j))) j++;
      const symbol = src.slice(i, j);
      i = j;
      let power = 1;
      if (src.charAt(i) === '^') {
        const m = /^\^(?:\{\s*(-?[0-9]+)\s*\}|([0-9]))/.exec(src.slice(i));
        if (!m) fail(`Unit powers must be whole numbers: ${symbol}^2`);
        power = Number(m?.[1] ?? m?.[2]);
        i += m?.[0].length ?? 0;
      }
      factors.push({ symbol, power: sign * power });
    } else {
      fail(`Unexpected "${c}" in a unit`);
    }
  }
  if (factors.length === 0) fail('Empty unit');
  return factors;
}

/** The text of a unit for `\unit{…}`: `m/s^{2}`, `kg\cdot m^{2}`, `J/(kg\cdot K)`. */
export function unitText(factors: readonly UnitFactor[]): string {
  const part = (f: UnitFactor, power: number) =>
    power === 1 ? f.symbol : `${f.symbol}^{${power}}`;
  const up = factors.filter((f) => f.power > 0).map((f) => part(f, f.power));
  const down = factors.filter((f) => f.power < 0).map((f) => part(f, -f.power));
  if (down.length === 0) return up.join('\\cdot ');
  if (up.length === 0) return factors.map((f) => part(f, f.power)).join('\\cdot ');
  const denominator = down.length === 1 ? (down[0] ?? '') : `(${down.join('\\cdot ')})`;
  return `${up.join('\\cdot ')}/${denominator}`;
}
