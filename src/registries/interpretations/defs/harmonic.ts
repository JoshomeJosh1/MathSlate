import type { Interpretation } from '../types';

/** Off until chosen: H with a subscript stays an ordinary name (H₁) unless the document picks it. */
const harmonic: Interpretation = {
  symbol: 'H',
  form: 'subscripted',
  question: 'Use H_n for the n-th harmonic number (1 + 1/2 + … + 1/n)?',
  options: [
    { id: 'harmonic', label: 'harmonic number', meaning: { kind: 'sequence', sequence: 'H' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'variable',
  promptOnFirstUse: true,
};

export default harmonic;
