import type { BuiltinFunction } from '../types';

const unary = (name: string, description: string, inverse?: string): BuiltinFunction =>
  inverse ? { name, arity: [1, 1], description, inverse } : { name, arity: [1, 1], description };

const functions: BuiltinFunction[] = [
  unary('sin', 'Sine', 'arcsin'),
  unary('cos', 'Cosine', 'arccos'),
  unary('tan', 'Tangent', 'arctan'),
  unary('cot', 'Cotangent', 'arccot'),
  unary('sec', 'Secant', 'arcsec'),
  unary('csc', 'Cosecant', 'arccsc'),
  unary('arcsin', 'Inverse sine'),
  unary('arccos', 'Inverse cosine'),
  unary('arctan', 'Inverse tangent'),
  unary('arccot', 'Inverse cotangent'),
  unary('arcsec', 'Inverse secant'),
  unary('arccsc', 'Inverse cosecant'),
  unary('sinh', 'Hyperbolic sine', 'arsinh'),
  unary('cosh', 'Hyperbolic cosine', 'arcosh'),
  unary('tanh', 'Hyperbolic tangent', 'artanh'),
  unary('coth', 'Hyperbolic cotangent'),
  unary('sech', 'Hyperbolic secant'),
  unary('csch', 'Hyperbolic cosecant'),
  unary('arsinh', 'Inverse hyperbolic sine'),
  unary('arcosh', 'Inverse hyperbolic cosine'),
  unary('artanh', 'Inverse hyperbolic tangent'),
  unary('exp', 'Exponential function', 'ln'),
  unary('ln', 'Natural logarithm', 'exp'),
  {
    name: 'log',
    arity: [1, 2],
    description: 'Logarithm (base 10, or \\log_b x)',
    subscriptArg: true,
  },
  unary('floor', 'Round down'),
  unary('ceil', 'Round up'),
  unary('sign', 'Sign'),
  { name: 'gcd', arity: [2, Infinity], description: 'Greatest common divisor' },
  { name: 'lcm', arity: [2, Infinity], description: 'Least common multiple' },
  { name: 'max', arity: [1, Infinity], description: 'Maximum' },
  { name: 'min', arity: [1, Infinity], description: 'Minimum' },
  { name: 'binomial', arity: [2, 2], description: 'Binomial coefficient' },
];

export default functions;
