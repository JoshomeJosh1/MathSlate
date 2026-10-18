import type { Interpretation } from '../types';

const pi: Interpretation = {
  symbol: '\\pi',
  form: 'bare',
  question: 'Use π as the circle constant (3.14159…)?',
  options: [
    { id: 'pi', label: 'circle constant', meaning: { kind: 'constant', id: 'pi' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'pi',
  promptOnFirstUse: false,
};

export default pi;
