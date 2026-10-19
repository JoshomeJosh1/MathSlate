import type { Interpretation } from '../types';

const eulersNumber: Interpretation = {
  symbol: 'e',
  form: 'bare',
  question: "Use e as Euler's number (2.718…)?",
  options: [
    { id: 'euler', label: "Euler's number", meaning: { kind: 'constant', id: 'e' } },
    { id: 'variable', label: 'variable', meaning: { kind: 'variable' } },
  ],
  defaultOption: 'euler',
  promptOnFirstUse: false, // a reserved constant (core/analyze.ts): no prompt
};

export default eulersNumber;
