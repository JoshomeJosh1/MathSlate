import type { BuiltinFunction } from '../types';

/**
 * Integer sequences as functions of n (the primes and Fibonacci numbers are also p_n and F_n).
 * `callOnly` like the special functions: without brackets the letters keep their ordinary meaning
 * (bell is b·e·l·l). SymPy computes them; Nerdamer declines.
 */
const sequence = (name: string, description: string): BuiltinFunction => ({
  name,
  arity: [1, 1],
  description,
  callOnly: true,
  group: 'Integer sequences',
});

const functions: BuiltinFunction[] = [
  sequence('fibonacci', 'Fibonacci numbers: 0, 1, 1, 2, 3, 5, … (also F_n)'),
  sequence('lucas', 'Lucas numbers: 2, 1, 3, 4, 7, 11, …'),
  sequence('catalan', 'Catalan numbers: 1, 1, 2, 5, 14, 42, …'),
  sequence('bell', 'Bell numbers (ways to partition a set of n): 1, 1, 2, 5, 15, …'),
  sequence(
    'partition',
    'Number of ways to write n as a sum of positive integers: 1, 1, 2, 3, 5, 7, …',
  ),
  sequence('harmonic', 'Harmonic numbers: 1 + 1/2 + … + 1/n'),
  sequence('bernoulli', 'Bernoulli numbers: 1, 1/2, 1/6, 0, −1/30, … (B_1 = +1/2)'),
  sequence('totient', "Euler's totient: how many of 1 … n share no factor with n"),
  sequence('primepi', 'Number of primes up to n'),
];

export default functions;
