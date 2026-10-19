/** The SI base units every unit is expressed in (mass in kilograms). */
export type BaseUnit = 'm' | 'kg' | 's' | 'A' | 'K' | 'mol';

export type Dimension = Partial<Record<BaseUnit, number>>;

/**
 * A unit of measurement, written in square brackets (`5[km]`) or as `\unit{km}`.
 * Its value is `factor` times the product of base units `dimension` (1 km = 1000 m).
 */
export interface UnitDef {
  /** As written: `m`, `min`, `Ω`. */
  symbol: string;
  /** Plain name for the `\` menu: "metre". */
  name: string;
  dimension: Dimension;
  /** Exact decimal multiple of the base units: '1609.344' for a mile. */
  factor: string;
  /** The multiple also has π to this power: a parsec is 648000·149597870700 / π m (-1). */
  piPower?: number;
  /** SI prefixes this unit takes: 'all' (pg, das, QW), or a list (`k` → kt). */
  prefixes?: 'all' | readonly string[];
  /** The prefixed forms the `\` menu offers (all of them can be typed). */
  menu?: readonly string[];
  /** Heading in the `\` menu. */
  group: string;
}

/** A power of ten as an exact decimal: -3 → '0.001', 6 → '1000000'. */
const powerOfTen = (n: number) => (n >= 0 ? `1${'0'.repeat(n)}` : `0.${'0'.repeat(-n - 1)}1`);

const prefix = (name: string, exponent: number) => ({ name, factor: powerOfTen(exponent) });

/** Every SI prefix, quecto to quetta. */
export const PREFIXES: Readonly<Record<string, { name: string; factor: string }>> = {
  q: prefix('quecto', -30),
  r: prefix('ronto', -27),
  y: prefix('yocto', -24),
  z: prefix('zepto', -21),
  a: prefix('atto', -18),
  f: prefix('femto', -15),
  p: prefix('pico', -12),
  n: prefix('nano', -9),
  µ: prefix('micro', -6),
  m: prefix('milli', -3),
  c: prefix('centi', -2),
  d: prefix('deci', -1),
  da: prefix('deca', 1),
  h: prefix('hecto', 2),
  k: prefix('kilo', 3),
  M: prefix('mega', 6),
  G: prefix('giga', 9),
  T: prefix('tera', 12),
  P: prefix('peta', 15),
  E: prefix('exa', 18),
  Z: prefix('zetta', 21),
  Y: prefix('yotta', 24),
  R: prefix('ronna', 27),
  Q: prefix('quetta', 30),
};
