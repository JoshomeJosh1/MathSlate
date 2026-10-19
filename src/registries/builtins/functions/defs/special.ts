import type { BuiltinFunction } from '../types';

/**
 * Special functions. All are `callOnly`: the name only means the function when followed by
 * parentheses, so Si can still be S·i, ζ a variable, and C(x+1) a product (the editor's shortcut
 * for a name turns back into letters unless brackets follow). Their conventional
 * LaTeX spellings (Γ, S, J_n, …) are in parser/functionNames.ts.
 */
const special = (
  name: string,
  arity: readonly [number, number],
  description: string,
  extra: Partial<BuiltinFunction> = {},
): BuiltinFunction => ({
  name,
  arity,
  description,
  callOnly: true,
  group: 'Special functions',
  ...extra,
});

const functions: BuiltinFunction[] = [
  special('erf', [1, 1], 'Error function'),
  special('erfc', [1, 1], 'Complementary error function'),
  special('erfi', [1, 1], 'Imaginary error function'),
  special('gamma', [1, 2], 'Gamma function Γ(x); with two arguments the upper incomplete Γ(s, x)'),
  special('lowergamma', [2, 2], 'Lower incomplete gamma function γ(s, x)'),
  special('Beta', [2, 2], 'Beta function B(a, b)'),
  special('zeta', [1, 2], 'Riemann zeta function ζ(s); Hurwitz ζ(s, a)'),
  special('digamma', [1, 2], 'Digamma function ψ(x); polygamma ψ(n, x)'),
  special('fresnelS', [1, 1], 'Fresnel integral S(x)'),
  special('fresnelC', [1, 1], 'Fresnel integral C(x)'),
  special('Si', [1, 1], 'Sine integral'),
  special('Ci', [1, 1], 'Cosine integral'),
  special('Shi', [1, 1], 'Hyperbolic sine integral'),
  special('Chi', [1, 1], 'Hyperbolic cosine integral'),
  special('Ei', [1, 1], 'Exponential integral'),
  special('li', [1, 1], 'Logarithmic integral'),
  special('Li', [2, 2], 'Polylogarithm Li_s(x)', { subscriptArg: 'first' }),
  special('LambertW', [1, 2], 'Lambert W function (optional branch k)'),
  special('besselJ', [2, 2], 'Bessel function of the first kind J_n(x)', { subscriptArg: 'first' }),
  special('besselY', [2, 2], 'Bessel function of the second kind Y_n(x)', {
    subscriptArg: 'first',
  }),
  special('besselI', [2, 2], 'Modified Bessel function I_n(x)', { subscriptArg: 'first' }),
  special('besselK', [2, 2], 'Modified Bessel function K_n(x)', { subscriptArg: 'first' }),
  special('Ai', [1, 1], 'Airy function Ai'),
  special('Bi', [1, 1], 'Airy function Bi'),
  special('ellipticK', [1, 1], 'Complete elliptic integral of the first kind K(m)'),
  special(
    'ellipticE',
    [1, 2],
    'Complete elliptic integral of the second kind E(m); incomplete E(φ, m)',
  ),
];

export default functions;
