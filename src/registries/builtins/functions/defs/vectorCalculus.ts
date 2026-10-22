import type { BuiltinFunction } from '../types';

/**
 * Vector calculus (parser/vectorCalculus.ts). The first argument is what to differentiate: an
 * expression, or a defined function (`\nabla f`, or `\nabla f(1,2)` at a point); the optional
 * second lists the variables, `(x, y)`, as does a subscript on ∇: `\nabla_{x,y} f`. Without it, a
 * function's own parameters, else the free variables in alphabetical order.
 */
const vector = (name: string, description: string): BuiltinFunction => ({
  name,
  arity: [1, 2],
  description,
  group: 'Vector calculus',
});

const functions: BuiltinFunction[] = [
  vector('grad', 'Gradient: the vector of partial derivatives (also ∇f)'),
  vector('div', 'Divergence of a vector field (also ∇·F)'),
  vector('curl', 'Curl of a vector field in 3D, or the scalar curl in 2D (also ∇×F)'),
  vector('laplacian', 'Laplacian: the sum of the second partial derivatives (also ∇²f)'),
  vector('jacobian', 'Jacobian matrix: the partial derivatives of each component'),
  vector('hessian', 'Hessian matrix: the second partial derivatives'),
];

export default functions;
