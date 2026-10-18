/** Half-open range [start, end) of character offsets into a row's LaTeX source. */
export interface Span {
  start: number;
  end: number;
}

export function spanOf(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/** A user-facing error tied to a position in the row's LaTeX. */
export class MathError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.name = 'MathError';
    this.span = span;
  }
}
