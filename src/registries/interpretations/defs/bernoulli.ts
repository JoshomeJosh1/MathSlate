import type { Interpretation } from '../types';

/** Off until chosen: B with a subscript stays an ordinary name (B₁) unless the document picks it. */
const bernoulli: Interpretation = {
  symbol: 'B',
  form: 'subscripted',
  question: 'Use B_n for the n-th Bernoulli number (1, 1/2, 1/6, 0, …)?',
  options: [
    { id: 'bernoulli', label: 'Bernoulli number', meaning: { kind: 'sequence', sequence: 'B' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'variable',
  promptOnFirstUse: true,
};

export default bernoulli;
