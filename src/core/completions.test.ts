import { describe, expect, it } from 'vitest';
import { builtinFunctions } from '../registries/builtins/functions';
import { analyzeRows } from './analyze';
import { latexCompletions } from './completions';

describe('the \\ menu', () => {
  const completions = latexCompletions();

  it('offers only commands the parser understands', () => {
    for (const c of completions) {
      // Fill the boxes and give operators and functions something to work on.
      const latex = c.latex.replace(/#\?/g, '2');
      const rows = [latex, `x${latex}(3)`, `1${latex}2`];
      const messages = analyzeRows(rows.map((l, i) => ({ id: `r${i}`, latex: l }))).map(
        (r) => r.error?.message ?? '',
      );
      for (const m of messages)
        expect(m, c.name).not.toMatch(/Unknown command|Unexpected character/);
    }
  });

  it('includes every multi-letter built-in function, once each', () => {
    const names = completions.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const f of builtinFunctions.values()) {
      if (/^[A-Za-z]{2,}$/.test(f.name)) expect(names, f.name).toContain(f.name);
    }
  });

  it('offers units', () => {
    expect(completions.find((c) => c.name === 'km')?.latex).toBe('\\unit{km}');
    expect(completions.find((c) => c.name === 'ohm')?.latex).toBe('\\unit{Ω}');
    expect(completions.find((c) => c.name === 'minute')?.latex).toBe('\\unit{min}');
  });

  it('gives functions that need brackets their brackets', () => {
    const lcm = completions.find((c) => c.name === 'lcm');
    expect(lcm?.latex).toBe('\\lcm\\left(#?\\right)');
    expect(completions.find((c) => c.name === 'sin')?.latex).toBe('\\sin');
  });
});
