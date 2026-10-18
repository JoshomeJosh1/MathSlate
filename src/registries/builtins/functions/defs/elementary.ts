import type { BuiltinFunction } from '../types';

const unary = (name: string, description: string, inverse?: string): BuiltinFunction =>
  inverse ? { name, arity: [1, 1], description, inverse } : { name, arity: [1, 1], description };

const group = (name: string, functions: BuiltinFunction[]): BuiltinFunction[] =>
  functions.map((f) => ({ ...f, group: name }));

const functions: BuiltinFunction[] = [
  ...group('Trigonometry', [
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
  ]),
  ...group('Hyperbolic functions', [
    unary('sinh', 'Hyperbolic sine', 'arsinh'),
    unary('cosh', 'Hyperbolic cosine', 'arcosh'),
    unary('tanh', 'Hyperbolic tangent', 'artanh'),
    unary('coth', 'Hyperbolic cotangent', 'arcoth'),
    unary('sech', 'Hyperbolic secant', 'arsech'),
    unary('csch', 'Hyperbolic cosecant', 'arcsch'),
    // ISO names (area sine, …), also accepted with the common "arc" spelling.
    { ...unary('arsinh', 'Inverse hyperbolic sine (also arcsinh)'), aliases: ['arcsinh'] },
    { ...unary('arcosh', 'Inverse hyperbolic cosine (also arccosh)'), aliases: ['arccosh'] },
    { ...unary('artanh', 'Inverse hyperbolic tangent (also arctanh)'), aliases: ['arctanh'] },
    { ...unary('arcoth', 'Inverse hyperbolic cotangent (also arccoth)'), aliases: ['arccoth'] },
    { ...unary('arsech', 'Inverse hyperbolic secant (also arcsech)'), aliases: ['arcsech'] },
    { ...unary('arcsch', 'Inverse hyperbolic cosecant (also arccsch)'), aliases: ['arccsch'] },
  ]),
  ...group('Exponentials and logarithms', [
    unary('exp', 'Exponential function', 'ln'),
    unary('ln', 'Natural logarithm', 'exp'),
    {
      name: 'log',
      arity: [1, 2],
      description: 'Logarithm (base 10, or \\log_b x)',
      subscriptArg: 'last',
    },
  ]),
  ...group('Rounding and integers', [
    unary('floor', 'Round down'),
    unary('ceil', 'Round up'),
    unary('sign', 'Sign'),
    { name: 'gcd', arity: [2, Infinity], description: 'Greatest common divisor' },
    { name: 'lcm', arity: [2, Infinity], description: 'Least common multiple' },
    { name: 'max', arity: [1, Infinity], description: 'Maximum' },
    { name: 'min', arity: [1, Infinity], description: 'Minimum' },
    { name: 'binomial', arity: [2, 2], description: 'Binomial coefficient' },
  ]),
];

export default functions;
