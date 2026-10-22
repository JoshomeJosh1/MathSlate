import { runVectorCalculus, vectorField, type Command } from '../types';

const jacobian: Command = {
  id: 'jacobian',
  title: () => 'Jacobian',
  slash: 'jacobian',
  description: 'Jacobian matrix: the partial derivatives of each component',
  appliesTo: ({ facts }) => (vectorField(facts) !== undefined ? 0.6 : 0),
  run: (ctx, cas) => runVectorCalculus(ctx, cas, 'jacobian'),
};

export default jacobian;
