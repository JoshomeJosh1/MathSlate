import { describe, expect, it } from 'vitest';
import { errorRange } from './errorRange';

/** Prefixes as MathLive gives them for x+\frac{1}{y}+2 (positions inside the fraction too). */
const latex = 'x+\\frac{1}{y}+2';
const prefixes = [
  '',
  'x',
  'x+',
  'x+',
  'x+1', // inside the numerator: not a prefix of the whole
  'x+\\frac{1}',
  'x+\\frac{1}',
  'x+\\frac{1}y',
  'x+\\frac{1}{y}',
  'x+\\frac{1}{y}+',
  'x+\\frac{1}{y}+2',
];
const range = (start: number, end: number) =>
  errorRange(latex, prefixes.length - 1, (k) => prefixes[k] ?? '', { start, end });

describe('errorRange', () => {
  it('maps a span on top-level atoms', () => {
    expect(range(0, 1)).toEqual({ from: 0, to: 1 }); // x
    expect(range(14, 15)).toEqual({ from: 9, to: 10 }); // 2
  });

  it('widens a span inside a structure to the part of it that can be placed', () => {
    expect(range(8, 9)).toEqual({ from: 3, to: 5 }); // the 1 inside \frac: its numerator
  });

  it('marks a point for an empty span', () => {
    expect(range(15, 15)).toEqual({ from: 10, to: 10 });
  });

  it('gives up when the span is past the field', () => {
    expect(range(40, 41)).toBeNull();
  });
});
