import type { Interpretation } from '../types';

const primes: Interpretation = {
  symbol: 'p',
  form: 'subscripted',
  question: 'Use p_n for the n-th prime (p_1 = 2, p_2 = 3, …)?',
  options: [
    { id: 'primes', label: 'n-th prime', meaning: { kind: 'sequence', sequence: 'p' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'primes',
  promptOnFirstUse: false, // on by default; the row badge switches it off
};

export default primes;
