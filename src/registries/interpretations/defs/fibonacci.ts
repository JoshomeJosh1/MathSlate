import type { Interpretation } from '../types';

const fibonacci: Interpretation = {
  symbol: 'F',
  form: 'subscripted',
  question: 'Use F_n for the n-th Fibonacci number (F_0 = 0, F_1 = 1, …)?',
  options: [
    { id: 'fibonacci', label: 'Fibonacci number', meaning: { kind: 'sequence', sequence: 'F' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'fibonacci',
  promptOnFirstUse: false, // on by default; the row badge switches it off
};

export default fibonacci;
