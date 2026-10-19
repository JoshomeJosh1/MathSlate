import type { Interpretation } from '../types';

/** Off until chosen: L with a subscript stays an ordinary name (L₁) unless the document picks it. */
const lucas: Interpretation = {
  symbol: 'L',
  form: 'subscripted',
  question: 'Use L_n for the n-th Lucas number (2, 1, 3, 4, 7, …)?',
  options: [
    { id: 'lucas', label: 'Lucas number', meaning: { kind: 'sequence', sequence: 'L' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'variable',
  promptOnFirstUse: true,
};

export default lucas;
