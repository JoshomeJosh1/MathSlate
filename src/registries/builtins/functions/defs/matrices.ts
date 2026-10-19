import type { BuiltinFunction } from '../types';

/**
 * Matrices and vectors. The same operations also have notation: |M| is the determinant, |v| a
 * vector's length, M^T the transpose, u·v the dot product and u×v the cross product (see
 * `_cdot`, `_times`, `_abs` in cas/sympy/python/runtime.py).
 */
const matrix = (
  name: string,
  arity: readonly [number, number],
  description: string,
): BuiltinFunction => ({ name, arity, description, group: 'Matrices and vectors' });

const functions: BuiltinFunction[] = [
  matrix('det', [1, 1], 'Determinant of a square matrix (also |M|)'),
  matrix('tr', [1, 1], 'Trace: the sum of the diagonal of a square matrix'),
  matrix('rank', [1, 1], 'Rank: the number of linearly independent rows'),
  matrix('transpose', [1, 1], 'Transpose: rows become columns (also M^T)'),
  matrix('dot', [2, 2], 'Dot product of two vectors (also u·v)'),
  matrix('cross', [2, 2], 'Cross product of two vectors of length 3 (also u×v)'),
];

export default functions;
