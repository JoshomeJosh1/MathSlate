import type { CommandCompletion } from './MathEditor';

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
