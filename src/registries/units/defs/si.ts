import type { UnitDef } from '../types';

/** SI base and derived units: every SI prefix works; `menu` lists the ones the `\` menu offers. */
const units: UnitDef[] = [
  { symbol: 'm', name: 'metre', dimension: { m: 1 }, factor: '1', prefixes: 'all', menu: ['m', 'c', 'k'], group: 'Length' },
  { symbol: 'g', name: 'gram', dimension: { kg: 1 }, factor: '0.001', prefixes: 'all', menu: ['m', 'k'], group: 'Mass' },
  { symbol: 's', name: 'second', dimension: { s: 1 }, factor: '1', prefixes: 'all', menu: ['m'], group: 'Time' },
  { symbol: 'A', name: 'ampere', dimension: { A: 1 }, factor: '1', prefixes: 'all', menu: ['m'], group: 'Electricity' },
  { symbol: 'K', name: 'kelvin', dimension: { K: 1 }, factor: '1', prefixes: 'all', group: 'Temperature and amount' },
  { symbol: 'mol', name: 'mole', dimension: { mol: 1 }, factor: '1', prefixes: 'all', group: 'Temperature and amount' },
  { symbol: 'N', name: 'newton', dimension: { kg: 1, m: 1, s: -2 }, factor: '1', prefixes: 'all', menu: ['k'], group: 'Force, energy and power' },
  { symbol: 'J', name: 'joule', dimension: { kg: 1, m: 2, s: -2 }, factor: '1', prefixes: 'all', menu: ['k'], group: 'Force, energy and power' },
  { symbol: 'W', name: 'watt', dimension: { kg: 1, m: 2, s: -3 }, factor: '1', prefixes: 'all', menu: ['k'], group: 'Force, energy and power' },
  { symbol: 'Pa', name: 'pascal', dimension: { kg: 1, m: -1, s: -2 }, factor: '1', prefixes: 'all', menu: ['k'], group: 'Pressure' },
  { symbol: 'Hz', name: 'hertz', dimension: { s: -1 }, factor: '1', prefixes: 'all', group: 'Time' },
  { symbol: 'C', name: 'coulomb', dimension: { A: 1, s: 1 }, factor: '1', prefixes: 'all', group: 'Electricity' },
  { symbol: 'V', name: 'volt', dimension: { kg: 1, m: 2, s: -3, A: -1 }, factor: '1', prefixes: 'all', group: 'Electricity' },
  { symbol: 'Ω', name: 'ohm', dimension: { kg: 1, m: 2, s: -3, A: -2 }, factor: '1', prefixes: 'all', menu: ['k'], group: 'Electricity' },
  { symbol: 'L', name: 'litre', dimension: { m: 3 }, factor: '0.001', prefixes: 'all', menu: ['m'], group: 'Volume' },
]; // prettier-ignore

export default units;
