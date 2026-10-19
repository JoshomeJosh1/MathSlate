import type { BuiltinSequence } from '../types';

const lucas: BuiltinSequence = {
  name: 'L',
  title: 'Lucas numbers',
  description: 'L_n is the n-th Lucas number: L_0 = 2, L_1 = 1, L_n = L_{n-1} + L_{n-2}',
  firstIndex: 0,
};

export default lucas;
