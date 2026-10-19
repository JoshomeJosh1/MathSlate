import { PREFIXES, type BaseUnit, type Dimension, type UnitDef } from './types';

export type { BaseUnit, Dimension, UnitDef } from './types';

/** A unit as it can be written, prefixed ones included (`km`): its value in base units. */
export interface UnitInfo {
  symbol: string;
  name: string;
  dimension: Dimension;
  /** Exact decimals whose product is the unit's multiple of the base units. */
  factors: readonly string[];
  /** Times π to this power (0 for most units). */
  piPower: number;
  group: string;
  /** Offered in the `\` menu (unprefixed units and the common prefixed ones). */
  inMenu: boolean;
}

// Every module in defs/ is picked up automatically (Vite resolves this glob at build time).
const modules = import.meta.glob<{ default: UnitDef | UnitDef[] }>('./defs/*.ts', { eager: true });
const defs = Object.values(modules).flatMap((m) =>
  Array.isArray(m.default) ? m.default : [m.default],
);

function build(): Map<string, UnitInfo> {
  const out = new Map<string, UnitInfo>();
  const add = (info: UnitInfo) => {
    if (out.has(info.symbol)) throw new Error(`Two units are written "${info.symbol}"`);
    out.set(info.symbol, info);
  };
  for (const d of defs) {
    const { symbol, name, dimension, group } = d;
    add({
      symbol,
      name,
      dimension,
      group,
      factors: d.factor === '1' ? [] : [d.factor],
      piPower: d.piPower ?? 0,
      inMenu: true,
    });
  }
  for (const d of defs) {
    const prefixes = d.prefixes === 'all' ? Object.keys(PREFIXES) : (d.prefixes ?? []);
    for (const p of prefixes) {
      const prefix = PREFIXES[p];
      if (!prefix) throw new Error(`Unknown prefix "${p}" on ${d.symbol}`);
      // kilogram is the base unit of mass: 1 kg = 1000 × 0.001 kg.
      const factors = [prefix.factor, ...(d.factor === '1' ? [] : [d.factor])];
      add({
        symbol: p + d.symbol,
        name: prefix.name + d.name,
        dimension: d.dimension,
        group: d.group,
        factors: p === 'k' && d.symbol === 'g' ? [] : factors,
        piPower: d.piPower ?? 0,
        inMenu: d.menu?.includes(p) ?? false,
      });
    }
  }
  return out;
}

/** Every unit symbol that can be written, prefixed ones included. */
export const units: ReadonlyMap<string, UnitInfo> = build();

export const BASE_UNITS: readonly BaseUnit[] = ['kg', 'm', 's', 'A', 'K', 'mol'];

/**
 * Named units a result is shown in when nothing the row wrote fits its dimension (a mass times
 * an acceleration is shown in N), in order of preference.
 */
export const NAMED_UNITS = ['N', 'J', 'W', 'Pa', 'C', 'V', 'Ω', 'Hz'];
