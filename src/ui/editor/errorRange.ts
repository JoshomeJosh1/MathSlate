/**
 * Maps an error's span (offsets into the row's LaTeX) to the editor's positions, so the error
 * can be marked inside the math field. `prefixAt(k)` is the field's LaTeX before position k; the
 * positions whose prefix is a prefix of the whole LaTeX are the top-level boundaries (positions
 * inside a fraction give partial LaTeX), and the error covers the atoms between the last
 * boundary at or before its start and the first at or after its end.
 *
 * Returns the positions [from, to] (the atoms ending at from+1 … to), or null when the span
 * cannot be placed.
 */
export function errorRange(
  latex: string,
  lastOffset: number,
  prefixAt: (position: number) => string,
  span: { start: number; end: number },
): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  for (let k = 0; k <= lastOffset; k++) {
    const prefix = prefixAt(k);
    if (!latex.startsWith(prefix)) continue;
    if (prefix.length <= span.start) from = k;
    if (prefix.length >= span.end) {
      to = k;
      break;
    }
  }
  if (from < 0 || to < 0) return null;
  return { from, to: Math.max(from, to) };
}
