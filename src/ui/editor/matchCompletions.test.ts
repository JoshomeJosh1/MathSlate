import { describe, expect, it } from 'vitest';
import { matchCompletions, menuLayout, moveInGrid } from './matchCompletions';

const items = ['sin', 'sinh', 'arcsin', 'Gamma', 'gamma', 'sqrt'].map((name) => ({
  name,
  latex: `\\${name}`,
  description: name === 'sqrt' ? 'Square root' : '',
  group: 'g',
}));

/** n entries per group, e.g. grid({ a: 10, b: 3 }): narrow groups unless named "wide…". */
function grid(sizes: Record<string, number>) {
  return Object.entries(sizes).flatMap(([group, n]) =>
    Array.from({ length: n }, (_, i) => ({
      name: `${group}${i}`,
      latex: '',
      description: '',
      group,
      wide: group.startsWith('wide'),
    })),
  );
}

describe('\\ menu grid', () => {
  it('lays groups out in rows of 8 (symbols) or 4 (function names)', () => {
    const layout = menuLayout(grid({ a: 10, wide: 5 }), '');
    expect(layout.groups.map((g) => g.rows.map((r) => r.length))).toEqual([
      [8, 2],
      [4, 1],
    ]);
  });

  it('moves left/right in order and up/down by row, across groups', () => {
    const layout = menuLayout(grid({ a: 10, b: 3 }), '');
    expect(moveInGrid(layout, 0, 'right')).toBe(1);
    expect(moveInGrid(layout, 0, 'left')).toBe(12); // wraps
    expect(moveInGrid(layout, 1, 'down')).toBe(9); // a9: second row of a, column 1
    expect(moveInGrid(layout, 5, 'down')).toBe(9); // row too short: its last entry
    expect(moveInGrid(layout, 9, 'down')).toBe(11); // into group b, column 1
    expect(moveInGrid(layout, 11, 'up')).toBe(9);
  });

  it('keeps the horizontal position between narrow and wide rows', () => {
    const layout = menuLayout(grid({ a: 8, wide: 4 }), '');
    expect(moveInGrid(layout, 7, 'down')).toBe(11); // last narrow column → last wide column
    expect(moveInGrid(layout, 8, 'up')).toBe(0);
  });

  it('puts the group with the best match first when filtering', () => {
    const entries = [
      { name: 'sinh', latex: '', description: '', group: 'Hyperbolic' },
      { name: 'arcsin', latex: '', description: '', group: 'Trig' },
      { name: 'sin', latex: '', description: '', group: 'Trig' },
    ];
    const layout = menuLayout(entries, 'sin');
    expect(layout.items.map((c) => c.name)).toEqual(['sin', 'arcsin', 'sinh']);
    expect(layout.groups.map((g) => g.name)).toEqual(['Trig', 'Hyperbolic']);
  });
});

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
