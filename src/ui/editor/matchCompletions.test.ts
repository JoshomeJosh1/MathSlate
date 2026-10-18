import { describe, expect, it } from 'vitest';
import { matchCompletions } from './matchCompletions';

const items = ['sin', 'sinh', 'arcsin', 'Gamma', 'gamma', 'sqrt'].map((name) => ({
  name,
  latex: `\\${name}`,
  description: name === 'sqrt' ? 'Square root' : '',
}));

describe('\\ menu matching', () => {
  it('puts prefix matches first, shortest first, then other matches', () => {
    expect(matchCompletions(items, 'sin').map((c) => c.name)).toEqual(['sin', 'sinh', 'arcsin']);
  });

  it('puts an exact case-sensitive match first', () => {
    expect(matchCompletions(items, 'Gamma').map((c) => c.name)).toEqual(['Gamma', 'gamma']);
    expect(matchCompletions(items, 'gamma').map((c) => c.name)).toEqual(['gamma', 'Gamma']);
  });

  it('searches descriptions by word, from three letters', () => {
    expect(matchCompletions(items, 'root').map((c) => c.name)).toEqual(['sqrt']);
    expect(matchCompletions(items, 'oot').map((c) => c.name)).toEqual([]);
    expect(matchCompletions(items, 'sq').map((c) => c.name)).toEqual(['sqrt']);
  });
});
