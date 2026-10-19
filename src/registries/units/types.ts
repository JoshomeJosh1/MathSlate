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
  /** SI prefixes this unit takes (`k` → km), from PREFIXES. */
  prefixes?: readonly string[];
  /** Heading in the `\` menu. */
  group: string;
}

/** SI prefixes as exact decimals. */
export const PREFIXES: Readonly<Record<string, { name: string; factor: string }>> = {
  n: { name: 'nano', factor: '0.000000001' },
  µ: { name: 'micro', factor: '0.000001' },
  m: { name: 'milli', factor: '0.001' },
  c: { name: 'centi', factor: '0.01' },
  h: { name: 'hecto', factor: '100' },
  k: { name: 'kilo', factor: '1000' },
  M: { name: 'mega', factor: '1000000' },
  G: { name: 'giga', factor: '1000000000' },
};
