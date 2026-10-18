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

const PLACEHOLDER = '\\placeholder{}';

/**
 * Removes empty boxes left behind by a deletion, which belong to nothing any more:
 * - in brackets not after a function — `(□)` once the function name before it was deleted;
 * - in an unfinished bracket — `erf(□` once its closing bracket was deleted;
 * - loose in the row, outside any structure — `1+□`.
 * Boxes of structures (`\frac{□}{□}`, `x^{□}`) and a function's argument box (`\erf(□)`) stay.
 * Returns the new LaTeX and the offsets (in the old LaTeX) of the boxes removed.
 */
export function removeStrayPlaceholders(latex: string): { latex: string; removed: number[] } {
  const removed: number[] = [];
  let depth = 0; // braces and brackets, not counting a placeholder's own {}
  for (let i = 0; i < latex.length; i++) {
    if (latex.startsWith(PLACEHOLDER, i)) {
      if (isStray(latex, i, depth)) removed.push(i);
      i += PLACEHOLDER.length - 1;
      continue;
    }
    const c = latex.charAt(i);
    if (c === '\\') {
      i++; // skip the escaped character (\{ \} \\), or the first letter of a command
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  let out = latex;
  for (const at of [...removed].reverse()) {
    out = out.slice(0, at) + out.slice(at + PLACEHOLDER.length);
  }
  return { latex: out, removed };
}

function isStray(latex: string, at: number, depth: number): boolean {
  const before = latex.slice(0, at);
  const after = latex.slice(at + PLACEHOLDER.length);
  if (before.endsWith('\\left(')) {
    // In brackets: stray unless they are a function's complete argument brackets.
    // A function: \erf, \operatorname{J}, \mathrm{area}, then maybe _{n} and ^{2}.
    const fn =
      /\\[A-Za-z]+(?:\{[A-Za-z]+\})?(?:_\{[^{}]*\}|_[A-Za-z0-9])?(?:\^\{[^{}]*\}|\^[A-Za-z0-9])?\s*\\left\($/.test(
        before,
      );
    return !(fn && after.startsWith('\\right)'));
  }
  // Loose in the row: not in any structure's box, nor a matrix cell (\begin{pmatrix}…\end).
  const openEnvironments = before.split('\\begin{').length - before.split('\\end{').length;
  return depth === 0 && openEnvironments === 0;
}

/** Text that is nothing yet: a range still inside a structure reads as "" or bare boxes. */
const nothingYet = (latex: string) => latex.split(PLACEHOLDER).join('').trim() === '';

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
