/**
 * Whether `latex` is a single structure whose boxes are all empty: `\sqrt{\placeholder{}}`,
 * `\frac{\placeholder{}}{\placeholder{}}`, `\sum_{\placeholder{}}^{\placeholder{}}`,
 * `\lim_{\placeholder{}\to\placeholder{}}`. Deleting next to one removes it whole, instead of
 * MathLive's stepping into it or unwrapping it into a stray empty box.
 */
export function isEmptyStructure(latex: string): boolean {
  const rest = latex
    .replace(/\\placeholder\{\}/g, '')
    .replace(/\\to\b/g, '')
    .replace(/\s+/g, '');
  return /^\\[A-Za-z]+(?:\[\]|[_^]?\{\})+$/.test(rest);
}

/** Text that is nothing yet: a range still inside a structure reads as "" or bare boxes. */
const nothingYet = (latex: string) => latex.replace(/\\placeholder\{\}/g, '').trim() === '';

/**
 * The editor offsets [start, end] of an empty structure right after (`forward`, for Delete) or
 * right before (`backward`, for Backspace) the caret, or null. `read(a, b)` is the LaTeX between
 * two offsets. MathLive numbers offsets inside structures too, so the range is widened one
 * offset at a time: readings are empty or bare boxes while it is inside the structure, the
 * structure once it covers it, and stay the same until it reaches the next item, which marks
 * the structure's edge. Real content first means the neighbour is not an empty structure.
 */
export function emptyStructureRange(
  read: (a: number, b: number) => string,
  caret: number,
  last: number,
  direction: 'forward' | 'backward',
  maxWidth = 16,
): [number, number] | null {
  const step = direction === 'forward' ? 1 : -1;
  const span = (far: number): string =>
    direction === 'forward' ? read(caret, far) : read(far, caret);
  const inRange = (far: number) => far >= 0 && far <= last && Math.abs(far - caret) <= maxWidth;
  for (let far = caret + step; inRange(far); far += step) {
    const latex = span(far);
    if (nothingYet(latex)) continue;
    if (!isEmptyStructure(latex)) return null;
    // Widen while the reading stays the same structure, to its outer edge.
    let edge = far;
    while (inRange(edge + step) && span(edge + step) === latex) edge += step;
    return direction === 'forward' ? [caret, edge] : [edge, caret];
  }
  return null;
}
