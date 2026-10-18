import type { Interpretation } from '../types';

const imaginaryUnit: Interpretation = {
  symbol: 'i',
  form: 'bare',
  question: 'Use i as the imaginary unit (i² = −1)?',
  options: [
    { id: 'imaginary', label: 'imaginary unit', meaning: { kind: 'constant', id: 'i' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'imaginary',
  promptOnFirstUse: true,
};

export default imaginaryUnit;
