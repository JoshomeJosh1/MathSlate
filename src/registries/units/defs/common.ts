import type { UnitDef } from '../types';

/** Non-SI units in everyday and engineering use, defined exactly in SI. */
const units: UnitDef[] = [
  { symbol: 'min', name: 'minute', dimension: { s: 1 }, factor: '60', group: 'Time' },
  { symbol: 'h', name: 'hour', dimension: { s: 1 }, factor: '3600', group: 'Time' },
  { symbol: 'd', name: 'day', dimension: { s: 1 }, factor: '86400', group: 'Time' },
  { symbol: 'yr', name: 'year (365.25 days)', dimension: { s: 1 }, factor: '31557600', group: 'Time' },
  { symbol: 'in', name: 'inch', dimension: { m: 1 }, factor: '0.0254', group: 'Length' },
  { symbol: 'ft', name: 'foot', dimension: { m: 1 }, factor: '0.3048', group: 'Length' },
  { symbol: 'yd', name: 'yard', dimension: { m: 1 }, factor: '0.9144', group: 'Length' },
  { symbol: 'mi', name: 'mile', dimension: { m: 1 }, factor: '1609.344', group: 'Length' },
  { symbol: 't', name: 'tonne', dimension: { kg: 1 }, factor: '1000', prefixes: ['k', 'M', 'G'], group: 'Mass' },
  { symbol: 'lb', name: 'pound', dimension: { kg: 1 }, factor: '0.45359237', group: 'Mass' },
  { symbol: 'oz', name: 'ounce', dimension: { kg: 1 }, factor: '0.028349523125', group: 'Mass' },
  { symbol: 'mph', name: 'mile per hour', dimension: { m: 1, s: -1 }, factor: '0.44704', group: 'Speed' },
  { symbol: 'Wh', name: 'watt-hour', dimension: { kg: 1, m: 2, s: -2 }, factor: '3600', prefixes: 'all', menu: ['k'], group: 'Force, energy and power' },
  { symbol: 'cal', name: 'calorie', dimension: { kg: 1, m: 2, s: -2 }, factor: '4.184', prefixes: 'all', menu: ['k'], group: 'Force, energy and power' },
  { symbol: 'eV', name: 'electronvolt', dimension: { kg: 1, m: 2, s: -2 }, factor: '0.0000000000000000001602176634', prefixes: 'all', group: 'Force, energy and power' },
  { symbol: 'bar', name: 'bar', dimension: { kg: 1, m: -1, s: -2 }, factor: '100000', prefixes: 'all', group: 'Pressure' },
  { symbol: 'atm', name: 'standard atmosphere', dimension: { kg: 1, m: -1, s: -2 }, factor: '101325', group: 'Pressure' },
  { symbol: 'psi', name: 'pound per square inch', dimension: { kg: 1, m: -1, s: -2 }, factor: '6894.757293168361', group: 'Pressure' },
]; // prettier-ignore

export default units;
