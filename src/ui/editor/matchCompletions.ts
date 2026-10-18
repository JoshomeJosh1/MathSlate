import type { CommandCompletion } from './MathEditor';

/** Tiles per row: symbol-sized and wide (function names). */
export const COLUMNS = { narrow: 8, wide: 4 } as const;

export interface MenuGroup {
  name: string;
  wide: boolean;
  /** Indices into `MenuLayout.items`, row by row. */
  rows: number[][];
}

export interface MenuLayout {
  /** Every shown entry, in display order (group by group); `active` indexes this. */
  items: CommandCompletion[];
  groups: MenuGroup[];
}

/**
 * The menu's grid: matching entries in groups (unfiltered, in their given order; filtered, the
 * group with the best match first and each group in match order, so index 0 is the best match).
 */
export function menuLayout(all: readonly CommandCompletion[], query: string): MenuLayout {
  const byGroup = new Map<string, CommandCompletion[]>();
  for (const c of matchCompletions(all, query)) {
    const list = byGroup.get(c.group);
    if (list) list.push(c);
    else byGroup.set(c.group, [c]);
  }
  const items: CommandCompletion[] = [];
  const groups: MenuGroup[] = [];
  for (const [name, entries] of byGroup) {
    const wide = entries.some((c) => c.wide);
    const columns = wide ? COLUMNS.wide : COLUMNS.narrow;
    const rows: number[][] = [];
    for (let i = 0; i < entries.length; i += columns) {
      rows.push(entries.slice(i, i + columns).map((_, k) => items.length + i + k));
    }
    items.push(...entries);
    groups.push({ name, wide, rows });
  }
  return { items, groups };
}

/**
 * Moves the selection through the grid. Left/right go through entries in order; up/down go to
 * the row above/below (across group boundaries), keeping the column as far as the row allows.
 */
export function moveInGrid(
  layout: MenuLayout,
  active: number,
  direction: 'left' | 'right' | 'up' | 'down',
): number {
  const count = layout.items.length;
  if (count === 0) return 0;
  if (direction === 'left') return (active - 1 + count) % count;
  if (direction === 'right') return (active + 1) % count;
  const rows = layout.groups.flatMap((g) => g.rows);
  const r = rows.findIndex((row) => row.includes(active));
  const from = rows[r];
  const to = rows[(r + (direction === 'down' ? 1 : -1) + rows.length) % rows.length];
  if (!from || !to) return active;
  // Wide and narrow rows have different column counts: keep the horizontal position instead.
  const fromColumns = layout.groups.find((g) => g.rows.includes(from))?.wide
    ? COLUMNS.wide
    : COLUMNS.narrow;
  const toColumns = layout.groups.find((g) => g.rows.includes(to))?.wide
    ? COLUMNS.wide
    : COLUMNS.narrow;
  const column = Math.floor((from.indexOf(active) * toColumns) / fromColumns);
  return to[Math.min(column, to.length - 1)] ?? active;
}

/**
 * Completions matching what was typed after `\`: names starting with it first (shortest first,
 * so "sin" comes before "sinh"; an exact name first, so \Gamma before \gamma), then names
 * containing it, then (from three letters) descriptions with a word starting with it: "root"
 * finds \sqrt, but "pi" does not find "Capital Greek letter".
 */
export function matchCompletions(
  all: readonly CommandCompletion[],
  query: string,
): CommandCompletion[] {
  if (!query) return [...all];
  const q = query.toLowerCase();
  const starts = all
    .filter((c) => c.name.toLowerCase().startsWith(q))
    .sort((a, b) => a.name.length - b.name.length);
  const exact = starts.findIndex((c) => c.name === query);
  if (exact > 0) starts.unshift(...starts.splice(exact, 1));
  const contains = all.filter(
    (c) =>
      !starts.includes(c) &&
      (c.name.toLowerCase().includes(q) ||
        (q.length >= 3 &&
          c.description
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .some((word) => word.startsWith(q)))),
  );
  return [...starts, ...contains];
}
