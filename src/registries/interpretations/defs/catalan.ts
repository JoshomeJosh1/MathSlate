import type { Interpretation } from '../types';

/** Off until chosen: C with a subscript stays an ordinary name (C₁) unless the document picks it. */
const catalan: Interpretation = {
  symbol: 'C',
  form: 'subscripted',
  question: 'Use C_n for the n-th Catalan number (1, 1, 2, 5, 14, …)?',
  options: [
    { id: 'catalan', label: 'Catalan number', meaning: { kind: 'sequence', sequence: 'C' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'variable',
  promptOnFirstUse: true,
};

export default catalan;
