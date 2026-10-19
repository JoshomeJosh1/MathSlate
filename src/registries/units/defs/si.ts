import type { UnitDef } from '../types';

/** SI base and derived units, with the prefixes in common use. */
const units: UnitDef[] = [
  { symbol: 'm', name: 'metre', dimension: { m: 1 }, factor: '1', prefixes: ['n', 'µ', 'm', 'c', 'k'], group: 'Length' },
  { symbol: 'g', name: 'gram', dimension: { kg: 1 }, factor: '0.001', prefixes: ['µ', 'm', 'k'], group: 'Mass' },
  { symbol: 's', name: 'second', dimension: { s: 1 }, factor: '1', prefixes: ['n', 'µ', 'm'], group: 'Time' },
  { symbol: 'A', name: 'ampere', dimension: { A: 1 }, factor: '1', prefixes: ['µ', 'm', 'k'], group: 'Electricity' },
  { symbol: 'K', name: 'kelvin', dimension: { K: 1 }, factor: '1', prefixes: ['m'], group: 'Temperature and amount' },
  { symbol: 'mol', name: 'mole', dimension: { mol: 1 }, factor: '1', prefixes: ['µ', 'm', 'k'], group: 'Temperature and amount' },
  { symbol: 'N', name: 'newton', dimension: { kg: 1, m: 1, s: -2 }, factor: '1', prefixes: ['m', 'k', 'M'], group: 'Force, energy and power' },
  { symbol: 'J', name: 'joule', dimension: { kg: 1, m: 2, s: -2 }, factor: '1', prefixes: ['m', 'k', 'M', 'G'], group: 'Force, energy and power' },
  { symbol: 'W', name: 'watt', dimension: { kg: 1, m: 2, s: -3 }, factor: '1', prefixes: ['m', 'k', 'M', 'G'], group: 'Force, energy and power' },
  { symbol: 'Pa', name: 'pascal', dimension: { kg: 1, m: -1, s: -2 }, factor: '1', prefixes: ['h', 'k', 'M', 'G'], group: 'Pressure' },
  { symbol: 'Hz', name: 'hertz', dimension: { s: -1 }, factor: '1', prefixes: ['k', 'M', 'G'], group: 'Time' },
  { symbol: 'C', name: 'coulomb', dimension: { A: 1, s: 1 }, factor: '1', prefixes: ['n', 'µ', 'm'], group: 'Electricity' },
  { symbol: 'V', name: 'volt', dimension: { kg: 1, m: 2, s: -3, A: -1 }, factor: '1', prefixes: ['µ', 'm', 'k', 'M'], group: 'Electricity' },
  { symbol: 'Ω', name: 'ohm', dimension: { kg: 1, m: 2, s: -3, A: -2 }, factor: '1', prefixes: ['m', 'k', 'M'], group: 'Electricity' },
  { symbol: 'L', name: 'litre', dimension: { m: 3 }, factor: '0.001', prefixes: ['µ', 'm'], group: 'Volume' },
]; // prettier-ignore

export default units;
