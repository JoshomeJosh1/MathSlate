import { describe, expect, it } from 'vitest';
import { printLatex } from '../parser/printLatex';
import { statementToSexpr } from '../parser/sexpr';
import { parseUnitText, unitText } from '../parser/units';
import { units } from '../registries/units';
import { analyzeRows } from './analyze';
import { decorateLatex } from './decorate';

const span = { start: 0, end: 0 };
const sexpr = (latex: string) => {
  const [row] = analyzeRows([{ id: 'r', latex }]);
  if (row?.error) return `!${row.error.message}`;
  return row?.statement ? statementToSexpr(row.statement) : '?';
};

describe('unit text', () => {
  it.each([
    ['km', 'km'],
    ['m/s^{2}', 'm/s^{2}'],
    ['m/s^2', 'm/s^{2}'],
    ['kg\\cdot m^{2}/s^{2}', 'kg\\cdot m^{2}/s^{2}'],
    ['J/(kg\\cdot K)', 'J/(kg\\cdot K)'],
    ['\\mu m', 'µm'],
    ['s^{-1}', 's^{-1}'],
  ])('%s → %s', (text, printed) => {
    expect(unitText(parseUnitText(text, span))).toBe(printed);
  });
});

describe('units in rows', () => {
  it.each([
    ['5\\unit{km}', '(* 5 [km])'],
    ['5\\left[km\\right]', '(* 5 [km])'],
    ['9.81\\left[\\frac{m}{s^2}\\right]', '(* 9.81 [m/s^{2}])'],
    ['5\\unit{km}\\to\\unit{mi}', '(-> (* 5 [km]) [mi])'],
    ['5\\unit{km}\\to\\left[mi\\right]', '(-> (* 5 [km]) [mi])'],
    ['d=5\\unit{km}\\to\\unit{mi}', '(def d (-> (* 5 [km]) [mi]))'],
    // Brackets that do not spell a unit are ordinary brackets.
    ['2\\left[x+1\\right]', '(* 2 (list (+ x 1)))'],
    ['\\unit{furlong}', '!Unknown unit "furlong"'],
    ['5\\to 3', '!Convert to a unit, e.g. → [km]'],
  ])('%s → %s', (latex, expected) => {
    expect(sexpr(latex)).toBe(expected);
  });

  it('round-trips through printLatex', () => {
    for (const latex of ['5\\unit{km}', '(x+1)\\unit{m/s^{2}}', '5\\unit{km}\\to\\unit{mi}']) {
      const [row] = analyzeRows([{ id: 'r', latex }]);
      const s = row?.statement;
      if (s?.kind !== 'expr') throw new Error(latex);
      expect(sexpr(printLatex(s.expr))).toBe(sexpr(latex));
    }
  });

  it('rewrites units typed in brackets as \\unit{…}', () => {
    const latex = '5\\left[km\\right]+3\\left\\lbrack m\\right\\rbrack';
    const [row] = analyzeRows([{ id: 'r', latex }]);
    expect(row && decorateLatex(latex, row.names, row.units)).toBe('5\\unit{km}+3\\unit{m}');
  });
});

describe('the units registry', () => {
  it('has prefixed units and no symbol twice', () => {
    for (const s of [
      'km',
      'mm',
      'µm',
      'kg',
      'ms',
      'kWh',
      'MPa',
      'mol',
      'min',
      'mi',
      'pg',
      'dam',
      'QW',
      'qs',
    ]) {
      expect(units.has(s), s).toBe(true);
    }
    expect(units.get('kg')?.factors).toEqual([]); // the base unit of mass
  });
});
