import type { BuiltinSequence } from '../types';

const fibonacci: BuiltinSequence = {
  name: 'F',
  title: 'Fibonacci numbers',
  description: 'F_n is the n-th Fibonacci number: F_0 = 0, F_1 = 1, F_{n} = F_{n-1} + F_{n-2}',
  firstIndex: 0,
};

export default fibonacci;
